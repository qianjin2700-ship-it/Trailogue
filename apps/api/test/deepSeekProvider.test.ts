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
      creativeRequirements: { contentLength: 'custom', customWordCount: 1800, focuses: ['culture'] },
    },
    photos,
    understandings: vision.facts,
    visionAvailable: true,
    languageMode: 'ja', actualLanguage: 'ja',
  });

  assert.equal(vision.facts[0]?.visibleFacts[0], '山路');
  assert.deepEqual(story.chapters[0]?.photoIds, ['photo-1']);
  assert.equal(story.meta.model, 'deepseek-flash');
  assert.equal(requests.length, 3);
  assert.equal((requests[1]?.body as { model: string }).model, 'deepseek-flash');
  assert.match(JSON.stringify(requests[2]?.body), /日本語/);
  assert.match(JSON.stringify(requests[2]?.body), /1800/);
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

test('DeepSeek provider surfaces the real 400 body instead of hiding the upstream reason', async () => {
  const logs: Array<{ event: string; data: Record<string, unknown> }> = [];
  const responses = [
    new Response(JSON.stringify({ data: [{ id: 'deepseek-flash', input_modalities: ['text', 'image'] }] })),
    ...Array.from({ length: 3 }, () => new Response(JSON.stringify({
      error: { code: 'invalid_request_error', message: 'This model does not support image' },
    }), { status: 400 })),
  ];
  const request = (async () => responses.shift()!) as typeof fetch;
  const provider = new DeepSeekProvider('server-secret', 'https://api.deepseek.com', 'deepseek-flash', request, {
    logger: (event, data) => logs.push({ event, data }),
  });

  await assert.rejects(
    () => provider.understandPhotos([{
      id: 'photo-1', url: 'https://signed.example/photo.jpg?sig=secret', capturedAt: null,
      locationName: null, caption: null, originalFilename: 'photo.jpg',
    }]),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /HTTP 400/);
      assert.match(error.message, /This model does not support image/);
      return true;
    },
  );
  const failure = logs.find((entry) => entry.event === 'deepseek.request_failed');
  assert.ok(failure, 'the request failure must be logged');
  assert.equal(failure!.data.providerCode, 'invalid_request_error');
  assert.equal(failure!.data.model, 'deepseek-flash');
  assert.equal(failure!.data.imageCount, 1);
  assert.deepEqual(failure!.data.messageRoles, ['system', 'user']);
  assert.doesNotMatch(JSON.stringify(logs), /server-secret|sig=secret/);
});

test('DeepSeek provider batches photos so one oversized request cannot fail them all', async () => {
  const bodies: Array<{ model: string; messages: Array<{ content: unknown }> }> = [];
  const responses = [
    new Response(JSON.stringify({ data: [{ id: 'deepseek-flash', input_modalities: ['text', 'image'] }] })),
    ...Array.from({ length: 2 }, (_, batchIndex) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        photos: Array.from({ length: batchIndex === 0 ? 4 : 1 }, (_unused, index) => ({
          photoId: `photo-${batchIndex * 4 + index + 1}`,
          visibleFacts: ['海边'],
          inferredLocation: null,
          confidence: 0.8,
        })),
      }) } }],
      usage: { total_tokens: 50 },
    }))),
  ];
  const request = (async (_input: string | URL | Request, init?: RequestInit) => {
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    return responses.shift()!;
  }) as typeof fetch;
  const provider = new DeepSeekProvider('server-secret', 'https://api.deepseek.com', 'deepseek-flash', request);

  const photos = Array.from({ length: 5 }, (_unused, index) => ({
    id: `photo-${index + 1}`,
    url: `https://signed.example/photo-${index + 1}.jpg`,
    capturedAt: null,
    locationName: null,
    caption: null,
    originalFilename: `photo-${index + 1}.jpg`,
  }));
  const vision = await provider.understandPhotos(photos);

  assert.equal(vision.facts.length, 5);
  assert.equal(bodies.length, 2, 'five photos must be split into batches of four and one');
  assert.equal(JSON.stringify(bodies[0]).match(/"type":"image_url"/g)?.length, 4);
  assert.equal(JSON.stringify(bodies[1]).match(/"type":"image_url"/g)?.length, 1);
});

test('DeepSeek provider skips photos whose signed URL is not publicly fetchable', async () => {
  const logs: Array<{ event: string; data: Record<string, unknown> }> = [];
  const requestedPhotos: string[] = [];
  const request = (async () => new Response(JSON.stringify({
    data: [{ id: 'deepseek-flash', input_modalities: ['text', 'image'] }],
  }))) as typeof fetch;
  const imageFetch = (async (input: string | URL | Request) => {
    const url = input.toString();
    if (url.includes('expired')) {
      return new Response('AccessDenied', { status: 403, headers: { 'content-type': 'text/xml' } });
    }
    requestedPhotos.push(url);
    return new Response(new Uint8Array([0xff, 0xd8]), {
      status: 206,
      headers: { 'content-type': 'image/jpeg', 'content-range': 'bytes 0-1/2048' },
    });
  }) as typeof fetch;
  const provider = new DeepSeekProvider('server-secret', 'https://api.deepseek.com', 'deepseek-flash', request, {
    logger: (event, data) => logs.push({ event, data }),
    imageFetch,
  });

  await assert.rejects(
    () => provider.understandPhotos([{
      id: 'photo-expired', url: 'https://signed.example/expired.jpg?sig=1', capturedAt: null,
      locationName: null, caption: null, originalFilename: 'a.jpg',
    }]),
    /Photos could not be read by the AI service/,
  );
  assert.deepEqual(requestedPhotos, []);
  const skipped = logs.find((entry) => entry.event === 'deepseek.photo_skipped');
  assert.deepEqual(skipped?.data, { photoId: 'photo-expired', reason: 'HTTP 403' });
  assert.doesNotMatch(JSON.stringify(logs), /sig=1/);
});

test('DeepSeek provider probes the model when /models omits modality information', async () => {
  const calls: string[] = [];
  const responses = [
    new Response(JSON.stringify({ data: [{ id: 'deepseek-flash' }] })),
    new Response(JSON.stringify({
      error: { code: 'invalid_request_error', message: 'This model does not support image' },
    }), { status: 400 }),
  ];
  const request = (async (input: string | URL | Request) => {
    calls.push(input.toString());
    return responses.shift()!;
  }) as typeof fetch;
  const provider = new DeepSeekProvider('server-secret', 'https://api.deepseek.com', 'deepseek-flash', request);

  assert.equal(await provider.supportsVision(), false);
  assert.deepEqual(calls, [
    'https://api.deepseek.com/models',
    'https://api.deepseek.com/chat/completions',
  ]);
  // 能力未知时不让用户白点一次生成：直接返回空事实，由故事生成走元数据降级。
  assert.deepEqual(await provider.understandPhotos([{
    id: 'photo-1', url: 'https://signed.example/photo.jpg', capturedAt: null,
    locationName: null, caption: null, originalFilename: 'photo.jpg',
  }]), { facts: [], totalTokens: 0 });
});
