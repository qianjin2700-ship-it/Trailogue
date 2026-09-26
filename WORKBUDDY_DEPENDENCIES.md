# WorkBuddy 专属依赖识别

> 回答一个问题：**离开 WorkBuddy 后，这个项目还能不能独立开发？**
> 结论先说：**能。** 项目运行时**不依赖 WorkBuddy**，它是标准的「微信原生小程序 + 腾讯云 CloudBase」项目。WorkBuddy 只是当时的开发/编排环境，下面列出与它耦合的残留物及处理方式。

---

## 依赖清单

| 依赖内容 | 代码位置 | 离开 WorkBuddy 还能否运行 | 如何迁移 |
|---|---|---|---|
| 开发/编排环境本身 | （无代码） | ✅ 不影响 | 换 VS Code / Cursor / Codex 直接打开即可 |
| 项目记忆 / 会话 / 临时文件 | `.workbuddy/`（`memory/`、`tmp/deploy-yaomiao/*.log` 等） | ✅ 已加入 `.gitignore`，不随项目走 | 无需处理；迁移脚本的部署日志就是这些 `tmp/*.log` |
| 硬编码绝对路径 | `scripts/migrate/deploy-all.ps1`、`scripts/migrate/deploy-yaomiao.ps1`（内含 `c:\Users\qjz19\WorkBuddy\20260823204843\lvji-chengshu` 与 `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`） | ⚠️ 脚本不可跨机运行，但不影响 App 运行 | 新机器上把脚本里的路径改成自己的路径（或直接手动在开发者工具里部署云函数） |
| 部署依赖微信开发者工具 CLI | `scripts/migrate/*.ps1` 调用 `cli.bat` | ⚠️ 仅 Windows + 已装开发者工具的环境可用 | 云函数可用开发者工具「上传并部署」或 CloudBase CLI（`tcb`）替代 |
| 文档中提及 WorkBuddy 路径 | `docs/00-INDEX.md`、`docs/12-deploy-manual.md` | ✅ 仅文档，不影响运行 | 可选清理，或忽略 |
| 工作区根目录的残留文件 | 工作区根 `cloudbaserc.json`（envId 指向已放弃的 yaomiao）、`output/*.docx`（历史交付物） | ⚠️ 根 `cloudbaserc.json` 是过期残留 | 已在**项目内**新建正确的 `cloudbaserc.json`（envId=lvji）；根目录那份不随仓库走，可忽略 |
| 云函数环境变量 / 密钥 | 存于**微信云开发控制台**（非 WorkBuddy） | ✅ 与 WorkBuddy 无关 | 迁移机器后需在新环境的控制台重新配置（见 `.env.example`） |
| 云数据库 / 云存储 | 腾讯云 CloudBase（环境 `lvji-d6g41bt719c85fe54`） | ✅ 与 WorkBuddy 无关 | 云资源在腾讯云，换开发机器不影响 |
| 运行时（Node / npm） | 项目用标准 `package.json` + devDependencies | ✅ 与 WorkBuddy 无关 | 新机器 `npm install` 即可 |
| 隐式依赖 | **无**。代码里没有 `wx.cloud` / 云函数之外的 WorkBuddy 专属服务、SDK、构建钩子 | ✅ | — |

---

## 结论

1. **项目本身零 WorkBuddy 运行时依赖** —— 前端是微信原生小程序，后端是 CloudBase 云函数，全部跑在微信/腾讯云侧。
2. **唯一需要清理的是迁移脚本里的绝对路径**（`scripts/migrate/*.ps1`），且它们不影响 App 运行，只是历史部署脚本。
3. **真正要在新机器/新环境重建的**是云开发环境侧配置：环境变量（6 个）、云函数超时、数据库索引与权限 —— 这些本来就在腾讯云控制台，与 WorkBuddy 无关。
4. 即使以后完全不用 WorkBuddy，`git clone` 本仓库 + 装微信开发者工具 + 配云开发环境即可继续开发，无需任何 WorkBuddy 组件。
