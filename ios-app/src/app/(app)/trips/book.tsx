import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { photoRepository, sharesApi, storyRepository, tripRepository } from '@/composition/services';
import type { BookPreviewDTO, ShareLinkDTO } from '@/contracts/story';
import type { Photo } from '@/domain/photo/photo';
import { recordPerformance } from '@/diagnostics/performance';
import {
  buildBookLayout,
  changePageLayout,
  makePdfFilename,
  renderBookHtml,
  restoreBookLayout,
  rotatePagePhotos,
  swapPageLeadPhoto,
  type BookLayoutDocument,
  type BookPage,
} from '@/features/books/bookLayout';
import { materializeBookPhotos, withTimeout } from '@/features/books/pdfExport';

export default function BookPreviewScreen() {
  const { signOut } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [book, setBook] = useState<BookPreviewDTO | null>(null);
  const [photos, setPhotos] = useState<Map<string, Photo>>(new Map());
  const [document, setDocument] = useState<BookLayoutDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportStage, setExportStage] = useState<string | null>(null);
  const [activeShare, setActiveShare] = useState<ShareLinkDTO | null>(null);
  const [editing, setEditing] = useState(false);
  const [changingStyle, setChangingStyle] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
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
  const saveLayout = async (next: BookLayoutDocument) => {
    if (!id) return;
    const previous = document;
    setSavingLayout(true);
    setDocument(next);
    setError(null);
    try {
      await storyRepository.updateBookLayout(id, next as unknown as Record<string, unknown>);
    } catch (cause) {
      setDocument(previous);
      if (!(await handleProtectedError(cause, signOut)))
        setError(cause instanceof Error ? cause.message : 'Could not save the book layout');
    } finally {
      setSavingLayout(false);
    }
  };
  const regenerateLayout = async () => {
    await saveLayout(buildBookLayout(book, photos));
  };
  const changeStyle = async (bookStyle: BookPreviewDTO['bookStyle']) => {
    if (!id || bookStyle === book.bookStyle) return;
    setChangingStyle(true);
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
      setBook(saved);
      setDocument(nextDocument);
    } catch (cause) {
      if (!(await handleProtectedError(cause, signOut))) {
        setError(cause instanceof Error ? cause.message : 'Could not change the book style');
      }
    } finally {
      setChangingStyle(false);
    }
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
        'Refreshing the photos took too long. Check your connection and try again.'
      );
      const freshPhotoMap = new Map(freshPhotos.map((photo) => [photo.id, photo]));
      const usedPhotoIds = new Set(document.pages.flatMap((page) => page.photoIds));
      const usedPhotos = new Map(
        [...freshPhotoMap].filter(([photoId]) => usedPhotoIds.has(photoId))
      );
      const prepared = await withTimeout(
        materializeBookPhotos(usedPhotos),
        60_000,
        'Preparing the photos took too long. Check your connection and try again.'
      );
      if (usedPhotos.size > 0 && prepared.photos.size === 0) {
        throw new Error('The photos could not be prepared. Check your connection and try again.');
      }
      setExportStage('Creating PDF…');
      const printed = await withTimeout(
        Print.printToFileAsync({ html: renderBookHtml(document, prepared.photos), base64: false }),
        60_000,
        'Creating the PDF took too long. Please try again.'
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
  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text accessibilityRole="header" style={styles.heading}>
        Book preview
      </Text>
      <Text style={styles.subheading}>
        {styleLabel(book.bookStyle)} · {document.pages.length} pages · preview matches PDF structure
      </Text>
      <Text style={styles.styleHeading}>Choose a style</Text>
      <View style={styles.styleChoices}>
        {(['travel_magazine', 'warm_memoir', 'minimalist'] as const).map((style) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: book.bookStyle === style, disabled: changingStyle }}
            disabled={changingStyle}
            key={style}
            onPress={() => void changeStyle(style)}
            style={[styles.styleChoice, book.bookStyle === style && styles.styleChoiceSelected]}
          >
            <Text style={[styles.styleChoiceLabel, book.bookStyle === style && styles.styleChoiceLabelSelected]}>
              {styleLabel(style)}
            </Text>
          </Pressable>
        ))}
      </View>
      {changingStyle ? <Text style={styles.applyingStyle}>Applying style without regenerating your story…</Text> : null}
      <View style={styles.primaryActions}>
        <Pressable disabled={savingLayout} onPress={() => void regenerateLayout()} style={styles.compactButton}>
          <Text style={styles.compactButtonLabel}>{savingLayout ? 'Saving…' : 'Regenerate layout'}</Text>
        </Pressable>
        <Pressable onPress={() => setEditing((value) => !value)} style={styles.compactButton}>
          <Text style={styles.compactButtonLabel}>{editing ? 'Finish editing' : 'Simple edit'}</Text>
        </Pressable>
      </View>
      {document.pages.map((page, index) => (
        <View key={page.id}>
          <PagePreview
            page={page}
            photos={photos}
            pageNumber={index + 1}
            styleName={document.style}
          />
          {editing && page.kind !== 'cover' ? (
            <View style={styles.pageTools}>
              <Pressable
                onPress={() => void saveLayout(changePageLayout(document, page.id, photos))}
              >
                <Text style={styles.toolLabel}>Try another layout</Text>
              </Pressable>
              {page.photoIds.length > 1 ? (
                <Pressable
                  onPress={() => void saveLayout(rotatePagePhotos(document, page.id, photos))}
                >
                  <Text style={styles.toolLabel}>Reorder photos</Text>
                </Pressable>
              ) : null}
              {page.photoIds.length ? (
                <>
                  <Pressable
                    onPress={() => void saveLayout(swapPageLeadPhoto(document, page.id, photos))}
                  >
                    <Text style={styles.toolLabel}>Swap lead</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        {editing ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/trips/story', params: { id } })}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryLabel}>Edit story text</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={exporting}
          onPress={() => void exportPdf()}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryLabel}>{exportStage ?? 'Export PDF'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={exporting}
          onPress={() => void shareLink()}
          style={styles.shareButton}
        >
          <Text style={styles.shareLabel}>Create private share link</Text>
        </Pressable>
        {activeShare ? (
          <>
            <Text selectable style={styles.activeLink}>
              {activeShare.url}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={exporting}
              onPress={() => void revokeShare()}
              style={styles.revokeButton}
            >
              <Text style={styles.revokeLabel}>Revoke this share link</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

function PagePreview({
  page,
  photos,
  pageNumber,
  styleName,
}: {
  page: BookPage;
  photos: Map<string, Photo>;
  pageNumber: number;
  styleName: BookPreviewDTO['bookStyle'];
}) {
  const pagePhotos = page.photoIds
    .map((id) => photos.get(id))
    .filter((photo): photo is Photo => Boolean(photo));
  const cover = page.kind === 'cover' || page.kind === 'chapter_opener';
  const bookCover = page.kind === 'cover';
  const minimalRail = styleName === 'minimalist' && page.variant === 'text_rail' && !bookCover;
  const media = pagePhotos.length ? (
    <View
      style={[
        styles.photoGrid,
        mediaLayoutStyle(page),
        minimalRail && styles.minimalRailMedia,
        bookCover && styleName === 'travel_magazine' && styles.magazineCoverMedia,
        bookCover && styleName === 'warm_memoir' && styles.memoirCoverMedia,
        bookCover && styleName === 'minimalist' && styles.minimalCoverMedia,
      ]}
    >
      {pagePhotos.map((photo, index) => (
        <View key={photo.id} style={[styles.photoSlot, photoSlotStyle(page, index)]}>
          <PreviewPhoto photo={photo} placement={page.placements[photo.id]} />
        </View>
      ))}
    </View>
  ) : null;
  const copy = (
    <View
      style={[
        styles.pageCopy,
        cover && styleName === 'travel_magazine' && styles.overlayCopy,
        styleName === 'warm_memoir' && !bookCover && styles.memoirCopy,
        bookCover && styleName === 'warm_memoir' && styles.memoirCoverCopy,
        bookCover && styleName === 'minimalist' && styles.minimalCoverCopy,
        minimalRail && styles.minimalRailCopy,
      ]}
    >
      {page.eyebrow ? (
        <Text style={[styles.eyebrow, cover && styleName === 'travel_magazine' && styles.light]}>
          {page.eyebrow}
        </Text>
      ) : null}
      {page.title ? (
        <Text
          style={[
            styles.pageTitle,
            cover && styleName === 'travel_magazine' && styles.light,
            minimalRail && styles.minimalRailTitle,
          ]}
        >
          {page.title}
        </Text>
      ) : null}
      {page.body ? (
        <Text
          numberOfLines={bookCover ? 3 : styleName === 'minimalist' ? 4 : 7}
          style={[
            styles.body,
            cover && styleName === 'travel_magazine' && styles.light,
            minimalRail && styles.minimalRailBody,
          ]}
        >
          {page.body}
        </Text>
      ) : null}
    </View>
  );
  return (
    <View
      style={[
        styles.page,
        styleName === 'warm_memoir' && styles.memoirPage,
        styleName === 'minimalist' && styles.minimalPage,
        cover && styleName === 'travel_magazine' && styles.darkPage,
        bookCover && styleName === 'warm_memoir' && styles.memoirCover,
        minimalRail && styles.minimalRailPage,
      ]}
    >
      {minimalRail ? copy : media}
      {minimalRail ? media : copy}
      <Text style={[styles.pageNumber, cover && styleName === 'travel_magazine' && styles.light]}>
        {pageNumber}
      </Text>
    </View>
  );
}
function PreviewPhoto({
  photo,
  placement,
}: {
  photo: Photo;
  placement: BookPage['placements'][string] | undefined;
}) {
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const sourceWidth = photo.width ?? 1;
  const sourceHeight = photo.height ?? 1;
  const fit = placement?.fit ?? 'contain';
  const scale =
    frame.width && frame.height
      ? fit === 'cover'
        ? Math.max(frame.width / sourceWidth, frame.height / sourceHeight)
        : Math.min(frame.width / sourceWidth, frame.height / sourceHeight)
      : 0;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const left =
    fit === 'cover'
      ? -(width - frame.width) * (placement?.positionX ?? 0.5)
      : (frame.width - width) / 2;
  const top =
    fit === 'cover'
      ? -(height - frame.height) * (placement?.positionY ?? 0.5)
      : (frame.height - height) / 2;
  const onLayout = (event: LayoutChangeEvent) => setFrame(event.nativeEvent.layout);
  return (
    <View onLayout={onLayout} style={styles.previewFrame}>
      {scale > 0 ? (
        <Image
          source={{ uri: photo.url }}
          style={[styles.previewPhoto, { height, left, top, width }]}
        />
      ) : null}
    </View>
  );
}
function mediaLayoutStyle(page: BookPage) {
  if (
    page.kind === 'image_left' ||
    page.kind === 'image_right' ||
    page.kind === 'mixed' ||
    page.kind === 'outro'
  )
    return styles.sideMedia;
  if (page.kind === 'two_photo' && page.variant === 'pair_rows') return styles.rowPair;
  return styles.gridMedia;
}
function photoSlotStyle(page: BookPage, index: number) {
  if (page.photoIds.length === 1) return styles.singleSlot;
  if (page.kind === 'two_photo' && page.variant === 'pair_rows') return styles.rowSlot;
  if ((page.kind === 'hero_two' || page.variant === 'landscape_lead') && index === 0)
    return styles.heroSlot;
  if (page.kind === 'three_collage' && page.variant === 'portrait_lead' && index === 0)
    return styles.portraitLeadSlot;
  return styles.gridSlot;
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
const styles = StyleSheet.create({
  screen: { backgroundColor: '#EAE3D8', flex: 1 },
  content: { padding: 18, paddingBottom: 60 },
  loader: { backgroundColor: '#EAE3D8', flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 32 },
  heading: { color: '#201C17', fontSize: 32, fontWeight: '800' },
  subheading: { color: '#6A5D51', marginBottom: 18, marginTop: 6 },
  page: {
    aspectRatio: 612 / 792,
    backgroundColor: '#FBF8F2',
    borderRadius: 3,
    elevation: 2,
    marginBottom: 18,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#33291F',
    shadowOpacity: 0.18,
    shadowRadius: 7,
  },
  darkPage: { backgroundColor: '#1D2529' },
  photoGrid: { flex: 1, gap: 3 },
  gridMedia: { flexDirection: 'row', flexWrap: 'wrap' },
  rowPair: { flexDirection: 'column' },
  sideMedia: { flex: 1, margin: 18 },
  photoSlot: { backgroundColor: '#EEEAE3', overflow: 'hidden' },
  singleSlot: { flex: 1 },
  gridSlot: { flexBasis: '48%', flexGrow: 1 },
  rowSlot: { flex: 1 },
  heroSlot: { flexBasis: '100%', flexGrow: 2 },
  portraitLeadSlot: { flexBasis: '54%', flexGrow: 2 },
  previewFrame: { flex: 1, overflow: 'hidden', position: 'relative' },
  previewPhoto: { position: 'absolute' },
  pageCopy: { padding: 20 },
  overlayCopy: {
    backgroundColor: 'rgba(10,15,18,.68)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  magazineCoverMedia: { flex: 0.6 },
  memoirCover: { padding: 22 },
  memoirCoverMedia: {
    backgroundColor: '#FFFAF2',
    borderRadius: 2,
    flex: 0.76,
    marginHorizontal: 18,
    marginTop: 10,
    padding: 7,
  },
  memoirCoverCopy: { alignItems: 'center', paddingHorizontal: 24 },
  minimalCoverMedia: { flex: 0.8 },
  minimalCoverCopy: { alignItems: 'center', paddingHorizontal: 24 },
  minimalRailPage: { flexDirection: 'row', padding: 10 },
  minimalRailCopy: { flex: 0.23, paddingHorizontal: 5, paddingTop: 8 },
  minimalRailMedia: { flex: 0.77 },
  minimalRailTitle: { color: '#18365D', fontSize: 14, lineHeight: 18 },
  minimalRailBody: { fontSize: 8, lineHeight: 12 },
  memoirCopy: {
    backgroundColor: '#FFFAF2',
    borderLeftColor: '#C78D72',
    borderLeftWidth: 4,
    margin: 16,
    padding: 16,
  },
  eyebrow: { color: '#B05F3F', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  pageTitle: {
    color: '#202020',
    fontFamily: 'Georgia',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 5,
  },
  body: { color: '#403A34', fontFamily: 'Georgia', fontSize: 12, lineHeight: 19, marginTop: 10 },
  light: { color: '#FFFFFF' },
  pageNumber: { bottom: 8, color: '#8C8379', fontSize: 9, position: 'absolute', right: 10 },
  memoirPage: { backgroundColor: '#F7EEE4', borderColor: '#E8D4C2', borderWidth: 4 },
  minimalPage: { backgroundColor: '#FFFFFF' },
  styleHeading: { color: '#4F453B', fontSize: 14, fontWeight: '800', marginBottom: 8 },
  styleChoices: { flexDirection: 'row', gap: 7, marginBottom: 10 },
  styleChoice: { backgroundColor: '#F7F2EA', borderColor: '#B9AA98', borderRadius: 999, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 6 },
  styleChoiceSelected: { backgroundColor: '#5D4631', borderColor: '#5D4631' },
  styleChoiceLabel: { color: '#5E5145', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  styleChoiceLabelSelected: { color: '#FFFFFF' },
  applyingStyle: { color: '#6A5D51', fontSize: 12, marginBottom: 10, textAlign: 'center' },
  primaryActions: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  compactButton: { borderColor: '#8B735D', borderRadius: 10, borderWidth: 1, flex: 1, padding: 12 },
  compactButtonLabel: { color: '#5E4C3A', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  pageTools: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'center',
    marginBottom: 18,
    marginTop: -10,
  },
  toolLabel: { color: '#6E5237', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  error: { color: '#A33B2B', fontSize: 15, marginTop: 12, textAlign: 'center' },
  actions: { gap: 10, marginTop: 20 },
  secondaryButton: { borderColor: '#7D5C3C', borderRadius: 12, borderWidth: 1, padding: 15 },
  secondaryLabel: { color: '#684F37', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  shareButton: { backgroundColor: '#24211D', borderRadius: 12, padding: 15 },
  shareLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  activeLink: { color: '#5D554D', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  revokeButton: { borderColor: '#A33B2B', borderRadius: 12, borderWidth: 1, padding: 13 },
  revokeLabel: { color: '#A33B2B', fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
