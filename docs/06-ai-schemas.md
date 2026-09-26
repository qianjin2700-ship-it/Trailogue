# 06 — AI 结构化输出 Schema

## 1. 总体原则

1. **两步生成**：先产出「照片事实素材库」（PhotoFact[]），经校验与用户确认后才进入故事生成；
2. **信息分四档**：`确定事实`（EXIF/用户补充，confidence=1.0）> `模型推断`（视觉模型，0<confidence<1）> `用户补充`（优先级高于推断）> `未知`；
3. **禁止虚构**：模型 prompt 与后校验双重约束——不得虚构：人物姓名、人物身份、人物关系、具体地点、具体日期、对话内容、未发生的事件、用户未提供的情绪或动机；
4. **推断不得伪装**：不得将推断伪装成确定事实；低置信度信息不得作为确定事实直接写入故事；不得仅凭视觉相似性断定具体地点、人物身份或人物关系；
5. **结构化 JSON 输出**：所有模型调用要求返回 JSON，云函数做 schema 校验 + 字段长度 + 引用完整性校验 + 地名一致性检查；
6. **校验失败重试**：最多自动重试 3 次（含结构校验 + 事实引用完整性检查 + 地名一致性检查）；
7. **降级链**：连续失败后使用安全的模板化降级文案，并明确提示用户检查（标记 degraded=true）；
8. **事实可追溯**：每个章节和段落必须能追溯到对应照片及事实。

## 2. PhotoFact — 照片事实（素材库单元）

```ts
interface PhotoFact {
  photo_id: string;                 // 对应 photos._id
  taken_at: string | null;          // ISO8601
  taken_at_source: 'exif' | 'file_meta' | 'inferred' | 'user' | 'unknown';
  taken_at_confidence: number;      // 0~1
  taken_at_user_confirmed: boolean;  // 是否经过用户确认
  location: {
    lat: number | null;
    lng: number | null;
    city: string | null;            // 如 "西宁市"
    district: string | null;
    poi: string | null;             // 如 "塔尔寺"
    source: 'exif' | 'inferred' | 'user' | 'unknown';
    confidence: number;             // 0~1
    user_confirmed: boolean;         // 是否经过用户确认
    original_value: string | null;  // 原始值（如原始 GPS 坐标）
  };
  facts: VisionFact[];              // 视觉模型结构化事实
  can_use_in_story: boolean;        // 该照片事实可否用于故事中的确定性表达
}

interface VisionFact {
  type: 'scene' | 'landmark' | 'weather' | 'time_of_day' | 'season'
      | 'activity' | 'text_visible' | 'object' | 'food' | 'person_group';
  value: string;                    // 简短中文描述，≤30 字
  confidence: number;               // 0~1
  source: 'vision' | 'user';        // 视觉推断 or 用户补充
  related_photo_ids: string[];       // 关联照片 ID（邻接推断依据）
  inference_basis: string | null;   // 推断依据（仅 source=inferred 时填写）
}
```

### 视觉模型输出约束（Prompt 要点）

- 只描述**画面可见**内容；不确定时输出低 confidence 而非猜测；
- 人脸不得描述具体身份，只允许"人物（单人/多人）"级描述；**不得仅凭视觉相似性断定具体地点、人物身份或人物关系**；
- 识别内容：地标、建筑、风景、天气、季节、昼夜、食物、人物活动、活动场景、图片之间可能的连续关系；
- `text_visible`：画面中清晰可见的文字（店名、路牌）可直接引用；
- 结合前后相邻照片的时间、地点和画面内容进行关联推断；
- 可利用同一组中其他高置信度照片辅助推断，但**不得将推断伪装成确定事实**；
- 所有推断结果必须标注：推断依据、数据来源、置信度、关联照片 ID；
- 低置信度信息不得作为确定事实直接写入故事；
- 置信度自评规则：≥0.8 明确可辨；0.5~0.8 部分模糊；<0.5 高度不确定。

### 置信度处理规则

| 置信度 | 用途 |
|--------|------|
| ≥ 0.8 | 可作为故事背景细节（仍需中性表达） |
| 0.6 ~ 0.8 | 仅用于排序/分组辅助，不写入正文 |
| < 0.6 | 仅用于排序/分组辅助，UI 标黄待确认 |

## 3. StoryOutput — 故事输出（最终产物）

```ts
interface StoryOutput {
  title: string;                    // ≤20 字
  subtitle: string;                 // 封面副标题 ≤30 字
  preface: string;                  // 序言 80~200 字
  chapters: Chapter[];
  epilogue: string;                 // 结尾 60~200 字
  share_summary: string | null;     // 可选分享摘要 ≤100 字
  meta: StoryMeta;
}

interface Chapter {
  chapter_id: string;               // 服务端生成（如 "ch1"），非模型输出
  title: string;                    // ≤16 字
  date_label: string | null;        // 如 "8月15日"；全部未知时为 null
  location_label: string | null;    // 如 "西宁 · 城中区"；未知为 null
  narrative: string;                // 100~400 字正文
  photo_ids: string[];              // 本章照片，按展示顺序
  captions: Record<string, string>; // photo_id → 图说（≤60 字）
  locked: boolean;                   // 用户锁定标记（重生成时跳过）
  user_edited: boolean;              // 用户手动修改标记（重生成时保留）
}

interface StoryMeta {
  model: string;                    // 如 "hunyuan-vision + hunyuan"
  generated_at: string;             // ISO8601
  degraded: boolean;                // true=含模板降级内容
  uncertain_notes: string[];        // 生成时基于低置信信息的中性表达说明（≤3 条）
  total_tokens: number;             // 模型调用 Token 总量（计费参考）
  call_count: number;               // 模型调用次数
  error_codes: string[];            // 调用过程中的错误码记录
}
```

