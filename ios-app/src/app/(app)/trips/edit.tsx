import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { tripRepository } from '@/composition/services';
import { invalidateTripList } from '@/features/trips/tripListInvalidation';

export default function EditTripScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { signOut } = useAuth();
  const [title, setTitle] = useState('');
  const [destinationName, setDestinationName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [storyBackground, setStoryBackground] = useState('');
  const [peopleNotes, setPeopleNotes] = useState('');
  const [highlights, setHighlights] = useState('');
  const [writingStyle, setWritingStyle] = useState('warm_documentary');
  const [customWritingStyle, setCustomWritingStyle] = useState('');
  const [avoidExpressions, setAvoidExpressions] = useState('');
  const [contentLength, setContentLength] = useState('medium');
  const [arrangement, setArrangement] = useState('timeline');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void tripRepository.getTrip(id).then((trip) => {
      if (!active) return;
      setTitle(trip.title);
      setDestinationName(trip.destinationName ?? '');
      setDescription(trip.description ?? '');
      setStartDate(trip.startDate ?? '');
      setEndDate(trip.endDate ?? '');
      setStoryBackground(trip.storyBackground ?? '');
      setPeopleNotes(trip.peopleNotes ?? '');
      setHighlights(trip.highlights ?? '');
      setWritingStyle(trip.writingStyle);
      setCustomWritingStyle(trip.customWritingStyle ?? '');
      setAvoidExpressions(trip.avoidExpressions ?? '');
      setContentLength(trip.contentLength);
      setArrangement(trip.arrangement);
      setLoading(false);
    }).catch(async (cause: unknown) => {
      if (!active || await handleProtectedError(cause, signOut)) return;
      setError(cause instanceof AppError ? cause.message : 'Could not load this trip');
      setLoading(false);
    });
    return () => { active = false; };
  }, [id, signOut]);

  const submit = async () => {
    if (!id) return;
    const input = {
      title: title.trim(), destinationName: destinationName.trim(),
      description: description.trim() || null, startDate: startDate.trim(), endDate: endDate.trim(),
      storyBackground: storyBackground.trim() || null,
      peopleNotes: peopleNotes.trim() || null,
      highlights: highlights.trim() || null,
      writingStyle,
      customWritingStyle: customWritingStyle.trim() || null,
      avoidExpressions: avoidExpressions.trim() || null,
      contentLength,
      arrangement,
    };
    if (!input.title || !input.destinationName || !isDate(input.startDate) ||
      !isDate(input.endDate) || input.startDate > input.endDate) {
      setError('Enter a title, destination, and valid date range.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await tripRepository.updateTrip(id, input);
      invalidateTripList();
      router.replace({ pathname: '/trips/[id]', params: { id } });
    } catch (cause) {
      if (await handleProtectedError(cause, signOut)) return;
      setError(cause instanceof AppError ? cause.message : 'Could not save this trip');
    } finally {
      setSubmitting(false);
    }
  };

  if (!id) {
    return <View style={styles.message}><Text style={styles.error}>Trip not found</Text></View>;
  }
  if (loading) {
    return <ActivityIndicator accessibilityLabel="Loading trip editor" color="#7D5C3C" style={styles.loading} />;
  }
  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.title}>Edit trip</Text>
      <Field label="Trip title" value={title} onChangeText={setTitle} />
      <Field label="Destination" value={destinationName} onChangeText={setDestinationName} />
      <Field label="Start date" value={startDate} onChangeText={setStartDate} />
      <Field label="End date" value={endDate} onChangeText={setEndDate} />
      <Field label="Description (optional)" value={description} onChangeText={setDescription} multiline />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button" disabled={submitting} onPress={() => void submit()}
        style={[styles.button, submitting && styles.buttonDisabled]}
      ><Text style={styles.buttonLabel}>{submitting ? 'Saving…' : 'Save changes'}</Text></Pressable>
    </ScrollView>
  );
}

function Field({ label, multiline = false, ...props }: {
  label: string; multiline?: boolean; value: string; onChangeText(value: string): void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props} accessibilityLabel={label} multiline={multiline}
        placeholder={label.includes('date') ? 'YYYY-MM-DD' : undefined}
        style={[styles.input, multiline && styles.textarea]}
      />
    </View>
  );
}

function isDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

const styles = StyleSheet.create({
  loading: { backgroundColor: '#F7F4EE', flex: 1 },
  message: { alignItems: 'center', backgroundColor: '#F7F4EE', flex: 1, justifyContent: 'center' },
  container: { backgroundColor: '#F7F4EE', flexGrow: 1, padding: 24 },
  title: { color: '#24211D', fontSize: 30, fontWeight: '700' },
  field: { marginTop: 22 },
  label: { color: '#655F57', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: '#FFFDF9', borderColor: '#DED6CA', borderRadius: 10, borderWidth: 1, color: '#24211D', fontSize: 16, padding: 14 },
  textarea: { minHeight: 96, textAlignVertical: 'top' },
  error: { color: '#A03B2A', lineHeight: 20, marginTop: 18 },
  button: { alignItems: 'center', backgroundColor: '#24211D', borderRadius: 12, marginTop: 24, padding: 15 },
  buttonDisabled: { opacity: 0.6 },
  buttonLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});

