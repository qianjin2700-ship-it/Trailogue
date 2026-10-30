import type { StoryContentDTO } from '@trailogue/contracts';
import type { ActualStoryLanguage, GenerationLanguage } from '@trailogue/domain';
import { languageInstruction } from './storyLanguage.js';

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

/** 结构化日志回调。禁止记录 API Key、Bearer Token、完整图片数据或带签名的完整 URL。 */
export type ProviderLogger = (event: string, data: Record<string, unknown>) => void;

export interface DeepSeekProviderOptions {
  logger?: ProviderLogger;
  /**
   * 用于在发送给 DeepSeek 之前自行校验图片 URL 是否可被外部匿名抓取（预签名 URL 自带签名）。
   * 未注入时跳过预检 —— 单元测试保持纯离线。
   */
  imageFetch?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { total_tokens?: number };
}

interface ModelListResponse {
  data?: Array<{ id?: string; input_modalities?: string[] }>;
}

/** DeepSeek 视觉文档限制：单请求最多 600 张图、外链 URL 最长 8192 字符、单图最大 32 MiB。 */
const MAX_IMAGES_PER_REQUEST = 600;
const MAX_IMAGE_URL_LENGTH = 8_192;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
/** 单个视觉分批的大小：控制在 4 张，避免一次失败拖累全部照片，也让请求体保持很小。 */
const VISION_BATCH_SIZE = 4;
/** 外链抓取失败时回退内联 base64 的上限（单图 5 MiB，单批 20 MiB，均低于 48 MiB 请求体上限）。 */
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_INLINE_BATCH_BYTES = 20 * 1024 * 1024;
const MAX_ERROR_BODY_CHARS = 2_000;
/** 1×1 透明 PNG：仅用于探测模型是否真的接受图片输入，不含任何用户数据。 */
const VISION_PROBE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

export class DeepSeekProviderError extends Error {
  readonly statusCode?: number | undefined;
  readonly providerCode?: string | undefined;

  constructor(message: string, details?: { statusCode?: number | undefined; providerCode?: string | undefined }) {
    super(message);
    this.name = 'DeepSeekProviderError';
    this.statusCode = details?.statusCode;
    this.providerCode = details?.providerCode;
  }
}

export class DeepSeekProvider {
  private readonly baseUrl: string;
  private visionCapability: boolean | null = null;
  private visionModel: string | null = null;

