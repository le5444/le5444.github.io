import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function compileTsModule(relativePath, name) {
  const sourcePath = new URL(relativePath, import.meta.url);
  const source = readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: sourcePath.pathname,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
      verbatimModuleSyntax: false,
    },
  }).outputText;
  const modulePath = join(tmpdir(), `zhimeng-verify-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  writeFileSync(modulePath, compiled, "utf8");
  return import(pathToFileURL(modulePath).href);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function fileLike(name, type, content) {
  const blob = new Blob([content], { type });
  return {
    name,
    type,
    size: blob.size,
    slice: (...args) => blob.slice(...args),
    arrayBuffer: () => blob.arrayBuffer(),
  };
}

const {
  CODE_TEXT_ATTACHMENT_EXTENSIONS,
  MAX_THREAD_ATTACHMENT_BYTES,
  THREAD_ATTACHMENT_ACCEPT,
  buildAgentThreadAttachmentFromFile,
  compactPreviewText,
  decodeRtfText,
  imageMimeFromName,
  isImageAttachment,
  isMetadataOnlyAttachment,
  isPdfAttachment,
  isTextLikeAttachment,
  normalizeImageDataUrlMime,
  readPdfTextPreview,
  validateAgentAttachmentFile,
} = await compileTsModule("../src/utils/agent-attachment-intake.ts", "agent-attachment-intake");

assert(CODE_TEXT_ATTACHMENT_EXTENSIONS.includes("ts"), "code extension list includes ts");
assert(THREAD_ATTACHMENT_ACCEPT.includes(".docx"), "accept list includes docx");
assertEqual(MAX_THREAD_ATTACHMENT_BYTES, 1_500_000, "attachment byte cap");
assertEqual(imageMimeFromName("screen.PNG"), "image/png", "png mime from name");
assertEqual(imageMimeFromName("photo.jpeg"), "image/jpeg", "jpeg mime from name");
assertEqual(imageMimeFromName("unknown.bin"), "", "unknown image mime");
assertEqual(normalizeImageDataUrlMime("data:;base64,AAAA", "image/png"), "data:image/png;base64,AAAA", "empty data url mime fixed");
assertEqual(normalizeImageDataUrlMime("data:application/octet-stream;base64,BBBB", "image/webp"), "data:image/webp;base64,BBBB", "octet stream image mime fixed");
assertEqual(isImageAttachment({ name: "paste.png", type: "" }), true, "image inferred from extension");
assertEqual(isImageAttachment({ name: "notes.txt", type: "text/plain" }), false, "text is not image");
assertEqual(isTextLikeAttachment({ name: "README", type: "" }), true, "readme is text-like");
assertEqual(isTextLikeAttachment({ name: "src/app.ts", type: "" }), true, "code extension is text-like");
assertEqual(isPdfAttachment({ name: "scan.pdf", type: "" }), true, "pdf inferred from extension");
assertEqual(isMetadataOnlyAttachment({ name: "legacy.doc" }), true, "legacy doc metadata only");
const validAttachmentGate = validateAgentAttachmentFile({ name: "small.txt", size: 128 });
assertEqual(validAttachmentGate.ok, true, "small attachment passes validation");
assertEqual(validAttachmentGate.reason, "ok", "small attachment validation reason");
assertEqual(validAttachmentGate.maxBytes, MAX_THREAD_ATTACHMENT_BYTES, "small attachment validation max bytes");
const oversizedAttachmentGate = validateAgentAttachmentFile({ name: "huge.png", size: MAX_THREAD_ATTACHMENT_BYTES + 1 });
assertEqual(oversizedAttachmentGate.ok, false, "oversized attachment is blocked");
assertEqual(oversizedAttachmentGate.reason, "too_large", "oversized attachment reason");
assert(oversizedAttachmentGate.detail.includes("未进入模型请求"), "oversized attachment detail names model request boundary");

const imageAttachment = await buildAgentThreadAttachmentFromFile(fileLike("shot.png", "", "fake-image"), {
  idFactory: () => "attachment-image",
  readAsDataUrl: async () => "data:;base64,AAAA",
});
assertEqual(imageAttachment.id, "attachment-image", "image attachment id");
assertEqual(imageAttachment.kind, "image", "image attachment kind");
assertEqual(imageAttachment.mimeType, "image/png", "image mime inferred");
assertEqual(imageAttachment.dataUrl, "data:image/png;base64,AAAA", "image data url fixed");
assertEqual(imageAttachment.parseStatus, "parsed", "image parse status");
assertEqual(imageAttachment.parser, "图片输入", "image parser label");
assert(imageAttachment.warning.includes("浏览器未提供 MIME"), "image warning tells inferred mime");

const textAttachment = await buildAgentThreadAttachmentFromFile(fileLike("notes.md", "text/markdown", "# 标题\n正文"), {
  idFactory: () => "attachment-text",
  readAsTextPreview: async () => "# 标题\n正文",
});
assertEqual(textAttachment.kind, "file", "text attachment kind");
assertEqual(textAttachment.parseStatus, "parsed", "text parsed");
assertEqual(textAttachment.parser, "文本片段", "markdown parser label");
assert(textAttachment.textPreview.includes("正文"), "text preview kept");

const codeAttachment = await buildAgentThreadAttachmentFromFile(fileLike("app.ts", "", "export const ok = true;"), {
  idFactory: () => "attachment-code",
  readAsTextPreview: async () => "export const ok = true;",
});
assertEqual(codeAttachment.parser, "代码片段", "code parser label");

const emptyText = await buildAgentThreadAttachmentFromFile(fileLike("empty.txt", "text/plain", ""), {
  idFactory: () => "attachment-empty",
  readAsTextPreview: async () => "",
});
assertEqual(emptyText.parseStatus, "failed", "empty text marks failed");
assert(emptyText.warning.includes("没有读取到可用内容"), "empty text warning");

const rtfText = decodeRtfText("{\\rtf1\\ansi Hello\\par \\u20320?\\u22909?}");
assert(rtfText.includes("Hello"), "rtf decodes ascii");
assert(rtfText.includes("你好"), "rtf decodes unicode");
const rtfAttachment = await buildAgentThreadAttachmentFromFile(fileLike("sample.rtf", "application/rtf", ""), {
  idFactory: () => "attachment-rtf",
  readAsTextPreview: async () => "{\\rtf1\\ansi Hello\\par \\u20320?\\u22909?}",
});
assertEqual(rtfAttachment.parseStatus, "parsed", "rtf parsed");
assertEqual(rtfAttachment.parser, "RTF 片段", "rtf parser label");
assert(rtfAttachment.warning.includes("RTF 使用浏览器端抽取"), "rtf warning");

const legacyDoc = await buildAgentThreadAttachmentFromFile(fileLike("old.doc", "application/msword", "binary"), {
  idFactory: () => "attachment-doc",
});
assertEqual(legacyDoc.parseStatus, "metadata", "legacy doc metadata");
assertEqual(legacyDoc.parser, "仅元数据", "legacy doc parser");
assert(legacyDoc.warning.includes("正文解析待接入桌面端文件解析"), "legacy doc warning");

const brokenDocx = await buildAgentThreadAttachmentFromFile(fileLike("broken.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "not zip"), {
  idFactory: () => "attachment-broken-docx",
});
assertEqual(brokenDocx.parseStatus, "failed", "broken docx failed");
assertEqual(brokenDocx.parser, "Word 片段", "broken docx parser");
assert(brokenDocx.warning.includes("解析失败"), "broken docx warning");

const pdf = fileLike("paper.pdf", "application/pdf", "%PDF-1.7\nBT (Hello PDF) Tj ET\n<4F60597D>\n");
const pdfPreview = await readPdfTextPreview(pdf);
assert(pdfPreview.includes("Hello PDF"), "pdf literal text preview");
const pdfAttachment = await buildAgentThreadAttachmentFromFile(pdf, {
  idFactory: () => "attachment-pdf",
});
assertEqual(pdfAttachment.parseStatus, "parsed", "pdf parsed");
assertEqual(pdfAttachment.parser, "PDF 片段", "pdf parser label");
assert(pdfAttachment.warning.includes("PDF 使用浏览器端轻量抽取"), "pdf warning");

const scannedPdf = await buildAgentThreadAttachmentFromFile(fileLike("scan.pdf", "application/pdf", "%PDF-1.7\n/Length 5\nstream\nabcde\nendstream"), {
  idFactory: () => "attachment-scan-pdf",
});
assertEqual(scannedPdf.parseStatus, "metadata", "scanned pdf metadata");
assertEqual(scannedPdf.parser, "PDF 元数据", "scanned pdf parser label");
assert(scannedPdf.warning.includes("需要后续桌面 OCR"), "scanned pdf warning");

const compact = compactPreviewText(["重复", "重复", "第二行"], 20);
assertEqual(compact, "重复\n第二行", "compact preview dedupes lines");

console.log("agent-attachment-intake ok");
