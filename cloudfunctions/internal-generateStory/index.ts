// cloudfunctions/internal-generateStory/index.ts — 故事生成（TokenHub 多模态模型，失败降级模板）
import cloud from 'wx-server-sdk';
import https from 'https';
import { writeEvent } from './common';
import { bumpDailyUsage } from './usage';

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// TokenHub OpenAI 兼容协议：https://tokenhub.tencentmaas.com/v1/chat/completions
const MODEL_BASE = (process.env.MODEL_ENDPOINT || 'https://tokenhub.tencentmaas.com').replace(/\/+$/, '');
const MODEL_NAME = process.env.MODEL_NAME || 'hy-vision-2.0-instruct';

interface CallEvent {
  job_id: string;
  mode?: string;
}

interface VisionResult {
  status: 'done' | 'failed';
  facts: string[];
  error?: string;
}

exports.main = async (event: CallEvent) => {
  const db = cloud.database();
  const jobId = event.job_id;

  // doc.get 对不存在的文档会抛异常而非返回空（wx-server-sdk 行为），必须捕获
  let job: Record<string, unknown> | null = null;
  try {
    const res = await db.collection('ai_jobs').doc(jobId).get();
    job = res.data as Record<string, unknown>;
  } catch (err) {
    job = null;
  }
  if (!job) return { code: 40401, message: '任务不存在' };

  // 归属校验：openid 经函数间调用透传，客户端直调伪造他人 job_id 会被拒绝
  const callerOpenid = cloud.getWXContext().OPENID;
  if (!callerOpenid || callerOpenid !== job._openid) {
    return { code: 40301, message: '无权执行该任务' };
  }

  // 防重入：任务已成功则不再重复执行
  if (job.status === 'succeeded') {
    return { code: 0, data: { status: 'succeeded', skipped: true } };
  }

  // 防重入：running 且 90 秒内有心跳 → 已有实例在跑，跳过（僵尸可接管）
  if (job.status === 'running') {
    const heartbeatMs = Date.now() - new Date(String(job.updated_at || job.created_at)).getTime();
    if (heartbeatMs < 90 * 1000) {
      return { code: 0, data: { status: 'running', skipped: true } };
    }
  }

  await db.collection('ai_jobs').doc(jobId).update({
    data: { status: 'running', updated_at: new Date().toISOString() },
  });

  let totalTokens = 0;
  let visionCallCount = 0;
  let storyCallCount = 0;
  let failedCallCount = 0;
  const errorCodes: string[] = [];
  const startedAt = Date.now();

  try {
    // 1. 组装事实库
    const albumId = String(job.album_id);
    let album: Record<string, unknown> | null = null;
    try {
      const albumRes = await db.collection('albums').doc(albumId).get();
      album = albumRes.data as Record<string, unknown>;
    } catch (err) {
      album = null;
    }
    if (!album) return { code: 40401, message: '相册不存在' };

    const { data: photos } = await db.collection('photos')
      .where({ album_id: job.album_id, deleted: false })
      .orderBy('sort_index', 'asc')
      .get();

    // 2. 视觉理解：为缺 vision 描述的照片生成描述
    await db.collection('ai_jobs').doc(jobId).update({
      data: { stage: 'vision', stage_message: '正在理解照片内容', updated_at: new Date().toISOString() },
    });

    const visionMap = await ensureVisionFacts(
      db,
      photos as Record<string, unknown>[],
      (done: number, total: number) =>
        db.collection('ai_jobs').doc(jobId).update({
          data: {
            stage: `vision_${done}/${total}`,
            progress: total > 0 ? (done / total) * 0.6 : 0.6,
            updated_at: new Date().toISOString(),
          },
        }).catch(() => undefined)
    );
    // 汇总 token / 调用计数（vision 拆分统计，供成本观察）
    for (const v of Object.values(visionMap)) {
      if (v.status === 'done' && v.tokens) totalTokens += v.tokens;
      if (v.status === 'done') {
        visionCallCount += 1;
      } else {
        failedCallCount += 1;
        if (v.error) errorCodes.push(v.error);
      }
    }

    // 3. 聚类分组（按相册编排策略；元数据不足时自动降级并在 notes 中注明）
    const clustered = clusterPhotos(
      photos as Record<string, unknown>[],
      String(album.arrangement) || 'timeline'
    );
    const groups = clustered.groups;

    // 4. AI 生成整本书文案
    await db.collection('ai_jobs').doc(jobId).update({
      data: { stage: 'writing', stage_message: '正在撰写故事', progress: 0.7, updated_at: new Date().toISOString() },
    });

    const aiResult = await generateStoryByModel(groups, album as Record<string, unknown>, visionMap, clustered.notes);
    if (aiResult.ok) {
      totalTokens += aiResult.tokens;
      storyCallCount += 1;
    } else if (aiResult.errorCode) {
      errorCodes.push(aiResult.errorCode);
      failedCallCount += 1;
    }

    // 5. 组装故事（AI 成功 → 真实文案；失败 → 模板降级）
    const chapters = buildChapters(groups, album as Record<string, unknown>, visionMap, aiResult);
    const story = assembleStory(chapters, album as Record<string, unknown>, aiResult, {
      degraded: !aiResult.ok,
      totalTokens,
      callCount: visionCallCount + storyCallCount,
      errorCodes,
      notes: aiResult.ok
        ? clustered.notes
        : [...clustered.notes, `AI 生成失败（${aiResult.errorCode || 'unknown'}），已降级为模板文案`],
    });

    // 6. 落库
    const version = await getNextVersion(db, String(job.album_id));

    await db.collection('album_stories').add({
      data: {
        _openid: job._openid,
        album_id: job.album_id,
        kind: 'story',
        version,
        story,
        locked_chapters: [],
        share_summary: story.share_summary || null,
        generate_meta: {
          model: aiResult.ok ? MODEL_NAME : 'template',
          generated_at: new Date().toISOString(),
          degraded: !aiResult.ok,
          // 成本观察字段（docs/13：无法可靠计算成本时返回 null，不伪造精确值）
          photo_count: photos.length,
          vision_call_count: visionCallCount,
          story_call_count: storyCallCount,
          token_usage: totalTokens,
          total_tokens: totalTokens, // 兼容旧读取方
          retry_count: failedCallCount,
          generation_duration_ms: Date.now() - startedAt,
          estimated_cost: null,
        },
        created_at: new Date().toISOString(),
      },
    });

    // 更新相册状态
    await db.collection('albums').doc(job.album_id).update({
      data: { status: 'done', story_id: jobId, updated_at: new Date().toISOString() },
    });

    // 更新任务
    await db.collection('ai_jobs').doc(jobId).update({
      data: { status: 'succeeded', progress: 1, updated_at: new Date().toISOString() },
    });

    // 每日用量：成功 +1；行为事件：generation_succeeded（模板降级也算完成，degraded 注明）
    await bumpDailyUsage(String(job._openid), { successDelta: 1 });
    await writeEvent(String(job._openid), 'generation_succeeded', {
      album_id: String(job.album_id),
      job_id: jobId,
      degraded: !aiResult.ok,
      photo_count: photos.length,
      duration_ms: Date.now() - startedAt,
    });

    return { code: 0, data: { status: 'succeeded', degraded: !aiResult.ok } };
  } catch (err) {
    const errMsg = (() => {
      if (err instanceof Error) return err.message;
      try { return JSON.stringify(err); } catch { return String(err); }
    })();
    await db.collection('ai_jobs').doc(jobId).update({
      data: { status: 'failed', error: errMsg, updated_at: new Date().toISOString() },
    });
    // 走到 catch 的均为基础设施级异常（DB/存储/临时URL），属系统确认的服务故障：
    // 回滚当日尝试次数（不计入用户 attempt），并记 generation_failed 事件
    await bumpDailyUsage(String(job._openid), { attemptDelta: -1 });
    await writeEvent(String(job._openid), 'generation_failed', {
      album_id: String(job.album_id),
      job_id: jobId,
      system_fault: true,
      error_code: errMsg.slice(0, 60),
    });
    return { code: 50001, message: '生成失败' };
  }
};

