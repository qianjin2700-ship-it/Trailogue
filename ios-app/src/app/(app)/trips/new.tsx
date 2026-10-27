import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { tripRepository } from '@/composition/services';
import { invalidateTripList } from '@/features/trips/tripListInvalidation';

export default function NewTripScreen() {
  const { signOut } = useAuth();
  const [title, setTitle] = useState('');
  const [destinationName, setDestinationName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef(Crypto.randomUUID());

  const submit = async () => {
    const input = { title: title.trim(), destinationName: destinationName.trim(), description: description.trim() || null, startDate: startDate.trim(), endDate: endDate.trim() };
    if (!input.title || !input.destinationName || !isDate(input.startDate) || !isDate(input.endDate) || input.startDate > input.endDate) {
      setError('Enter a title, destination, and valid dates with the end date on or after the start date.');
      return;
    }
    setSubmitting(true); setError(null);
    try {
      const trip = await tripRepository.createTrip(input, idempotencyKey.current);
      invalidateTripList();
      router.replace({ pathname: '/trips/[id]', params: { id: trip.id } });
    } catch (cause) {
      if (await handleProtectedError(cause, signOut)) return;
      setError(cause instanceof AppError ? cause.message : 'Couldn\'t create this trip. Try again.');
    } finally { setSubmitting(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.title}>Create a new trip</Text>
      <Text style={styles.description}>Start with the details. You can add photos next.</Text>
      <Field label="Trip title" value={title} onChangeText={setTitle} placeholder="Summer in California" />
      <Field label="Destination" value={destinationName} onChangeText={setDestinationName} placeholder="California" />
      <Field label="Start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
      <Field label="End date" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />
      <Field label="Description (optional)" value={description} onChangeText={setDescription} placeholder="What made this trip special?" multiline />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={submitting} onPress={() => void submit()} style={[styles.button, submitting && styles.buttonDisabled]}>
        <Text style={styles.buttonLabel}>{submitting ? 'Creating…' : 'Create trip'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, multiline = false, ...props }: { label: string; multiline?: boolean; value: string; onChangeText(value: string): void; placeholder: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} accessibilityLabel={label} multiline={multiline} style={[styles.input, multiline && styles.textarea]} /></View>;
}

function isDate(value: string) { const date = new Date(`${value}T00:00:00.000Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }

const styles = StyleSheet.create({
  container: { backgroundColor: '#F7F4EE', flexGrow: 1, padding: 24 },
  title: { color: '#24211D', fontSize: 30, fontWeight: '700' },
  description: { color: '#655F57', fontSize: 16, lineHeight: 24, marginTop: 12 },
  field: { marginTop: 22 }, label: { color: '#655F57', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: '#FFFDF9', borderColor: '#DED6CA', borderRadius: 10, borderWidth: 1, color: '#24211D', fontSize: 16, padding: 14 },
  textarea: { minHeight: 96, textAlignVertical: 'top' }, error: { color: '#A03B2A', lineHeight: 20, marginTop: 18 },
  button: { alignItems: 'center', backgroundColor: '#24211D', borderRadius: 12, marginTop: 24, padding: 15 }, buttonDisabled: { opacity: 0.6 }, buttonLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});

