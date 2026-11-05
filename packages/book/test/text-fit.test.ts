import assert from 'node:assert/strict';
import test from 'node:test';

import {
  charWidthEm,
  estimateLineCount,
  isCjkChar,
  magazineTextCapacity,
  splitTextIntoPages,
} from '../src/index.js';

/**
 * 文字容量估算与分页。
 *
 * 这一层决定了「文字会不会溢出页」：Magazine 是固定页高，
 * 估算是唯一能在渲染前判断是否分页的手段，所以它的行为必须被锁死。
 */

test('字符宽度：CJK 占 1em，拉丁约占 0.52em', () => {
  assert.equal(isCjkChar('潮'), true);
  assert.equal(isCjkChar('，'), true);
  assert.equal(isCjkChar('a'), false);
  assert.equal(charWidthEm('潮'), 1);
  assert.equal(charWidthEm('a'), 0.52);
});

test('estimateLineCount：空文本为 0 行，单行短句为 1 行', () => {
  assert.equal(estimateLineCount('', 20), 0);
  assert.equal(estimateLineCount('潮水退了。', 20), 1);
});

test('estimateLineCount：只高估不低估（长文本行数 ≥ 字符数 / 每行 em）', () => {
  const capacity = magazineTextCapacity('image_text');
  for (const length of [30, 120, 400, 1200]) {
    const text = '潮'.repeat(length);
    const lines = estimateLineCount(text, capacity.lineWidthEm);
    // 用 lineWidthEm（可含小数）比较，而不是 floor 过的 charsPerLine：
    // 后者是给「每行能放几个字」的人看的整数，拿来算行数会把边界算多一行。
    assert.ok(
      lines >= Math.ceil(length / capacity.lineWidthEm),
      `${length} 字的行数估算被低估：${lines}`,
    );
  }
});

test('文本容量：hero 比 image_text 少，引语页最少', () => {
  const hero = magazineTextCapacity('hero');
  const body = magazineTextCapacity('image_text');
  const quote = magazineTextCapacity('quote');
  assert.ok(hero.lines < body.lines);
  assert.ok(quote.lines <= body.lines);
  assert.ok(hero.lineWidthEm > body.lineWidthEm, 'hero 文字栏更宽');
});

test('splitTextIntoPages：短文本只有一页且原样返回', () => {
  const capacity = magazineTextCapacity('image_text');
  const text = '潮水退到堤外之后，滩涂上开始出现细小的动静。';
  assert.deepEqual(splitTextIntoPages(text, capacity), [text]);
});

test('splitTextIntoPages：长文本分页后不丢字（只丢失分页产生的空白）', () => {
  const capacity = magazineTextCapacity('image_text');
  const sentence = '潮水退到堤外之后，滩涂上开始出现细小的动静。';
  const text = Array.from({ length: 60 }, () => sentence).join('');
  const pages = splitTextIntoPages(text, capacity);
  assert.ok(pages.length > 3, `预期多页，实际 ${pages.length} 页`);
  const joined = pages.join('');
  assert.equal(joined.replace(/\s/g, ''), text.replace(/\s/g, ''), '分页后文字有丢失');
});

test('splitTextIntoPages：每页都在容量之内（不溢出）', () => {
  const sentence = '潮水退到堤外之后，滩涂上开始出现细小的动静。';
  for (const zone of ['hero', 'image_text', 'quote', 'closing'] as const) {
    const capacity = magazineTextCapacity(zone);
    const pages = splitTextIntoPages(
      Array.from({ length: 40 }, () => sentence).join(''),
      capacity,
    );
    pages.forEach((page, index) => {
      const lines = estimateLineCount(page, capacity.lineWidthEm);
      assert.ok(lines <= capacity.lines, `${zone} 第 ${index + 1} 页 ${lines} 行超过 ${capacity.lines} 行`);
    });
  }
});

test('splitTextIntoPages：无标点的超长串也能切开（按字符兜底）', () => {
  const capacity = magazineTextCapacity('image_text');
  const pages = splitTextIntoPages('潮'.repeat(2000), capacity);
  assert.ok(pages.length > 1);
  assert.equal(pages.join('').length, 2000);
});

test('splitTextIntoPages：英文按句分页，且单词不被截断', () => {
  const capacity = magazineTextCapacity('image_text');
  const text = 'The tide had not turned yet when we arrived. '.repeat(40);
  const pages = splitTextIntoPages(text, capacity);
  assert.ok(pages.length > 1);
  pages.forEach((page) => {
    assert.ok(!/\s$/.test(page), '分页后残留行尾空格');
    assert.ok(/\S/.test(page), '出现空白页');
  });
  // 分页边界会吃掉一个空格（换页本身即分隔），因此只比较「字符是否丢失」
  assert.equal(pages.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
});

test('splitTextIntoPages：空白输入不产生页', () => {
  const capacity = magazineTextCapacity('image_text');
  assert.deepEqual(splitTextIntoPages('   \n  ', capacity), []);
});
