import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { photoRepository, photoUploadService } from '@/composition/services';
import type { LoadState } from '@/contracts/common';
import type { Photo } from '@/domain/photo/photo';

import { selectAndPreparePhotos } from './expoPhotoSelection';
import type { PreparedPhoto } from './photoUploadService';

interface UploadItem {
  photo: PreparedPhoto;
  progress: number;
  status: 'uploading' | 'failed';
  error?: string;
}

export function PhotoSection({
  tripId,
  onPhotoCountChange,
}: {
  tripId: string;
  onPhotoCountChange?: (count: number) => void;
}) {
  const { signOut } = useAuth();
  const [photos, setPhotos] = useState<LoadState<Photo[]>>({ status: 'loading' });
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const loadPhotos = useCallback(async (showLoading = true) => {
    if (showLoading) setPhotos({ status: 'loading' });
    try {
      const data = await photoRepository.getPhotos(tripId);
      setPhotos({ status: 'success', data });
      onPhotoCountChange?.(data.length);
    } catch (error) {
      if (await handleProtectedError(error, signOut)) return;
      setPhotos({
        status: 'error',
        error: error instanceof AppError ? error : new AppError('UNKNOWN', undefined, error),
      });
    }
  }, [onPhotoCountChange, signOut, tripId]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  const runUpload = useCallback(async (photo: PreparedPhoto) => {
    const id = photo.clientUploadId;
    setUploads((items) => upsertUpload(items, { photo, progress: 0, status: 'uploading' }));
    try {
      await photoUploadService.upload(tripId, photo, (progress) => {
        setUploads((items) => items.map((item) => item.photo.clientUploadId === id
          ? { ...item, progress }
          : item));
      });
      setUploads((items) => items.filter((item) => item.photo.clientUploadId !== id));
      await loadPhotos(false);
    } catch (error) {
      if (await handleProtectedError(error, signOut)) return;
      setUploads((items) => items.map((item) => item.photo.clientUploadId === id
        ? {
            ...item,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Upload failed',
          }
        : item));
    }
  }, [loadPhotos, signOut, tripId]);

  const addPhotos = useCallback(async () => {
    setSelecting(true);
    setSelectionError(null);
    try {
      const selected = await selectAndPreparePhotos();
      for (const photo of selected) void runUpload(photo);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : 'Photos could not be prepared');
    } finally {
      setSelecting(false);
    }
  }, [runUpload]);

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Text style={styles.label}>Photos</Text>
        <Pressable
          accessibilityRole="button"
          disabled={selecting}
          onPress={() => void addPhotos()}
          style={({ pressed }) => [styles.addButton, (pressed || selecting) && styles.buttonPressed]}
        >
          <Text style={styles.addButtonLabel}>{selecting ? 'Preparing…' : 'Add Photos'}</Text>
        </Pressable>
      </View>

      {selectionError ? <Text style={styles.errorText}>{selectionError}</Text> : null}
      {photos.status === 'loading' || photos.status === 'idle' ? (
        <ActivityIndicator accessibilityLabel="Loading photos" color="#7D5C3C" style={styles.photoLoader} />
      ) : null}
      {photos.status === 'error' ? (
        <View style={styles.statusRow}>
          <Text style={styles.errorText}>Couldn&apos;t load photos.</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadPhotos()}>
            <Text style={styles.retryLabel}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {photos.status === 'success' && photos.data.length === 0 && uploads.length === 0 ? (
        <Text style={styles.emptyText}>Add up to five photos from your library.</Text>
      ) : null}
      {photos.status === 'success' && photos.data.length > 0 ? (
        <View style={styles.grid}>
          {photos.data.map((photo) => (
            <Image
              accessibilityLabel={photo.originalFilename}
              key={photo.id}
              resizeMode="cover"
              source={{ uri: photo.url }}
              style={styles.photo}
            />
          ))}
        </View>
      ) : null}
      {uploads.map((item) => (
        <View key={item.photo.clientUploadId} style={styles.uploadRow}>
          <View style={styles.uploadCopy}>
            <Text numberOfLines={1} style={styles.uploadName}>{item.photo.originalFilename}</Text>
            <Text style={item.status === 'failed' ? styles.errorText : styles.progressText}>
              {item.status === 'failed'
                ? item.error ?? 'Upload failed'
                : `Uploading ${Math.round(item.progress * 100)}%`}
            </Text>
          </View>
          {item.status === 'failed' ? (
            <Pressable accessibilityRole="button" onPress={() => void runUpload(item.photo)}>
              <Text style={styles.retryLabel}>Retry</Text>
            </Pressable>
          ) : <ActivityIndicator color="#7D5C3C" />}
        </View>
      ))}
    </View>
  );
}

function upsertUpload(items: UploadItem[], next: UploadItem): UploadItem[] {
  const existingIndex = items.findIndex(
    (item) => item.photo.clientUploadId === next.photo.clientUploadId,
  );
  if (existingIndex < 0) return [...items, next];
  return items.map((item, index) => index === existingIndex ? next : item);
}

const styles = StyleSheet.create({
  section: { borderTopColor: '#DED6CA', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 28, paddingTop: 20 },
  headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: '#7D5C3C', fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  addButton: { backgroundColor: '#24211D', borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10 },
  addButtonLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  buttonPressed: { opacity: 0.65 },
  photoLoader: { marginVertical: 24 },
  emptyText: { color: '#655F57', fontSize: 15, lineHeight: 22, marginTop: 18 },
  errorText: { color: '#A33B2B', fontSize: 14, lineHeight: 20, marginTop: 8 },
  retryLabel: { color: '#7D5C3C', fontSize: 14, fontWeight: '700' },
  statusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  photo: { aspectRatio: 1, backgroundColor: '#E8E1D7', borderRadius: 10, width: '31%' },
  uploadRow: { alignItems: 'center', backgroundColor: '#EFE9E0', borderRadius: 10, flexDirection: 'row', marginTop: 12, padding: 12 },
  uploadCopy: { flex: 1, marginRight: 12 },
  uploadName: { color: '#24211D', fontSize: 14, fontWeight: '600' },
  progressText: { color: '#655F57', fontSize: 13, marginTop: 4 },
});
