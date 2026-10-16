import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppError } from '@/api/errors';
import { tripRepository } from '@/composition/services';
import type { LoadState } from '@/contracts/common';
import type { TripSummary } from '@/domain/trip/trip';
import { TripListContent } from '@/features/trips/TripListContent';

export default function TripListScreen() {
  const [state, setState] = useState<LoadState<TripSummary[]>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    void tripRepository
      .getTrips()
      .then((data) => active && setState({ status: 'success', data }))
      .catch((error: unknown) =>
        active &&
        setState({
          status: 'error',
          error: error instanceof AppError ? error : new AppError('UNKNOWN', undefined, error),
        })
      );
    return () => {
      active = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'success', data: await tripRepository.getTrips() });
    } catch (error) {
      setState({
        status: 'error',
        error: error instanceof AppError ? error : new AppError('UNKNOWN', undefined, error),
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setState({ status: 'success', data: await tripRepository.getTrips() });
    } catch (error) {
      setState({
        status: 'error',
        error: error instanceof AppError ? error : new AppError('UNKNOWN', undefined, error),
      });
    } finally {
      setRefreshing(false);
    }
  }, []);

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

