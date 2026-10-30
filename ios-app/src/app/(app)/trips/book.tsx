import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { photoRepository, sharesApi, storyRepository, tripRepository } from '@/composition/services';
import type { BookPreviewDTO, ShareLinkDTO } from '@/contracts/story';
import type { Photo } from '@/domain/photo/photo';
import { recordPerformance } from '@/diagnostics/performance';
import {
  buildBookLayout,
  cycleBookLayout,
  makePdfFilename,
  renderBookHtml,
  renderBookPreviewHtml,
  restoreBookLayout,
  type BookLayoutDocument,
} from '@/features/books/bookLayout';
import { materializeBookPhotos, withTimeout } from '@/features/books/pdfExport';

export default function BookPreviewScreen() {
  const { signOut } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [book, setBook] = useState<BookPreviewDTO | null>(null);
  const [photos, setPhotos] = useState<Map<string, Photo>>(new Map());
  const [document, setDocument] = useState<BookLayoutDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [previewNeedsRetry, setPreviewNeedsRetry] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStage, setExportStage] = useState<string | null>(null);
  const [activeShare, setActiveShare] = useState<ShareLinkDTO | null>(null);
  const [changingStyle, setChangingStyle] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const photoRefreshAttemptedRef = useRef(false);
  const photoRefreshInFlightRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const startedAt = Date.now();
    void Promise.all([storyRepository.getBook(id), photoRepository.getPhotos(id)])
      .then(([nextBook, nextPhotos]) => {
        if (!active) return;
        const photoMap = new Map(nextPhotos.map((photo) => [photo.id, photo]));
        const restored = restoreBookLayout(nextBook.layout, nextBook, photoMap);
        setBook(nextBook);
        setPhotos(photoMap);
        setDocument(restored ?? buildBookLayout(nextBook, photoMap));
        recordPerformance('book_preview', startedAt, {
          photoCount: nextPhotos.length,
          restoredLayout: Boolean(restored),
        });
      })
      .catch(async (cause: unknown) => {
        if (!active || (await handleProtectedError(cause, signOut))) return;
        setError(cause instanceof Error ? cause.message : 'Could not load the book');
      });
    return () => {
      active = false;
    };
  }, [id, signOut]);

  const previewHtml = useMemo(
    () => (document ? renderBookPreviewHtml(document, photos) : ''),
    [document, photos],
  );

  if (error && !book)
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  if (!book || !document)
    return (
      <ActivityIndicator
        accessibilityLabel="Loading book preview"
        color="#7D5C3C"
        style={styles.loader}
      />
    );

  const saveLayout = async (next: BookLayoutDocument, status = 'Saving design…') => {
    if (!id) return;
    const previous = document;
    setSavingLayout(true);
    setPreviewStatus(status);
    setDocument(next);
    setError(null);
    try {
      await storyRepository.updateBookLayout(id, next as unknown as Record<string, unknown>);
      setPreviewStatus('Design saved');
    } catch (cause) {
      setDocument(previous);
      setPreviewStatus(null);
      if (!(await handleProtectedError(cause, signOut)))
        setError(cause instanceof Error ? cause.message : 'Could not save the book design');
    } finally {
      setSavingLayout(false);
    }
  };

  const tryAnotherDesign = async () => {
    await saveLayout(cycleBookLayout(document, photos), 'Trying another design…');
  };

  const changeStyle = async (bookStyle: BookPreviewDTO['bookStyle']) => {
    if (!id || bookStyle === book.bookStyle) return;
    setChangingStyle(true);
    setPreviewStatus('Applying style…');
    setError(null);
    try {
      const trip = await tripRepository.getTrip(id);
      await tripRepository.updateCreativeRequirements(id, {
        ...trip.creativeRequirements,
        bookStyle,
      });
      const nextBook = { ...book, bookStyle, layout: {} };
      const nextDocument = buildBookLayout(nextBook, photos);
      const saved = await storyRepository.updateBookLayout(
        id,
        nextDocument as unknown as Record<string, unknown>,
      );
      setBook({ ...saved, bookStyle });
      setDocument(nextDocument);
      setPreviewStatus('Style applied');
    } catch (cause) {
      setPreviewStatus(null);
      if (!(await handleProtectedError(cause, signOut))) {
        setError(cause instanceof Error ? cause.message : 'Could not change the book style');
      }
    } finally {
      setChangingStyle(false);
    }
  };

  const refreshPreviewPhotos = async () => {
    if (!id || photoRefreshInFlightRef.current) return;
    photoRefreshInFlightRef.current = true;
    setPreviewStatus('Refreshing photos…');
    setPreviewNeedsRetry(false);
    setError(null);
    try {
      const nextPhotos = await photoRepository.getPhotos(id);
      setPhotos(new Map(nextPhotos.map((photo) => [photo.id, photo])));
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
      const usedPhotoIds = new Set(document.pages.flatMap((page) => page.photoIds));
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
      const printed = await withTimeout(
        Print.printToFileAsync({ html: renderBookHtml(document, prepared.photos), base64: false }),
        60_000,
        'Creating the PDF took too long. Please try again.',
      );
      const named = new File(Paths.cache, makePdfFilename(book.tripTitle, book.startDate));
      if (named.exists) named.delete();
      await new File(printed.uri).copy(named);
      recordPerformance('pdf_export', startedAt, { pageCount: document.pages.length });
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
      setActiveShare(link);
      await Share.share({
        title: book.title,
        message: `${book.title}\n\n${book.story.shareSummary ?? book.story.preface}\n\n${link.url}`,
        url: link.url,
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

  const busy = changingStyle || savingLayout || exporting;

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <Text style={styles.subheading}>
          {styleLabel(book.bookStyle)} · {document.pages.length} pages
        </Text>
        <View accessibilityRole="radiogroup" style={styles.styleChoices}>
          {(['travel_magazine', 'warm_memoir', 'minimalist'] as const).map((style) => (
            <Pressable
              accessibilityLabel={styleLabel(style)}
              accessibilityRole="radio"
              accessibilityState={{ checked: book.bookStyle === style, disabled: busy }}
              disabled={busy}
              key={style}
              onPress={() => void changeStyle(style)}
              style={[styles.styleChoice, book.bookStyle === style && styles.styleChoiceSelected]}
            >
              <Text
                style={[
                  styles.styleChoiceLabel,
                  book.bookStyle === style && styles.styleChoiceLabelSelected,
                ]}
              >
                {shortStyleLabel(style)}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.primaryActions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void tryAnotherDesign()}
            style={[styles.compactButton, busy && styles.disabled]}
          >
            <Text style={styles.compactButtonLabel}>Try another design</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => router.push({ pathname: '/trips/story', params: { id } })}
            style={[styles.compactButton, busy && styles.disabled]}
          >
            <Text style={styles.compactButtonLabel}>Edit story text</Text>
          </Pressable>
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
        accessibilityLabel="Book page preview"
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
          <Text style={styles.shareLabel}>Private share</Text>
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

function styleLabel(value: BookPreviewDTO['bookStyle']) {
  return (
    {
      travel_magazine: 'Travel magazine',
      warm_memoir: 'Warm memoir',
      minimalist: 'Minimalist photo book',
    } as const
  )[value];
}

function shortStyleLabel(value: BookPreviewDTO['bookStyle']) {
  return (
    {
      travel_magazine: 'Magazine',
      warm_memoir: 'Memoir',
      minimalist: 'Minimalist',
    } as const
  )[value];
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#EAE3D8', flex: 1 },
  loader: { backgroundColor: '#EAE3D8', flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 32 },
  controls: { backgroundColor: '#F4EFE7', paddingHorizontal: 14, paddingVertical: 10 },
  subheading: { color: '#5F5348', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  styleChoices: { flexDirection: 'row', gap: 7 },
  styleChoice: {
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
  styleChoiceSelected: { backgroundColor: '#5D4631', borderColor: '#5D4631' },
  styleChoiceLabel: { color: '#5E5145', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  styleChoiceLabelSelected: { color: '#FFFFFF' },
  primaryActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  compactButton: {
    alignItems: 'center',
    borderColor: '#8B735D',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  compactButtonLabel: { color: '#5E4C3A', fontSize: 13, fontWeight: '700', textAlign: 'center' },
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
