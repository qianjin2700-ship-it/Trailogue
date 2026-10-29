import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { photoRepository, sharesApi, storyRepository } from '@/composition/services';
import type { BookPreviewDTO, ShareLinkDTO } from '@/contracts/story';
import type { Photo } from '@/domain/photo/photo';
import { buildBookLayout, changePageLayout, makePdfFilename, mergeUserEdits, renderBookHtml, restoreBookLayout, rotatePagePhotos, swapPageLeadPhoto, type BookLayoutDocument, type BookPage } from '@/features/books/bookLayout';
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
  useEffect(() => {
    if (!id) return;
    let active = true;
    void Promise.all([storyRepository.getBook(id), photoRepository.getPhotos(id)]).then(([nextBook, nextPhotos]) => {
      if (!active) return;
      const photoMap = new Map(nextPhotos.map((photo) => [photo.id, photo]));
      setBook(nextBook); setPhotos(photoMap); setDocument(restoreBookLayout(nextBook.layout, nextBook, photoMap) ?? buildBookLayout(nextBook, photoMap));
    }).catch(async (cause: unknown) => {
      if (!active || await handleProtectedError(cause, signOut)) return;
      setError(cause instanceof Error ? cause.message : 'Could not load the book');
    });
    return () => { active = false; };
  }, [id, signOut]);
  if (error && !book) return <View style={styles.center}><Text style={styles.error}>{error}</Text></View>;
  if (!book || !document) return <ActivityIndicator accessibilityLabel="Loading book preview" color="#7D5C3C" style={styles.loader} />;
  const saveLayout = async (next: BookLayoutDocument) => {
    if (!id) return;
    const previous = document; setDocument(next); setError(null);
    try { await storyRepository.updateBookLayout(id, next as unknown as Record<string, unknown>); }
    catch (cause) { setDocument(previous); if (!await handleProtectedError(cause, signOut)) setError(cause instanceof Error ? cause.message : 'Could not save the book layout'); }
  };
  const exportPdf = async () => {
    setExporting(true); setError(null);
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
      const usedPhotos = new Map([...freshPhotoMap].filter(([photoId]) => usedPhotoIds.has(photoId)));
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
      if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available');
      setExportStage('Opening share sheet…');
      await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: named.name });
      if (prepared.skippedCount > 0) setError(`${prepared.skippedCount} photo could not be included in this PDF.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not export this book'); }
    finally { setExporting(false); setExportStage(null); }
  };
  const shareLink = async () => {
    if (!id) return;
    setExporting(true); setError(null);
    try {
      const link = await sharesApi.create(id); setActiveShare(link);
      await Share.share({ title: book.title, message: `${book.title}\n\n${book.story.shareSummary ?? book.story.preface}\n\n${link.url}`, url: link.url });
    } catch (cause) { if (!await handleProtectedError(cause, signOut)) setError(cause instanceof Error ? cause.message : 'Could not create a share link'); }
    finally { setExporting(false); }
  };
  const revokeShare = async () => {
    if (!activeShare) return;
    setExporting(true); setError(null);
    try { await sharesApi.revoke(activeShare.id); setActiveShare(null); }
    catch (cause) { if (!await handleProtectedError(cause, signOut)) setError(cause instanceof Error ? cause.message : 'Could not revoke the share link'); }
    finally { setExporting(false); }
  };
  return <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
    <Text accessibilityRole="header" style={styles.heading}>Book preview</Text>
    <Text style={styles.subheading}>{styleLabel(book.bookStyle)} · {document.pages.length} pages · preview matches PDF structure</Text>
    <View style={styles.planActions}>
      <Pressable onPress={() => void saveLayout(mergeUserEdits(buildBookLayout(book, photos), document))} style={styles.planButton}><Text style={styles.planLabel}>Replan unedited pages</Text></Pressable>
      <Pressable onPress={() => void saveLayout(buildBookLayout(book, photos))} style={styles.planButton}><Text style={styles.planLabel}>Reset all layout edits</Text></Pressable>
    </View>
    {document.pages.map((page, index) => <View key={page.id}><PagePreview page={page} photos={photos} pageNumber={index + 1} styleName={document.style} />{page.kind !== 'cover' ? <View style={styles.pageTools}><Pressable onPress={() => void saveLayout(changePageLayout(document, page.id))}><Text style={styles.toolLabel}>Change layout</Text></Pressable>{page.photoIds.length > 1 ? <Pressable onPress={() => void saveLayout(rotatePagePhotos(document, page.id))}><Text style={styles.toolLabel}>Rotate photos</Text></Pressable> : null}{page.photoIds.length ? <Pressable onPress={() => void saveLayout(swapPageLeadPhoto(document, page.id))}><Text style={styles.toolLabel}>Swap lead photo</Text></Pressable> : null}</View> : null}</View>)}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" disabled={exporting} onPress={() => void exportPdf()} style={styles.secondaryButton}><Text style={styles.secondaryLabel}>{exportStage ?? 'Export PDF'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={exporting} onPress={() => void shareLink()} style={styles.shareButton}><Text style={styles.shareLabel}>Create private share link</Text></Pressable>
      {activeShare ? <><Text selectable style={styles.activeLink}>{activeShare.url}</Text><Pressable accessibilityRole="button" disabled={exporting} onPress={() => void revokeShare()} style={styles.revokeButton}><Text style={styles.revokeLabel}>Revoke this share link</Text></Pressable></> : null}
    </View>
  </ScrollView>;
}

function PagePreview({ page, photos, pageNumber, styleName }: { page: BookPage; photos: Map<string, Photo>; pageNumber: number; styleName: BookPreviewDTO['bookStyle'] }) {
  const pagePhotos = page.photoIds.map((id) => photos.get(id)).filter((photo): photo is Photo => Boolean(photo));
  const cover = page.kind === 'cover' || page.kind === 'chapter_opener';
  return <View style={[styles.page, styleName === 'warm_memoir' && styles.memoirPage, styleName === 'minimalist' && styles.minimalPage, cover && styles.darkPage]}>
    {pagePhotos.length ? <View style={[styles.photoGrid, pagePhotos.length === 1 && styles.onePhoto]}>{pagePhotos.map((photo, index) => <Image key={photo.id} source={{ uri: photo.url }} style={[styles.previewPhoto, index === 0 && pagePhotos.length === 3 && styles.heroPhoto]} />)}</View> : null}
    <View style={[styles.pageCopy, cover && styles.overlayCopy]}>
      {page.eyebrow ? <Text style={[styles.eyebrow, cover && styles.light]}>{page.eyebrow}</Text> : null}
      {page.title ? <Text style={[styles.pageTitle, cover && styles.light]}>{page.title}</Text> : null}
      {page.body ? <Text numberOfLines={cover ? 7 : 12} style={[styles.body, cover && styles.light]}>{page.body}</Text> : null}
    </View>
    <Text style={[styles.pageNumber, cover && styles.light]}>{pageNumber}</Text>
  </View>;
}
function styleLabel(value: BookPreviewDTO['bookStyle']) { return ({ travel_magazine: 'Travel magazine', warm_memoir: 'Warm memoir', minimalist: 'Minimalist photo book' } as const)[value]; }
const styles = StyleSheet.create({
  screen: { backgroundColor: '#EAE3D8', flex: 1 }, content: { padding: 18, paddingBottom: 60 }, loader: { backgroundColor: '#EAE3D8', flex: 1 }, center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 32 }, heading: { color: '#201C17', fontSize: 32, fontWeight: '800' }, subheading: { color: '#6A5D51', marginBottom: 18, marginTop: 6 },
  page: { aspectRatio: 612 / 792, backgroundColor: '#FBF8F2', borderRadius: 3, elevation: 2, marginBottom: 18, overflow: 'hidden', position: 'relative', shadowColor: '#33291F', shadowOpacity: 0.18, shadowRadius: 7 }, darkPage: { backgroundColor: '#1D2529' }, photoGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }, onePhoto: { flexWrap: 'nowrap' }, previewPhoto: { flexBasis: '48%', flexGrow: 1, height: '50%' }, heroPhoto: { flexBasis: '100%', height: '60%' }, pageCopy: { padding: 20 }, overlayCopy: { backgroundColor: 'rgba(10,15,18,.70)', bottom: 0, left: 0, position: 'absolute', right: 0 }, eyebrow: { color: '#B05F3F', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, pageTitle: { color: '#202020', fontFamily: 'Georgia', fontSize: 26, fontWeight: '800', marginTop: 5 }, body: { color: '#403A34', fontFamily: 'Georgia', fontSize: 12, lineHeight: 19, marginTop: 10 }, light: { color: '#FFFFFF' }, pageNumber: { bottom: 8, color: '#8C8379', fontSize: 9, position: 'absolute', right: 10 },
  memoirPage: { backgroundColor: '#F7EEE4', borderColor: '#E8D4C2', borderWidth: 4 }, minimalPage: { backgroundColor: '#FFFFFF' }, planActions: { flexDirection: 'row', gap: 8, marginBottom: 18 }, planButton: { borderColor: '#8B735D', borderRadius: 8, borderWidth: 1, flex: 1, padding: 10 }, planLabel: { color: '#5E4C3A', fontSize: 12, fontWeight: '700', textAlign: 'center' }, pageTools: { flexDirection: 'row', gap: 14, justifyContent: 'center', marginBottom: 18, marginTop: -10 }, toolLabel: { color: '#6E5237', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  error: { color: '#A33B2B', fontSize: 15, marginTop: 12, textAlign: 'center' }, actions: { gap: 10, marginTop: 20 }, secondaryButton: { borderColor: '#7D5C3C', borderRadius: 12, borderWidth: 1, padding: 15 }, secondaryLabel: { color: '#684F37', fontSize: 16, fontWeight: '700', textAlign: 'center' }, shareButton: { backgroundColor: '#24211D', borderRadius: 12, padding: 15 }, shareLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' }, activeLink: { color: '#5D554D', fontSize: 12, lineHeight: 18, textAlign: 'center' }, revokeButton: { borderColor: '#A33B2B', borderRadius: 12, borderWidth: 1, padding: 13 }, revokeLabel: { color: '#A33B2B', fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
