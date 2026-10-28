import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { storyRepository, tripRepository } from '@/composition/services';
import type { CreativeRequirementsDTO } from '@/contracts/trip';
import type { ActualStoryLanguage } from '@trailogue/domain';
import { defaultCreativeRequirements } from '@/features/stories/creativeRequirements';

const stylesList = [
  ['warm_documentary', 'Warm documentary', 'Honest, gentle and grounded in the journey.'],
  ['literary', 'Literary essay', 'More lyrical rhythm and reflective transitions.'],
  ['playful', 'Light & humorous', 'Relaxed pacing without inventing jokes or dialogue.'],
  ['parent_child', 'Parent-child growth', 'Focus on companionship, interaction and growth.'],
  ['travel_guide', 'Travel guide', 'Practical structure with places, food and experience.'],
  ['custom', 'Custom style', 'Describe the voice you want.'],
] as const;
const focusList = [
  ['scenery', 'Scenery'], ['food', 'Food'], ['people', 'People'],
  ['journey', 'Journey'], ['reflection', 'Reflections'], ['culture', 'Culture'],
] as const;
const languageList = [
  ['auto', 'Auto detect'], ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文'],
  ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'],
] as const;

export default function CreativeRequirementsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { signOut } = useAuth();
  const [form, setForm] = useState<CreativeRequirementsDTO>(defaultCreativeRequirements());
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const lastSaved = useRef('');
  const serialized = useMemo(() => JSON.stringify(form), [form]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void tripRepository.getTrip(id).then((trip) => {
      if (!active) return;
      const next = { ...defaultCreativeRequirements(), ...trip.creativeRequirements };
      setForm(next);
      lastSaved.current = JSON.stringify(next);
      setLoaded(true);
    }).catch(async (cause: unknown) => {
      if (!active || await handleProtectedError(cause, signOut)) return;
      setMessage(cause instanceof Error ? cause.message : 'Could not load creative requirements');
    });
    return () => { active = false; };
  }, [id, signOut]);

  useEffect(() => {
    if (!id || !loaded || serialized === lastSaved.current) return;
    const timer = setTimeout(() => {
      setSaving(true);
      void tripRepository.updateTrip(id, { creativeRequirements: form })
        .then(() => { lastSaved.current = serialized; setMessage('Creative requirements saved'); })
        .catch(async (cause: unknown) => {
          if (await handleProtectedError(cause, signOut)) return;
          setMessage(cause instanceof Error ? cause.message : 'Could not save changes');
        })
        .finally(() => setSaving(false));
    }, 900);
    return () => clearTimeout(timer);
  }, [form, id, loaded, serialized, signOut]);

  const update = <K extends keyof CreativeRequirementsDTO>(key: K, value: CreativeRequirementsDTO[K]) => {
    setMessage(null);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const generate = async () => {
    if (!id) return;
    setGenerating(true);
    setMessage(null);
    try {
      await tripRepository.updateTrip(id, { creativeRequirements: form });
      lastSaved.current = JSON.stringify(form);
      await storyRepository.generate(id, { confirmed: true, fallbackLanguage: fallbackLanguage() });
      router.replace({ pathname: '/trips/story', params: { id } });
    } catch (cause) {
      if (await handleProtectedError(cause, signOut)) return;
      setMessage(cause instanceof Error ? cause.message : 'Story generation failed');
    } finally {
      setGenerating(false);
    }
  };

  if (!id) return <Centered text="Trip not found" />;
  if (!loaded) return <ActivityIndicator accessibilityLabel="Loading creative requirements" color="#7D5C3C" style={styles.loader} />;
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>Creative requirements</Text>
      <Text style={styles.intro}>Shape the story before AI writes it. Nothing is generated until you tap the button below.</Text>
      <Section title="People" subtitle="Only include details you know to be true.">
        <Field label="Main person" value={form.mainPerson} onChange={(value) => update('mainPerson', value)} />
        <Field label="Companions" value={form.companions} onChange={(value) => update('companions', value)} />
        <Field label="Relationship" value={form.relationship} onChange={(value) => update('relationship', value)} />
        <Field label="Person to focus on" value={form.focusPerson} onChange={(value) => update('focusPerson', value)} />
      </Section>
      <Section title="Writing style">
        {stylesList.map(([value, label, detail]) => (
          <Choice key={value} selected={form.writingStyle === value} label={label} detail={detail} onPress={() => update('writingStyle', value)} />
        ))}
        {form.writingStyle === 'custom' ? <Field label="Custom style" value={form.customWritingStyle} onChange={(value) => update('customWritingStyle', value)} multiline /> : null}
      </Section>
      <Section title="Length">
        <View style={styles.chips}>{(['short', 'standard', 'detailed', 'custom'] as const).map((value) => (
          <Chip key={value} label={value} selected={form.contentLength === value} onPress={() => update('contentLength', value)} />
        ))}</View>
        {form.contentLength === 'custom' ? <Field keyboardType="number-pad" label="Target words / characters" value={form.customWordCount?.toString() ?? ''} onChange={(value) => update('customWordCount', Math.min(10_000, Math.max(200, Number(value) || 0)) || null)} /> : null}
      </Section>
      <Section title="Story focus" subtitle="Choose more than one if needed.">
        <View style={styles.chips}>{focusList.map(([value, label]) => (
          <Chip key={value} label={label} selected={form.focuses.includes(value)} onPress={() => update('focuses', form.focuses.includes(value) ? form.focuses.filter((item) => item !== value) : [...form.focuses, value])} />
        ))}</View>
      </Section>
      <Section title="Memories & boundaries">
        <Field label="Memories to include" value={form.specialMemories} onChange={(value) => update('specialMemories', value)} multiline />
        <Field label="What to emphasize" value={form.emphasis} onChange={(value) => update('emphasis', value)} multiline />
        <Field label="Expressions to avoid" value={form.avoidExpressions} onChange={(value) => update('avoidExpressions', value)} multiline />
        <Field label="Other requirements" value={form.otherRequirements} onChange={(value) => update('otherRequirements', value)} multiline />
      </Section>
      <Section title="Generation language" subtitle="Auto detect uses your narrative input, not location or phone geography.">
        <View style={styles.chips}>{languageList.map(([value, label]) => (
          <Chip key={value} label={label} selected={form.generationLanguage === value} onPress={() => update('generationLanguage', value)} />
        ))}</View>
      </Section>
      <Section title="Book style">
        <Choice label="Travel magazine" detail="Bold imagery, modern type and varied compositions." selected={form.bookStyle === 'travel_magazine'} onPress={() => update('bookStyle', 'travel_magazine')} />
        <Choice label="Warm memoir" detail="Soft color, family moments and memory-led pacing." selected={form.bookStyle === 'warm_memoir'} onPress={() => update('bookStyle', 'warm_memoir')} />
        <Choice label="Minimalist photo book" detail="Photography first, restrained text and deliberate space." selected={form.bookStyle === 'minimalist'} onPress={() => update('bookStyle', 'minimalist')} />
      </Section>
      <Text style={styles.saveState}>{saving ? 'Saving…' : message ?? 'Changes save automatically'}</Text>
      <Pressable accessibilityRole="button" disabled={generating} onPress={() => void generate()} style={[styles.generate, generating && styles.disabled]}>
        <Text style={styles.generateLabel}>{generating ? 'Generating story…' : 'Start generating story'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}{children}</View>;
}
function Field({ label, value, onChange, multiline = false, keyboardType }: { label: string; value: string | null; onChange(value: string | null): void; multiline?: boolean; keyboardType?: 'number-pad' }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} keyboardType={keyboardType} multiline={multiline} onChangeText={(text) => onChange(text || null)} style={[styles.input, multiline && styles.multiline]} value={value ?? ''} /></View>;
}
function Choice({ label, detail, selected, onPress }: { label: string; detail: string; selected: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={styles.choiceTitle}>{label}</Text><Text style={styles.choiceDetail}>{detail}</Text></Pressable>;
}
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text></Pressable>;
}
function Centered({ text }: { text: string }) { return <View style={styles.center}><Text>{text}</Text></View>; }
function fallbackLanguage(): ActualStoryLanguage {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
  if (locale.startsWith('zh-tw') || locale.startsWith('zh-hk')) return 'zh-Hant';
  if (locale.startsWith('zh')) return 'zh-Hans';
  if (locale.startsWith('ja')) return 'ja';
  if (locale.startsWith('ko')) return 'ko';
  return 'en';
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F7F4EE', flex: 1 }, content: { padding: 22, paddingBottom: 60 },
  loader: { backgroundColor: '#F7F4EE', flex: 1 }, center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  title: { color: '#211D18', fontSize: 34, fontWeight: '800' }, intro: { color: '#655F57', fontSize: 16, lineHeight: 24, marginTop: 10 },
  section: { borderTopColor: '#D8CDBE', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 30, paddingTop: 22 },
  sectionTitle: { color: '#24211D', fontSize: 22, fontWeight: '700' }, sectionSubtitle: { color: '#71685F', lineHeight: 20, marginTop: 5 },
  field: { marginTop: 16 }, label: { color: '#5D4A39', fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { backgroundColor: '#FFFFFF', borderColor: '#D8CDBE', borderRadius: 11, borderWidth: 1, color: '#24211D', fontSize: 16, padding: 13 },
  multiline: { minHeight: 86, textAlignVertical: 'top' }, choice: { backgroundColor: '#FFFFFF', borderColor: '#D8CDBE', borderRadius: 12, borderWidth: 1, marginTop: 10, padding: 14 },
  choiceSelected: { backgroundColor: '#F0E4D2', borderColor: '#7D5C3C', borderWidth: 2 }, choiceTitle: { color: '#29231D', fontSize: 16, fontWeight: '700' }, choiceDetail: { color: '#6D655D', lineHeight: 19, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 14 }, chip: { backgroundColor: '#FFFFFF', borderColor: '#CFC3B3', borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  chipSelected: { backgroundColor: '#6A4B31', borderColor: '#6A4B31' }, chipLabel: { color: '#5C5147', fontWeight: '600', textTransform: 'capitalize' }, chipLabelSelected: { color: '#FFFFFF' },
  saveState: { color: '#6D655D', marginTop: 28, textAlign: 'center' }, generate: { backgroundColor: '#24211D', borderRadius: 14, marginTop: 12, padding: 17 }, generateLabel: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', textAlign: 'center' }, disabled: { opacity: 0.55 },
});
