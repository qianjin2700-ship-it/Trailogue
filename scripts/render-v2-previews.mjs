/**
 * 生成 Story 2.0 / Magazine 2.0 的静态预览（docs/v2/previews/*.html）。
 *
 * 为什么需要这个脚本：`features/v2` 是纯 TS，仓库里没有 ts-node / tsx，
 * 但预览必须由**同一份渲染器**产出，否则预览就不能代表真实效果。
 * 做法是用仓库自带的 tsc 把 v2 编译到临时目录，再 require 它渲染。
 *
 * 用法：node scripts/render-v2-previews.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = resolve(root, 'ios-app');
const target = resolve(root, 'docs/v2/previews');
const buildDir = mkdtempSync(resolve(tmpdir(), 'trailogue-v2-'));

try {
  execFileSync(
    process.execPath,
    [
      resolve(appDir, 'node_modules/typescript/bin/tsc'),
      'src/features/v2/index.ts',
      '--ignoreConfig',
      '--ignoreDeprecations',
      '6.0',
      '--outDir',
      buildDir,
      '--module',
      'commonjs',
      '--target',
      'es2020',
      '--moduleResolution',
      'node',
      '--skipLibCheck',
      '--esModuleInterop',
    ],
    { cwd: appDir, stdio: 'inherit' },
  );

  const require = createRequire(import.meta.url);
  const v2 = require(resolve(buildDir, 'index.js'));
  const source = v2.createMockSource();

  const story = v2.renderStoryHtml(v2.buildStoryDocument(source), { preview: true });
  const magazine = v2.renderMagazineHtml(v2.buildMagazineDocument(source), { preview: true });

  mkdirSync(target, { recursive: true });
  writeFileSync(resolve(target, 'story-preview.html'), story, 'utf8');
  writeFileSync(resolve(target, 'magazine-preview.html'), magazine, 'utf8');
  console.log(`story-preview.html    ${story.length} bytes`);
  console.log(`magazine-preview.html ${magazine.length} bytes`);
  console.log(`→ ${target}`);
} finally {
  rmSync(buildDir, { recursive: true, force: true });
}
