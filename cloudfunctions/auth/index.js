"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// cloudfunctions/auth/index.ts — 登录/资料/隐私同意
const wx_server_sdk_1 = __importDefault(require("wx-server-sdk"));
const common_1 = require("./common");
wx_server_sdk_1.default.init({ env: wx_server_sdk_1.default.DYNAMIC_CURRENT_ENV });
exports.main = async (event) => {
    const { action } = event;
    const wxContext = wx_server_sdk_1.default.getWXContext();
    switch (action) {
        case 'login':
            return handleLogin(wxContext.OPENID);
        case 'updateProfile':
            return handleUpdateProfile(wxContext.OPENID, event.nickname);
        case 'agreePrivacy':
            return handleAgreePrivacy(wxContext.OPENID, event.retention_days);
        default:
            return { code: 40001, message: `未知 action: ${action}` };
    }
};
async function handleLogin(openid) {
    const db = wx_server_sdk_1.default.database();
    const col = db.collection('users');
    const { data } = await col.where({ _openid: openid }).get();
    // 行为事件：app_open（每次启动登录都会经过此处；writeEvent 内部吞错不阻塞）
    await (0, common_1.writeEvent)(openid, 'app_open', {
        platform: 'wx',
        is_new_user: data.length === 0,
    });
    if (data.length === 0) {
        // 首次登录，创建用户
        const created = await col.add({
            data: {
                _openid: openid,
                nickname: null,
                avatar_url: null,
                privacy_agreed_at: null,
                retention_days: 90,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
        });
        // 行为事件：user_created
        await (0, common_1.writeEvent)(openid, 'user_created', { user_id: created._id });
        return {
            code: 0,
            data: {
                openid,
                user: { nickname: null, retention_days: 90, privacy_agreed_at: null },
                need_privacy_agree: true,
            },
        };
    }
    const user = data[0];
    return {
        code: 0,
        data: {
            openid,
            user: {
                nickname: user.nickname,
                retention_days: user.retention_days,
                privacy_agreed_at: user.privacy_agreed_at,
            },
            need_privacy_agree: !user.privacy_agreed_at,
        },
    };
}
async function handleUpdateProfile(openid, nickname) {
    const db = wx_server_sdk_1.default.database();
    await db.collection('users').where({ _openid: openid }).update({
        data: {
            nickname,
            updated_at: new Date().toISOString(),
        },
    });
    return { code: 0, data: { ok: true } };
}
async function handleAgreePrivacy(openid, retentionDays) {
    const db = wx_server_sdk_1.default.database();
    // 校验：-1（永久）或 1~3650 天；其余拒绝（防止传 0/null 导致到期时间算错、全量原图被误删）
    const days = Number(retentionDays);
    if (days !== -1 && !(days >= 1 && days <= 3650)) {
        return { code: 40001, message: '保存期限参数非法' };
    }
    await db.collection('users').where({ _openid: openid }).update({
        data: {
            privacy_agreed_at: new Date().toISOString(),
            retention_days: days,
            updated_at: new Date().toISOString(),
        },
    });
    return { code: 0, data: { ok: true } };
}
