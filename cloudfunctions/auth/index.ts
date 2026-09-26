// cloudfunctions/auth/index.ts — 登录/资料/隐私同意
import cloud from 'wx-server-sdk';
import { writeEvent } from './common';

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

interface CallEvent {
  action: string;
  [key: string]: unknown;
}

exports.main = async (event: CallEvent) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();

  switch (action) {
    case 'login':
      return handleLogin(wxContext.OPENID);
    case 'updateProfile':
      return handleUpdateProfile(wxContext.OPENID, event.nickname as string);
    case 'agreePrivacy':
      return handleAgreePrivacy(wxContext.OPENID, event.retention_days as number);
    default:
      return { code: 40001, message: `未知 action: ${action}` };
  }
};

async function handleLogin(openid: string) {
  const db = cloud.database();
  const col = db.collection('users');

  const { data } = await col.where({ _openid: openid }).get();

  // 行为事件：app_open（每次启动登录都会经过此处；writeEvent 内部吞错不阻塞）
  await writeEvent(openid, 'app_open', {
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
    await writeEvent(openid, 'user_created', { user_id: created._id });

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

async function handleUpdateProfile(openid: string, nickname: string) {
  const db = cloud.database();
  await db.collection('users').where({ _openid: openid }).update({
    data: {
      nickname,
      updated_at: new Date().toISOString(),
    },
  });
  return { code: 0, data: { ok: true } };
}

async function handleAgreePrivacy(openid: string, retentionDays: number) {
  const db = cloud.database();

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
