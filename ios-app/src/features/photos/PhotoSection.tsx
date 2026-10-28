import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { photoRepository, photoUploadService, tripRepository } from '@/composition/services';
import type { LoadState } from '@/contracts/common';
import type { Photo } from '@/domain/photo/photo';

import { selectAndPreparePhotos } from './expoPhotoSelection';
import { runUploadQueue, type PreparedPhoto } from './photoUploadService';

interface UploadItem {
  photo: PreparedPhoto;
  progress: number;
  status: 'queued' | 'uploading' | 'failed';
  error?: string;
}

export function PhotoSection({
  tripId,
  coverPhotoId,
  onCoverPhotoChange,
  onPhotoCountChange,
}: {
  tripId: string;
  coverPhotoId?: string | null;
  onCoverPhotoChange?: (photoId: string | null) => void;
  onPhotoCountChange?: (count: number) => void;
}) {
  const { signOut } = useAuth();
  const [photos, setPhotos] = useState<LoadState<Photo[]>>({ status: 'loading' });
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number } | null>(null);

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

  const runUpload = useCallback(async (photo: PreparedPhoto, refresh = true) => {
    const id = photo.clientUploadId;
    setUploads((items) => upsertUpload(items, { photo, progress: 0, status: 'uploading' }));
    try {
      await photoUploadService.upload(tripId, photo, (progress) => {
        setUploads((items) => items.map((item) => item.photo.clientUploadId === id
          ? { ...item, progress }
          : item));
      });
      setUploads((items) => items.filter((item) => item.photo.clientUploadId !== id));
      if (refresh) await loadPhotos(false);
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
      const savedCount = photos.status === 'success' ? photos.data.length : 0;
      const remaining = 50 - savedCount - uploads.length;
      if (remaining <= 0) throw new Error('This trip already has the maximum of 50 photos');
      const selected = await selectAndPreparePhotos(Math.min(25, remaining));
      if (selected.length === 0) return;
      setUploads((items) => selected.reduce(
        (next, photo) => upsertUpload(next, { photo, progress: 0, status: 'queued' }),
        items,
      ));
      setBatchProgress({ completed: 0, total: selected.length });
      await runUploadQueue(selected, 3, async (photo) => {
        await runUpload(photo, false);
        setBatchProgress((current) => current
          ? { ...current, completed: current.completed + 1 }
          : current);
      });
      await loadPhotos(false);
      setBatchProgress(null);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : 'Photos could not be prepared');
    } finally {
      setSelecting(false);
    }
  }, [loadPhotos, photos, runUpload, uploads.length]);

  const removePhoto = useCallback((photo: Photo) => {
    Alert.alert(
      'Delete photo?',
      'This removes the cloud photo from this trip and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: () => {
            void photoRepository.deletePhoto(tripId, photo.id)
              .then(() => loadPhotos(false))
              .catch(async (error: unknown) => {
                if (await handleProtectedError(error, signOut)) return;
                setSelectionError(error instanceof Error ? error.message : 'Photo could not be deleted');
              });
          },
        },
      ],
    );
  }, [loadPhotos, signOut, tripId]);

  const movePhoto = useCallback(async (index: number, direction: -1 | 1) => {
    if (photos.status !== 'success') return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= photos.data.length) return;
    const reordered = [...photos.data];
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(nextIndex, 0, moved);
    setPhotos({ status: 'success', data: reordered });
    try {
      await photoRepository.reorderPhotos(tripId, reordered.map((photo) => photo.id));
    } catch (error) {
      if (await handleProtectedError(error, signOut)) return;
      setSelectionError(error instanceof Error ? error.message : 'Photo order could not be saved');
      await loadPhotos(false);
    }
  }, [loadPhotos, photos, signOut, tripId]);

  const editCaption = useCallback((photo: Photo) => {
    Alert.prompt(
      'Photo note',
      'Add a factual note that can be used in the travel story.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save', onPress: (caption?: string) => {
            void photoRepository.updatePhoto(tripId, photo.id, { caption: caption?.trim() || null })
              .then(() => loadPhotos(false))
              .catch(async (error: unknown) => {
                if (await handleProtectedError(error, signOut)) return;
                setSelectionError(error instanceof Error ? error.message : 'Photo note could not be saved');
              });
          },
        },
      ],
      'plain-text',
      photo.caption ?? '',
    );
  }, [loadPhotos, signOut, tripId]);

  const editLocation = useCallback((photo: Photo) => {
    Alert.prompt(
      'Photo location',
      'Enter the place shown in this photo. Leave blank to remove it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save', onPress: (locationName?: string) => {
            void photoRepository.updatePhoto(tripId, photo.id, {
              locationName: locationName?.trim() || null,
            }).then(() => loadPhotos(false)).catch(async (error: unknown) => {
              if (await handleProtectedError(error, signOut)) return;
              setSelectionError(error instanceof Error ? error.message : 'Photo location could not be saved');
            });
          },
        },
      ],
      'plain-text',
      photo.locationName ?? '',
    );
  }, [loadPhotos, signOut, tripId]);

  const editCapturedAt = useCallback((photo: Photo) => {
    Alert.prompt(
      'Photo date',
      'Enter YYYY-MM-DD. Leave blank to remove the date.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save', onPress: (value?: string) => {
            const capturedAt = parsePhotoDate(value);
            if (capturedAt === undefined) {
              setSelectionError('Use a valid date in YYYY-MM-DD format');
              return;
            }
            void photoRepository.updatePhoto(tripId, photo.id, { capturedAt })
              .then(() => loadPhotos(false))
              .catch(async (error: unknown) => {
                if (await handleProtectedError(error, signOut)) return;
                setSelectionError(error instanceof Error ? error.message : 'Photo date could not be saved');
              });
          },
        },
      ],
      'plain-text',
      photo.capturedAt ? photo.capturedAt.toISOString().slice(0, 10) : '',
    );
  }, [loadPhotos, signOut, tripId]);

  const setCover = useCallback(async (photo: Photo) => {
    const nextCoverId = coverPhotoId === photo.id ? null : photo.id;
    try {
      await tripRepository.setCoverPhoto(tripId, nextCoverId);
      onCoverPhotoChange?.(nextCoverId);
    } catch (error) {
      if (await handleProtectedError(error, signOut)) return;
      setSelectionError(error instanceof Error ? error.message : 'Cover photo could not be saved');
    }
  }, [coverPhotoId, onCoverPhotoChange, signOut, tripId]);

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
      {photos.status === 'success' ? (
        <Text style={styles.counter}>{photos.data.length + uploads.length}/50 photos</Text>
      ) : null}
      {batchProgress ? (
        <Text style={styles.progressText}>
          Processing {batchProgress.completed}/{batchProgress.total} selected photos · up to 3 at a time
        </Text>
      ) : null}
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
        <Text style={styles.emptyText}>Choose up to 25 photos at once, with a maximum of 50 per trip.</Text>
      ) : null}
      {photos.status === 'success' && photos.data.length > 0 ? (
        <View style={styles.grid}>
          {photos.data.map((photo, index) => (
            <View key={photo.id} style={styles.photoCard}>
              <Image
                accessibilityLabel={photo.originalFilename}
                resizeMode="cover"
                source={{ uri: photo.url }}
                style={styles.photo}
              />
              <View style={styles.photoActions}>
                <Pressable
                  accessibilityLabel={`Move ${photo.originalFilename} earlier`}
                  disabled={index === 0}
                  onPress={() => void movePhoto(index, -1)}
                ><Text style={styles.photoAction}>‹</Text></Pressable>
                <Pressable
                  accessibilityLabel={`Delete ${photo.originalFilename}`}
                  onPress={() => removePhoto(photo)}
                ><Text style={styles.deleteAction}>Delete</Text></Pressable>
                <Pressable
                  accessibilityLabel={`Move ${photo.originalFilename} later`}
                  disabled={index === photos.data.length - 1}
                  onPress={() => void movePhoto(index, 1)}
                ><Text style={styles.photoAction}>›</Text></Pressable>
              </View>
              <Pressable accessibilityRole="button" onPress={() => editCaption(photo)}>
                <Text numberOfLines={2} style={styles.caption}>{photo.caption || 'Add note'}</Text>
              </Pressable>
              <View style={styles.metadataActions}>
                <Pressable accessibilityRole="button" onPress={() => editCapturedAt(photo)}>
                  <Text style={styles.metadataAction}>{photo.capturedAt ? formatPhotoDate(photo.capturedAt) : 'Add date'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => editLocation(photo)}>
                  <Text numberOfLines={1} style={styles.metadataAction}>{photo.locationName || 'Add place'}</Text>
                </Pressable>
              </View>
              <Pressable accessibilityRole="button" onPress={() => void setCover(photo)}>
                <Text style={coverPhotoId === photo.id ? styles.coverSelected : styles.coverAction}>
                  {coverPhotoId === photo.id ? 'Cover photo' : 'Set as cover'}
                </Text>
              </Pressable>
            </View>
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
                : item.status === 'queued'
                  ? 'Waiting to upload'
                  : `Uploading ${Math.round(item.progress * 100)}%`}
            </Text>
          </View>
          {item.status === 'failed' ? (
            <Pressable accessibilityRole="button" onPress={() => void runUpload(item.photo)}>
              <Text style={styles.retryLabel}>Retry</Text>
            </Pressable>
          ) : item.status === 'uploading' ? <ActivityIndicator color="#7D5C3C" /> : null}
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
  counter: { color: '#655F57', fontSize: 13, marginTop: 12 },
  errorText: { color: '#A33B2B', fontSize: 14, lineHeight: 20, marginTop: 8 },
  retryLabel: { color: '#7D5C3C', fontSize: 14, fontWeight: '700' },
  statusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  photoCard: { width: '31%' },
  photo: { aspectRatio: 1, backgroundColor: '#E8E1D7', borderRadius: 10, width: '100%' },
  photoActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  photoAction: { color: '#7D5C3C', fontSize: 21, fontWeight: '700', paddingHorizontal: 5 },
  deleteAction: { color: '#A33B2B', fontSize: 11, fontWeight: '700' },
  caption: { color: '#655F57', fontSize: 11, lineHeight: 15, marginTop: 5, textAlign: 'center' },
  metadataActions: { gap: 3, marginTop: 6 },
  metadataAction: { color: '#6B6258', fontSize: 10, textAlign: 'center', textDecorationLine: 'underline' },
  coverAction: { color: '#7D5C3C', fontSize: 11, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  coverSelected: { color: '#FFFFFF', backgroundColor: '#7D5C3C', borderRadius: 8, fontSize: 11, fontWeight: '700', marginTop: 6, overflow: 'hidden', paddingVertical: 4, textAlign: 'center' },
  uploadRow: { alignItems: 'center', backgroundColor: '#EFE9E0', borderRadius: 10, flexDirection: 'row', marginTop: 12, padding: 12 },
  uploadCopy: { flex: 1, marginRight: 12 },
  uploadName: { color: '#24211D', fontSize: 14, fontWeight: '600' },
  progressText: { color: '#655F57', fontSize: 13, marginTop: 4 },
});

function parsePhotoDate(value?: string): string | null | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  const date = new Date(`${trimmed}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) return undefined;
  return date.toISOString();
}

function formatPhotoDate(value: Date): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(value);
}
