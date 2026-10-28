import type { StoryContentDTO } from '@trailogue/contracts';

export interface StoryPhotoInput {
  id: string;
  url: string;
  capturedAt: string | null;
  locationName: string | null;
  caption: string | null;
  originalFilename: string;
}

export interface PhotoUnderstanding {
  photoId: string;
  visibleFacts: string[];
  inferredLocation: string | null;
  confidence: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { total_tokens?: number };
}

interface ModelListResponse {
  data?: Array<{ id?: string; input_modalities?: string[] }>;
}

export class DeepSeekProviderError extends Error {}

export class DeepSeekProvider {
  private readonly baseUrl: string;
  private visionCapability: boolean | null = null;
  private visionModel: string | null = null;

  constructor(
    private readonly apiKey: string,
    baseUrl: string,
    readonly model: string,
    private readonly request: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async supportsVision(): Promise<boolean> {
    if (this.visionCapability !== null) return this.visionCapability;
    try {
      const response = await this.request(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const payload = await response.json() as ModelListResponse;
        const configured = payload.data?.find((candidate) => candidate.id === this.model);
        if (configured?.input_modalities?.includes('image')) {
          this.visionModel = this.model;
          this.visionCapability = true;
          return true;
        }
        const fallback = payload.data?.find((candidate) =>
          candidate.id === 'deepseek-flash' && candidate.input_modalities?.includes('image'));
        if (fallback) {
          this.visionModel = fallback.id!;
          this.visionCapability = true;
          return true;
        }
        if (configured?.input_modalities) {
          this.visionCapability = false;
          return false;
        }
      }
    } catch {
      // Capability discovery is best-effort; the documented model allowlist below is conservative.
    }
    this.visionCapability = this.model === 'deepseek-flash'
      || this.model === 'deepseek-v4-flash-vision-exp';
    this.visionModel = this.visionCapability ? this.model : null;
    return this.visionCapability;
  }

  async understandPhotos(photos: StoryPhotoInput[]): Promise<{
    facts: PhotoUnderstanding[];
    totalTokens: number;
  }> {
    if (!(await this.supportsVision())) return { facts: [], totalTokens: 0 };
    const content: Array<Record<string, unknown>> = [{
      type: 'text',
      text: `Return JSON only: {"photos":[{"photoId":"...","visibleFacts":["..."],"inferredLocation":null,"confidence":0.0}]}.
Describe only directly visible details. Do not identify people or invent relationships, dates, places, events, emotions, or dialogue.
The images follow in the same order as these IDs: ${photos.map((photo) => photo.id).join(', ')}.`,
    }];
    for (const photo of photos) {
      content.push({ type: 'text', text: `photoId=${photo.id}` });
      content.push({ type: 'image_url', image_url: { url: photo.url, detail: 'low' } });
    }
    const allowed = new Set(photos.map((photo) => photo.id));
    let totalTokens = 0;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const completion = await this.complete([
          { role: 'system', content: 'You extract conservative, privacy-aware visible facts from travel photos and output JSON.' },
          { role: 'user', content: attempt === 1 ? content : [
            ...content,
            { type: 'text', text: 'The previous output failed validation. Return exactly one result for every supplied photoId.' },
          ] },
        ], 4_000, this.visionModel ?? this.model);
        totalTokens += completion.totalTokens;
        const parsed = parseJson(completion.content) as { photos?: unknown };
        const facts = Array.isArray(parsed.photos)
          ? parsed.photos.map(parsePhotoUnderstanding).filter((fact): fact is PhotoUnderstanding => fact !== null)
          : [];
        const seen = new Set<string>();
        if (facts.length !== photos.length || facts.some((fact) =>
          !allowed.has(fact.photoId) || seen.has(fact.photoId) || !seen.add(fact.photoId))) {
          throw new DeepSeekProviderError('Photo understanding did not cover every photo exactly once');
        }
        return { facts, totalTokens };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new DeepSeekProviderError('DeepSeek photo understanding validation failed');
  }

  async generateStory(input: {
    trip: {
      title: string;
      description: string | null;
      destinationName: string | null;
      startDate: string | null;
      endDate: string | null;
      storyBackground: string | null;
      peopleNotes: string | null;
      highlights: string | null;
      writingStyle: string;
      customWritingStyle: string | null;
      avoidExpressions: string | null;
      contentLength: string;
      arrangement: string;
    };
    photos: StoryPhotoInput[];
    understandings: PhotoUnderstanding[];
    visionAvailable: boolean;
    feedback?: string | null;
  }): Promise<StoryContentDTO> {
    const photoFacts = input.photos.map((photo) => ({
      photoId: photo.id,
      capturedAt: photo.capturedAt,
      locationName: photo.locationName,
      userCaption: photo.caption,
      originalFilename: photo.originalFilename,
      visibleFacts: input.understandings.find((fact) => fact.photoId === photo.id)?.visibleFacts ?? [],
      inferredLocation: input.understandings.find((fact) => fact.photoId === photo.id)?.inferredLocation ?? null,
    }));
    const prompt = `Create a Chinese travel story using only the supplied facts. Output JSON only.
Never invent names, relationships, exact locations, dates, dialogue, events, motives, or emotions. Treat visual observations as uncertain unless confirmed by user metadata.
Required JSON keys: title, subtitle, preface, chapters, epilogue, shareSummary.
Each chapter must contain: chapterId, title, dateLabel, locationLabel, narrative, photoIds, captions, locked=false, userEdited=false.
Every supplied photoId must appear exactly once across chapters. captions is an object keyed by photoId.
Trip: ${JSON.stringify(input.trip)}
Photo facts: ${JSON.stringify(photoFacts)}
User regeneration feedback: ${JSON.stringify(input.feedback ?? null)}`;
    let totalTokens = 0;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const completion = await this.complete([
          { role: 'system', content: 'You are a careful travel-book editor. Respond with valid JSON and obey factual constraints.' },
          { role: 'user', content: attempt === 1 ? prompt : `${prompt}\nPrevious output failed strict validation. Return a complete corrected JSON object.` },
        ], 8_000);
        totalTokens += completion.totalTokens;
        return validateStoryContent(parseJson(completion.content), {
          model: this.model,
          visionAvailable: input.visionAvailable,
          totalTokens,
          callCount: attempt + (input.visionAvailable ? 1 : 0),
          photoIds: input.photos.map((photo) => photo.id),
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new DeepSeekProviderError('DeepSeek story validation failed');
  }

  private async complete(messages: unknown[], maxTokens: number, model = this.model): Promise<{
    content: string;
    totalTokens: number;
  }> {
    const response = await this.request(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      const requestId = response.headers.get('x-request-id');
      throw new DeepSeekProviderError(
        `DeepSeek request failed with HTTP ${response.status}${requestId ? ` (${requestId})` : ''}`,
      );
    }
    const payload = await response.json() as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new DeepSeekProviderError('DeepSeek returned an empty response');
    return { content, totalTokens: payload.usage?.total_tokens ?? 0 };
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new DeepSeekProviderError('DeepSeek returned invalid JSON');
  }
}

function parsePhotoUnderstanding(value: unknown): PhotoUnderstanding | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.photoId !== 'string' || !Array.isArray(record.visibleFacts)) return null;
  return {
    photoId: record.photoId,
    visibleFacts: record.visibleFacts.filter((fact): fact is string => typeof fact === 'string').slice(0, 12),
    inferredLocation: typeof record.inferredLocation === 'string' ? record.inferredLocation : null,
    confidence: typeof record.confidence === 'number'
      ? Math.max(0, Math.min(1, record.confidence))
      : 0,
  };
}

function validateStoryContent(value: unknown, context: {
  model: string;
  visionAvailable: boolean;
  totalTokens: number;
  callCount: number;
  photoIds: string[];
}): StoryContentDTO {
  if (!value || typeof value !== 'object') throw new DeepSeekProviderError('Story response is not an object');
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.chapters) || record.chapters.length === 0) {
    throw new DeepSeekProviderError('Story response has no chapters');
  }
  const allowed = new Set(context.photoIds);
  const seen = new Set<string>();
  const chapters = record.chapters.map((value, index) => {
    if (!value || typeof value !== 'object') throw new DeepSeekProviderError('Story chapter is invalid');
    const chapter = value as Record<string, unknown>;
    const photoIds = Array.isArray(chapter.photoIds)
      ? chapter.photoIds.filter((id): id is string => typeof id === 'string' && allowed.has(id))
      : [];
    for (const id of photoIds) {
      if (seen.has(id)) throw new DeepSeekProviderError('A photo is referenced more than once');
      seen.add(id);
    }
    const captions = chapter.captions && typeof chapter.captions === 'object'
      ? Object.fromEntries(Object.entries(chapter.captions as Record<string, unknown>)
        .filter(([id, caption]) => allowed.has(id) && typeof caption === 'string')) as Record<string, string>
      : {};
    return {
      chapterId: stringValue(chapter.chapterId, `ch${index + 1}`, 80),
      title: requiredString(chapter.title, 'Story chapter title is missing', 80),
      dateLabel: nullableString(chapter.dateLabel, 80),
      locationLabel: nullableString(chapter.locationLabel, 160),
      narrative: requiredString(chapter.narrative, 'Story chapter narrative is missing', 4_000),
      photoIds,
      captions,
      locked: false,
      userEdited: false,
    };
  });
  if (seen.size !== allowed.size) throw new DeepSeekProviderError('Story response omitted photos');
  return {
    title: requiredString(record.title, 'Story title is missing', 200),
    subtitle: stringValue(record.subtitle, '', 240),
    preface: stringValue(record.preface, '', 4_000),
    chapters,
    epilogue: stringValue(record.epilogue, '', 4_000),
    shareSummary: nullableString(record.shareSummary, 500),
    meta: {
      model: context.model,
      generatedAt: new Date().toISOString(),
      degraded: !context.visionAvailable,
      visionAvailable: context.visionAvailable,
      uncertainNotes: context.visionAvailable ? [] : ['当前配置模型不支持图片输入，故事仅使用旅行与照片元数据。'],
      totalTokens: context.totalTokens,
      callCount: context.callCount,
    },
  };
}

function stringValue(value: unknown, fallback: string, maxLength: number): string {
  return (typeof value === 'string' ? value : fallback).trim().slice(0, maxLength);
}

function requiredString(value: unknown, message: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new DeepSeekProviderError(message);
  return value.trim().slice(0, maxLength);
}

function nullableString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}
