"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// cloudfunctions/story/index.ts — 故事生成/查询/编辑/重生成
const wx_server_sdk_1 = __importDefault(require("wx-server-sdk"));
const common_1 = require("./common");
const usage_1 = require("./usage");
wx_server_sdk_1.default.init({ env: wx_server_sdk_1.default.DYNAMIC_CURRENT_ENV });
exports.main = async (event) => {
    const { action } = event;
    const wxContext = wx_server_sdk_1.default.getWXContext();
    const openid = wxContext.OPENID;
    switch (action) {
        case 'generateStory':
            return handleGenerateStory(openid, event.album_id);
        case 'getJobStatus':
            return handleGetJobStatus(openid, event.job_id);
        case 'regenerateSection':
            return handleRegenerateSection(openid, event);
        case 'getStory':
            return handleGetStory(openid, event.album_id, event.version);
        case 'updateStory':
            return handleUpdateStory(openid, event);
        default:
            return { code: 40001, message: `未知 action: ${action}` };
    }
};
async function handleGenerateStory(openid, albumId) {
    const db = wx_server_sdk_1.default.database();
    const config = await (0, common_1.loadAppConfig)();
    // 前置校验（doc.get 对不存在文档会抛异常，须捕获）
    let album = null;
    try {
        const res = await db.collection('albums').doc(albumId).get();
        album = res.data;
    }
    catch (err) {
        album = null;
    }
    if (!album || album._openid !== openid) {
        return { code: 40301, message: '无权操作该相册' };
    }
    if (Number(album.photo_count) < config.minPhotosPerAlbum ||
        Number(album.photo_count) > config.maxPhotosPerAlbum) {
        return { code: 40001, message: `照片数量需在 ${config.minPhotosPerAlbum}~${config.maxPhotosPerAlbum} 张之间` };
    }
    // 检查是否有未完成照片
    const { data: pendingPhotos } = await db.collection('photos')
        .where({ album_id: albumId, upload_status: db.command.in(['uploading', 'checking']) })
        .get();
    if (pendingPhotos.length > 0) {
        return { code: 40903, message: `存在 ${pendingPhotos.length} 张未完成上传的照片` };
    }
    // 检查是否有失败照片
    const { data: failedPhotos } = await db.collection('photos')
        .where({ album_id: albumId, upload_status: 'failed', deleted: false })
        .get();
    if (failedPhotos.length > 0) {
        return { code: 40903, message: `存在 ${failedPhotos.length} 张失败的照片，请重试或移除` };
    }
    // 检查是否有进行中的 story 任务
    const { data: runningJobs } = await db.collection('ai_jobs')
        .where({ album_id: albumId, type: 'story', status: db.command.in(['pending', 'running']) })
        .get();
    if (runningJobs.length > 0) {
        // 幂等：已有进行中的任务时直接返回该任务（供进度页恢复轮询），
        // 而不是报 40901 —— 否则用户中途退出再进会看到"任务启动失败"。
        const running = runningJobs[0];
        // 僵尸回收：任务超过 15 分钟无心跳则判失败，允许重新生成
        const staleMs = Date.now() - new Date(running.updated_at || running.created_at).getTime();
        if (staleMs < 15 * 60 * 1000) {
            return { code: 0, data: { job_id: running._id, resumed: true } };
        }
        await db.collection('ai_jobs').doc(running._id).update({
            data: { status: 'failed', error: '任务超时（长时间无进展），已自动回收', updated_at: new Date().toISOString() },
        });
        await db.collection('albums').doc(albumId).update({
            data: { status: 'ready', updated_at: new Date().toISOString() },
        }).catch(() => undefined);
    }
    /* ============================================================
     * 免费阶段防滥用限流（docs/13-launch-gap-analysis.md）
     * generationLimitEnabled=false 时全部跳过（当前默认：逻辑就绪但休眠）
     * 用量记录（daily_usage / events）无论开关与否始终写入，供后台观察
     * ============================================================ */
    const { data: albumPhotos } = await db.collection('photos')
        .where({ album_id: albumId, deleted: false })
        .field({ _id: true })
        .get();
    const albumPhotoIds = albumPhotos.map((p) => String(p._id));
    const usage = await (0, usage_1.getDailyUsage)(openid);
    const newPhotoIds = albumPhotoIds.filter((id) => !usage.photoIds.includes(id));
    let isRegeneration = false;
    if (config.generationLimitEnabled) {
        // 1. 每日发起次数（幂等复用/僵尸回收重建不经过此处，天然不重复计数）
        if (usage.attemptCount >= config.dailyGenerationAttemptLimit) {
            return { code: 42901, message: `今日发起生成次数已达上限（${config.dailyGenerationAttemptLimit}次），请明天再试` };
        }
        // 2. 每日成功相册数
        if (usage.successCount >= config.dailySuccessfulAlbumLimit) {
            return { code: 42902, message: `今日成功生成的相册数已达上限（${config.dailySuccessfulAlbumLimit}本），请明天再试` };
        }
        // 3. 每日 AI 处理照片去重数（同任务失败重试因 photoIds 去重不重复计数）
        if (usage.uniquePhotoCount + newPhotoIds.length > config.dailyPhotoProcessingLimit) {
            return { code: 42903, message: `今日提交AI处理的照片数已达上限（${config.dailyPhotoProcessingLimit}张），请明天再试` };
        }
        // 4. 并发任务数（同用户）
        const { total: myRunning } = await db.collection('ai_jobs')
            .where({ _openid: openid, type: 'story', status: db.command.in(['pending', 'running']) })
            .count();
        if (myRunning >= config.concurrentGenerationLimit) {
            return { code: 42904, message: '已有生成任务进行中，请等待完成后再试' };
        }
        // 5. 单相册免费重生成次数（首次生成不限，之后限 freeRegenerationLimitPerAlbum 次）
        const { total: doneJobs } = await db.collection('ai_jobs')
            .where({ album_id: albumId, type: 'story', status: 'succeeded' })
            .count();
        if (doneJobs >= 1 + config.freeRegenerationLimitPerAlbum) {
            return { code: 42905, message: `该相册免费重新生成次数已用完（${config.freeRegenerationLimitPerAlbum}次）` };
        }
        isRegeneration = doneJobs >= 1;
    }
    // 创建任务
    const jobRes = await db.collection('ai_jobs').add({
        data: {
            _openid: openid,
            album_id: albumId,
            type: 'story',
            status: 'pending',
            stage: 'factbase',
            progress: 0,
            batches: [],
            failed_photo_ids: [],
            payload: {},
            result_ref: null,
            error: null,
            retry_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        },
    });
    // 更新相册状态
    await db.collection('albums').doc(albumId).update({
        data: { status: 'generating', updated_at: new Date().toISOString() },
    });
    // 记录每日用量（attempt +1；重生成单独计数；照片去重计入当日处理量）
    await (0, usage_1.bumpDailyUsage)(openid, {
        attemptDelta: 1,
        regenDelta: isRegeneration ? 1 : 0,
        addPhotoIds: albumPhotoIds,
    });
    // 行为事件：generation_started
    await (0, common_1.writeEvent)(openid, 'generation_started', {
        album_id: albumId,
        job_id: jobRes._id,
        photo_count: albumPhotoIds.length,
        is_regeneration: isRegeneration,
    });
    // ⚠️ 触发方式变更（2026-08-29）：不再在云端 fire-and-forget 调 internal-generateStory——
    // 云函数返回后未 await 的 callFunction 会被运行时冻结，调用从未真正发出
    // （真机实锤：story 任务永远 pending、轮询超时；EXIF 解析同款 bug）。
    // 触发改由前端拿到 job_id 后直调 internal-generateStory：
    // 客户端发起的调用即使本地超时返回，云端仍会执行到完成（服务端超时 300s）。
    return { code: 0, data: { job_id: jobRes._id } };
}
async function handleGetJobStatus(openid, jobId) {
    const db = wx_server_sdk_1.default.database();
    // doc.get 对不存在的文档会抛异常而非返回空（wx-server-sdk 行为），必须捕获
    let job = null;
    try {
        const res = await db.collection('ai_jobs').doc(jobId).get();
        job = res.data;
    }
    catch (err) {
        job = null;
    }
    if (!job) {
        return { code: 40401, message: '任务不存在' };
    }
    // 权限校验：任务必须属于当前用户
    if (job._openid !== openid) {
        return { code: 40301, message: '无权查看该任务' };
    }
    const batches = (job.batches || []);
    const done = batches.filter((b) => b.status === 'succeeded').length;
    const failed = batches.filter((b) => b.status === 'failed').length;
    const total = batches.length;
    // 预估剩余时间（不承诺固定时间）
    const estimatedRemaining = total > 0 ? Math.ceil(((total - done) / total) * 180) : 0;
    return {
        code: 0,
        data: {
            status: job.status,
            stage: job.stage,
            progress: job.progress,
            batches: { total, done, failed },
            failed_photo_ids: job.failed_photo_ids || [],
            stage_message: total > 0 ? `正在分析第 ${done + 1}/${total} 批照片` : '准备中...',
            estimated_remaining: estimatedRemaining,
            result_ref: job.result_ref,
            error: job.error,
        },
    };
}
async function handleRegenerateSection(openid, event) {
    const db = wx_server_sdk_1.default.database();
    const albumId = event.album_id;
    const chapterId = event.chapter_id;
    // 检查锁定
    const { data: storyDoc } = await db.collection('album_stories')
        .where({ album_id: albumId, _openid: openid, kind: 'story' })
        .orderBy('version', 'desc')
        .limit(1)
        .get();
    if (storyDoc.length === 0) {
        return { code: 40401, message: '故事不存在' };
    }
    const lockedChapters = storyDoc[0].locked_chapters || [];
    if (lockedChapters.includes(chapterId)) {
        return { code: 40901, message: '该章节已锁定' };
    }
    // 创建重生成任务
    const jobRes = await db.collection('ai_jobs').add({
        data: {
            _openid: openid,
            album_id: albumId,
            type: 'regen_section',
            status: 'pending',
            stage: 'factbase',
            progress: 0,
            batches: [],
            failed_photo_ids: [],
            payload: { chapter_id: chapterId, feedback: event.feedback || '' },
            result_ref: null,
            error: null,
            retry_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        },
    });
    // 记录每日用量：重生成同样占用一次发起额度（否则可用重生成绕过每日限制），并计入重生成次数
    await (0, usage_1.bumpDailyUsage)(openid, { attemptDelta: 1, regenDelta: 1 });
    // 行为事件：generation_started（单章重生成）
    await (0, common_1.writeEvent)(openid, 'generation_started', {
        album_id: albumId,
        job_id: jobRes._id,
        chapter_id: chapterId,
        is_regeneration: true,
    });
    // ⚠️ 触发方式变更（2026-08-29）：同 handleGenerateStory，改由前端直调 internal-generateStory
    // （云端 fire-and-forget 会被运行时冻结，任务永远 pending）
    return { code: 0, data: { job_id: jobRes._id, chapter_id: chapterId } };
}
async function handleGetStory(openid, albumId, version) {
    const db = wx_server_sdk_1.default.database();
    let query = db.collection('album_stories')
        .where({ album_id: albumId, _openid: openid, kind: 'story' });
    if (version) {
        query = query.where({ version });
    }
    else {
        query = query.orderBy('version', 'desc').limit(1);
    }
    const { data } = await query.get();
    if (data.length === 0) {
        return { code: 40401, message: '故事不存在' };
    }
    const storyDoc = data[0];
    return {
        code: 0,
        data: {
            story: storyDoc.story,
            version: storyDoc.version,
            degraded: storyDoc.generate_meta?.degraded || false,
        },
    };
}
async function handleUpdateStory(openid, event) {
    const db = wx_server_sdk_1.default.database();
    const albumId = event.album_id;
    const patch = event.patch;
    // 获取最新版本
    const { data: stories } = await db.collection('album_stories')
        .where({ album_id: albumId, _openid: openid, kind: 'story' })
        .orderBy('version', 'desc')
        .limit(1)
        .get();
    if (stories.length === 0) {
        return { code: 40401, message: '故事不存在' };
    }
    const latest = stories[0];
    const newVersion = latest.version + 1;
    // 合并修改
    const updatedStory = { ...latest.story };
    if (patch.title)
        updatedStory.title = patch.title;
    if (patch.chapters) {
        for (const ch of patch.chapters) {
            const idx = updatedStory.chapters.findIndex((c) => c.chapter_id === ch.chapter_id);
            if (idx >= 0) {
                if (ch.title !== undefined)
                    updatedStory.chapters[idx].title = ch.title;
                if (ch.narrative !== undefined) {
                    updatedStory.chapters[idx].narrative = ch.narrative;
                    updatedStory.chapters[idx].user_edited = true;
                }
                if (ch.captions !== undefined) {
                    updatedStory.chapters[idx].captions = {
                        ...(updatedStory.chapters[idx].captions || {}),
                        ...ch.captions,
                    };
                }
            }
        }
    }
    // 保存新版本
    await db.collection('album_stories').add({
        data: {
            ...latest,
            _id: undefined,
            version: newVersion,
            story: updatedStory,
            created_at: new Date().toISOString(),
        },
    });
    // 行为事件：album_saved（用户保存了故事编辑）
    await (0, common_1.writeEvent)(openid, 'album_saved', {
        album_id: albumId,
        version: newVersion,
        chapter_count: updatedStory.chapters.length,
    });
    return { code: 0, data: { version: newVersion } };
}