/* ============================================================
 * TokenHub Chat Completions（OpenAI 兼容协议，Bearer Token 鉴权）
 * ============================================================ */

interface ChatContent {
  type: string;
  text?: string;
  image_url?: { url: string };
}

type ChatMessage = { role: string; content: string | ChatContent[] };

/**
 * 调用 TokenHub chat/completions（非流式）
 */
function callChatModel(messages: ChatMessage[], temperature = 0.7): Promise<{
  ok: boolean;
  content: string;
  tokens: number;
  errorCode: string;
}> {
  return new Promise((resolve) => {
    const apiKey = process.env.TOKENHUB_API_KEY;
    if (!apiKey) {
      resolve({ ok: false, content: '', tokens: 0, errorCode: 'ENV_MISSING' });
      return;
    }

    const url = new URL(MODEL_BASE + '/v1/chat/completions');
    const body = JSON.stringify({
      model: MODEL_NAME,
      messages,
      temperature,
      top_p: 0.8,
      stream: false,
    });

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 90000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              const code = (parsed.error.code || parsed.error.type || parsed.error.message || 'API_ERROR').toString().slice(0, 60);
              resolve({ ok: false, content: '', tokens: 0, errorCode: code });
              return;
            }
            if (res.statusCode && res.statusCode >= 400) {
              resolve({ ok: false, content: '', tokens: 0, errorCode: `HTTP_${res.statusCode}` });
              return;
            }
            const msg = parsed.choices && parsed.choices[0] && parsed.choices[0].message;
            const content = (msg && msg.content) || '';
            const tokens = (parsed.usage && parsed.usage.total_tokens) || 0;
            if (!content) {
              resolve({ ok: false, content: '', tokens, errorCode: 'EMPTY_RESPONSE' });
              return;
            }
            resolve({ ok: true, content, tokens, errorCode: '' });
          } catch (e) {
            resolve({ ok: false, content: '', tokens: 0, errorCode: 'PARSE_ERROR' });
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, content: '', tokens: 0, errorCode: 'TIMEOUT' });
    });
    req.on('error', (e: Error) => {
      resolve({ ok: false, content: '', tokens: 0, errorCode: `NETWORK_ERROR:${e.message.slice(0, 40)}` });
    });
    req.write(body);
    req.end();
  });
}

