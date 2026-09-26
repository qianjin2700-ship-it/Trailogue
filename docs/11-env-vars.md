# 云函数环境变量清单

> **安全原则**：密钥仅存于云函数环境变量，前端代码、数据库文档、日志中均不得出现任何密钥明文。

## 需配置环境变量的云函数

| 云函数 | 需要的环境变量 |
|--------|---------------|
| `internal-processMeta` | `TENCENT_CLOUD_SECRET_ID`, `TENCENT_CLOUD_SECRET_KEY`, `TENCENT_LBS_KEY` |
| `internal-processVision` | `TENCENT_CLOUD_SECRET_ID`, `TENCENT_CLOUD_SECRET_KEY`, `MODEL_NAME`, `MODEL_ENDPOINT` |
| `internal-generateStory` | `TENCENT_CLOUD_SECRET_ID`, `TENCENT_CLOUD_SECRET_KEY`, `MODEL_NAME`, `MODEL_ENDPOINT` |

## 环境变量明细

| 变量名 | 用途 | 示例值 | 配置位置 |
|--------|------|--------|---------|
| `TENCENT_CLOUD_SECRET_ID` | 腾讯云 API 凭证 SecretId | `AKIDxxxxxxxxxxxxx` | 云函数环境变量 |
| `TENCENT_CLOUD_SECRET_KEY` | 腾讯云 API 凭证 SecretKey | `xxxxxxxxxxxxxxxxx` | 云函数环境变量 |
| `TENCENT_LBS_KEY` | 腾讯位置服务 Key（逆地址解析） | `XXXXX-XXXXX-XXXXX-XXXXX` | 云函数环境变量 |
| `MODEL_NAME` | AI 模型名称（如 hunyuan-vision） | `hunyuan-vision` | 云函数环境变量 |
| `MODEL_ENDPOINT` | 模型服务地址 | `https://hunyuan.tencentcloudapi.com` | 云函数环境变量 |

## 配置操作步骤（云开发控制台）

1. 微信开发者工具 → 顶部「云开发」→ 云开发控制台（环境 `lvji-d6g41bt719c85fe54`）。
2. 「云函数」→ 点目标函数名进入详情 → 「函数配置」→ 「环境变量」→ 逐条添加（键、值）→ 保存后函数会自动重启生效。
3. 三个函数按下面清单逐个配置：

**internal-processMeta（3 条）**
```
TENCENT_CLOUD_SECRET_ID  = <你的 SecretId>
TENCENT_CLOUD_SECRET_KEY = <你的 SecretKey>
TENCENT_LBS_KEY          = <位置服务 Key>
```

**internal-processVision（4 条）**
```
TENCENT_CLOUD_SECRET_ID  = <你的 SecretId>
TENCENT_CLOUD_SECRET_KEY = <你的 SecretKey>
MODEL_NAME               = hunyuan-vision
MODEL_ENDPOINT           = https://hunyuan.tencentcloudapi.com
```

**internal-generateStory（4 条）**
```
TENCENT_CLOUD_SECRET_ID  = <你的 SecretId>
TENCENT_CLOUD_SECRET_KEY = <你的 SecretKey>
MODEL_NAME               = hunyuan-vision
MODEL_ENDPOINT           = https://hunyuan.tencentcloudapi.com
```

> SecretId/SecretKey 获取：https://console.cloud.tencent.com/cam/capi （账号 100052125926）。
> 位置服务 Key 获取：https://lbs.qq.com/dev/console/key/manage （需开通 WebServiceAPI，勾选「逆地址解析」）。
> 配置完成后调用一次 internal-processMeta 的云端测试验证密钥可用（传入最小 event），日志中不得出现密钥明文。

## 日志脱敏规则

云函数日志**可以**记录：
- 模型调用状态（成功/失败/重试）
- 耗时（ms）
- Token 或计费量
- 错误码
- openid 哈希、任务 ID

云函数日志**不得**记录：
- 原始照片内容
- GPS 原始坐标
- 完整提示词中的隐私信息
- 任何密钥明文
