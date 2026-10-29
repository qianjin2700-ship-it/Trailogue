# Trailogue V4.1：体验修复与画册质量重构

## 根因与修复

- **故事生成与画册风格错误耦合**：创作要求页面过去每次点击按钮都会重新执行照片理解和 DeepSeek 故事生成，即使用户只修改 `bookStyle`。一次生成最多包含三轮、每轮 90 秒的上游请求，客户端总超时为 300 秒，因此连续试用 Travel Magazine、Warm Memoir、Minimalist 时容易在第二或第三次表现为网络失败。
- **修复方式**：已有故事且只改变画册风格时，客户端仅保存创作要求、重建并持久化布局，然后直接打开画册；不会调用 DeepSeek，也不会新建故事版本。故事内容、语言或人物要求变化时，才会明确执行重新生成。
- **可诊断性**：Railway 日志记录故事生成的 request ID、旅行 ID、总耗时、结果和安全的失败类型；DeepSeek 超时、连接失败、上游 HTTP 错误和严格 JSON 校验失败会返回不同的可理解信息，不记录 Token、照片内容或用户输入正文。
- **照片等待**：系统照片选择器返回后立即显示本地缩略图；JPEG 规范化改为最多三张并行，随后使用原有三路上传队列。失败照片仍保留并可重试。

## 画册布局 V5

- 布局文档版本升级到 V5。V2–V4 的自动页面会按新算法重排，已有 `userEdited` 页面在迁移时继续保留。
- 画册不再复制完整故事正文。Travel Magazine 使用编辑式摘要；Warm Memoir 每章保留一张 30–80 个中文字符左右的回忆卡；Minimalist 仅保留极短信息栏。完整故事仍在故事阅读与编辑页面中持久化。
- Warm Memoir 的普通内页以照片为主：双图、三图、重点图组合和大幅照片页的媒体区域约占 60%–85%，文字卡叠放在照片边缘或窄侧栏。
- Travel Magazine 使用深蓝封面、全幅章节页、不对称重点图和四图编辑网格。
- Minimalist Photo Book 使用白色纸面、窄信息栏、连续照片带和克制文字。
- 人物或竖图在危险裁切时继续使用 `contain`；横图网格的槽位比例已修正，避免灰色横带。
- App 预览和 PDF 继续共享同一个 `BookLayoutDocument`，不会出现预览与导出使用两套布局的问题。

## 界面精简

画册主界面保留：

1. Regenerate layout
2. Simple edit
3. Export PDF

只有进入 Simple edit 后才显示“换个排版、调整照片顺序、替换主图、编辑故事文字”。普通界面不再显示 `Replan Unedited Pages`、`Reset All Layout Edits`、裁切模式和焦点坐标。

## 视觉验收

三套样本使用同一组 17 张桂山岛真实参考照片和同一份四章故事，共 10 页。逐页接触表已检查封面、照片面积、人物完整性、图文比例、留白、溢出、重复版式和结尾页。

| 风格 | 页数 | 自动审计 | 人工视觉检查 |
| --- | ---: | --- | --- |
| Travel Magazine | 10 | 无缺失位置、无危险裁切、无短空白页 | 四图横带已修复；章节层次和大幅照片清晰 |
| Warm Memoir | 10 | 无缺失位置、无危险裁切、无短空白页 | 无纯文字页；普通内页照片主导；短回忆卡不压缩照片 |
| Minimalist Photo Book | 10 | 无缺失位置、无危险裁切、无短空白页 | 窄信息栏与照片带稳定；留白用于摄影集节奏 |

样本：

- `output/pdf/Trailogue-Guishan-travel_magazine-V5.pdf`
- `output/pdf/Trailogue-Guishan-warm_memoir-V5.pdf`
- `output/pdf/Trailogue-Guishan-minimalist-V5.pdf`
- 对应逐页接触表文件名以 `-contact-sheet.jpg` 结尾。

## 发布状态

按 V4.1 任务书的交付顺序，代码和视觉样本先提交用户集中确认。视觉确认前不推送触发 Railway 部署，也不生成新的 EAS Preview 安装包。
