#!/usr/bin/env node
/**
 * Trailogue production smoke test（无第三方依赖，Node 18+ 直接运行）。
 *
 * 用途：production 环境部署完成后、以及每次部署后，用一条命令确认
 * 健康端点、鉴权闸门、分享页路由都返回预期状态码，避免"看起来部署成功、
 * 实际上后端起不来"的情况。
 *
 * 用法：
 *   node scripts/smoke-production.mjs https://<production-host>
 *   SMOKE_BASE_URL=https://<production-host> node scripts/smoke-production.mjs
 *
 * 退出码：0 全部通过；1 有失败项（可直接用于 CI 或部署门禁）。
 * 注意：只做只读探测，不写入任何用户数据，不携带任何密钥。
 */

const baseUrl = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? '').replace(/\/+$/, '');
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 12_000);

if (!baseUrl) {
  console.error('用法: node scripts/smoke-production.mjs https://your-production-host');
  process.exit(2);
}

/** 单次请求，超时即失败，不重试（避免掩盖启动抖动）。 */
async function probe(name, path, expectation, options = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const body = await response.text();
    const elapsed = Date.now() - startedAt;
    const ok = expectation(response.status, body);
    return { name, path, status: response.status, elapsed, ok, detail: body.slice(0, 160) };
  } catch (error) {
    return {
      name,
      path,
      status: 0,
      elapsed: Date.now() - startedAt,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];

// 1. 存活探针：进程是否起来。
results.push(await probe('liveness', '/health', (status, body) => status === 200 && body.includes('"ok"')));

// 2. 就绪探针：数据库连接是否可用（Railway healthcheck 用的就是它）。
results.push(await probe('readiness', '/ready', (status, body) => status === 200 && body.includes('"ready"')));

// 3. 鉴权闸门：未带 token 必须被拒绝，不能返回 200（否则用户数据裸奔）。
results.push(
  await probe('auth guard', '/v1/trips', (status) => status === 401 || status === 403),
);

// 4. 分享路由：未知 token 必须是 404，而不是 500（说明分享链路可用且不泄露）。
results.push(
  await probe(
    'share route',
    `/share/${'a'.repeat(43)}`,
    (status) => status === 404,
  ),
);

// 5. 登录入口：伪造 Apple identity token 必须被 4xx 拒绝，不能 5xx（5xx 说明 Apple 校验或配置有问题）。
results.push(
  await probe(
    'apple sign-in guard',
    '/v1/auth/apple',
    (status) => status >= 400 && status < 500 && status !== 404,
    { method: 'POST', body: { identityToken: 'not-a-real-token', fallbackLanguage: 'en' } },
  ),
);

for (const result of results) {
  const flag = result.ok ? 'PASS' : 'FAIL';
  console.log(
    `[${flag}] ${result.name.padEnd(20)} ${String(result.status).padStart(3)}  ${String(result.elapsed).padStart(5)}ms  ${result.path}` +
      (result.ok ? '' : `\n        ${result.detail}`),
  );
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed · ${baseUrl}`);
process.exit(failed.length === 0 ? 0 : 1);