/* ============================================================
 * 视觉理解：照片 → 文字描述
 * ============================================================ */

const VISION_PROMPT =
  '请用中文客观描述这张旅行照片，80字以内，像旅行相册的配文那样写。包含：①画面主体和场景；②光线、色彩与天气氛围；③一个让人会心的小细节。不要臆测地名或人名，不确定的内容不写。';

/**
 * 确保每张照片都有视觉描述：
 * - photos.vision.status === 'done' 且有 facts 的直接复用
 * - 其余照片取临时 URL 并发调混元视觉，结果写回 photos.vision
 */
async function ensureVisionFacts(
  db: ReturnType<typeof cloud.database>,
  photos: Record<string, unknown>[],
  onProgress: (done: number, total: number) => Promise<unknown>
): Promise<Record<string, VisionResult & { tokens?: number }>> {
  const result: Record<string, VisionResult & { tokens?: number }> = {};

  const needVision = photos.filter((p) => {
    const vision = p.vision as VisionResult | undefined;
    return !vision || vision.status !== 'done' || !vision.facts || vision.facts.length === 0;
  });

  // 已有描述的直接复用
  for (const p of photos) {
    if (needVision.includes(p)) continue;
    const vision = p.vision as VisionResult;
    result[p._id as string] = { status: 'done', facts: vision.facts, tokens: 0 };
  }

  if (needVision.length === 0) return result;

  // 获取临时 URL
  const fileIds = needVision
    .map((p) => (p.thumb_file_id || p.file_id) as string)
    .filter(Boolean);
  const urlMap: Record<string, string> = {};
  if (fileIds.length > 0) {
    const urlRes = await cloud.getTempFileURL({ fileList: fileIds.slice(0, 50) });
    for (const f of urlRes.fileList || []) {
      if (f.fileID && f.tempFileURL) urlMap[f.fileID] = f.tempFileURL;
    }
  }

  // 并发调用（限 4）
  const CONCURRENCY = 4;
  let done = 0;
  const queue = [...needVision];
  const total = needVision.length;

  async function worker() {
    while (queue.length > 0) {
      const photo = queue.shift();
      if (!photo) break;
      const pid = photo._id as string;
      const fileId = (photo.thumb_file_id || photo.file_id) as string;
      const url = fileId ? urlMap[fileId] : '';

      let vision: VisionResult & { tokens?: number };
      if (!url) {
        vision = { status: 'failed', facts: [], error: 'NO_FILE_URL' };
      } else {
        const res = await callChatModel(
          [
            {
              role: 'user',
              content: [
                { type: 'text', text: VISION_PROMPT },
                { type: 'image_url', image_url: { url } },
              ],
            },
          ],
          0.2
        );
        vision = res.ok
          ? { status: 'done', facts: [res.content.trim()], tokens: res.tokens }
          : { status: 'failed', facts: [], error: res.errorCode };
      }

      result[pid] = vision;

      // 写回照片文档（失败不中断）
      await db.collection('photos').doc(pid).update({
        data: {
          vision: {
            status: vision.status,
            facts: vision.facts,
            error: vision.error || null,
            model: MODEL_NAME,
            updated_at: new Date().toISOString(),
          },
        },
      }).catch(() => undefined);

      done += 1;
      await onProgress(done, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()));
  return result;
}

/* ============================================================
 * 文本生成：整本书文案（一次调用输出 JSON）
 * ============================================================ */

function styleDescription(album: Record<string, unknown>): string {
  const map: Record<string, string> = {
    warm_documentary: '温厚纪实，娓娓道来，注重真实细节',
    casual_humor: '轻松随性，带一点幽默感',
    literary: '恬淡文艺，意境优美，克制抒情',
    family: '温馨家庭，暖意融融，突出亲情',
    youth: '青春明快，充满活力',
    concise: '简洁利落，不堆砌辞藻',
    custom: String(album.style_custom || '独一无二的个人风格'),
  };
  return map[String(album.style)] || '自然真诚';
}

/* ============================================================
 * 篇幅规格（相册 content_length：short / medium / long）
 * ============================================================ */

interface LengthSpec {
  narrative: string;
  caption: string;
  preface: string;
  epilogue: string;
  share: string;
  extra: string;
}

const LENGTH_SPECS: Record<string, LengthSpec> = {
  short: {
    narrative: '40~70 字',
    caption: '8~15 字',
    preface: '40~60 字',
    epilogue: '25~40 字',
    share: '20 字以内',
    extra: '篇幅总原则：文字克制、多留白，像杂志图说那样点到为止；宁可少写一句，也不要为凑字数而堆砌形容。',
  },
  medium: {
    narrative: '70~110 字',
    caption: '10~20 字',
    preface: '60~90 字',
    epilogue: '40~60 字',
    share: '30 字以内',
    extra: '篇幅总原则：具体但不冗长，每句话都要有信息量。',
  },
  long: {
    narrative: '120~200 字',
    caption: '12~25 字',
    preface: '80~130 字',
    epilogue: '50~80 字',
    share: '30 字以内',
    extra: '篇幅总原则：可以更充分地铺陈细节与情绪，但依然不要重复、不要空洞抒情。',
  },
};

function lengthSpecOf(album: Record<string, unknown>): LengthSpec {
  return LENGTH_SPECS[String(album.content_length)] || LENGTH_SPECS.medium;
}

function arrangementDescription(album: Record<string, unknown>): string {
  const map: Record<string, string> = {
    timeline: '已按拍摄时间顺序分为若干页面',
    location: '已按地点聚类分组，同一地点的照片在同一页面（组内按时间排序）',
    event: '已按事件进程分组，每组是旅程中的一个阶段（依据地点变化与时间间隔切分）',
  };
  return map[String(album.arrangement)] || map.timeline;
}

/**
 * 北京时间感知解析：
 * - 带时区标记（Z 或 ±hh:mm）的 ISO：换算到 UTC+8 后取各字段
 * - 不带时区标记的字符串（用户在 photo-review 手动输入的 "YYYY-MM-DDTHH:mm:00"）：按字面取，视为北京时间
 * 云函数容器时区为 UTC，直接 getHours()/toISOString() 对两类输入口径不一致
 * （带时区数据会把北京时间 0~8 点的照片归入前一天），必须统一走这里。
 */
function bjParts(iso: unknown): { y: number; m: number; d: number; hh: number; mm: number } | null {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hasZone = /(Z|[+-]\d{2}:\d{2})$/i.test(iso.trim());
  if (!hasZone) {
    return { y: +m[1], m: +m[2], d: +m[3], hh: +m[4], mm: +m[5] };
  }
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const bj = new Date(t + 8 * 3600 * 1000);
  return {
    y: bj.getUTCFullYear(),
    m: bj.getUTCMonth() + 1,
    d: bj.getUTCDate(),
    hh: bj.getUTCHours(),
    mm: bj.getUTCMinutes(),
  };
}

/** 按北京时区取日期 key（YYYY-MM-DD），用于按日分组 */
function bjDayKey(iso: unknown): string | null {
  const p = bjParts(iso);
  if (!p) return null;
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function formatDateTime(iso: unknown): string {
  const p = bjParts(iso);
  if (!p) return '时间未知';
  return `${p.y}年${p.m}月${p.d}日 ${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
}

function locationOf(photo: Record<string, unknown>): string {
  const loc = (photo.location || {}) as Record<string, unknown>;
  return [loc.poi, loc.district, loc.city].filter(Boolean).map(String).join(' · ') || '地点未知';
}

function photoVisionText(pid: string, visionMap: Record<string, VisionResult & { tokens?: number }>): string {
  const v = visionMap[pid];
  if (v && v.status === 'done' && v.facts.length > 0) return v.facts[0];
  return '（照片内容描述不可用）';
}

interface AiStoryResult {
  ok: boolean;
  tokens: number;
  errorCode: string;
  data: {
    title?: string;
    subtitle?: string;
    preface?: string;
    epilogue?: string;
    share_summary?: string;
    chapters?: Array<{
      title?: string;
      narrative?: string;
      captions?: Record<string, string>;
    }>;
  } | null;
}

async function generateStoryByModel(
  groups: Record<string, unknown>[][],
  album: Record<string, unknown>,
  visionMap: Record<string, VisionResult & { tokens?: number }>,
  arrangeNotes: string[] = []
): Promise<AiStoryResult> {
  const lengthSpec = lengthSpecOf(album);
  const arrangeNote = arrangementDescription(album)
    + (arrangeNotes.length > 0 ? `（注意：${arrangeNotes.join('；')}）` : '');

  // 组装素材文本
  const photoLines: string[] = [];
  groups.forEach((group, gi) => {
    photoLines.push(`【第${gi + 1}页】`);
    for (const p of group) {
      photoLines.push(
        `- 照片ID ${p._id}｜${formatDateTime(p.taken_at)}｜${locationOf(p)}｜照片描述：${photoVisionText(p._id as string, visionMap)}`
      );
    }
  });

  const prompt = [
    '你是一位擅长图文排版的旅行相册文字编辑。请根据以下素材，为一本高颜值图文旅行相册撰写全部文字。整体风格轻松、有画面感，像一本可以翻看的精致旅行影集，而不是严肃书籍。',
    '',
    '【相册主题】',
    `相册名：${album.name || '未命名旅行'}`,
    `整体背景（仅供开篇语泛指，不要在每个章节重复，也不要据此补充未在照片中出现的具体细节）：${album.background || '（未提供）'}`,
    `同行关系：${album.relations || '（未提供）'}`,
    `希望突出的亮点：${album.highlights || '（未提供）'}`,
    `写作文风：${styleDescription(album)}`,
    album.avoid_expressions ? `需要避免的表达：${album.avoid_expressions}` : '',
    '',
    `【照片素材】（${arrangeNote}）`,
    ...photoLines,
    '',
    '【严格边界约束】（最高优先级，务必遵守）',
    '1) 上方素材已按相册编排策略预先分页为【第1页】…【第N页】，共 N 页。',
    '2) chapters 数组必须 1:1 顺次对应：第 k 个 chapter 完全基于【第k页】给定的照片素材创作；其它章节的素材信息对本章不可见。',
    '3) 每个 chapter 的 narrative 与每张照片的 caption 都只能引用本页内的画面/时间/地点，**严禁** 跨页取材，不得编造其他章节或相册外的人名/地名/事件/对话/回忆。',
    '4) caption 必须是对**该张照片实际视觉**的客观描述（写场景、主体、氛围中的一个角度），禁止泛泛重复 narrative，禁止描述本照片之外的内容。',
    '5) 若本章素材中某些照片的拍摄时间或地点与其他照片不一致，请按本页全部照片**客观陈列**：caption 各自描述对应照片，narrative 在本页范围内切换细节点即可，但仍以【第k页】素材为限。',
    '',
    '【写作要求】',
    `1. 开篇语（preface）${lengthSpec.preface}：只交代这趟旅程的整体氛围和心情，**只出现一次**，不要把后续页面会出现的场景提前讲完。`,
    `2. 每个 chapter 写一段 ${lengthSpec.narrative} 的 narrative，**只**基于本页【第k页】的实际画面，写具体场景、主体、光线、色彩、动作、情绪；不得引用其他章节素材，不得补充相册外信息。`,
    `3. 每个 chapter 给一个 2~6 字的 title（从本页照片内容提炼，例如「海边清晨」「机场出发」），不要写「第X章」。`,
    `4. 每张照片配一句 ${lengthSpec.caption} 的 caption（key 用上面【第k页】里给的「照片ID」原样照抄），是**该张照片视觉本身**的客观描述，不要重复章节 narrative，也不要描述其它照片。`,
    `5. 收尾语（epilogue）${lengthSpec.epilogue}：简短收束，不要总结全书，只留温柔余韵。`,
    `6. share_summary ${lengthSpec.share}，适合发朋友圈。`,
    `7. 严禁虚构：不得编造任何人名、地名、事件、对话、回忆等具体信息。`,
    `8. ${lengthSpec.extra}`,
    `9. 严格只输出一个 JSON 对象，不输出任何其他文字或代码块标记；字段结构：`,
    `{"title":"...","subtitle":"...","preface":"...","chapters":[{"title":"...","narrative":"...","captions":{"照片ID":"..."}}],"epilogue":"...","share_summary":"..."}`,
  ]
    .filter((line) => line !== '')
    .join('\n');

  const res = await callChatModel(
    [{ role: 'user', content: prompt }],
    0.8
  );

  if (!res.ok) {
    return { ok: false, tokens: 0, errorCode: res.errorCode, data: null };
  }

  // 解析 JSON（容错：剥离代码块围栏、截取大括号范围）
  let text = res.content.trim();
  text = text.replace(/```(?:json)?/g, '');
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) {
    return { ok: false, tokens: res.tokens, errorCode: 'JSON_NOT_FOUND', data: null };
  }
  try {
    const data = JSON.parse(text.slice(first, last + 1));
    if (
      !data ||
      !Array.isArray(data.chapters) ||
      data.chapters.length !== groups.length ||
      data.chapters.some((ch: Record<string, unknown>) => typeof ch.narrative !== 'string' || !ch.narrative)
    ) {
      return { ok: false, tokens: res.tokens, errorCode: 'SCHEMA_INVALID', data: null };
    }
    return { ok: true, tokens: res.tokens, errorCode: '', data };
  } catch (e) {
    return { ok: false, tokens: res.tokens, errorCode: 'JSON_PARSE_ERROR', data: null };
  }
}

