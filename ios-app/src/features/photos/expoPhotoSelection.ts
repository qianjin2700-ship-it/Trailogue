import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { PreparedPhoto } from './photoUploadService';

const MAX_SELECTION = 25;
const MAX_EDGE = 4_096;
const JPEG_QUALITY = 0.82;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function selectAndPreparePhotos(limit = MAX_SELECTION): Promise<PreparedPhoto[]> {
  const selectionLimit = Math.max(1, Math.min(MAX_SELECTION, limit));
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit,
    orderedSelection: true,
    quality: 1,
    exif: true,
  });
  if (result.canceled) return [];
  const prepared: PreparedPhoto[] = [];
  for (const asset of result.assets.slice(0, selectionLimit)) {
    prepared.push(await normalizeToJpeg(asset));
  }
  return prepared;
}

async function normalizeToJpeg(asset: ImagePicker.ImagePickerAsset): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(asset.uri);
  const longestEdge = Math.max(asset.width, asset.height);
  if (longestEdge > MAX_EDGE) {
    if (asset.width >= asset.height) context.resize({ width: MAX_EDGE });
    else context.resize({ height: MAX_EDGE });
  }
  const rendered = await context.renderAsync();
  try {
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    const file = new File(saved.uri);
    const clientUploadId = randomUUID();
    if (!file.exists || !file.size) throw new Error('The selected photo could not be prepared');
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('This photo is still larger than 15 MB after compression');
    }
    return {
      clientUploadId,
      uri: saved.uri,
      originalFilename: jpegFilename(asset.fileName, clientUploadId),
      mimeType: 'image/jpeg',
      fileSize: file.size,
      width: saved.width,
      height: saved.height,
      capturedAt: capturedAtFromExif(asset.exif),
    };
  } finally {
    rendered.release();
    context.release();
  }
}

function capturedAtFromExif(exif: Record<string, unknown> | null | undefined): string | null {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTimeDigitized ?? exif?.DateTime;
  if (typeof raw !== 'string') return null;
  const normalized = raw.replace(
    /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}:\d{2}:\d{2})$/,
    '$1-$2-$3T$4',
  );
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function jpegFilename(filename: string | null | undefined, fallback: string): string {
  if (!filename) return `${fallback}.jpg`;
  const base = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 240);
  return `${base || fallback}.jpg`;
}