  constructor(
    private readonly apiKey: string,
    baseUrl: string,
    readonly model: string,
    private readonly request: typeof fetch = fetch,
    private readonly options: DeepSeekProviderOptions = {},
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
        if (configured?.input_modalities) {
          if (configured.input_modalities.includes('image')) {
            this.visionModel = this.model;
            this.visionCapability = true;
            return true;
          }
          // 模型清单明确声明该模型只接收文本：直接判定不支持，绝不硬发图片。
          this.visionCapability = false;
          return false;
        }
        const fallback = payload.data?.find((candidate) =>
          candidate.id === 'deepseek-flash' && candidate.input_modalities?.includes('image'));
        if (fallback?.id) {
          this.visionModel = fallback.id;
          this.visionCapability = true;
          return true;
        }
      }
    } catch {
      // 能力探测是尽力而为，失败后走下面的真实探测。
    }
    // 模型清单没有给出多模态信息（DeepSeek /models 通常如此），
    // 过去仅凭模型名判断会导致「以为支持视觉，实际 400」。改为一次真实探测。
    return this.probeVision();
  }

  /**
   * 用 1×1 PNG 真实探测当前模型是否接受图片输入。
   * 成功 → 支持视觉；失败 → 关闭视觉并记录上游返回的真实错误码/正文（不含用户数据）。
   */
  private async probeVision(): Promise<boolean> {
    try {
      const response = await this.request(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Reply with OK.' },
              { type: 'image_url', image_url: { url: VISION_PROBE_IMAGE } },
            ],
          }],
          max_tokens: 8,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        this.visionModel = this.model;
        this.visionCapability = true;
        this.log('deepseek.vision_probe', { model: this.model, supported: true });
        return true;
      }
      const detail = await readErrorDetail(response);
      this.visionCapability = false;
      this.visionModel = null;
      this.log('deepseek.vision_probe', {
        model: this.model,
        supported: false,
        status: response.status,
        providerCode: detail.code,
        providerMessage: detail.message,
      });
      return false;
    } catch (error) {
      this.visionCapability = false;
      this.visionModel = null;
      this.log('deepseek.vision_probe', {
        model: this.model,
        supported: false,
        error: error instanceof Error ? error.name : 'unknown',
      });
      return false;
    }
  }

  async understandPhotos(photos: StoryPhotoInput[]): Promise<{
    facts: PhotoUnderstanding[];
    totalTokens: number;
  }> {
    if (!(await this.supportsVision())) return { facts: [], totalTokens: 0 };
    const usable: StoryPhotoInput[] = [];
    const skipped: Array<{ photoId: string; reason: string }> = [];
    for (const photo of photos) {
      const inspection = await this.inspectImage(photo);
      if (!inspection.ok) {
        // 预检失败的照片不进入请求，避免上游以 400 拒绝整批；具体原因可诊断。
        this.log('deepseek.photo_preflight_failed', {
          photoId: photo.id,
          reason: inspection.reason,
          urlLength: photo.url.length,
        });
        this.options.logger?.('deepseek.photo_skipped', { photoId: photo.id, reason: inspection.reason });
        skipped.push({ photoId: photo.id, reason: inspection.reason });
        continue;
      }
      usable.push(photo);
    }
    if (usable.length === 0 && photos.length > 0) {
      // 全部照片都抓不到时，给出可执行的原因，而不是让上游 400 掩盖真实问题。
      const reason = skipped[0]?.reason ?? 'unknown';
      throw new DeepSeekProviderError(
        `Photos could not be read by the AI service (${skipped.length} photo(s), first reason: ${reason})`,
      );
    }
    const facts: PhotoUnderstanding[] = [];
    let totalTokens = 0;
    let lastError: unknown;
    for (let offset = 0; offset < usable.length; offset += VISION_BATCH_SIZE) {
      const batch = usable.slice(offset, offset + VISION_BATCH_SIZE);
      try {
        const result = await this.understandBatch(batch);
        facts.push(...result.facts);
        totalTokens += result.totalTokens;
      } catch (error) {
        lastError = error;
        this.log('deepseek.vision_batch_failed', {
          photoIds: batch.map((photo) => photo.id),
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
    if (facts.length === 0 && usable.length > 0) {
      throw lastError instanceof Error
        ? lastError
        : new DeepSeekProviderError('DeepSeek photo understanding validation failed');
    }
    return { facts, totalTokens };
  }

  private async understandBatch(batch: StoryPhotoInput[]): Promise<{
    facts: PhotoUnderstanding[];
    totalTokens: number;
  }> {
    const allowed = new Set(batch.map((photo) => photo.id));
    let lastError: unknown;
    let inlineMode = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const content = await this.buildVisionContent(batch, inlineMode);
        const completion = await this.complete([
          { role: 'system', content: 'You extract conservative, privacy-aware visible facts from travel photos and output JSON.' },
          { role: 'user', content: attempt === 1 || inlineMode ? content : [
            ...content,
            { type: 'text', text: 'The previous output failed validation. Return exactly one result for every supplied photoId.' },
          ] },
        ], 4_000, this.visionModel ?? this.model);
        const parsed = parseJson(completion.content) as { photos?: unknown };
        const facts = Array.isArray(parsed.photos)
          ? parsed.photos.map(parsePhotoUnderstanding).filter((fact): fact is PhotoUnderstanding => fact !== null)
          : [];
        const seen = new Set<string>();
        if (facts.length !== batch.length || facts.some((fact) =>
          !allowed.has(fact.photoId) || seen.has(fact.photoId) || !seen.add(fact.photoId))) {
          throw new DeepSeekProviderError('Photo understanding did not cover every photo exactly once');
        }
        return { facts, totalTokens: completion.totalTokens };
      } catch (error) {
        lastError = error;
        // 400 且原因可能是上游抓不到预签名外链：改为内联 base64 重试一次（带字节上限）。
        if (!inlineMode && error instanceof DeepSeekProviderError && error.statusCode === 400) {
          const inline = await this.tryBuildInlineBatch(batch);
          if (inline) {
            inlineMode = true;
            this.log('deepseek.vision_inline_retry', {
              photoIds: batch.map((photo) => photo.id),
              totalBytes: inline.totalBytes,
            });
            continue;
          }
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new DeepSeekProviderError('DeepSeek photo understanding validation failed');
  }

  private async buildVisionContent(batch: StoryPhotoInput[], inline: boolean): Promise<Array<Record<string, unknown>>> {
    const content: Array<Record<string, unknown>> = [{
      type: 'text',
      text: `Return JSON only: {"photos":[{"photoId":"...","visibleFacts":["..."],"inferredLocation":null,"confidence":0.0}]}.
Describe only directly visible details. Do not identify people or invent relationships, dates, places, events, emotions, or dialogue.
The images follow in the same order as these IDs: ${batch.map((photo) => photo.id).join(', ')}.`,
    }];
    for (const photo of batch) {
      content.push({ type: 'text', text: `photoId=${photo.id}` });
      const url = inline ? await this.inlineImage(photo.url) : photo.url;
      content.push({ type: 'image_url', image_url: { url, detail: 'low' } });
    }
    return content;
  }

  private async tryBuildInlineBatch(batch: StoryPhotoInput[]): Promise<{ totalBytes: number } | null> {
    if (!this.options.imageFetch) return null;
    let totalBytes = 0;
    for (const photo of batch) {
      try {
        const response = await this.options.imageFetch(photo.url, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) return null;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > MAX_INLINE_IMAGE_BYTES) return null;
        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_INLINE_BATCH_BYTES) return null;
      } catch {
        return null;
      }
    }
    return { totalBytes };
  }

  private async inlineImage(url: string): Promise<string> {
    const response = await this.options.imageFetch!(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new DeepSeekProviderError(`Photo could not be fetched for inline retry (HTTP ${response.status})`);
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_INLINE_IMAGE_BYTES) {
      throw new DeepSeekProviderError('Photo is too large for inline retry');
    }
    return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
  }

  /** 用匿名 GET（Range 0-1023）验证预签名 URL 确实可被外部抓取，而不是只有 App 自己能打开。 */
  private async inspectImage(photo: StoryPhotoInput): Promise<
    { ok: true } | { ok: false; reason: string }
  > {
    if (photo.url.length > MAX_IMAGE_URL_LENGTH) {
      return { ok: false, reason: `url longer than ${MAX_IMAGE_URL_LENGTH} characters` };
    }
    if (!/^https?:\/\//i.test(photo.url) && !photo.url.startsWith('data:image/')) {
      return { ok: false, reason: 'url is neither http(s) nor a data URI' };
    }
    if (!this.options.imageFetch) return { ok: true };
    try {
      const response = await this.options.imageFetch(photo.url, {
        headers: { Range: 'bytes=0-1023' },
        signal: AbortSignal.timeout(15_000),
      });
      await response.body?.cancel();
      if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.startsWith('image/')) {
        return { ok: false, reason: `unexpected content-type ${contentType || 'unknown'}` };
      }
      const contentRange = response.headers.get('content-range');
      const totalBytes = contentRange ? Number(contentRange.split('/')[1]) : NaN;
      if (Number.isFinite(totalBytes) && totalBytes > MAX_IMAGE_BYTES) {
        return { ok: false, reason: `image larger than ${MAX_IMAGE_BYTES} bytes` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.name : 'fetch failed' };
    }
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
      creativeRequirements?: Record<string, unknown>;
    };
    photos: StoryPhotoInput[];
    understandings: PhotoUnderstanding[];
    visionAvailable: boolean;
    feedback?: string | null;
    languageMode?: GenerationLanguage;
    actualLanguage?: ActualStoryLanguage;
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
    const requirements = input.trip.creativeRequirements ?? { contentLength: input.trip.contentLength };
    const targetWords = requirements.contentLength === 'custom'
      ? Number(requirements.customWordCount) || 1_200
      : ({ short: 600, standard: 1_200, detailed: 2_400 } as const)[String(requirements.contentLength) as 'short' | 'standard' | 'detailed'] ?? 1_200;
    const prompt = `Create a travel story in ${languageInstruction(input.actualLanguage ?? 'en')} using only the supplied facts. Output JSON only.
Separate factual photo understanding from narrative writing: weave confirmed facts naturally into a coherent journey instead of listing buildings, roads, clothing colors, or detected objects.
Prioritize the requested people, relationships, interactions, atmosphere, transitions, and travel meaning, but never invent dialogue, events, motives, emotions, relationships, exact places, or exact times. When time evidence is uncertain or inconsistent, use broad phrases such as morning, later, or toward evening instead of a precise clock time.
Aim for approximately ${targetWords} words/characters in the target language across the complete story. Apply the requested style and focuses materially.
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
          languageMode: input.languageMode ?? 'auto',
          actualLanguage: input.actualLanguage ?? 'en',
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
    const body = {
      model,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: maxTokens,
    };
    const imageCount = countImageBlocks(messages);
    const payloadBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
    if (imageCount > MAX_IMAGES_PER_REQUEST) {
      throw new DeepSeekProviderError(
        `Request contains ${imageCount} images, above the provider limit of ${MAX_IMAGES_PER_REQUEST}`,
      );
    }

    let response: Response;
    try {
      response = await this.request(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new DeepSeekProviderError('DeepSeek request timed out after 90 seconds');
      }
      throw new DeepSeekProviderError('DeepSeek could not be reached');
    }
    if (!response.ok) {
      // 关键：过去这里丢掉了响应体，导致 400 的真实原因完全不可见。现在读取并结构化记录。
      const requestId = response.headers.get('x-request-id');
      const detail = await readErrorDetail(response);
      this.log('deepseek.request_failed', {
        endpoint: '/chat/completions',
        model,
        status: response.status,
        providerCode: detail.code,
        providerMessage: detail.message,
        upstreamRequestId: requestId,
        imageCount,
        messageRoles: describeMessageRoles(messages),
        payloadBytes,
      });
      throw new DeepSeekProviderError(
        describeFailure(response.status, detail, requestId),
        { statusCode: response.status, providerCode: detail.code },
      );
    }
    const payload = await response.json() as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new DeepSeekProviderError('DeepSeek returned an empty response');
    return { content, totalTokens: payload.usage?.total_tokens ?? 0 };
  }

  private log(event: string, data: Record<string, unknown>): void {
    this.options.logger?.(event, data);
  }
}

/** 读取上游错误响应体，解析出 error.code / error.message（截断，且绝不包含请求体内容）。 */
async function readErrorDetail(response: Response): Promise<{
  code?: string | undefined;
  message?: string | undefined;
}> {
  try {
    const raw = (await response.text()).slice(0, MAX_ERROR_BODY_CHARS);
    if (!raw.trim()) return {};
    try {
      const parsed = JSON.parse(raw) as { error?: { code?: unknown; message?: unknown; type?: unknown } };
      const message = typeof parsed.error?.message === 'string' ? parsed.error.message : undefined;
      const code = typeof parsed.error?.code === 'string'
        ? parsed.error.code
        : typeof parsed.error?.type === 'string' ? parsed.error.type : undefined;
      return { code, message };
    } catch {
      return { message: raw.trim().slice(0, 300) };
    }
  } catch {
    return {};
  }
}

function describeFailure(
  status: number,
  detail: { code?: string | undefined; message?: string | undefined },
  requestId: string | null,
): string {
  const parts = [`DeepSeek request failed with HTTP ${status}`];
  if (detail.code) parts.push(detail.code);
  if (detail.message) parts.push(detail.message.replace(/\s+/g, ' ').trim().slice(0, 200));
  const base = parts.join(': ');
  return requestId ? `${base} (${requestId})` : base;
}

function describeMessageRoles(messages: unknown[]): string[] {
  return messages.map((message) => {
    if (!message || typeof message !== 'object') return 'unknown';
    const role = (message as { role?: unknown }).role;
    return typeof role === 'string' ? role : 'unknown';
  });
}

function countImageBlocks(messages: unknown[]): number {
  let count = 0;
  for (const message of messages) {
    const content = (message as { content?: unknown } | null)?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if ((block as { type?: unknown } | null)?.type === 'image_url') count += 1;
    }
  }
  return count;
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
  languageMode: GenerationLanguage;
  actualLanguage: ActualStoryLanguage;
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
      languageMode: context.languageMode,
      actualLanguage: context.actualLanguage,
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