/* ============================================================
 * 章节组装（结构由代码控制，文案来自 AI 或模板）
 * ============================================================ */

function buildChapters(
  groups: Record<string, unknown>[][],
  album: Record<string, unknown>,
  visionMap: Record<string, VisionResult & { tokens?: number }>,
  aiResult: AiStoryResult
): Record<string, unknown>[] {
  const aiChapters = aiResult.ok && aiResult.data ? aiResult.data.chapters || [] : [];

  return groups.map((group, index) => {
    const firstDate = firstValidDate(group);
    const dateLabel = formatDateLabel(firstDate);
    const locations = extractLocationLabels(group);
    const locationLabel = locations.join(' · ') || null;

    const ai = aiChapters[index] || {};
    const aiCaptions = (ai.captions || {}) as Record<string, string>;

    // captions：优先 AI 结果，缺失的照片回退模板
    const captions: Record<string, string> = {};
    group.forEach((p, idx) => {
      const pid = p._id as string;
      captions[pid] =
        aiCaptions[pid] && typeof aiCaptions[pid] === 'string' && aiCaptions[pid].length > 0
          ? aiCaptions[pid]
          : buildCaption(p, idx, locations[0] || null);
    });

    const title = (ai.title as string) || (locations[0] ? `${dateLabel || ''}${dateLabel ? ' · ' : ''}${locations[0]}` : `旅途 · ${index + 1}`);
    const narrative = (ai.narrative as string) || buildChapterNarrative(group, index, album, dateLabel, locationLabel);

    return {
      chapter_id: `ch${index + 1}`,
      title,
      date_label: dateLabel,
      location_label: locationLabel,
      narrative,
      photo_ids: group.map((p) => p._id),
      captions,
      locked: false,
      user_edited: false,
    };
  });
}

