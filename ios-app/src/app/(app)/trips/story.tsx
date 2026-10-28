import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { storyRepository } from '@/composition/services';
import type { StoryContentDTO, StoryDTO } from '@/contracts/story';

export default function StoryScreen() {
  const { signOut } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [story, setStory] = useState<StoryDTO | null>(null);
  const [draft, setDraft] = useState<StoryContentDTO | null>(null);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [versions, setVersions] = useState<StoryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void storyRepository.getLatest(id).then((result) => {
      if (!active) return;
      setStory(result);
      setDraft(result.content);
    }).catch(async (cause: unknown) => {
      if (!active || await handleProtectedError(cause, signOut)) return;
      if (!(cause instanceof AppError && cause.code === 'NOT_FOUND')) {
        setError(cause instanceof Error ? cause.message : 'Could not load the story');
      }
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, signOut]);

  const generate = async () => {
    if (!id) return;
    setWorking(true);
    setError(null);
    try {
      const result = await storyRepository.generate(id, feedback.trim() || null);
      setStory(result);
      setDraft(result.content);
      setFeedback('');
      setEditing(false);
    } catch (cause) {
      if (await handleProtectedError(cause, signOut)) return;
      setError(cause instanceof Error ? cause.message : 'Story generation failed');
    } finally {
      setWorking(false);
    }
  };

  const save = async () => {
    if (!id || !draft) return;
    setWorking(true);
    setError(null);
    try {
      const result = await storyRepository.update(id, draft);
      setStory(result);
      setDraft(result.content);
      setEditing(false);
    } catch (cause) {
      if (await handleProtectedError(cause, signOut)) return;
      setError(cause instanceof Error ? cause.message : 'Could not save the story');
    } finally {
      setWorking(false);
    }
  };

  const toggleVersions = async () => {
    if (!id) return;
    if (versions) {
      setVersions(null);
      return;
    }
    setWorking(true);
    setError(null);
    try {
      setVersions(await storyRepository.listVersions(id));
    } catch (cause) {
      if (await handleProtectedError(cause, signOut)) return;
      setError(cause instanceof Error ? cause.message : 'Could not load story versions');
    } finally {
      setWorking(false);
    }
  };

  const openVersion = (version: StoryDTO) => {
    setStory(version);
    setDraft(version.content);
    setEditing(false);
    setVersions(null);
  };

  if (!id) return <CenteredMessage text="Trip not found" />;
  if (loading) return <ActivityIndicator accessibilityLabel="Loading story" color="#7D5C3C" style={styles.loader} />;
  if (!draft) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Turn these photos into a story</Text>
        <Text style={styles.emptyCopy}>Trailogue will analyze visible details and use your trip information without inventing people or events.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <ActionButton disabled={working} label={working ? 'Creating story…' : 'Generate story'} onPress={generate} />
      </View>
    );
  }

  const update = (change: Partial<StoryContentDTO>) => setDraft((current) => current ? { ...current, ...change } : current);
  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.version}>VERSION {story?.version ?? 1}</Text>
      {draft.meta.visionAvailable ? null : (
        <Text style={styles.notice}>This story used trip and photo metadata only because the configured model does not support image input.</Text>
      )}
      {editing ? (
        <TextInput accessibilityLabel="Story title" onChangeText={(title) => update({ title })} style={styles.titleInput} value={draft.title} />
      ) : <Text accessibilityRole="header" style={styles.title}>{draft.title}</Text>}
      {editing ? (
        <TextInput accessibilityLabel="Story subtitle" onChangeText={(subtitle) => update({ subtitle })} style={styles.input} value={draft.subtitle} />
      ) : draft.subtitle ? <Text style={styles.subtitle}>{draft.subtitle}</Text> : null}
      <EditableParagraph editing={editing} label="Preface" onChange={(preface) => update({ preface })} value={draft.preface} />
      {draft.chapters.map((chapter, index) => (
        <View key={chapter.chapterId} style={styles.chapter}>
          <Text style={styles.chapterMeta}>{[chapter.dateLabel, chapter.locationLabel].filter(Boolean).join(' · ')}</Text>
          {editing ? (
            <TextInput
              accessibilityLabel={`Chapter ${index + 1} title`}
              onChangeText={(title) => update({ chapters: draft.chapters.map((item, itemIndex) => itemIndex === index ? { ...item, title } : item) })}
              style={styles.chapterTitleInput}
              value={chapter.title}
            />
          ) : <Text style={styles.chapterTitle}>{chapter.title}</Text>}
          <EditableParagraph
            editing={editing}
            label={`Chapter ${index + 1}`}
            onChange={(narrative) => update({ chapters: draft.chapters.map((item, itemIndex) => itemIndex === index ? { ...item, narrative } : item) })}
            value={chapter.narrative}
          />
          <Text style={styles.photoCount}>{chapter.photoIds.length} photos</Text>
        </View>
      ))}
      <EditableParagraph editing={editing} label="Epilogue" onChange={(epilogue) => update({ epilogue })} value={draft.epilogue} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {editing ? (
        <View style={styles.row}>
          <ActionButton disabled={working} label={working ? 'Saving…' : 'Save new version'} onPress={save} />
          <ActionButton label="Cancel" onPress={() => { setDraft(story?.content ?? draft); setEditing(false); }} secondary />
        </View>
      ) : (
        <>
          <View style={styles.row}>
            <ActionButton label="Edit story" onPress={() => setEditing(true)} secondary />
            <ActionButton label="Book preview" onPress={() => router.push({ pathname: '/trips/book', params: { id } })} />
            <ActionButton label={versions ? 'Hide versions' : 'Story versions'} onPress={() => void toggleVersions()} secondary />
          </View>
          {versions ? (
            <View style={styles.versions}>
              {versions.map((version) => (
                <Pressable
                  accessibilityRole="button"
                  key={version.id}
                  onPress={() => openVersion(version)}
                  style={styles.versionCard}
                >
                  <Text style={styles.versionCardTitle}>Version {version.version} · {version.source}</Text>
                  <Text style={styles.versionCardDate}>{new Date(version.updatedAt).toLocaleString()}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <TextInput
            accessibilityLabel="Regeneration feedback"
            multiline
            onChangeText={setFeedback}
            placeholder="Optional: what should change in the new version?"
            style={styles.feedback}
            value={feedback}
          />
          <ActionButton disabled={working} label={working ? 'Regenerating…' : 'Regenerate as a new version'} onPress={generate} secondary />
        </>
      )}
    </ScrollView>
  );
}

function EditableParagraph({ editing, label, onChange, value }: {
  editing: boolean; label: string; onChange: (value: string) => void; value: string;
}) {
  return editing
    ? <TextInput accessibilityLabel={label} multiline onChangeText={onChange} style={styles.bodyInput} value={value} />
    : <Text style={styles.body}>{value}</Text>;
}

function ActionButton({ label, onPress, disabled = false, secondary = false }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}>
      <Text style={[styles.buttonLabel, secondary && styles.secondaryButtonLabel]}>{label}</Text>
    </Pressable>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return <View style={styles.empty}><Text style={styles.emptyTitle}>{text}</Text></View>;
}

const inputStyle = {
  backgroundColor: '#FFFFFF', borderColor: '#D8CDBE', borderRadius: 10, borderWidth: 1,
  color: '#24211D', fontSize: 16, padding: 13,
} as const;

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F7F4EE', flex: 1 },
  content: { padding: 24, paddingBottom: 60 },
  loader: { backgroundColor: '#F7F4EE', flex: 1 },
  empty: { alignItems: 'center', backgroundColor: '#F7F4EE', flex: 1, justifyContent: 'center', padding: 32 },
  emptyTitle: { color: '#24211D', fontSize: 28, fontWeight: '700', textAlign: 'center' },
  emptyCopy: { color: '#655F57', fontSize: 16, lineHeight: 24, marginVertical: 18, textAlign: 'center' },
  version: { color: '#8B6D50', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  notice: { backgroundColor: '#EFE3D1', borderRadius: 10, color: '#684F37', lineHeight: 20, marginTop: 14, padding: 12 },
  title: { color: '#24211D', fontSize: 36, fontWeight: '700', letterSpacing: -0.8, marginTop: 16 },
  titleInput: { ...inputStyle, fontSize: 28, fontWeight: '700', marginTop: 16 },
  subtitle: { color: '#7D5C3C', fontSize: 18, fontStyle: 'italic', marginTop: 8 },
  input: { ...inputStyle, marginTop: 10 },
  body: { color: '#39342E', fontSize: 17, lineHeight: 29, marginTop: 22 },
  bodyInput: { ...inputStyle, minHeight: 120, marginTop: 18, textAlignVertical: 'top' },
  chapter: { borderTopColor: '#D8CDBE', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 30, paddingTop: 24 },
  chapterMeta: { color: '#8B6D50', fontSize: 13, fontWeight: '600' },
  chapterTitle: { color: '#24211D', fontSize: 25, fontWeight: '700', marginTop: 6 },
  chapterTitleInput: { ...inputStyle, fontSize: 21, fontWeight: '700', marginTop: 8 },
  photoCount: { color: '#8B8177', fontSize: 13, marginTop: 12 },
  feedback: { ...inputStyle, minHeight: 78, marginTop: 26, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 28 },
  versions: { gap: 8, marginTop: 18 },
  versionCard: { backgroundColor: '#FFFFFF', borderColor: '#D8CDBE', borderRadius: 10, borderWidth: 1, padding: 12 },
  versionCardTitle: { color: '#24211D', fontSize: 14, fontWeight: '700' },
  versionCardDate: { color: '#7D746B', fontSize: 12, marginTop: 4 },
  button: { backgroundColor: '#24211D', borderRadius: 12, marginTop: 18, paddingHorizontal: 18, paddingVertical: 13 },
  secondaryButton: { backgroundColor: 'transparent', borderColor: '#7D5C3C', borderWidth: 1 },
  buttonLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  secondaryButtonLabel: { color: '#684F37' },
  disabled: { opacity: 0.55 },
  error: { color: '#A33B2B', lineHeight: 21, marginTop: 18, textAlign: 'center' },
});
