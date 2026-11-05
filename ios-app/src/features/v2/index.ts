/**
 * Trailogue 2.0 组件系统 —— iOS 侧入口。
 *
 * Phase B0 起，实现已经搬到 monorepo 共享包 `@trailogue/book`
 * （`packages/book`），因为服务端分享页、expo-print PDF 和 App 预览
 * 必须读**同一份**文档模型与渲染器，复制一份必然漂移。
 *
 * 这里保留一个转发入口而不是让 app 代码直接 import 包名，有两个用处：
 *  1. iOS 侧的 import 路径（`@/features/v2`）保持稳定，Phase C 接线时不用全量改；
 *  2. 将来若需要 iOS 特化（例如注入 `Platform` 相关的图片处理），
 *     只改这一个文件，不动包本身。
 *
 * 约束不变：本目录及其转发目标都不得 import React / React Native。
 */
export * from '@trailogue/book';