function assembleStory(
  chapters: Record<string, unknown>[],
  album: Record<string, unknown>,
  aiResult: AiStoryResult,
  metaInfo: {
    degraded: boolean;
    totalTokens: number;
    callCount: number;
    errorCodes: string[];
    notes: string[];
  }
): Record<string, unknown> {
  const totalCount = chapters.reduce(
    (sum, ch) => sum + ((ch.photo_ids as string[]) || []).length, 0
  );
  const allLocations = Array.from(
    new Set(
      chapters
        .flatMap((ch) => (ch.location_label as string) || '')
        .filter(Boolean)
        .map((l) => String(l).split(' · ')[0])
    )
  ).slice(0, 5);

  const ai = aiResult.ok && aiResult.data ? aiResult.data : null;
  const cleanStr = (v: unknown, fallback: string): string =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;

  return {
    title: cleanStr(ai && ai.title, (album.name as string) || '旅迹成书'),
    subtitle: cleanStr(ai && ai.subtitle, `${totalCount}张照片组成的${styleTone(album.style)}回忆`),
    preface: cleanStr(ai && ai.preface, buildPreface(album, totalCount, chapters.length, allLocations)),
    chapters,
    epilogue: cleanStr(ai && ai.epilogue, buildEpilogue(album, totalCount)),
    share_summary: cleanStr(
      ai && ai.share_summary,
      `整理了${totalCount}张${album.name || '旅行'}照片，做了一本相册。`
    ),
    meta: {
      model: metaInfo.degraded ? 'template' : MODEL_NAME,
      generated_at: new Date().toISOString(),
      degraded: metaInfo.degraded,
      uncertain_notes: metaInfo.notes,
      total_tokens: metaInfo.totalTokens,
      call_count: metaInfo.callCount,
      error_codes: metaInfo.errorCodes,
    },
  };
}

