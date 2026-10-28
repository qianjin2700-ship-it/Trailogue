import type { CreativeRequirementsDTO } from '@/contracts/trip';

export function defaultCreativeRequirements(): CreativeRequirementsDTO {
  return {
    mainPerson: null, companions: null, relationship: null, focusPerson: null,
    writingStyle: 'warm_documentary', customWritingStyle: null,
    contentLength: 'standard', customWordCount: null, focuses: ['journey', 'people'],
    specialMemories: null, emphasis: null, avoidExpressions: null, otherRequirements: null,
    generationLanguage: 'auto', bookStyle: 'travel_magazine',
  };
}

export function normalizeCreativeRequirements(value: unknown): CreativeRequirementsDTO {
  const defaults = defaultCreativeRequirements();
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const text = (key: string, maxLength: number): string | null =>
    typeof input[key] === 'string' && input[key].trim()
      ? input[key].trim().slice(0, maxLength)
      : null;
  const writingStyles = ['warm_documentary', 'literary', 'playful', 'parent_child', 'travel_guide', 'custom'] as const;
  const contentLengths = ['short', 'standard', 'detailed', 'custom'] as const;
  const focusValues = ['scenery', 'food', 'people', 'journey', 'reflection', 'culture'] as const;
  const languages = ['auto', 'zh-Hans', 'zh-Hant', 'en', 'ja', 'ko'] as const;
  const bookStyles = ['travel_magazine', 'warm_memoir', 'minimalist'] as const;
  const oneOf = <T extends string>(candidate: unknown, allowed: readonly T[], fallback: T): T =>
    typeof candidate === 'string' && allowed.includes(candidate as T) ? candidate as T : fallback;
  const rawLength = input.contentLength === 'medium'
    ? 'standard'
    : input.contentLength === 'long' ? 'detailed' : input.contentLength;
  const focuses = Array.isArray(input.focuses)
    ? [...new Set(input.focuses.filter((item): item is typeof focusValues[number] =>
      typeof item === 'string' && focusValues.includes(item as typeof focusValues[number])))].slice(0, 6)
    : defaults.focuses;
  const customWordCount = typeof input.customWordCount === 'number'
    && Number.isInteger(input.customWordCount)
    && input.customWordCount >= 200
    && input.customWordCount <= 10_000
    ? input.customWordCount
    : null;

  return {
    mainPerson: text('mainPerson', 500), companions: text('companions', 1_000),
    relationship: text('relationship', 500), focusPerson: text('focusPerson', 500),
    writingStyle: oneOf(input.writingStyle, writingStyles, defaults.writingStyle),
    customWritingStyle: text('customWritingStyle', 1_000),
    contentLength: oneOf(rawLength, contentLengths, defaults.contentLength), customWordCount, focuses,
    specialMemories: text('specialMemories', 10_000), emphasis: text('emphasis', 5_000),
    avoidExpressions: text('avoidExpressions', 2_000), otherRequirements: text('otherRequirements', 5_000),
    generationLanguage: oneOf(input.generationLanguage, languages, defaults.generationLanguage),
    bookStyle: oneOf(input.bookStyle, bookStyles, defaults.bookStyle),
  };
}
