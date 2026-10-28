import type { ActualStoryLanguage, GenerationLanguage } from '@trailogue/domain';

const TRADITIONAL_HINTS = /[體臺灣龍風車點與後裡這個們]/gu;

export function resolveStoryLanguage(
  mode: GenerationLanguage,
  values: Array<string | null | undefined>,
  fallback: ActualStoryLanguage = 'en',
): ActualStoryLanguage {
  if (mode !== 'auto') return mode;
  const text = values.filter((value) => value && value.trim().length >= 3).join('\n');
  if (!text.trim()) return fallback;
  const scores = {
    ja: (text.match(/[\u3040-\u30ff]/gu) ?? []).length * 3,
    ko: (text.match(/[\uac00-\ud7af]/gu) ?? []).length * 3,
    zh: (text.match(/[\u3400-\u9fff]/gu) ?? []).length,
    en: (text.match(/[A-Za-z]{2,}/gu) ?? []).reduce((total, word) => total + word.length, 0),
  };
  if (scores.ja > Math.max(scores.ko, scores.zh, scores.en)) return 'ja';
  if (scores.ko > Math.max(scores.ja, scores.zh, scores.en)) return 'ko';
  if (scores.zh >= scores.en && scores.zh > 0) {
    return (text.match(TRADITIONAL_HINTS) ?? []).length >= 2 ? 'zh-Hant' : 'zh-Hans';
  }
  return scores.en > 0 ? 'en' : fallback;
}

export function languageInstruction(language: ActualStoryLanguage): string {
  return ({
    'zh-Hans': '简体中文',
    'zh-Hant': '繁體中文',
    en: 'English',
    ja: '日本語',
    ko: '한국어',
  } as const)[language];
}