/* ============================================================
 * 聚类分组（相册 arrangement：timeline 时间线 / location 地点聚类 / event 事件流）
 * 元数据不足时自动降级，并把降级原因写入 notes（落库到 story.meta.uncertain_notes）
 * ============================================================ */

interface ClusterResult {
  groups: Record<string, unknown>[][];
  notes: string[];
}

/** 每组照片上限（超过则顺序拆分） */
const GROUP_MAX = 8;
/** 事件流策略：相邻照片时间间隔超过该值（毫秒）视为新事件 */
const EVENT_GAP_MS = 3 * 60 * 60 * 1000;

function photoTime(p: Record<string, unknown>): number {
  return p.taken_at ? new Date(p.taken_at as string).getTime() : Number.MAX_SAFE_INTEGER;
}

function locationKey(p: Record<string, unknown>): string {
  const loc = (p.location || {}) as Record<string, unknown>;
  if (loc.poi) return String(loc.poi);
  if (loc.district) return String(loc.district);
  if (loc.city) return String(loc.city);
  return '__unknown__';
}

/** 组数超限时顺序拆分（保持组内顺序） */
function splitByMax(groups: Record<string, unknown>[][]): Record<string, unknown>[][] {
  const out: Record<string, unknown>[][] = [];
  for (const g of groups) {
    if (g.length === 0) continue;
    for (let i = 0; i < g.length; i += GROUP_MAX) {
      out.push(g.slice(i, i + GROUP_MAX));
    }
  }
  return out;
}

/**
 * 时间线分组（也作为 location/event 元数据不足时的降级路径）：
 * 按北京时区的日历日切分（同日一组），同日超过 GROUP_MAX 时按 8h 间隔再切子组，
 * 无时间的照片统一放最后。
 */
