// set-fn-env-yaomiao.js — 批量配置云函数环境变量（新环境 yaomiao-d3g3u7ckz71fffd26）
//
// 密钥一律从本机环境变量传入，不写入文件、不进 git：
//   $env:TCB_SID      = 腾讯云 SecretId
//   $env:TCB_SKEY     = 腾讯云 SecretKey
//   $env:TOKENHUB_API_KEY = TokenHub（腾讯混元 MaaS）API Key
//   $env:WX_APP_ID    = 小程序 AppID
//   $env:WX_APP_SECRET= 小程序 AppSecret
//   $env:TENCENT_LBS_KEY = 腾讯位置服务 Key（逆地理编码，可留空 → 三级降级）
//
// 用法（PowerShell）：
//   cd scripts\migrate
//   npm i @cloudbase/manager-node      # 仅首次
//   node set-fn-env-yaomiao.js
//
// ⚠️ 若拿不到腾讯云密钥，直接用云开发控制台手填（控制台 → 云函数 → 函数 → 配置 → 环境变量），
//    效果完全相同，且更安全。见 docs/19-cloud-env-migration.md 第四步。

const CloudBase = require('@cloudbase/manager-node');

const envId = 'yaomiao-d3g3u7ckz71fffd26';
const sid = process.env.TCB_SID;
const skey = process.env.TCB_SKEY;

if (!sid || !skey) {
  console.error('missing TCB_SID / TCB_SKEY');
  process.exit(1);
}

const app = new CloudBase({ secretId: sid, secretKey: skey, envId });

const common = {
  TENCENT_CLOUD_SECRET_ID: sid,
  TENCENT_CLOUD_SECRET_KEY: skey,
};

// 与线上实际值保持一致（2026-08 起已切换到 TokenHub，旧混元平台端点已下线）
const targets = {
  'internal-generateStory': {
    ...common,
    TOKENHUB_API_KEY: process.env.TOKENHUB_API_KEY || '',
    MODEL_NAME: 'hy-vision-2.0-instruct',
    MODEL_ENDPOINT: 'https://tokenhub.tencentmaas.com',
  },
  'internal-processMeta': {
    ...common,
    TENCENT_LBS_KEY: process.env.TENCENT_LBS_KEY || '',
  },
  share: {
    ...common,
    WX_APP_ID: process.env.WX_APP_ID || '',
    WX_APP_SECRET: process.env.WX_APP_SECRET || '',
  },
};

// 超时（套餐允许的上限内；免费版可能强制 3~5s，届时 AI 生成会超时，需升级套餐）
const TIMEOUTS = {
  'internal-generateStory': 300,
  'internal-processMeta': 300,
  export: 60,
  share: 20,
};

(async () => {
  for (const [name, envVariables] of Object.entries(targets)) {
    try {
      const detail = await app.functions.getFunctionDetail(name);
      await app.functions.updateFunctionConfig({
        name,
        envVariables,
        timeout: TIMEOUTS[name] || (detail && detail.Timeout) || 20,
        runtime: (detail && detail.Runtime) || 'Nodejs16.13',
        memorySize: (detail && detail.MemorySize) || 256,
      });
      console.log('UPDATE', name, 'OK');
    } catch (e) {
      console.error('UPDATE', name, 'FAIL:', e.message);
    }
  }

  // 验证（只打印变量名，不打印值）
  await new Promise((r) => setTimeout(r, 3000));
  for (const name of Object.keys(targets)) {
    try {
      const d = await app.functions.getFunctionDetail(name);
      const vars =
        (d.Environment && d.Environment.Variables) ||
        d.envVariables ||
        d.EnvVariables ||
        [];
      const keys = Array.isArray(vars)
        ? vars.map((v) => v.Key || v.key)
        : Object.keys(vars);
      console.log('VERIFY', name, JSON.stringify(keys), 'timeout=', d.Timeout);
    } catch (e) {
      console.error('VERIFY', name, 'FAIL:', e.message);
    }
  }
})();
