import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { tripRepository } from '@/composition/services';
import type { LoadState } from '@/contracts/common';
import type { TripSummary } from '@/domain/trip/trip';
import { TripListContent } from '@/features/trips/TripListContent';

export default function TripListScreen() {
  const { signOut } = useAuth();
  const [state, setState] = useState<LoadState<TripSummary[]>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    void tripRepository
      .getTrips()
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
  }, [signOut]);

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'success', data: await tripRepository.getTrips() });
    } catch (error) {
      if (await handleProtectedError(error, signOut)) return;
      setState({
        status: 'error',
        error: error instanceof AppError ? error : new AppError('UNKNOWN', undefined, error),
      });
    }
  }, [signOut]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setState({ status: 'success', data: await tripRepository.getTrips() });
    } catch (error) {
      if (await handleProtectedError(error, signOut)) return;
      setState({
        status: 'error',
        error: error instanceof AppError ? error : new AppError('UNKNOWN', undefined, error),
      });
    } finally {
      setRefreshing(false);
    }
  }, [signOut]);

  return (
    <View style={styles.screen}>
      <TripListContent
        onCreateTrip={() => router.push('/trips/new')}
        onOpenTrip={(id) => router.push({ pathname: '/trips/[id]', params: { id } })}
        onRefresh={() => void refresh()}
        onRetry={() => void reload()}
        refreshing={refreshing}
        state={state}
      />
    </View>
  );
}

const styles = StyleSheet.create({ screen: { backgroundColor: '#F7F4EE', flex: 1 } });

