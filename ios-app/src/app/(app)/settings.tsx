import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { usersApi } from '@/composition/services';
import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';

const RETENTION_OPTIONS = [30, 90, 365, -1] as const;

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(user?.name ?? '');
  const [retentionDays, setRetentionDays] = useState(user?.retentionDays ?? 90);
  const [privacyAgreed, setPrivacyAgreed] = useState(Boolean(user?.privacyAgreedAt));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await usersApi.updateSettings({ displayName, retentionDays, privacyAgreed });
      setMessage('Settings saved.');
    } catch (cause) {
      if (await handleProtectedError(cause, signOut)) return;
      setMessage(cause instanceof Error ? cause.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => Alert.alert(
    'Delete your Trailogue account?',
    'This permanently deletes your trips, photos, stories, books, sessions, and private cloud files. This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete account', style: 'destructive', onPress: () => {
          void usersApi.deleteAccount().then(() => signOut()).catch(async (cause: unknown) => {
            if (await handleProtectedError(cause, signOut)) return;
            setMessage(cause instanceof Error ? cause.message : 'Account could not be deleted');
          });
        },
      },
    ],
  );

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.heading}>Profile</Text>
      <Text style={styles.label}>Display name</Text>
      <TextInput accessibilityLabel="Display name" onChangeText={setDisplayName} style={styles.input} value={displayName} />
      <Text style={styles.heading}>Photo retention</Text>
      <Text style={styles.copy}>Choose how long original photos should be retained. Automatic cleanup will use this preference when enabled.</Text>
      <View style={styles.options}>
        {RETENTION_OPTIONS.map((days) => (
          <Pressable
            accessibilityRole="button"
            key={days}
            onPress={() => setRetentionDays(days)}
            style={[styles.option, retentionDays === days && styles.optionSelected]}
          >
            <Text style={[styles.optionLabel, retentionDays === days && styles.optionLabelSelected]}>
              {days === -1 ? 'Keep forever' : `${days} days`}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.heading}>Privacy agreement</Text>
          <Text style={styles.copy}>Allow your selected photos and notes to be sent securely to the configured AI provider when you generate a story.</Text>
        </View>
        <Switch accessibilityLabel="Privacy agreement" onValueChange={setPrivacyAgreed} value={privacyAgreed} />
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={styles.saveButton}>
        <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save settings'}</Text>
      </Pressable>
      <View style={styles.dangerZone}>
        <Text style={styles.dangerHeading}>Delete account and all data</Text>
        <Text style={styles.copy}>Deletion removes private R2 objects before deleting database records.</Text>
        <Pressable accessibilityRole="button" onPress={confirmDelete} style={styles.deleteButton}>
          <Text style={styles.deleteLabel}>Delete account</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F7F4EE', flex: 1 },
  content: { padding: 24, paddingBottom: 60 },
  heading: { color: '#24211D', fontSize: 19, fontWeight: '700', marginTop: 22 },
  label: { color: '#655F57', fontSize: 13, fontWeight: '600', marginTop: 14 },
  input: { backgroundColor: '#FFFFFF', borderColor: '#D8CDBE', borderRadius: 10, borderWidth: 1, color: '#24211D', fontSize: 16, marginTop: 7, padding: 13 },
  copy: { color: '#655F57', fontSize: 14, lineHeight: 21, marginTop: 7 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 14 },
  option: { borderColor: '#A8947D', borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  optionSelected: { backgroundColor: '#7D5C3C', borderColor: '#7D5C3C' },
  optionLabel: { color: '#684F37', fontSize: 13, fontWeight: '700' },
  optionLabelSelected: { color: '#FFFFFF' },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: 18, marginTop: 18 },
  switchCopy: { flex: 1 },
  message: { color: '#684F37', fontSize: 14, marginTop: 18 },
  saveButton: { backgroundColor: '#24211D', borderRadius: 12, marginTop: 24, padding: 14 },
  saveLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  dangerZone: { borderTopColor: '#D8CDBE', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 38, paddingTop: 22 },
  dangerHeading: { color: '#A33B2B', fontSize: 18, fontWeight: '700' },
  deleteButton: { borderColor: '#B85C4A', borderRadius: 12, borderWidth: 1, marginTop: 16, padding: 13 },
  deleteLabel: { color: '#A33B2B', fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
