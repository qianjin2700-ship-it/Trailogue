// utils/share.ts — 分享能力统一开启工具
//
// 踩过的坑（务必遵守，否则右上角菜单的「发送给朋友」/「分享到朋友圈」会是灰色或不显示）：
//
// 1. 分享是**按页面**生效的，不是全局配置。一个页面要能转发，必须同时满足：
//    a) 调用了 wx.showShareMenu（未调用 → 按钮默认不显示/置灰）
//    b) 定义了 onShareAppMessage（未定义 → 「发送给朋友」不可用，「复制链接」连带置灰）
//
// 2. 要显示「分享到朋友圈」额外再满足两条：
//    a) showShareMenu 的 menus 里显式包含 'shareTimeline'（不在 menus 里就不显示）
//    b) 页面定义了 onShareTimeline 处理函数（只改 menus 不定义函数同样不显示）
//
// 3. 建议在 onShow 里调用而非 onLoad：分享状态是页面级的，
//    只在 onLoad 调一次，某些导航路径下会被覆盖。
//
// 4. ⚠️ 关键：平台不支持 shareTimeline 时，千万不要把它塞进 menus。
//    某些平台（如 HarmonyOS）调用 showShareMenu 会返回**成功**（不走 fail 回调），
//    但整个分享菜单会陷入异常状态——按钮显示得出来，点击却毫无反应。
//    表现为「按钮在、点不动」，极易误判成 onShareAppMessage 写错了。
//    所以必须用 wx.canIUse 先探测再决定是否传入。
//
// 5. 平台限制：官方将 shareTimeline 标注为 Beta，早期仅 Android 支持。
//    iOS 上若朋友圈按钮仍不出现，属平台侧限制，不是代码问题。
//    另外 Windows/Mac 微信客户端不支持「复制链接」。

type ShareMenu = 'shareAppMessage' | 'shareTimeline';

/** 探测当前平台是否支持「分享到朋友圈」菜单项 */
function canShareTimeline(): boolean {
  try {
    return Boolean(wx.canIUse('showShareMenu.menus.shareTimeline'));
  } catch (err) {
    console.warn('[share] canIUse failed', err);
    return false;
  }
}

/**
 * 分享标题安全化：AI 生成的标题可能很长，超长标题会让分享面板弹不出来，
 * 统一裁剪到 30 字符以内（微信对 title 有长度限制）。
 */
export function safeTitle(title: string | undefined, fallback = '旅迹成书'): string {
  const text = (title || '').trim() || fallback;
  return text.length > 30 ? `${text.slice(0, 29)}…` : text;
}

/**
 * 打开当前页面的分享菜单。
 * @param options.timeline 是否需要「分享到朋友圈」，默认 true
 */
export function enableShare(options?: { timeline?: boolean }): void {
  const menus: ShareMenu[] = ['shareAppMessage'];
  const wantTimeline = options?.timeline !== false;
  const supportTimeline = canShareTimeline();
  if (wantTimeline && supportTimeline) {
    menus.push('shareTimeline');
  }
  console.log('[SHARE_DIAG] enableShare', JSON.stringify({
    menus,
    canIUseTimeline: supportTimeline,
    sdk: (() => { try { return wx.getSystemInfoSync().SDKVersion; } catch { return '?'; } })(),
    platform: (() => { try { return wx.getSystemInfoSync().platform; } catch { return '?'; } })(),
  }));

  const apply = (list: ShareMenu[]) => {
    wx.showShareMenu({
      // withShareTicket 只在需要群信息时才有用，先去掉以排除干扰
      menus: list,
      success: () => console.log('[SHARE_DIAG] showShareMenu ok', JSON.stringify(list)),
      fail: (err) => {
        // 低版本基础库不认识 shareTimeline 会走 fail，降级只开转发
        console.warn('[SHARE_DIAG] showShareMenu fail', err, JSON.stringify(list));
        if (list.length > 1) {
          wx.showShareMenu({ menus: ['shareAppMessage'] });
        }
      },
    });
  };

  try {
    apply(menus);
  } catch (err) {
    console.warn('[share] showShareMenu threw', err);
  }
}
