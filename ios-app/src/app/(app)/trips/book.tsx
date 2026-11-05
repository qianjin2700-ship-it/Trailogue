import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { photoRepository, sharesApi, storyRepository } from '@/composition/services';
import type { BookPreviewDTO, ShareLinkDTO } from '@/contracts/story';
import type { Photo } from '@/domain/photo/photo';
import { recordPerformance } from '@/diagnostics/performance';
import { makePdfFilename } from '@/features/books/bookLayout';
import { materializeBookPhotos, withTimeout } from '@/features/books/pdfExport';
import { ErrorState } from '@/features/v2-ui';
import {
  renderMagazineHtml,
  renderStoryHtml,
  type MagazineDocument,
  type StoryDocument,
} from '@/features/v2';
import { createV2DocumentsFromBook } from '@/features/v2/bookDocuments';

type BookView = 'story' | 'magazine';

export default function BookPreviewScreen() {
  const { signOut } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [book, setBook] = useState<BookPreviewDTO | null>(null);
  const [photos, setPhotos] = useState<Map<string, Photo>>(new Map());
  const [storyDocument, setStoryDocument] = useState<StoryDocument | null>(null);
  const [magazineDocument, setMagazineDocument] = useState<MagazineDocument | null>(null);
  const [view, setView] = useState<BookView>('story');
  const [error, setError] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [previewNeedsRetry, setPreviewNeedsRetry] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStage, setExportStage] = useState<string | null>(null);
  const [activeShare, setActiveShare] = useState<ShareLinkDTO | null>(null);
  const photoRefreshAttemptedRef = useRef(false);
  const photoRefreshInFlightRef = useRef(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const startedAt = Date.now();
    void Promise.all([storyRepository.getBook(id), photoRepository.getPhotos(id)])
      .then(([nextBook, nextPhotos]) => {
        if (!active) return;
        const photoMap = new Map(nextPhotos.map((photo) => [photo.id, photo]));
        const documents = createV2DocumentsFromBook(nextBook, photoMap.values());
        setBook(nextBook);
        setPhotos(photoMap);
        setStoryDocument(documents.story);
        setMagazineDocument(documents.magazine);
        setError(null);
        recordPerformance('book_preview', startedAt, { photoCount: nextPhotos.length });
      })
      .catch(async (cause: unknown) => {
        if (!active || (await handleProtectedError(cause, signOut))) return;
        setError(cause instanceof Error ? cause.message : 'Could not load the book');
      });
    return () => {
      active = false;
    };
  }, [id, loadAttempt, signOut]);

  const previewHtml = useMemo(() => {
    if (!storyDocument || !magazineDocument) return '';
    return view === 'magazine'
      ? renderMagazineHtml(magazineDocument, { preview: true })
      : renderStoryHtml(storyDocument, { preview: true });
  }, [magazineDocument, storyDocument, view]);

  if (error && !book)
    return (
      <View style={styles.center}>
        <ErrorState
          title="Book preview could not be loaded"
          message={error}
          onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
          retryLabel="Retry"
        />
      </View>
    );
  if (!book || !storyDocument || !magazineDocument)
    return (
      <ActivityIndicator
        accessibilityLabel="Loading book preview"
        color="#7D5C3C"
        style={styles.loader}
      />
    );

  const refreshPreviewPhotos = async () => {
    if (!id || photoRefreshInFlightRef.current) return;
    photoRefreshInFlightRef.current = true;
    setPreviewStatus('Refreshing photos…');
    setPreviewNeedsRetry(false);
    setError(null);
    try {
      const nextPhotos = await photoRepository.getPhotos(id);
      const nextMap = new Map(nextPhotos.map((photo) => [photo.id, photo]));
      const documents = createV2DocumentsFromBook(book, nextMap.values());
      setPhotos(nextMap);
      setStoryDocument(documents.story);
      setMagazineDocument(documents.magazine);
      setPreviewStatus('Photos refreshed');
    } catch (cause) {
      setPreviewStatus(null);
      setPreviewNeedsRetry(true);
      if (!(await handleProtectedError(cause, signOut))) {
        setError(cause instanceof Error ? cause.message : 'Could not refresh the book photos');
      }
    } finally {
      photoRefreshInFlightRef.current = false;
    }
  };

  const handlePreviewMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string };
      if (message.type !== 'photo-error' || photoRefreshInFlightRef.current) return;
      if (photoRefreshAttemptedRef.current) {
        setPreviewNeedsRetry(true);
        setPreviewStatus(null);
        setError('Some photos could not be loaded. Check your connection and try again.');
        return;
      }
      photoRefreshAttemptedRef.current = true;
      void refreshPreviewPhotos();
    } catch {
      // Ignore messages that do not belong to the preview protocol.
    }
  };

  const retryPreviewPhotos = () => {
    photoRefreshAttemptedRef.current = false;
    void refreshPreviewPhotos();
  };

  const exportPdf = async () => {
    const startedAt = Date.now();
    setExporting(true);
    setError(null);
    try {
      if (!id) throw new Error('Trip not found');
      setExportStage('Preparing photos…');
      const freshPhotos = await withTimeout(
        photoRepository.getPhotos(id),
        20_000,
        'Refreshing the photos took too long. Check your connection and try again.',
      );
      const freshPhotoMap = new Map(freshPhotos.map((photo) => [photo.id, photo]));
      const usedPhotoIds = new Set(
        magazineDocument.pages.flatMap((page) => page.photos.map((photo) => photo.id)),
      );
      const usedPhotos = new Map(
        [...freshPhotoMap].filter(([photoId]) => usedPhotoIds.has(photoId)),
      );
      const prepared = await withTimeout(
        materializeBookPhotos(usedPhotos),
        60_000,
        'Preparing the photos took too long. Check your connection and try again.',
      );
      if (usedPhotos.size > 0 && prepared.photos.size === 0) {
        throw new Error('The photos could not be prepared. Check your connection and try again.');
      }
      setExportStage('Creating PDF…');
      const printDocuments = createV2DocumentsFromBook(book, prepared.photos.values());
      const printed = await withTimeout(
        Print.printToFileAsync({
          html: renderMagazineHtml(printDocuments.magazine),
          base64: false,
        }),
        60_000,
        'Creating the PDF took too long. Please try again.',
      );
      const named = new File(Paths.cache, makePdfFilename(book.tripTitle, book.startDate));
      if (named.exists) named.delete();
      await new File(printed.uri).copy(named);
      recordPerformance('pdf_export', startedAt, { pageCount: magazineDocument.pages.length });
      if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available');
      setExportStage('Opening share sheet…');
      await Sharing.shareAsync(named.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: named.name,
      });
      if (prepared.skippedCount > 0)
        setError(`${prepared.skippedCount} photo could not be included in this PDF.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export this book');
    } finally {
      setExporting(false);
      setExportStage(null);
    }
  };

  const shareLink = async () => {
    if (!id) return;
    setExporting(true);
    setError(null);
    try {
      const link = await sharesApi.create(id);
      // 所见即所得：Story tab 分享图文网页，Magazine tab 分享画册网页。
      const sharedUrl = `${link.url}${link.url.includes('?') ? '&' : '?'}view=${view}&renderer=v2`;
      setActiveShare({ ...link, url: sharedUrl });
      await Share.share({
        title: book.title,
        message: `${book.title}\n\n${book.story.shareSummary ?? book.story.preface}\n\n${sharedUrl}`,
        url: sharedUrl,
      });
    } catch (cause) {
      if (!(await handleProtectedError(cause, signOut)))
        setError(cause instanceof Error ? cause.message : 'Could not create a share link');
    } finally {
      setExporting(false);
    }
  };

  const revokeShare = async () => {
    if (!activeShare) return;
    setExporting(true);
    setError(null);
    try {
      await sharesApi.revoke(activeShare.id);
      setActiveShare(null);
    } catch (cause) {
      if (!(await handleProtectedError(cause, signOut)))
        setError(cause instanceof Error ? cause.message : 'Could not revoke the share link');
    } finally {
      setExporting(false);
    }
  };

  const busy = exporting;

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <View style={styles.viewSwitch}>
          {([['story', 'Story'], ['magazine', 'Magazine']] as const).map(([value, label]) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: view === value, disabled: busy }}
              disabled={busy}
              key={value}
              onPress={() => setView(value)}
              style={[styles.viewChoice, view === value && styles.viewChoiceSelected]}
            >
              <Text style={[styles.viewChoiceLabel, view === value && styles.viewChoiceLabelSelected]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.primaryActions}>
          <Text style={styles.meta}>
            {view === 'magazine' ? `${magazineDocument.pages.length} pages` : `${photos.size} photos · story text`}
          </Text>
        </View>
        {previewStatus ? <Text style={styles.status}>{previewStatus}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {previewNeedsRetry ? (
          <Pressable accessibilityRole="button" onPress={retryPreviewPhotos} style={styles.retryButton}>
            <Text style={styles.retryLabel}>Retry loading photos</Text>
          </Pressable>
        ) : null}
      </View>

      <WebView
        accessibilityLabel="Book preview"
        mixedContentMode="never"
        onMessage={handlePreviewMessage}
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        source={{ html: previewHtml }}
        style={styles.webPreview}
      />

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void exportPdf()}
          style={[styles.exportButton, busy && styles.disabled]}
        >
          <Text style={styles.exportLabel}>{exportStage ?? 'Export PDF'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void shareLink()}
          style={[styles.shareButton, busy && styles.disabled]}
        >
          <Text style={styles.shareLabel}>Share</Text>
        </Pressable>
      </View>
      {activeShare ? (
        <View style={styles.shareStatus}>
          <Text numberOfLines={1} selectable style={styles.activeLink}>
            {activeShare.url}
          </Text>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void revokeShare()}>
            <Text style={styles.revokeLabel}>Revoke</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#EAE3D8', flex: 1 },
  loader: { backgroundColor: '#EAE3D8', flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 32 },
  controls: { backgroundColor: '#F4EFE7', paddingHorizontal: 14, paddingVertical: 10 },
  viewSwitch: { flexDirection: 'row', gap: 7 },
  viewChoice: {
    alignItems: 'center',
    backgroundColor: '#FBF8F2',
    borderColor: '#B9AA98',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 6,
  },
  viewChoiceSelected: { backgroundColor: '#5D4631', borderColor: '#5D4631' },
  viewChoiceLabel: { color: '#5E5145', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  viewChoiceLabelSelected: { color: '#FFFFFF' },
  primaryActions: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 8 },
  meta: { color: '#6A5D51', flex: 1, fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  status: { color: '#6A5D51', fontSize: 12, marginTop: 7, textAlign: 'center' },
  error: { color: '#A33B2B', fontSize: 13, marginTop: 7, textAlign: 'center' },
  retryButton: { alignItems: 'center', minHeight: 44, paddingTop: 10 },
  retryLabel: { color: '#7A3D2D', fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  webPreview: { backgroundColor: '#EAE3D8', flex: 1 },
  actions: { backgroundColor: '#F4EFE7', flexDirection: 'row', gap: 8, padding: 10 },
  exportButton: {
    alignItems: 'center',
    backgroundColor: '#24211D',
    borderRadius: 12,
    flex: 2,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 12,
  },
  exportLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  shareButton: {
    alignItems: 'center',
    borderColor: '#7D5C3C',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 8,
  },
  shareLabel: { color: '#684F37', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  shareStatus: {
    alignItems: 'center',
    backgroundColor: '#F4EFE7',
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  activeLink: { color: '#5D554D', flex: 1, fontSize: 11 },
  revokeLabel: { color: '#A33B2B', fontSize: 13, fontWeight: '800', padding: 8 },
});
