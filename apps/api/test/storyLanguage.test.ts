import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveStoryLanguage } from '../src/modules/stories/storyLanguage.js';

test('detects the primary narrative language instead of a place name', () => {
  assert.equal(resolveStoryLanguage('auto', ['Tokyo', 'We explored quiet streets and shared a long family dinner.'], 'zh-Hans'), 'en');
  assert.equal(resolveStoryLanguage('auto', ['東京', 'この旅で家族と一緒に過ごした時間を記録したいです。'], 'en'), 'ja');
  assert.equal(resolveStoryLanguage('auto', ['Seoul', '우리 가족이 함께 걸으며 보낸 시간과 여행의 느낌을 기록하고 싶어요.'], 'en'), 'ko');
});

test('manual language always wins and auto falls back when input is ambiguous', () => {
  assert.equal(resolveStoryLanguage('zh-Hant', ['English text'], 'en'), 'zh-Hant');
  assert.equal(resolveStoryLanguage('auto', ['京都'], 'en'), 'en');
  assert.equal(resolveStoryLanguage('auto', ['A'], 'ja'), 'ja');
});
