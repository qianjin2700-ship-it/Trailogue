import { loadApiConfig } from '@trailogue/config';
import {
  createDatabase,
  BookRepository,
  PhotoRepository,
  SessionRepository,
  ShareLinkRepository,
  StoryRepository,
  TripRepository,
  UserRepository,
} from '@trailogue/database';

import { buildApp } from './app.js';
import type { ProviderLogger } from './modules/stories/deepSeekProvider.js';
import { AppleJwksIdentityVerifier } from './modules/auth/appleIdentityVerifier.js';
import { PostgresAppleUserResolver } from './modules/auth/appleUserResolver.js';
import { TrailogueAuthenticationService } from './modules/auth/authService.js';
import { SessionService } from './modules/auth/sessionService.js';
import { PhotoService } from './modules/photos/photoService.js';
import { R2PhotoStorage } from './modules/photos/r2PhotoStorage.js';
import { TripService } from './modules/trips/tripService.js';
import { DeepSeekProvider } from './modules/stories/deepSeekProvider.js';
import { StoryService } from './modules/stories/storyService.js';
import { ShareService } from './modules/shares/shareService.js';
import { UserService } from './modules/users/userService.js';

const config = loadApiConfig();
/**
 * 诊断日志出口：app 实例在服务构造之后才存在，因此用延迟绑定。
 * 只输出结构化事件名 + 元数据（模型、状态码、上游错误码、照片 id/数量）；
 * 绝不输出 API Key、Bearer Token、图片 base64 或带签名的完整 URL。
 */
let logSink: ((event: string, data: Record<string, unknown>) => void) | null = null;
const providerLogger: ProviderLogger = (event, data) => {
  if (logSink) logSink(event, data);
  else console.log(JSON.stringify({ event, ...data }));
};
const database = createDatabase(config.DATABASE_URL);
const sessions = new SessionService(
  new SessionRepository(database.executor),
  config.SESSION_SECRET,
  config.SESSION_TTL_SECONDS,
);
const authentication = new TrailogueAuthenticationService(
  new AppleJwksIdentityVerifier(config.APPLE_BUNDLE_ID),
  new PostgresAppleUserResolver(database.withTransaction),
  sessions,
);
const tripRepository = new TripRepository(database.executor);
const photoRepository = new PhotoRepository(database.executor);
const userRepository = new UserRepository(database.executor);
const photoStorage = new R2PhotoStorage(config.R2_BUCKET, {
  endpoint: config.R2_ENDPOINT,
  accessKeyId: config.R2_ACCESS_KEY_ID,
  secretAccessKey: config.R2_SECRET_ACCESS_KEY,
});
const photos = new PhotoService({
  photos: photoRepository,
  trips: tripRepository,
  storage: photoStorage,
  maxBytes: config.PHOTO_MAX_BYTES,
  uploadUrlTtlSeconds: config.R2_UPLOAD_URL_TTL_SECONDS,
  readUrlTtlSeconds: config.R2_READ_URL_TTL_SECONDS,
});
const trips = new TripService(tripRepository, photoRepository, photoStorage);
const stories = new StoryService({
  trips: tripRepository,
  users: userRepository,
  photos: photoRepository,
  stories: new StoryRepository(database.executor),
  books: new BookRepository(database.executor),
  storage: photoStorage,
  provider: new DeepSeekProvider(
    config.DEEPSEEK_API_KEY,
    config.DEEPSEEK_BASE_URL,
    config.DEEPSEEK_MODEL,
    fetch,
    {
      logger: providerLogger,
      // 生产环境启用「能不能被外部匿名抓取」预检；测试注入自定义 request 时不影响。
      imageFetch: fetch,
    },
  ),
  readUrlTtlSeconds: config.R2_READ_URL_TTL_SECONDS,
  logger: providerLogger,
});
const users = new UserService(
  userRepository,
  photoRepository,
  photoStorage,
);
const shares = new ShareService(
  new ShareLinkRepository(database.executor),
  tripRepository,
  new StoryRepository(database.executor),
  photoRepository,
  photoStorage,
  config.APP_BASE_URL,
  config.R2_READ_URL_TTL_SECONDS,
);
const app = await buildApp({
  readiness: database,
  services: {
    authentication,
    sessions,
    users,
    trips,
    photos,
    stories,
    shares,
  },
  logger: {
    level: config.NODE_ENV === 'development' || config.NODE_ENV === 'test' ? 'debug' : 'info',
    redact: ['req.headers.authorization'],
  },
});

// app 就绪后把诊断日志接到 Fastify 的结构化日志（Railway 中可按 event 名检索）。
logSink = (event, data) => {
  app.log.info({ event, ...data }, event);
};

const shutdown = async () => {
  await app.close();
  await database.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await app.listen({ host: '0.0.0.0', port: config.PORT });