## 4. 生成 Prompt 结构（故事阶段）

```
[System]
你是旅行相册文案作者。规则：
1. 只能使用 <事实素材库> 中的信息，严禁虚构人名、地名、事件经过；
2. 事实分三档：[事实]（source=exif/user）可直接陈述；
   [推断]（source=inferred/vision）须用中性表达，如"画面里似乎是..."；
   [未知] 的信息一律不提及或用"某地/某天"模糊指代；
3. 用户输入（背景/关系/强调/文风）优先级最高；
4. 严格输出 JSON，结构如下：<StoryOutput JSON Schema>
[User]
文风：{style}；背景：{background}；人物关系：{relations}；强调：{highlights}
事实素材库：<PhotoFact[]>
请生成 1 个标题、1 段序言、{N} 个章节（N=分组数）、每章图说、1 段结尾。
```

## 5. 输出校验（云函数后校验，prompt 之外的保险）

### 5.1 结构校验（JSON Schema）
- 使用 ajv（或手写校验器）对 StoryOutput 全字段类型与长度校验；
- `chapters.photo_ids` 必须为该相册照片 ID 的**子集且无重复**（引用完整性）；
- 全部 photo_ids 并集必须覆盖用户已确认的全部照片（防漏图）。

### 5.2 反虚构扫描（启发式）
- 提取 narrative 中出现的**地名候选词**（结合逆解析词表 + 常见地名词典）；
- 候选词不在素材库 location 词表 → 该次生成判为违规 → 重试；
- 检测引号内人名、`某某说` 句式等叙事性虚构信号，命中则重试。

### 5.3 失败降级
```
第1次生成(temperature=0.7) → 校验失败
→ 第2次(temperature=0.3，附带违规原因反馈) → 校验失败
→ 第3次(temperature=0.1) → 校验失败
→ 模板生成：标题=相册名，序言/章节/结尾=固定模板 + 时间地点占位填充，
   narrative 使用照片事实串联的模板句式，degraded=true，明确提示用户检查
```

> **校验失败最多自动重试 3 次**（含结构校验 + 事实引用完整性检查 + 地名一致性检查）；连续失败后使用安全的模板化降级文案。

## 6. 单段重生成（regenerateSection）

- 输入：该章 PhotoFact 子集 + 该章现有文本 + 用户 feedback；
- 输出：仅该 Chapter 的 JSON（同结构单对象）；
- 校验同 5.1/5.2（photo_ids 校验范围限本章）；
- 成功后合并回故事文档，version+1。

## 7. 模型调用参数与成本控制

| 调用 | 模型 | 单次输入上限 | 重试策略 |
|------|------|-------------|---------|
| 视觉理解 | 混元视觉（暂定，经环境变量配置） | 1 图/次（云存储临时 URL） | 单批失败自动重试 1 次；仍失败标记 photos.vision.status=failed 并计入 failed_photo_ids，**阻断故事生成**，由用户选择重试或移除该照片（不做静默降级） |
| 故事生成 | 混元（文本，经环境变量配置） | 全量事实库（超 50 张照片时按章节分次） | 见 5.3 三级降级 |

### 7.1 模型调用必须设置的参数

| 参数 | 说明 |
|------|------|
| 超时时间 | 单次调用 ≤ 30s（视觉）/ ≤ 60s（文本） |
| 重试次数 | 视觉 1 次、文本 3 次（含降温降级） |
| 幂等标识 | 每次调用携带 request_id，重复请求返回首次结果 |
| 并发上限 | 单相册 ≤ 1 个并发 story 任务；视觉分批 ≤ 2 并发 |
| 限流机制 | 每 openid 每分钟云函数调用 ≤ 60 次 |
| 降级策略 | 视觉失败→阻断生成（用户决策）；文本失败→三级降级模板 |

### 7.2 模型调用日志规范

记录以下信息（不含敏感内容）：
- 模型调用状态（成功/失败/重试）
- 耗时（ms）
- Token 或计费量
- 错误码
- **不得记录**：敏感照片内容、完整提示词中的隐私信息

> **配置与密钥管理（已确认决策）**：模型名称、密钥、服务地址**全部通过云函数环境变量注入**，包括但不限于：
> - `TENCENT_CLOUD_SECRET_ID` / `TENCENT_CLOUD_SECRET_KEY`（腾讯云 API 凭证）
> - `TENCENT_LBS_KEY`（腾讯位置服务）
> - `MODEL_NAME`（模型名称，如 hunyuan-vision）
> - `MODEL_ENDPOINT`（模型服务地址）
>
> 约束：前端代码（miniprogram 目录）、数据库文档、云函数日志中**均不得出现任何密钥明文**；日志脱敏规则见 01 号文档 §6。
> **Provider 可替换**：模型调用封装为可替换的 Provider 接口，以便未来更换模型供应商。
