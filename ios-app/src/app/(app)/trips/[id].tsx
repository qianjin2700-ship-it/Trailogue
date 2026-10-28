import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { tripRepository } from '@/composition/services';
import type { LoadState } from '@/contracts/common';
import type { Trip } from '@/domain/trip/trip';
import { formatTripDateRange } from '@/features/trips/formatTripDateRange';
import { PhotoSection } from '@/features/photos/PhotoSection';
import { invalidateTripList } from '@/features/trips/tripListInvalidation';

export default function TripDetailScreen() {
  const { signOut } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id;
  const [state, setState] = useState<LoadState<Trip>>({ status: 'loading' });

  const updatePhotoCount = useCallback((photoCount: number) => {
    setState((current) => current.status === 'success'
      ? { status: 'success', data: { ...current.data, photoCount } }
      : current);
  }, []);

  const updateCoverPhoto = useCallback((coverPhotoId: string | null) => {
    setState((current) => current.status === 'success'
      ? { status: 'success', data: { ...current.data, coverPhotoId } }
      : current);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setState({ status: 'loading' });
    try {
      setState({ status: 'success', data: await tripRepository.getTrip(id) });
    } catch (error) {
      if (await handleProtectedError(error, signOut)) return;
      setState({
        status: 'error',
        error: error instanceof AppError ? error : new AppError('UNKNOWN', undefined, error),
      });
    }
  }, [id, signOut]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void tripRepository
      .getTrip(id)
      .then((data) => active && setState({ status: 'success', data }))
      .catch(async (error: unknown) => {
        if (!active || (await handleProtectedError(error, signOut))) return;
        if (active) setState({
          status: 'error',
          error: error instanceof AppError ? error : new AppError('UNKNOWN', undefined, error),
        });
      });
    return () => {
      active = false;
    };
  }, [id, signOut]);

  if (!id) return <StateMessage title="Trip not found" />;
  if (state.status === 'idle' || state.status === 'loading') {
    return <ActivityIndicator accessibilityLabel="Loading trip" color="#7D5C3C" size="large" style={styles.loader} />;
  }
  if (state.status === 'error') {
    return <StateMessage action={() => void load()} detail={state.error.message} title="Couldn't load this trip" />;
  }

  const trip = state.data;
  const travelDates = formatTripDateRange(trip.startDate, trip.endDate);
  const deleteTrip = () => {
    Alert.alert(
      'Delete this trip?',
      'The trip, its photos, stories, and books will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: () => {
            void tripRepository.deleteTrip(trip.id)
              .then(() => {
                invalidateTripList();
                router.replace('/trips');
              })
              .catch(async (error: unknown) => {
                if (await handleProtectedError(error, signOut)) return;
                setState({
                  status: 'error',
                  error: error instanceof AppError ? error : new AppError('UNKNOWN', undefined, error),
                });
              });
          },
        },
      ],
    );
  };
  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>{trip.title}</Text>
      {travelDates ? <Text style={styles.travelDates}>{travelDates}</Text> : null}
      <Text style={styles.meta}>{trip.photoCount} {trip.photoCount === 1 ? 'photo' : 'photos'} · {trip.status}</Text>
      {trip.destinationName ? <Section label="Destination" value={trip.destinationName} /> : null}
      {trip.description ? <Section label="About this trip" value={trip.description} /> : null}
      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/trips/edit', params: { id: trip.id } })}
          style={styles.secondaryButton}
        ><Text style={styles.secondaryButtonLabel}>Edit trip</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={deleteTrip} style={styles.deleteButton}>
          <Text style={styles.deleteButtonLabel}>Delete trip</Text>
        </Pressable>
      </View>
      <PhotoSection
        coverPhotoId={trip.coverPhotoId}
        onCoverPhotoChange={updateCoverPhoto}
        onPhotoCountChange={updatePhotoCount}
        tripId={trip.id}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/trips/creative', params: { id: trip.id } })}
        style={styles.storyButton}
      >
        <Text style={styles.storyButtonLabel}>Set creative requirements</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/trips/story', params: { id: trip.id } })} style={styles.secondaryStoryButton}>
        <Text style={styles.secondaryStoryLabel}>Open current story</Text>
      </Pressable>
      <Section label="Last updated" value={trip.updatedAt.toLocaleDateString()} />
    </ScrollView>
  );
}

function Section({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.sectionValue}>{value}</Text>
    </View>
  );
}

function StateMessage({ title, detail, action }: { title: string; detail?: string; action?: () => void }) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>{title}</Text>
      {detail ? <Text style={styles.stateDetail}>{detail}</Text> : null}
      {action ? (
        <Pressable accessibilityRole="button" onPress={action} style={styles.button}>
          <Text style={styles.buttonLabel}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F7F4EE', flex: 1 },
  content: { padding: 24 },
  loader: { backgroundColor: '#F7F4EE', flex: 1 },
  title: { color: '#24211D', fontSize: 34, fontWeight: '700', letterSpacing: -0.8 },
  meta: { color: '#7D5C3C', fontSize: 14, fontWeight: '600', marginTop: 10, textTransform: 'capitalize' },
  travelDates: { color: '#4D443B', fontSize: 17, fontWeight: '600', marginTop: 9 },
  section: { borderTopColor: '#DED6CA', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 28, paddingTop: 20 },
  sectionLabel: { color: '#7D5C3C', fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  sectionValue: { color: '#24211D', fontSize: 17, lineHeight: 25, marginTop: 8 },
  state: { alignItems: 'center', backgroundColor: '#F7F4EE', flex: 1, justifyContent: 'center', padding: 32 },
  stateTitle: { color: '#24211D', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  stateDetail: { color: '#655F57', fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  button: { backgroundColor: '#24211D', borderRadius: 12, marginTop: 22, paddingHorizontal: 22, paddingVertical: 13 },
  buttonLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  secondaryButton: { borderColor: '#7D5C3C', borderRadius: 10, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 11 },
  secondaryButtonLabel: { color: '#5D432D', fontSize: 14, fontWeight: '700' },
  deleteButton: { borderColor: '#B85C4A', borderRadius: 10, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 11 },
  deleteButtonLabel: { color: '#A33B2B', fontSize: 14, fontWeight: '700' },
  storyButton: { backgroundColor: '#7D5C3C', borderRadius: 14, marginTop: 28, padding: 16 },
  storyButtonLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  secondaryStoryButton: { borderColor: '#7D5C3C', borderRadius: 14, borderWidth: 1, marginTop: 12, padding: 15 },
  secondaryStoryLabel: { color: '#684F37', fontSize: 15, fontWeight: '700', textAlign: 'center' },
});