function timelineGroups(sorted: Record<string, unknown>[]): Record<string, unknown>[][] {
  const groups: Record<string, unknown>[][] = [];
  const withTime = sorted.filter((p) => photoTime(p) !== Number.MAX_SAFE_INTEGER);
  const withoutTime = sorted.filter((p) => photoTime(p) === Number.MAX_SAFE_INTEGER);

  if (withTime.length === 0) {
    return splitByMax([withoutTime]);
  }

  const SUB_GAP_MS = 8 * 60 * 60 * 1000;

  const byDay = new Map<string, Record<string, unknown>[]>();
  for (const p of withTime) {
    // 北京时区日 key：用户手动输入的无时区字符串按字面取；带时区的 EXIF 时间换算到 +8
    const day = bjDayKey(p.taken_at) || 'zz-unknown';
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(p);
  }

  byDay.forEach((dayPhotos) => {
    if (dayPhotos.length <= GROUP_MAX) {
      groups.push(dayPhotos);
      return;
    }
    // 大组按 8h 间隔再切子组（保持组内时间顺序）
    let sub: Record<string, unknown>[] = [dayPhotos[0]];
    for (let i = 1; i < dayPhotos.length; i += 1) {
      const gap = photoTime(dayPhotos[i]) - photoTime(dayPhotos[i - 1]);
      if (sub.length >= GROUP_MAX || gap > SUB_GAP_MS) {
        groups.push(sub);
        sub = [];
      }
      sub.push(dayPhotos[i]);
    }
    if (sub.length > 0) groups.push(sub);
  });

  // 无时间的照片统一放最后，避免污染前面的按日分组
  if (withoutTime.length > 0) {
    groups.push(withoutTime);
  }

  return splitByMax(groups);
}

function clusterPhotos(photos: Record<string, unknown>[], arrangement: string): ClusterResult {
  const notes: string[] = [];
  const sorted = [...photos].sort((a, b) => photoTime(a) - photoTime(b));

  // 地点聚类：同一地点归为一组，组内按时间，组间按该组最早照片时间；
  // 缺位置信息的照片不参与地点聚类，改按时间线规则切分后按时间插入（避免全部硬切 8 张/组）
  if (arrangement === 'location') {
    const withLoc = sorted.filter((p) => locationKey(p) !== '__unknown__');
    const noLoc = sorted.filter((p) => locationKey(p) === '__unknown__');

    if (withLoc.length === 0) {
      notes.push('照片缺少位置信息，地点聚类已自动按时间线编排');
      return { groups: timelineGroups(sorted), notes };
    }
    if (noLoc.length > 0) {
      notes.push(`${noLoc.length} 张照片缺少位置信息，已按时间线归入相应页面`);
    }

    const byLoc = new Map<string, Record<string, unknown>[]>();
    for (const p of withLoc) {
      const k = locationKey(p);
      if (!byLoc.has(k)) byLoc.set(k, []);
      byLoc.get(k)!.push(p);
    }
    const groups = Array.from(byLoc.values())
      .filter((g) => g.length > 0)
      .sort((a, b) => photoTime(a[0]) - photoTime(b[0]));

    // 无位置照片按时间线切分后并入，统一按组内最早照片时间排序，保持全局时间序
    if (noLoc.length > 0) {
      groups.push(...timelineGroups(noLoc));
      groups.sort((a, b) => photoTime(a[0]) - photoTime(b[0]));
    }
    return { groups: splitByMax(groups), notes };
  }

  // 事件流：按时间排序，地点变化或时间间隔过大时切分新事件
  if (arrangement === 'event') {
    const withTime = sorted.filter((p) => photoTime(p) !== Number.MAX_SAFE_INTEGER);
    const noTime = sorted.filter((p) => photoTime(p) === Number.MAX_SAFE_INTEGER);

    if (withTime.length === 0) {
      notes.push('照片缺少拍摄时间，事件流已退化为按上传顺序分页');
      return { groups: splitByMax([sorted]), notes };
    }
    if (noTime.length > 0) {
      notes.push(`${noTime.length} 张照片缺少拍摄时间，已排在最后`);
    }

    const groups: Record<string, unknown>[][] = [];
    let cur: Record<string, unknown>[] = [];
    let prev: Record<string, unknown> | null = null;
    for (const p of sorted) {
      if (prev && photoTime(prev) !== Number.MAX_SAFE_INTEGER && photoTime(p) !== Number.MAX_SAFE_INTEGER) {
        const gap = Math.abs(photoTime(p) - photoTime(prev));
        const locChanged = locationKey(p) !== locationKey(prev);
        if (locChanged || gap > EVENT_GAP_MS) {
          groups.push(cur);
          cur = [];
        }
      }
      cur.push(p);
      prev = p;
    }
    if (cur.length > 0) groups.push(cur);
    // 合并过小的碎片组（单张）到前一组，避免页面太碎；
    // 仅当与前一组的地点一致时才合并，防止"地点变化"切分出的单张被并回旧地点、
    // 造成同一页混入不同地点素材
    const merged: Record<string, unknown>[][] = [];
    for (const g of groups) {
      const prevGroup = merged[merged.length - 1];
      const sameLocation =
        prevGroup &&
        prevGroup.length > 0 &&
        locationKey(g[0]) === locationKey(prevGroup[prevGroup.length - 1]);
      if (g.length < 2 && sameLocation) {
        merged[merged.length - 1].push(...g);
      } else {
        merged.push(g);
      }
    }
    return { groups: splitByMax(merged), notes };
  }

  // timeline（默认）：直接走时间线分组
  return { groups: timelineGroups(sorted), notes };
}

/* ============================================================
 * 模板降级文案（AI 失败时兜底）
 * ============================================================ */

