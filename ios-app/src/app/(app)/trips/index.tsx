import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { tripRepository } from '@/composition/services';
import type { LoadState } from '@/contracts/common';
import type { TripSummary } from '@/domain/trip/trip';
import { TripListContent } from '@/features/trips/TripListContent';
import { getTripListRevision } from '@/features/trips/tripListInvalidation';

export default function TripListScreen() {
  const { signOut } = useAuth();
  const [state, setState] = useState<LoadState<TripSummary[]>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<AppError | null>(null);
  const loadedRevision = useRef<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      const targetRevision = getTripListRevision();
      if (loadedRevision.current === targetRevision) return;

      let active = true;
      const preserveExistingData = loadedRevision.current !== null;
      setRefreshError(null);
      if (preserveExistingData) setRefreshing(true);
      else setState({ status: 'loading' });

      void tripRepository
        .getTrips()
        .then((data) => {
          if (!active) return;
          loadedRevision.current = targetRevision;
          setState({ status: 'success', data });
        })
        .catch(async (error: unknown) => {
          if (!active || (await handleProtectedError(error, signOut)) || !active) return;
          const appError = normalizeError(error);
          if (preserveExistingData) setRefreshError(appError);
          else setState({ status: 'error', error: appError });
        })
        .finally(() => {
          if (active) setRefreshing(false);
        });

      return () => {
        active = false;
      };
    }, [signOut])
  );

  const reload = useCallback(async () => {
    const targetRevision = getTripListRevision();
    setState({ status: 'loading' });
    setRefreshError(null);
    try {
      setState({ status: 'success', data: await tripRepository.getTrips() });
      loadedRevision.current = targetRevision;
    } catch (error) {
      if (await handleProtectedError(error, signOut)) return;
      setState({ status: 'error', error: normalizeError(error) });
    }
  }, [signOut]);

  const refresh = useCallback(async () => {
    const targetRevision = getTripListRevision();
    setRefreshing(true);
    setRefreshError(null);
    try {
      setState({ status: 'success', data: await tripRepository.getTrips() });
      loadedRevision.current = targetRevision;
    } catch (error) {
      if (await handleProtectedError(error, signOut)) return;
      setRefreshError(normalizeError(error));
    } finally {
      setRefreshing(false);
    }
  }, [signOut]);

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Pressable accessibilityLabel="Create trip" accessibilityRole="button" onPress={() => router.push('/trips/new')}>
          <Text style={styles.createTrip}>Create trip</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
      <TripListContent
        onCreateTrip={() => router.push('/trips/new')}
        onOpenTrip={(id) => router.push({ pathname: '/trips/[id]', params: { id } })}
        onRefresh={() => void refresh()}
        onRetry={() => void reload()}
        refreshError={refreshError}
        refreshing={refreshing}
        state={state}
      />
    </View>
  );
}

function normalizeError(error: unknown): AppError {
  return error instanceof AppError ? error : new AppError('UNKNOWN', undefined, error);
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F7F4EE', flex: 1 },
  toolbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 },
  createTrip: { color: '#7D5C3C', fontSize: 15, fontWeight: '700', padding: 8 },
  signOut: { color: '#655F57', fontSize: 14, fontWeight: '600', padding: 8 },
});

