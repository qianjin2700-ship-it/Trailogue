import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { PreparedPhoto } from './photoUploadService';

const MAX_SELECTION = 5;
const MAX_EDGE = 4_096;
const JPEG_QUALITY = 0.82;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function selectAndPreparePhotos(): Promise<PreparedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: MAX_SELECTION,
    orderedSelection: true,
    quality: 1,
  });
  if (result.canceled) return [];
  const prepared: PreparedPhoto[] = [];
  for (const asset of result.assets.slice(0, MAX_SELECTION)) {
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
    };
  } finally {
    rendered.release();
    context.release();
  }
}

function jpegFilename(filename: string | null | undefined, fallback: string): string {
  if (!filename) return `${fallback}.jpg`;
  const base = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 240);
  return `${base || fallback}.jpg`;
}
