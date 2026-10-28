import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { storyRepository } from '@/composition/services';
import type { StoryDTO } from '@/contracts/story';
import { compareStories } from '@/features/stories/storyDiff';

export default function StoryVersionsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { signOut } = useAuth();
  const [versions, setVersions] = useState<StoryDTO[]>([]);
  const [viewing, setViewing] = useState<StoryDTO | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const differences = useMemo(() => selected.length === 2
    ? compareStories(versions.find((item) => item.id === selected[1])!, versions.find((item) => item.id === selected[0])!)
    : [], [selected, versions]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void storyRepository.listVersions(id).then((items) => {
      if (active) setVersions(items);
    }).catch(async (cause: unknown) => {
      if (!active || await handleProtectedError(cause, signOut)) return;
      setError(cause instanceof Error ? cause.message : 'Could not load story history');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, signOut]);

  const toggle = (storyId: string) => setSelected((current) => current.includes(storyId)
    ? current.filter((item) => item !== storyId)
    : [...current.slice(-1), storyId]);
  const restore = (story: StoryDTO) => Alert.alert(
    `Restore V${story.version}?`,
    'The current version will remain in history. Restoration creates a new version.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Restore as new version', onPress: () => {
      if (!id) return;
      setWorking(true);
      void storyRepository.restore(id, story.id).then(async () => {
        setVersions(await storyRepository.listVersions(id));
      }).catch(async (cause: unknown) => {
        if (await handleProtectedError(cause, signOut)) return;
        setError(cause instanceof Error ? cause.message : 'Could not restore this version');
      }).finally(() => setWorking(false));
    } }],
  );

  if (loading) return <ActivityIndicator accessibilityLabel="Loading story history" color="#7D5C3C" style={styles.loader} />;
  return <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
    <Text accessibilityRole="header" style={styles.title}>Story history</Text>
    <Text style={styles.summary}>Current version: V{versions[0]?.version ?? 0} · {versions.length} saved versions</Text>
    <Text style={styles.help}>Select any two versions to compare. Viewing or restoring never deletes an earlier version.</Text>
    {versions.map((story, index) => <View key={story.id} style={[styles.card, index === 0 && styles.current]}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(story.id) }} onPress={() => toggle(story.id)} style={styles.cardMain}>
        <Text style={styles.cardTitle}>V{story.version} · {label(story.versionType)} {index === 0 ? '· CURRENT' : ''}</Text>
        <Text style={styles.meta}>{new Date(story.createdAt).toLocaleString()} · {story.actualLanguage} · {story.creativeSnapshot.writingStyle}</Text>
      </Pressable>
      <View style={styles.actions}><SmallButton label="View" onPress={() => setViewing(story)} /><SmallButton disabled={working} label="Restore" onPress={() => restore(story)} /></View>
    </View>)}
    {selected.length === 2 ? <View style={styles.compare}><Text style={styles.sectionTitle}>Main differences</Text>{differences.length === 0 ? <Text>No textual differences.</Text> : differences.map((item) => <View key={item.section} style={styles.diff}><Text style={styles.diffTitle}>{item.section}</Text><Text style={styles.before}>− {item.before || '(empty)'}</Text><Text style={styles.after}>+ {item.after || '(empty)'}</Text></View>)}</View> : null}
    {viewing ? <View style={styles.viewer}><View style={styles.viewerHeader}><Text style={styles.sectionTitle}>V{viewing.version}: {viewing.content.title}</Text><SmallButton label="Close" onPress={() => setViewing(null)} /></View><Text style={styles.body}>{viewing.content.preface}</Text>{viewing.content.chapters.map((chapter) => <View key={chapter.chapterId}><Text style={styles.chapter}>{chapter.title}</Text><Text style={styles.body}>{chapter.narrative}</Text></View>)}<Text style={styles.body}>{viewing.content.epilogue}</Text></View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </ScrollView>;
}

function SmallButton({ label, onPress, disabled = false }: { label: string; onPress(): void; disabled?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.smallButton}><Text style={styles.smallButtonLabel}>{label}</Text></Pressable>; }
function label(value: StoryDTO['versionType']) { return ({ generated: 'AI generated', regenerated: 'AI regenerated', edited: 'Manual edit', restored: 'Restored' } as const)[value]; }
const styles = StyleSheet.create({
  screen: { backgroundColor: '#F7F4EE', flex: 1 }, content: { padding: 22, paddingBottom: 60 }, loader: { backgroundColor: '#F7F4EE', flex: 1 }, title: { color: '#24211D', fontSize: 34, fontWeight: '800' }, summary: { color: '#6C4E34', fontSize: 16, fontWeight: '700', marginTop: 9 }, help: { color: '#6D655D', lineHeight: 21, marginTop: 8 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#D8CDBE', borderRadius: 13, borderWidth: 1, marginTop: 14, padding: 14 }, current: { borderColor: '#7D5C3C', borderWidth: 2 }, cardMain: { paddingBottom: 10 }, cardTitle: { color: '#24211D', fontSize: 16, fontWeight: '800' }, meta: { color: '#736960', fontSize: 12, marginTop: 5 }, actions: { flexDirection: 'row', gap: 8 }, smallButton: { borderColor: '#8A6D51', borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 }, smallButtonLabel: { color: '#694D35', fontSize: 13, fontWeight: '700' },
  compare: { borderTopColor: '#D8CDBE', borderTopWidth: 1, marginTop: 28, paddingTop: 22 }, sectionTitle: { color: '#29231D', fontSize: 21, fontWeight: '800' }, diff: { marginTop: 18 }, diffTitle: { color: '#5C4633', fontWeight: '800' }, before: { backgroundColor: '#F9E7E3', color: '#873B30', lineHeight: 21, marginTop: 7, padding: 9 }, after: { backgroundColor: '#E5F1E6', color: '#315D38', lineHeight: 21, marginTop: 5, padding: 9 },
  viewer: { backgroundColor: '#FFFFFF', borderRadius: 14, marginTop: 28, padding: 18 }, viewerHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' }, chapter: { color: '#24211D', fontSize: 20, fontWeight: '800', marginTop: 24 }, body: { color: '#403A34', fontSize: 16, lineHeight: 26, marginTop: 12 }, error: { color: '#A33B2B', marginTop: 18 },
});
