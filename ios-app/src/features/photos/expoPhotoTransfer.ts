import { File, UploadType } from 'expo-file-system';

import type { PhotoTransfer } from './photoUploadService';

export const expoPhotoTransfer: PhotoTransfer = {
  async upload(input, onProgress) {
    const file = new File(input.uri);
    const task = file.createUploadTask(input.url, {
      httpMethod: input.method,
      uploadType: UploadType.BINARY_CONTENT,
      headers: input.headers,
      mimeType: input.mimeType,
      sessionType: 'foreground',
      onProgress: ({ bytesSent, totalBytes }) => {
        if (totalBytes > 0) onProgress(Math.min(1, Math.max(0, bytesSent / totalBytes)));
      },
    });
    const result = await task.uploadAsync();
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Photo upload failed with status ${result.status}`);
    }
  },
};
