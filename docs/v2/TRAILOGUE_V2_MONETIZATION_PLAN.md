# TRAILOGUE V2 — 商业化预留

> 结论先说：**2.0 不实现付费，只留挂载点。**
> 本轮没有任何计费代码、没有 IAP、没有 paywall、没有后端 entitlement 表。

---

## 1. 现状（事实，非计划）

| 项 | 现状 |
|---|---|
| 商业模式 | **$2.99 付费下载**（买断） |
| 应用内购买 | 无。全仓库无 StoreKit / `expo-in-app-purchases` / RevenueCat 依赖 |
| 订阅 | 无 |
| 账号体系 | Apple 登录，`users` 表无 plan / entitlement 字段 |
| 分析埋点 | 无（不采集任何使用行为） |
| 广告 | 无 |
| 分享 | 免费、无限量（仅按 token 生成） |

**2.0 Phase A 不改变以上任何一条。**

---

## 2. 预留原则

1. **主链永远免费**：`Trip → Photos → Story → Share` 不允许被任何付费墙拦截。
   这是产品承诺，也是 App Store 审核最容易被质疑的地方（把核心功能锁住 = 用户投诉源）。
2. **付费买「更多」，不买「能用」**：Pro 只卖「更好的成品」和「更多的量」，不卖基础能力。
3. **单点挂载**：所有付费判断收敛到一个 `Entitlements` 接口，禁止在页面里散落 `if (isPro)`。
4. **可以先有 UI 位置，不能先有假功能**：2.0 不做「灰掉的按钮点了弹即将上线」这种半成品。

---

## 3. Pro 能力清单（候选，未实现）

| 能力 | 归属 | 价值 | 实现成本 | 建议优先级 |
|---|---|---|---|---|
| Premium Magazine layouts | Mag 渲染器 + 主题令牌 | 视觉差异化，最直观 | 中（新增 2–3 套 token + 少量 CSS） | **P0** |
| High-resolution PDF | `pdfExport.ts` 的 `MAX_PRINT_EDGE` | 打印质量，愿意为「能挂墙上」付费 | 低 | **P0** |
| Premium sharing output | 服务端分享页主题 | 分享出去更体面 | 中 | P1 |
| Additional writing styles | `creativeRequirements` + prompt | 内容差异化 | 低（已有 writing_style 机制） | P1 |
| Advanced AI rewrite | 新端点 + 版本机制 | 高频使用者的刚需 | 高（新 API + 成本） | P2 |
| Annual Travel Magazine | 跨旅行聚合 | 年度回顾，情感价值高 | 高（新数据结构） | P2 |
| High-resolution image export | 单图导出 | 弱需求 | 低 | P3 |

**建议首个付费点：Premium Magazine layouts + 高清 PDF**。
理由：两者都复用现有渲染器，只是换 token 与像素上限，不需要新数据模型，
也不影响免费用户的主链 —— 最容易验证「有没有人愿意付」。

---

## 4. 架构挂载点（设计，不含实现）

### 4.1 单一 entitlement 接口

```ts
// 未来放在 packages/contracts 或 ios-app/src/features/entitlements
export type Plan = 'free' | 'pro';

export interface Entitlements {
  plan: Plan;
  /** 功能级开关，避免页面直接判断 plan */
  can(feature: 'magazineThemes' | 'hiresPdf' | 'premiumShare' | 'extraWritingStyles'): boolean;
}
```

页面只允许调用 `can('hiresPdf')`，不允许 `plan === 'pro'`。
这样将来从「买断 Pro」改成「订阅」或「按次付费」时，页面不用改。

### 4.2 挂载点位置

| 能力 | 挂载点 | 现状 |
|---|---|---|
| Magazine 主题 | `renderMagazineHtml(doc, { theme })` | 已有 `MAGAZINE_TOKENS` 单例，加参数即可 |
| 高清 PDF | `features/books/pdfExport.ts` 的 `MAX_PRINT_EDGE = 1600` | 改为按 entitlement 取值 |
| 分享页主题 | 服务端 `renderSharedMagazineHtml` | 需先统一渲染器（见 MAGAZINE_DESIGN §11） |
| 写作风格 | `trips.writing_style` + `creativeRequirements` | 已存在，加白名单即可 |

### 4.3 数据侧（未来，不在 Phase A）

- `users.plan`（`varchar(16)`，default `'free'`）或独立 `entitlements` 表（更利于订阅/退款/家庭共享）；
- 建议独立表：`entitlements(user_id, product_id, source, expires_at, revoked_at)`；
- **Phase A 不加任何列、不写迁移。**

---

## 5. UI 预留（不做）

2.0 的界面里**不出现**任何付费元素：没有锁图标、没有「Pro」角标、没有升级入口。
原因：首批用户是买断用户，看到「还有更高级的」会认为被二次收费，得不偿失。

真要上线 Pro 时，最小侵入方案：

```
Book Preview
  [ Story ][ Magazine ]
  ...预览...
  [ Export PDF ]  [ Share ]
        └─ 长按或二级入口：「高清导出（Pro）」
```

即：**不新增主页按钮**，把 Pro 放在次一级的操作里。

---

## 6. 合规约束（App Store）

| 规则 | 要求 | 对本项目的影响 |
|---|---|---|
| 3.1.1 | 解锁 App 内功能必须用 IAP | 不能用「官网付款解锁」 |
| 3.1.3(b) | 多平台服务可用其他支付 | 本项目不适用（纯 iOS） |
| 3.1.2 | 订阅需明确周期与价格 | 若做订阅必须写清 |
| 2.3.1 | 隐藏功能不可用 | 不能「藏一个开关等审核后打开」 |
| 隐私 | 付费不需要额外隐私声明 | 但若引入分析工具则必须更新隐私政策 |

现状的 $2.99 买断**不涉及 IAP**，因此 2.0 不引入 StoreKit 就不会触碰 3.1.1。

---

## 7. 如果要开始实施（未来 checklist）

- [ ] 决定 Pro 形态：买断升级 / 订阅 / 按次
- [ ] 决定是否引入 StoreKit（原生能力，**需要重新 EAS Build**）
- [ ] 新增 `entitlements` 表 + 迁移
- [ ] 服务端校验收据（App Store Server API，不是客户端自证）
- [ ] 恢复购买（Restore Purchases）流程
- [ ] 退款/家庭共享的处理
- [ ] 隐私政策更新（若引入分析）
- [ ] 定价与本地化文案

> 以上全部**未开始**。当前不做任何一项。

---

## 8. 与 1.0 的关系

- 1.0 已按 $2.99 付费下载提交审核，**审核中不改商业模式**；
- 2.0 若改变收费方式，属于新版本 + 新审核，需单独评估对已购用户的影响（通常：老用户免费升级到 Pro）；
- 任何涉及 StoreKit 的改动都会改变二进制，必须重新构建（记住：本项目**没有** EAS Update / OTA 通道）。
