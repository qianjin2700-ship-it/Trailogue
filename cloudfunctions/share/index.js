"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// cloudfunctions/share/index.ts — 分享创建/撤销/查看
const wx_server_sdk_1 = __importDefault(require("wx-server-sdk"));
const crypto = __importStar(require("crypto"));
const common_1 = require("./common");
wx_server_sdk_1.default.init({ env: wx_server_sdk_1.default.DYNAMIC_CURRENT_ENV });
exports.main = async (event) => {
    const { action } = event;
    switch (action) {
        case 'createShare':
            return handleCreate(event);
        case 'revokeShare':
            return handleRevoke(event.share_id);
        case 'getSharedStory':
            return handleGetSharedStory(event.token);
        case 'getShareQrCode':
            return handleGetQrCode(event.token);
        default:
            return { code: 40001, message: `未知 action: ${action}` };
    }
};
async function handleCreate(event) {
    const db = wx_server_sdk_1.default.database();
    const wxContext = wx_server_sdk_1.default.getWXContext();
    const openid = wxContext.OPENID;
    const albumId = event.album_id;
    // 权限校验
    const { data: album } = await db.collection('albums').doc(albumId).get();
    if (!album || album._openid !== openid) {
        return { code: 40301, message: '无权操作该相册' };
    }
    // 获取故事
    const { data: stories } = await db.collection('album_stories')
        .where({ album_id: albumId, kind: 'story' })
        .orderBy('version', 'desc')
        .limit(1)
        .get();
    if (stories.length === 0) {
        return { code: 40401, message: '故事不存在，请先生成' };
    }
    // expire_days 合法性校验：-1（永久）或 1~90 天；非法值一律按永久处理，避免 NaN 崩溃
    let expireDays = event.expire_days;
    if (typeof expireDays !== 'number' || isNaN(expireDays) || (expireDays !== -1 && (expireDays < 1 || expireDays > 90))) {
        expireDays = -1;
    }
    // 复用当前有效（未撤销、未过期）的分享链接，避免每次进入分享页都铸造新 token
    const { data: activeLinks } = await db.collection('share_links')
        .where({ album_id: albumId, _openid: openid, revoked: false })
        .orderBy('created_at', 'desc')
        .limit(5)
        .get();
    const reusable = activeLinks.find((l) => !l.expire_at || new Date(l.expire_at) > new Date());
    if (reusable) {
        // 刷新为最新故事版本（用户可能重新生成过故事）
        await db.collection('share_links').doc(reusable._id).update({
            data: { story_id: stories[0]._id },
        });
        // 行为事件：album_shared（复用链接）
        await (0, common_1.writeEvent)(openid, 'album_shared', { album_id: albumId, reused: true });
        return {
            code: 0,
            data: {
                share_id: reusable._id,
                token: reusable.token,
                path: `/pages/shared-view/index?token=${reusable.token}`,
                reused: true,
            },
        };
    }
    // 生成 token
    const token = crypto.randomBytes(16).toString('hex');
    const expireAt = expireDays === -1 ? null : new Date(Date.now() + expireDays * 86400000).toISOString();
    const res = await db.collection('share_links').add({
        data: {
            _openid: openid,
            album_id: albumId,
            story_id: stories[0]._id,
            token,
            expire_at: expireAt,
            revoked: false,
            visit_count: 0,
            created_at: new Date().toISOString(),
        },
    });
    // 行为事件：album_shared（新建链接）
    await (0, common_1.writeEvent)(openid, 'album_shared', { album_id: albumId, reused: false });
    return {
        code: 0,
        data: {
            share_id: res._id,
            token,
            path: `/pages/shared-view/index?token=${token}`,
        },
    };
}
async function handleRevoke(shareId) {
    const db = wx_server_sdk_1.default.database();
    const wxContext = wx_server_sdk_1.default.getWXContext();
    const { data: link } = await db.collection('share_links').doc(shareId).get();
    if (!link || link._openid !== wxContext.OPENID) {
        return { code: 40301, message: '无权操作' };
    }
    await db.collection('share_links').doc(shareId).update({
        data: { revoked: true },
    });
    return { code: 0, data: { ok: true } };
}
async function handleGetSharedStory(token) {
    const db = wx_server_sdk_1.default.database();
    // token 校验
    const { data: links } = await db.collection('share_links')
        .where({ token, revoked: false })
        .get();
    if (links.length === 0) {
        return { code: 40401, message: '链接已失效' };
    }
    const link = links[0];
    // 过期检查
    if (link.expire_at && new Date(link.expire_at) < new Date()) {
        return { code: 40401, message: '链接已过期' };
    }
    // 获取故事（脱敏，不含 _openid）
    const { data: storyDoc } = await db.collection('album_stories').doc(link.story_id).get();
    if (!storyDoc) {
        return { code: 40401, message: '故事不存在' };
    }
    // 获取相册名
    const { data: album } = await db.collection('albums').doc(link.album_id).get();
    // 更新访问计数
    await db.collection('share_links').doc(link._id).update({
        data: { visit_count: db.command.inc(1) },
    });
    return {
        code: 0,
        data: {
            story: storyDoc.story,
            album_name: album?.name || '旅迹成书',
            expire_at: link.expire_at,
        },
    };
}
/** 生成分享小程序码（scene = token，进入 shared-view 页） */
async function handleGetQrCode(token) {
    if (!token) {
        return { code: 40001, message: '参数缺失' };
    }
    const db = wx_server_sdk_1.default.database();
    // 校验 token 有效（存在且未撤销）
    const { data: links } = await db.collection('share_links')
        .where({ token, revoked: false })
        .get();
    if (links.length === 0) {
        return { code: 40401, message: '链接已失效' };
    }
    try {
        const buffer = await fetchQrBuffer(token);
        return {
            code: 0,
            data: { qrcode_base64: buffer.toString('base64') },
        };
    }
    catch (err) {
        const e = err;
        return { code: 50002, message: `小程序码生成失败: ${e.errMsg || e.message || String(err)}` };
    }
}
/** 获取小程序码图片 buffer：优先 openapi 云调用，失败降级 HTTP（需环境变量 WX_APP_ID / WX_APP_SECRET） */
async function fetchQrBuffer(token) {
    const params = {
        scene: token,
        page: 'pages/shared-view/index',
        checkPath: false,
        width: 430,
    };
    // 1) openapi 云调用（微信侧开通/已授权的环境可用；SDK 用驼峰参数）
    try {
        const result = await wx_server_sdk_1.default.openapi.wxacode.getUnlimited(params);
        return result.buffer;
    }
    catch (err) {
        console.warn('openapi 云调用失败，尝试 HTTP 降级:', err.errMsg);
    }
    // 2) HTTP 降级：自行获取 access_token（注意：HTTP 接口用下划线参数 check_path，驼峰会报 47001）
    const appId = process.env.WX_APP_ID;
    const appSecret = process.env.WX_APP_SECRET;
    if (!appId || !appSecret) {
        throw new Error('未配置小程序鉴权：请在云开发控制台完成微信小程序授权，或为 share 函数配置 WX_APP_ID / WX_APP_SECRET 环境变量');
    }
    const tokenRes = await httpsGetJson(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`);
    if (!tokenRes.access_token) {
        throw new Error(`access_token 获取失败: ${JSON.stringify(tokenRes).slice(0, 120)}`);
    }
    return httpsPostBuffer(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${tokenRes.access_token}`, {
        scene: params.scene,
        page: params.page,
        check_path: params.checkPath,
        width: params.width,
    });
}
/** HTTPS GET（JSON） */
function httpsGetJson(url) {
    return new Promise((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const https = require('https');
        https.get(url, (res) => {
            const chunks = [];
            res.on('data', (d) => { if (d)
                chunks.push(d); });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                }
                catch (err) {
                    reject(err);
                }
            });
        }).on('error', reject);
    });
}
/** HTTPS POST，返回图片 buffer（微信错误时返回 JSON，转成错误抛出） */
function httpsPostBuffer(url, body) {
    return new Promise((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const https = require('https');
        const payload = JSON.stringify(body);
        const req = https.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        }, (res) => {
            const chunks = [];
            res.on('data', (d) => { if (d)
                chunks.push(d); });
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                const contentType = String(res.headers['content-type'] || '');
                if (contentType.includes('json')) {
                    const info = JSON.parse(buf.toString('utf8'));
                    reject(new Error(`微信接口错误 ${info.errcode}: ${info.errmsg}`));
                }
                else {
                    resolve(buf);
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}
