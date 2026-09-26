"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// cloudfunctions/export/index.ts — 相册导出（PDF 合成）
// 设计：前端 canvas 渲染"页图"（jpg）→ 上传云存储 → 本函数下载页图，
//       用 pdf-lib 按图片原始尺寸逐页合成 PDF → 上传云存储 → 返回 fileID。
//       规避中文字体嵌入问题（字体在云函数环境不可用）。
const wx_server_sdk_1 = __importDefault(require("wx-server-sdk"));
const pdf_lib_1 = require("pdf-lib");
wx_server_sdk_1.default.init({ env: wx_server_sdk_1.default.DYNAMIC_CURRENT_ENV });
exports.main = async (event) => {
    const { action } = event;
    switch (action) {
        case 'createPdf':
            return handleCreatePdf(event);
        default:
            return { code: 40001, message: `未知 action: ${action}` };
    }
};
/** 合成 PDF：album_id + 页图 fileID 数组 → { pdf_file_id, page_count } */
async function handleCreatePdf(event) {
    const db = wx_server_sdk_1.default.database();
    const { OPENID } = wx_server_sdk_1.default.getWXContext();
    const albumId = event.album_id;
    const pageFileIds = event.page_file_ids;
    if (!albumId || !Array.isArray(pageFileIds) || pageFileIds.length === 0) {
        return { code: 40001, message: '参数缺失' };
    }
    if (pageFileIds.length > 60) {
        return { code: 40001, message: '页图数量超限（最多 60 页）' };
    }
    // 权限校验：相册必须属于当前用户
    const { data: album } = await db.collection('albums').doc(albumId).get();
    if (!album || album._openid !== OPENID) {
        return { code: 40301, message: '无权操作该相册' };
    }
    // 安全校验：页图必须位于当前用户专属目录下（防止借本函数下载他人云存储文件）
    const allowedPrefix = `/export/pdf-pages/${OPENID}/`;
    for (const fid of pageFileIds) {
        if (typeof fid !== 'string' || !fid.includes(allowedPrefix)) {
            return { code: 40301, message: '页图文件非法' };
        }
    }
    try {
        const pdfBytes = await buildPdf(pageFileIds);
        const upload = await wx_server_sdk_1.default.uploadFile({
            cloudPath: `export/${OPENID}/${albumId}/${Date.now()}.pdf`,
            fileContent: Buffer.from(pdfBytes),
        });
        // 清理页图（PDF 已合成，页图不再需要）
        try {
            await wx_server_sdk_1.default.deleteFile({ fileList: pageFileIds });
        }
        catch (err) {
            console.warn('cleanup page files failed', err);
        }
        return {
            code: 0,
            data: { pdf_file_id: upload.fileID, page_count: pageFileIds.length },
        };
    }
    catch (err) {
        const e = err;
        console.error('createPdf failed', err);
        return { code: 50001, message: `PDF 合成失败: ${e.message || String(err)}` };
    }
}
/** 下载页图并逐页嵌入 PDF（页尺寸 = 图片原始尺寸） */
async function buildPdf(pageFileIds) {
    const pdfDoc = await pdf_lib_1.PDFDocument.create();
    for (const fileId of pageFileIds) {
        const { fileContent } = await wx_server_sdk_1.default.downloadFile({ fileID: fileId });
        const bytes = fileContent;
        let img;
        try {
            img = await pdfDoc.embedJpg(bytes);
        }
        catch {
            img = await pdfDoc.embedPng(bytes);
        }
        const page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    return pdfDoc.save();
}
