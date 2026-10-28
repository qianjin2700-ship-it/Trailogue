import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { useAuth } from '@/auth/AuthProvider';
import { handleProtectedError } from '@/auth/handleProtectedError';
import { photoRepository, sharesApi, storyRepository } from '@/composition/services';
import type { BookPreviewDTO, ShareLinkDTO } from '@/contracts/story';
import type { Photo } from '@/domain/photo/photo';

export default function BookPreviewScreen() {
  const { signOut } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [book, setBook] = useState<BookPreviewDTO | null>(null);
  const [photos, setPhotos] = useState<Map<string, Photo>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [activeShare, setActiveShare] = useState<ShareLinkDTO | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void Promise.all([storyRepository.getBook(id), photoRepository.getPhotos(id)])
      .then(([nextBook, nextPhotos]) => {
        if (!active) return;
        setBook(nextBook);
        setPhotos(new Map(nextPhotos.map((photo) => [photo.id, photo])));
      })
      .catch(async (cause: unknown) => {
        if (!active || await handleProtectedError(cause, signOut)) return;
        setError(cause instanceof Error ? cause.message : 'Could not load the book');
      });
    return () => { active = false; };
  }, [id, signOut]);

  if (error && !book) return <View style={styles.center}><Text style={styles.error}>{error}</Text></View>;
  if (!book) return <ActivityIndicator accessibilityLabel="Loading book preview" color="#7D5C3C" style={styles.loader} />;
  const shareText = [book.title, book.subtitle, book.story.shareSummary ?? book.story.preface].filter(Boolean).join('\n\n');
  const exportPdf = async () => {
    setExporting(true);
    setError(null);
    try {
      const file = await Print.printToFileAsync({ html: renderBookHtml(book, photos) });
      if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export this book');
    } finally {
      setExporting(false);
    }
  };
  const shareLink = async () => {
    if (!id) return;
    setExporting(true);
    setError(null);
    try {
      const link = await sharesApi.create(id);
      setActiveShare(link);
      await Share.share({ title: book.title, message: `${shareText}\n\n${link.url}`, url: link.url });
    } catch (cause) {
      if (await handleProtectedError(cause, signOut)) return;
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
      if (await handleProtectedError(cause, signOut)) return;
      setError(cause instanceof Error ? cause.message : 'Could not revoke the share link');
    } finally {
      setExporting(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      {book.coverPhotoId && photos.get(book.coverPhotoId) ? (
        <Image source={{ uri: photos.get(book.coverPhotoId)!.url }} style={styles.cover} />
      ) : null}
      <Text accessibilityRole="header" style={styles.title}>{book.title}</Text>
      {book.subtitle ? <Text style={styles.subtitle}>{book.subtitle}</Text> : null}
      <Text style={styles.body}>{book.story.preface}</Text>
      {book.story.chapters.map((chapter) => (
        <View key={chapter.chapterId} style={styles.chapter}>
          <Text style={styles.chapterMeta}>{[chapter.dateLabel, chapter.locationLabel].filter(Boolean).join(' · ')}</Text>
          <Text style={styles.chapterTitle}>{chapter.title}</Text>
          <Text style={styles.body}>{chapter.narrative}</Text>
          {chapter.photoIds.map((photoId) => photos.get(photoId) ? (
            <View key={photoId} style={styles.photoBlock}>
              <Image source={{ uri: photos.get(photoId)!.url }} style={styles.photo} />
              {chapter.captions[photoId] ? <Text style={styles.caption}>{chapter.captions[photoId]}</Text> : null}
            </View>
          ) : null)}
        </View>
      ))}
      <Text style={styles.body}>{book.story.epilogue}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={exporting} onPress={() => void exportPdf()} style={styles.secondaryButton}>
          <Text style={styles.secondaryLabel}>{exporting ? 'Preparing…' : 'Export PDF'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={exporting} onPress={() => void shareLink()} style={styles.shareButton}>
          <Text style={styles.shareLabel}>Create private share link</Text>
        </Pressable>
        {activeShare ? (
          <>
            <Text selectable style={styles.activeLink}>{activeShare.url}</Text>
            <Pressable accessibilityRole="button" disabled={exporting} onPress={() => void revokeShare()} style={styles.revokeButton}>
              <Text style={styles.revokeLabel}>Revoke this share link</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F3EDE3', flex: 1 },
  content: { padding: 22, paddingBottom: 60 },
  loader: { backgroundColor: '#F3EDE3', flex: 1 },
  center: { alignItems: 'center', backgroundColor: '#F3EDE3', flex: 1, justifyContent: 'center', padding: 32 },
  error: { color: '#A33B2B', fontSize: 16, textAlign: 'center' },
  cover: { aspectRatio: 4 / 3, borderRadius: 18, marginBottom: 28, width: '100%' },
  title: { color: '#211D18', fontFamily: 'Georgia', fontSize: 38, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#72583F', fontFamily: 'Georgia', fontSize: 18, fontStyle: 'italic', marginTop: 9, textAlign: 'center' },
  body: { color: '#37312A', fontFamily: 'Georgia', fontSize: 17, lineHeight: 29, marginTop: 22 },
  chapter: { borderTopColor: '#CDBEA9', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 34, paddingTop: 28 },
  chapterMeta: { color: '#846A4F', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textAlign: 'center' },
  chapterTitle: { color: '#211D18', fontFamily: 'Georgia', fontSize: 28, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  photoBlock: { marginTop: 22 },
  photo: { aspectRatio: 4 / 3, borderRadius: 8, width: '100%' },
  caption: { color: '#6F655A', fontFamily: 'Georgia', fontSize: 13, fontStyle: 'italic', marginTop: 7, textAlign: 'center' },
  shareButton: { backgroundColor: '#24211D', borderRadius: 12, padding: 15 },
  shareLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  actions: { gap: 10, marginTop: 36 },
  secondaryButton: { borderColor: '#7D5C3C', borderRadius: 12, borderWidth: 1, padding: 15 },
  secondaryLabel: { color: '#684F37', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  activeLink: { color: '#5D554D', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  revokeButton: { borderColor: '#A33B2B', borderRadius: 12, borderWidth: 1, padding: 13 },
  revokeLabel: { color: '#A33B2B', fontSize: 14, fontWeight: '700', textAlign: 'center' },
});

function renderBookHtml(book: BookPreviewDTO, photos: Map<string, Photo>): string {
  const sections = book.story.chapters.map((chapter) => `
    <section><p class="meta">${escapeHtml([chapter.dateLabel, chapter.locationLabel].filter(Boolean).join(' · '))}</p>
    <h2>${escapeHtml(chapter.title)}</h2><p>${escapeHtml(chapter.narrative)}</p>
    ${chapter.photoIds.map((id) => photos.get(id)
      ? `<figure><img src="${escapeHtml(photos.get(id)!.url)}"><figcaption>${escapeHtml(chapter.captions[id] ?? '')}</figcaption></figure>`
      : '').join('')}</section>`).join('');
  return `<html><head><meta charset="utf-8"><style>@page{margin:18mm}body{color:#29251f;font:16px/1.7 Georgia,serif}h1,h2{text-align:center}h1{font-size:34px}.subtitle,.meta{text-align:center;color:#765c43}section{break-before:page}img{max-height:210mm;object-fit:contain;width:100%}figure{break-inside:avoid;margin:24px 0}figcaption{text-align:center;color:#6f655a;font-size:12px}</style></head><body><h1>${escapeHtml(book.title)}</h1><p class="subtitle">${escapeHtml(book.subtitle ?? '')}</p><p>${escapeHtml(book.story.preface)}</p>${sections}<p>${escapeHtml(book.story.epilogue)}</p></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]!);
}