function formatDateLabel(iso: string | null): string | null {
  const p = bjParts(iso);
  return p ? `${p.m}月${p.d}日` : null;
}

function extractLocationLabels(group: Record<string, unknown>[]): string[] {
  const set = new Set<string>();
  for (const p of group) {
    const loc = (p.location || {}) as Record<string, unknown>;
    if (loc.poi) set.add(String(loc.poi));
    else if (loc.district) set.add(String(loc.district));
    else if (loc.city) set.add(String(loc.city));
  }
  return dedupSimilarLabels(Array.from(set)).slice(0, 3);
}

/**
 * 对地点标签做相似去重：
 * - 一个字符串包含另一个 → 保留较长的（解决「机场bus站台」vs「机场bus站」）
 * - 编辑距离相似度 ≥0.75 且长度差 ≤2 → 保留较长的
 */
function dedupSimilarLabels(labels: string[]): string[] {
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    const dupIndex = out.findIndex((existing) => {
      if (existing.includes(label) || label.includes(existing)) return true;
      if (Math.abs(existing.length - label.length) > 2) return false;
      return similarity(existing, label) >= 0.75;
    });
    if (dupIndex === -1) {
      out.push(label);
    } else if (label.length > out[dupIndex].length) {
      out[dupIndex] = label; // 保留更完整的名称
    }
  }
  return out;
}

/** Levenshtein 相似度：0~1，1 表示完全相同 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / len;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return curr[n];
}

function firstValidDate(group: Record<string, unknown>[]): string | null {
  for (const p of group) {
    if (p.taken_at) return p.taken_at as string;
  }
  return null;
}

function buildCaption(photo: Record<string, unknown>, idx: number, locationLabel: string | null): string {
  const time = formatTimeOfDay((photo.taken_at as string) || null);
  const prefix = time ? `${time}的` : '旅途中的';
  const loc = locationLabel ? `${locationLabel}，` : '';
  const suffixes = ['一帧', '片段', '瞬间', '画面', '记忆'];
  return `${loc}${prefix}${suffixes[idx % suffixes.length]}`;
}

function formatTimeOfDay(iso: string | null): string | null {
  const p = bjParts(iso);
  if (!p) return null;
  const h = p.hh;
  if (h >= 5 && h < 10) return '清晨';
  if (h < 13) return '上午';
  if (h < 17) return '下午';
  if (h < 20) return '傍晚';
  return '夜晚';
}

function styleTone(style: unknown): string {
  const map: Record<string, string> = {
    warm_documentary: '温厚纪实的',
    casual_humor: '轻松随性的',
    literary: '恬淡文艺的',
    family: '暖意融融的',
    youth: '轻快明亮的',
    concise: '干净利落的',
    custom: '独一无二的',
  };
  return map[String(style)] || '属于自己的';
}

function buildChapterNarrative(
  group: Record<string, unknown>[],
  index: number,
  album: Record<string, unknown>,
  dateLabel: string | null,
  locationLabel: string | null
): string {
  const count = group.length;
  const loc = locationLabel || '这一段路途';
  const date = dateLabel ? `${dateLabel}，` : '';
  const style = styleTone(album.style);

  const openers = ['这一页，', '翻到这儿，', '这一组照片，', '看这一页，'];
  const opener = openers[index % openers.length];

  let text = `${opener}${date}在${loc}留下了${count}张${style}影像。`;
  const closers = [
    '光线和颜色把当时的氛围留了下来。',
    '这些不经意的瞬间，让旅程多了一些温度。',
    '画面里的细节，比文字更先让人想起那一天。',
    '整理成册，再翻到时，仿佛还能闻到当时的风。',
  ];
  text += closers[index % closers.length];
  return text;
}

function buildPreface(
  album: Record<string, unknown>,
  totalCount: number,
  chapterCount: number,
  allLocations: string[]
): string {
  const name = (album.name as string) || '旅迹成书';
  const locPart = allLocations.length > 0 ? `从${allLocations.join('、')}经过，` : '';
  const style = styleTone(album.style);
  const relations = (album.relations as string) || '';

  let text = `《${name}》从${totalCount}张照片开始。${locPart}每一段旅程都有它自己的节奏。`;
  if (relations) {
    text += `${relations}一起，把这段${style}时光收进相册。`;
  } else {
    text += `这一册希望把当时的氛围和心情留下来。`;
  }
  text += `分为${chapterCount}页，每一页都是旅途中的一小段切片。`;
  return text;
}

function buildEpilogue(album: Record<string, unknown>, totalCount: number): string {
  const name = (album.name as string) || '这段旅程';
  return `${totalCount}张照片，只是${name}的一个缩影。再翻开这一册时，希望还能想起当时的阳光、风和身边的人。`;
}

async function getNextVersion(db: ReturnType<typeof cloud.database>, albumId: string): Promise<number> {
  const { data } = await db.collection('album_stories')
    .where({ album_id: albumId, kind: 'story' })
    .orderBy('version', 'desc')
    .limit(1)
    .get();
  return data.length > 0 ? (data[0].version as number) + 1 : 1;
}
