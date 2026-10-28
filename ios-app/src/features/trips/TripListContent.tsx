import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LoadState } from '@/contracts/common';
import type { TripSummary } from '@/domain/trip/trip';
import { formatTripDateRange } from './formatTripDateRange';

interface TripListContentProps {
  state: LoadState<TripSummary[]>;
  refreshing: boolean;
  refreshError?: Error | null;
  onRefresh(): void;
  onRetry(): void;
  onCreateTrip(): void;
  onOpenTrip(id: string): void;
}

export function TripListContent({
  state,
  refreshing,
  refreshError,
  onRefresh,
  onRetry,
  onCreateTrip,
  onOpenTrip,
}: TripListContentProps) {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator accessibilityLabel="Loading trips" color="#7D5C3C" size="large" />
        <Text style={styles.supportingText}>Loading your trips…</Text>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.stateTitle}>Couldn&apos;t load trips</Text>
        <Text style={styles.supportingText}>{state.error.message}</Text>
        <PrimaryButton label="Retry" onPress={onRetry} />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={state.data.length === 0 ? styles.emptyList : styles.list}
      data={state.data}
      keyExtractor={(trip) => trip.id}
      ListHeaderComponent={
        refreshError ? (
          <View accessibilityRole="alert" style={styles.refreshError}>
            <View style={styles.refreshErrorCopy}>
              <Text style={styles.refreshErrorTitle}>Couldn&apos;t refresh trips</Text>
              <Text style={styles.refreshErrorDetail}>{refreshError.message}</Text>
            </View>
            <Pressable accessibilityLabel="Retry refresh" accessibilityRole="button" onPress={onRefresh}>
              <Text style={styles.retryRefresh}>Retry</Text>
            </Pressable>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.stateTitle}>No trips yet</Text>
          <Text style={styles.supportingText}>Your next story starts with a few travel photos.</Text>
          <PrimaryButton label="Create your first trip" onPress={onCreateTrip} />
        </View>
      }
      onRefresh={onRefresh}
      refreshing={refreshing}
      renderItem={({ item }) => <TripCard trip={item} onPress={() => onOpenTrip(item.id)} />}
    />
  );
}

function TripCard({ trip, onPress }: { trip: TripSummary; onPress(): void }) {
  const dates = formatTripDateRange(trip.startDate, trip.endDate);
  return (
    <Pressable
      accessibilityLabel={`Open ${trip.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {trip.coverUrl ? (
        <Image accessibilityLabel={`${trip.title} cover`} source={{ uri: trip.coverUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Text style={styles.coverFallbackText}>Trailogue</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {trip.title}
        </Text>
        {dates ? <Text style={styles.tripDates}>{dates}</Text> : null}
        {trip.destinationName ? <Text numberOfLines={1} style={styles.destination}>{trip.destinationName}</Text> : null}
        <Text style={styles.cardMeta}>
          {trip.photoCount} {trip.photoCount === 1 ? 'photo' : 'photos'} · Updated{' '}
          {formatDate(trip.updatedAt)}
        </Text>
        <Text style={styles.status}>{trip.status.replace('_', ' ')}</Text>
      </View>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

const styles = StyleSheet.create({
  list: { gap: 16, padding: 20 },
  emptyList: { flexGrow: 1 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 32 },
  stateTitle: { color: '#24211D', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  supportingText: { color: '#655F57', fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  button: { backgroundColor: '#24211D', borderRadius: 12, marginTop: 22, paddingHorizontal: 22, paddingVertical: 13 },
  buttonLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden' },
  cardPressed: { opacity: 0.82 },
  cover: { backgroundColor: '#DDD3C4', height: 170, width: '100%' },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  coverFallbackText: { color: '#7D5C3C', fontSize: 15, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  cardBody: { padding: 18 },
  cardTitle: { color: '#24211D', fontSize: 21, fontWeight: '700' },
  cardMeta: { color: '#655F57', fontSize: 14, lineHeight: 20, marginTop: 8 },
  tripDates: { color: '#4A443D', fontSize: 14, fontWeight: '600', marginTop: 8 },
  destination: { color: '#7D5C3C', fontSize: 14, marginTop: 5 },
  status: { color: '#7D5C3C', fontSize: 12, fontWeight: '700', marginTop: 12, textTransform: 'uppercase' },
  refreshError: { alignItems: 'center', backgroundColor: '#F4E5DF', borderRadius: 12, flexDirection: 'row', gap: 12, justifyContent: 'space-between', padding: 14 },
  refreshErrorCopy: { flex: 1 },
  refreshErrorTitle: { color: '#7A2E22', fontSize: 14, fontWeight: '700' },
  refreshErrorDetail: { color: '#7A2E22', fontSize: 13, marginTop: 4 },
  retryRefresh: { color: '#7A2E22', fontSize: 14, fontWeight: '700', padding: 6 },
});

