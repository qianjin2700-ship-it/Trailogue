import assert from 'node:assert/strict';
import test from 'node:test';

import { DeepSeekProvider } from '../src/modules/stories/deepSeekProvider.js';

test('DeepSeek provider discovers vision support and validates photo-complete story JSON', async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  const responses = [
    new Response(JSON.stringify({
      data: [{ id: 'deepseek-flash', input_modalities: ['text', 'image'] }],
    })),
    new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        photos: [{
          photoId: 'photo-1', visibleFacts: ['山路'], inferredLocation: null, confidence: 0.9,
        }],
      }) } }],
      usage: { total_tokens: 100 },
    })),
    new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: '山路记忆', subtitle: '沿途所见', preface: '一段旅程。',
        chapters: [{
          chapterId: 'ch1', title: '出发', dateLabel: null, locationLabel: null,
          narrative: '画面中是一段山路。', photoIds: ['photo-1'],
          captions: { 'photo-1': '山路' }, locked: false, userEdited: false,
        }],
        epilogue: '旅程留在照片里。', shareSummary: '沿途所见。',
      }) } }],
      usage: { total_tokens: 200 },
    })),
  ];
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: input.toString(), body: init?.body ? JSON.parse(String(init.body)) : null });
    return responses.shift()!;
  }) as typeof fetch;
  const provider = new DeepSeekProvider('server-secret', 'https://api.deepseek.com/', 'deepseek-flash', request);
  const photos = [{
    id: 'photo-1', url: 'https://signed.example/photo.jpg', capturedAt: null,
    locationName: null, caption: null, originalFilename: 'photo.jpg',
  }];

  assert.equal(await provider.supportsVision(), true);
  const vision = await provider.understandPhotos(photos);
  const story = await provider.generateStory({
    trip: {
      title: 'Trip', description: null, destinationName: null, startDate: null, endDate: null,
      storyBackground: null, peopleNotes: null, highlights: null,
      writingStyle: 'warm_documentary', customWritingStyle: null, avoidExpressions: null,
      contentLength: 'medium', arrangement: 'timeline',
    },
    photos,
    understandings: vision.facts,
    visionAvailable: true,
  });

  assert.equal(vision.facts[0]?.visibleFacts[0], '山路');
  assert.deepEqual(story.chapters[0]?.photoIds, ['photo-1']);
  assert.equal(story.meta.model, 'deepseek-flash');
  assert.equal(requests.length, 3);
  assert.equal((requests[1]?.body as { model: string }).model, 'deepseek-flash');
  assert.doesNotMatch(JSON.stringify(requests), /server-secret/);
});

test('DeepSeek provider never sends images to a text-only configured model', async () => {
  let calls = 0;
  const request = (async () => {
    calls += 1;
    return new Response(JSON.stringify({
      data: [{ id: 'deepseek-v4-pro', input_modalities: ['text'] }],
    }));
  }) as typeof fetch;
  const provider = new DeepSeekProvider('server-secret', 'https://api.deepseek.com', 'deepseek-v4-pro', request);

  assert.equal(await provider.supportsVision(), false);
  assert.deepEqual(await provider.understandPhotos([]), { facts: [], totalTokens: 0 });
  assert.equal(calls, 1);
});

test('DeepSeek provider rejects partial vision output instead of claiming photo understanding', async () => {
  const responses = [
    new Response(JSON.stringify({ data: [{ id: 'deepseek-flash', input_modalities: ['text', 'image'] }] })),
    ...Array.from({ length: 3 }, () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ photos: [] }) } }],
    }))),
  ];
  const request = (async () => responses.shift()!) as typeof fetch;
  const provider = new DeepSeekProvider('server-secret', 'https://api.deepseek.com', 'deepseek-flash', request);

  await assert.rejects(
    () => provider.understandPhotos([{
      id: 'photo-1', url: 'https://signed.example/photo.jpg', capturedAt: null,
      locationName: null, caption: null, originalFilename: 'photo.jpg',
    }]),
    /cover every photo exactly once/,
  );
  assert.equal(responses.length, 0);
});
