export const MAX_THREAD_ATTACHMENTS = 6;
export const MAX_THREAD_ATTACHMENT_BYTES = 1_500_000;
export const MAX_THREAD_ATTACHMENT_TEXT = 6000;

export const CODE_TEXT_ATTACHMENT_EXTENSIONS = [
  "md",
  "mdx",
  "txt",
  "json",
  "jsonc",
  "jsonl",
  "csv",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "vue",
  "svelte",
  "py",
  "pyw",
  "java",
  "kt",
  "kts",
  "go",
  "rs",
  "c",
  "h",
  "cpp",
  "cc",
  "cxx",
  "hpp",
  "cs",
  "php",
  "rb",
  "swift",
  "dart",
  "scala",
  "r",
  "lua",
  "sql",
  "css",
  "scss",
  "sass",
  "less",
  "html",
  "htm",
  "xml",
  "svg",
  "yml",
  "yaml",
  "toml",
  "ini",
  "env",
  "properties",
  "conf",
  "config",
  "log",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "cmd",
  "dockerfile",
  "gitignore",
  "gitattributes",
  "editorconfig",
].sort();

export const THREAD_ATTACHMENT_ACCEPT = [
  "image/*",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".heic",
  ".heif",
  ...CODE_TEXT_ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`),
  ".rtf",
  ".docx",
  ".pdf",
  ".doc",
  ".xlsx",
  ".xls",
  ".pptx",
  ".ppt",
].join(",");

export interface AgentAttachmentIntakeFileLike {
  name: string;
  type: string;
  size: number;
  slice: (start?: number, end?: number, contentType?: string) => Blob;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export interface AgentThreadMessageAttachmentLike {
  id: string;
  kind: "image" | "file";
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  textPreview?: string;
  parseStatus?: "parsed" | "metadata" | "failed";
  parser?: string;
  warning?: string;
}

export interface AgentAttachmentIntakeOptions {
  idFactory?: () => string;
  maxTextChars?: number;
  readAsDataUrl?: (file: AgentAttachmentIntakeFileLike) => Promise<string>;
  readAsTextPreview?: (file: AgentAttachmentIntakeFileLike, maxChars: number) => Promise<string>;
  readAsArrayBuffer?: (file: AgentAttachmentIntakeFileLike) => Promise<ArrayBuffer>;
}

export interface AgentAttachmentValidationResult {
  ok: boolean;
  reason: "ok" | "too_large";
  detail: string;
  maxBytes: number;
}

function makeAttachmentId(options: AgentAttachmentIntakeOptions) {
  return options.idFactory?.() || `attachment-${Math.random().toString(36).slice(2, 10)}`;
}

export function imageMimeFromName(name: string) {
  const normalized = name.toLowerCase();
  if (/\.(jpg|jpeg)$/i.test(normalized)) return "image/jpeg";
  if (/\.png$/i.test(normalized)) return "image/png";
  if (/\.webp$/i.test(normalized)) return "image/webp";
  if (/\.gif$/i.test(normalized)) return "image/gif";
  if (/\.bmp$/i.test(normalized)) return "image/bmp";
  if (/\.avif$/i.test(normalized)) return "image/avif";
  if (/\.heic$/i.test(normalized)) return "image/heic";
  if (/\.heif$/i.test(normalized)) return "image/heif";
  if (/\.svg$/i.test(normalized)) return "image/svg+xml";
  return "";
}

export function isImageAttachment(file: Pick<AgentAttachmentIntakeFileLike, "name" | "type">) {
  return file.type.toLowerCase().startsWith("image/") || Boolean(imageMimeFromName(file.name));
}

export function normalizeImageDataUrlMime(dataUrl: string, mimeType: string) {
  if (!dataUrl || !mimeType) return dataUrl;
  if (/^data:;base64,/i.test(dataUrl)) return dataUrl.replace(/^data:;base64,/i, `data:${mimeType};base64,`);
  if (mimeType.startsWith("image/") && /^data:application\/octet-stream;base64,/i.test(dataUrl)) {
    return dataUrl.replace(/^data:application\/octet-stream;base64,/i, `data:${mimeType};base64,`);
  }
  return dataUrl;
}

export function isTextLikeAttachment(file: Pick<AgentAttachmentIntakeFileLike, "name" | "type">) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() || "" : name;
  const basename = name.replace(/^.*[\\/]/, "");
  return mime.startsWith("text/")
    || mime.includes("json")
    || mime.includes("xml")
    || mime.includes("yaml")
    || CODE_TEXT_ATTACHMENT_EXTENSIONS.includes(extension)
    || ["dockerfile", "makefile", "rakefile", "gemfile", "procfile", "license", "readme"].includes(basename);
}

export function isRtfAttachment(file: Pick<AgentAttachmentIntakeFileLike, "name" | "type">) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return mime.includes("rtf") || /\.rtf$/i.test(name);
}

export function isDocxAttachment(file: Pick<AgentAttachmentIntakeFileLike, "name" | "type">) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return mime.includes("wordprocessingml.document") || /\.docx$/i.test(name);
}

export function isXlsxAttachment(file: Pick<AgentAttachmentIntakeFileLike, "name" | "type">) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return mime.includes("spreadsheetml.sheet") || /\.xlsx$/i.test(name);
}

export function isPptxAttachment(file: Pick<AgentAttachmentIntakeFileLike, "name" | "type">) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return mime.includes("presentationml.presentation") || /\.pptx$/i.test(name);
}

export function isPdfAttachment(file: Pick<AgentAttachmentIntakeFileLike, "name" | "type">) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return mime.includes("pdf") || /\.pdf$/i.test(name);
}

export function isMetadataOnlyAttachment(file: Pick<AgentAttachmentIntakeFileLike, "name">) {
  return /\.(doc|xls|ppt)$/i.test(file.name.toLowerCase());
}

export function validateAgentAttachmentFile(
  file: Pick<AgentAttachmentIntakeFileLike, "name" | "size">,
  maxBytes = MAX_THREAD_ATTACHMENT_BYTES,
): AgentAttachmentValidationResult {
  const safeMaxBytes = Math.max(0, Math.floor(maxBytes));
  if (file.size > safeMaxBytes) {
    return {
      ok: false,
      reason: "too_large",
      detail: `${file.name} 超过 ${safeMaxBytes} bytes，未进入模型请求。`,
      maxBytes: safeMaxBytes,
    };
  }
  return {
    ok: true,
    reason: "ok",
    detail: "附件大小可进入解析队列。",
    maxBytes: safeMaxBytes,
  };
}

export async function readFileAsDataUrl(file: AgentAttachmentIntakeFileLike) {
  if (typeof FileReader !== "undefined") {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
      reader.readAsDataURL(file as unknown as Blob);
    });
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const base64 = typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(bytes).toString("base64");
  return `data:${file.type || ""};base64,${base64}`;
}

export async function readFileAsTextPreview(file: AgentAttachmentIntakeFileLike, maxChars = MAX_THREAD_ATTACHMENT_TEXT) {
  const slice = file.slice(0, maxChars);
  if (typeof FileReader !== "undefined") {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsText(slice);
    });
  }
  return slice.text().catch(() => "");
}

export async function readFileAsArrayBuffer(file: AgentAttachmentIntakeFileLike) {
  return file.arrayBuffer();
}

function xmlTextDecode(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function readLeUint16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readLeUint32(bytes: Uint8Array, offset: number) {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0;
}

interface ZipTextEntry {
  name: string;
  compression: number;
  compressedSize: number;
  dataOffset: number;
}

function findZipEndOfCentralDirectory(bytes: Uint8Array) {
  const min = Math.max(0, bytes.length - 66000);
  for (let offset = bytes.length - 22; offset >= min; offset -= 1) {
    if (readLeUint32(bytes, offset) === 0x06054b50) return offset;
  }
  return -1;
}

export function parseZipTextEntries(bytes: Uint8Array): ZipTextEntry[] {
  const endOffset = findZipEndOfCentralDirectory(bytes);
  if (endOffset < 0) throw new Error("未找到 Office zip 目录。");
  const entryCount = readLeUint16(bytes, endOffset + 10);
  let offset = readLeUint32(bytes, endOffset + 16);
  const decoder = new TextDecoder("utf-8");
  const entries: ZipTextEntry[] = [];
  for (let i = 0; i < entryCount && offset + 46 <= bytes.length; i += 1) {
    if (readLeUint32(bytes, offset) !== 0x02014b50) break;
    const compression = readLeUint16(bytes, offset + 10);
    const compressedSize = readLeUint32(bytes, offset + 20);
    const nameLength = readLeUint16(bytes, offset + 28);
    const extraLength = readLeUint16(bytes, offset + 30);
    const commentLength = readLeUint16(bytes, offset + 32);
    const localHeaderOffset = readLeUint32(bytes, offset + 42);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength)).replace(/\\/g, "/");
    const localNameLength = readLeUint16(bytes, localHeaderOffset + 26);
    const localExtraLength = readLeUint16(bytes, localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (readLeUint32(bytes, localHeaderOffset) === 0x04034b50 && dataOffset + compressedSize <= bytes.length) {
      entries.push({ name, compression, compressedSize, dataOffset });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export async function inflateZipEntry(bytes: Uint8Array, entry: ZipTextEntry) {
  const raw = bytes.slice(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.compression === 0) return raw;
  if (entry.compression !== 8) throw new Error(`不支持的 zip 压缩方式：${entry.compression}`);
  const DecompressionStreamCtor = (globalThis as unknown as {
    DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array>;
  }).DecompressionStream;
  if (!DecompressionStreamCtor) throw new Error("当前浏览器不支持 zip deflate 解压。");
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStreamCtor("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function extractTagText(xml: string, localNames: string[]) {
  const names = localNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`<(?:(?:[\\w-]+):)?(?:${names})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[\\w-]+):)?(?:${names})>`, "g");
  return Array.from(xml.matchAll(pattern))
    .map((match) => xmlTextDecode(match[1]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractParagraphText(xml: string, paragraphPattern: RegExp, textTags: string[]) {
  const blocks = Array.from(xml.matchAll(paragraphPattern))
    .map((match) => extractTagText(match[0], textTags).join(""))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return blocks.length ? blocks : extractTagText(xml, textTags);
}

export function compactPreviewText(lines: string[], maxTextChars = MAX_THREAD_ATTACHMENT_TEXT) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const cleaned = line.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const key = cleaned.slice(0, 160);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.join("\n").length >= maxTextChars) break;
  }
  return result.join("\n").slice(0, maxTextChars);
}

function extractOfficeXmlText(xml: string, kind: "docx" | "xlsx" | "pptx", entryName: string) {
  if (kind === "docx") {
    return extractParagraphText(xml, /<w:p[\s\S]*?<\/w:p>/g, ["t"]);
  }
  if (kind === "pptx") {
    return extractParagraphText(xml, /<a:p[\s\S]*?<\/a:p>/g, ["t"]);
  }
  const text = extractTagText(xml, ["t"]);
  if (text.length || entryName.includes("sharedStrings")) return text;
  return extractTagText(xml, ["v"]).slice(0, 200);
}

export async function readOfficeXmlTextPreview(
  file: AgentAttachmentIntakeFileLike,
  kind: "docx" | "xlsx" | "pptx",
  options: Pick<AgentAttachmentIntakeOptions, "readAsArrayBuffer" | "maxTextChars"> = {},
) {
  const maxTextChars = options.maxTextChars || MAX_THREAD_ATTACHMENT_TEXT;
  const bytes = new Uint8Array(await (options.readAsArrayBuffer || readFileAsArrayBuffer)(file));
  const entries = parseZipTextEntries(bytes);
  const selected = entries.filter((entry) => {
    const name = entry.name.toLowerCase();
    if (kind === "docx") return /^word\/(document|footnotes|endnotes|header\d*|footer\d*)\.xml$/.test(name);
    if (kind === "pptx") return /^ppt\/slides\/slide\d+\.xml$/.test(name);
    return name === "xl/sharedstrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name);
  }).sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  const decoder = new TextDecoder("utf-8");
  const chunks: string[] = [];
  for (const entry of selected.slice(0, 80)) {
    const xml = decoder.decode(await inflateZipEntry(bytes, entry));
    const entryText = compactPreviewText(extractOfficeXmlText(xml, kind, entry.name), maxTextChars);
    if (!entryText) continue;
    if (kind === "docx") chunks.push(entryText);
    else chunks.push(`${entry.name}\n${entryText}`);
    if (chunks.join("\n\n").length >= maxTextChars) break;
  }
  return chunks.join("\n\n").slice(0, maxTextChars);
}

function decodePdfLiteralString(value: string) {
  return value
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function decodePdfHexString(value: string) {
  const hex = value.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length < 4) return "";
  const evenHex = hex.length % 2 ? `${hex}0` : hex;
  const bytes: number[] = [];
  for (let i = 0; i < evenHex.length; i += 2) {
    bytes.push(parseInt(evenHex.slice(i, i + 2), 16));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return text.replace(/\s+/g, " ").trim();
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    let text = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      text += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
    }
    return text.replace(/\s+/g, " ").trim();
  }
  const byteArray = new Uint8Array(bytes);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(byteArray).replace(/\s+/g, " ").trim();
  if (/[\p{L}\p{N}\u4e00-\u9fff]/u.test(utf8)) return utf8;
  return new TextDecoder("latin1").decode(byteArray).replace(/\s+/g, " ").trim();
}

function looksLikeUsefulPdfText(text: string) {
  if (!/[\p{L}\p{N}\u4e00-\u9fff]/u.test(text)) return false;
  if (/^D:\d{8,}/.test(text)) return false;
  if (/^[A-Z0-9+/_=-]{18,}$/.test(text)) return false;
  if (/^[\d\s.,:;()/-]{1,24}$/.test(text)) return false;
  return text.length >= 2;
}

export async function readPdfTextPreview(
  file: AgentAttachmentIntakeFileLike,
  options: Pick<AgentAttachmentIntakeOptions, "readAsArrayBuffer" | "maxTextChars"> = {},
) {
  const maxTextChars = options.maxTextChars || MAX_THREAD_ATTACHMENT_TEXT;
  const bytes = new Uint8Array(await (options.readAsArrayBuffer || readFileAsArrayBuffer)(file));
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes.slice(0, Math.min(bytes.length, 1_200_000)));
  const literalTexts = Array.from(raw.matchAll(/\((?:\\.|[^\\()]){2,}\)/g))
    .map((match) => decodePdfLiteralString(match[0].slice(1, -1)))
    .filter(looksLikeUsefulPdfText);
  const hexTexts = Array.from(raw.matchAll(/<([0-9a-fA-F\s]{4,})>/g))
    .map((match) => decodePdfHexString(match[1]))
    .filter(looksLikeUsefulPdfText);
  const textOperatorBlocks = Array.from(raw.matchAll(/(?:\[(?:\s*(?:\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]+>|-?\d+(?:\.\d+)?)\s*)+\]\s*TJ|(?:\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]+>)\s*Tj)/g))
    .flatMap((match) => {
      const block = match[0];
      return [
        ...Array.from(block.matchAll(/\((?:\\.|[^\\()])*\)/g)).map((item) => decodePdfLiteralString(item[0].slice(1, -1))),
        ...Array.from(block.matchAll(/<([0-9a-fA-F\s]{4,})>/g)).map((item) => decodePdfHexString(item[1])),
      ];
    })
    .filter(looksLikeUsefulPdfText);
  return compactPreviewText([...textOperatorBlocks, ...literalTexts, ...hexTexts], maxTextChars);
}

function rtfUnicodeChar(code: number) {
  const normalized = code < 0 ? code + 65536 : code;
  if (normalized < 0 || normalized > 0x10ffff) return "";
  return String.fromCodePoint(normalized);
}

export function decodeRtfText(raw: string, maxTextChars = MAX_THREAD_ATTACHMENT_TEXT) {
  const text = raw
    .replace(/\\u(-?\d+)(?:\s|\?)?/g, (_, code: string) => {
      return rtfUnicodeChar(Number(code));
    })
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\(?:par|line)\b\s?/g, "\n")
    .replace(/\\tab\b\s?/g, "\t")
    .replace(/\\[{}\\]/g, (match) => match.slice(1))
    .replace(/{\\\*?\\(?:fonttbl|colortbl|stylesheet|info|pict|object|datastore|themedata)[\s\S]*?}\s*/gi, "")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "");
  return compactPreviewText(text.split(/\r?\n/).map((line) => line.trim()), maxTextChars);
}

export async function readRtfTextPreview(
  file: AgentAttachmentIntakeFileLike,
  options: Pick<AgentAttachmentIntakeOptions, "readAsTextPreview" | "maxTextChars"> = {},
) {
  const maxTextChars = options.maxTextChars || MAX_THREAD_ATTACHMENT_TEXT;
  const raw = await (options.readAsTextPreview || readFileAsTextPreview)(file, maxTextChars);
  return decodeRtfText(raw, maxTextChars);
}

export async function buildAgentThreadAttachmentFromFile(
  file: AgentAttachmentIntakeFileLike,
  options: AgentAttachmentIntakeOptions = {},
): Promise<AgentThreadMessageAttachmentLike> {
  const maxTextChars = options.maxTextChars || MAX_THREAD_ATTACHMENT_TEXT;
  const inferredImageMime = imageMimeFromName(file.name);
  const isImage = isImageAttachment(file);
  const effectiveMimeType = file.type || inferredImageMime || "application/octet-stream";
  let textPreview = "";
  let parseStatus: AgentThreadMessageAttachmentLike["parseStatus"] = isImage ? "parsed" : "metadata";
  let parser = isImage ? "图片输入" : "仅元数据";
  let warning = isImage && !file.type && inferredImageMime
    ? `浏览器未提供 MIME，已按扩展名识别为 ${inferredImageMime} 并作为多模态图片发送。`
    : "";

  if (!isImage && isRtfAttachment(file)) {
    textPreview = await readRtfTextPreview(file, options);
    parseStatus = textPreview ? "parsed" : "failed";
    parser = "RTF 片段";
    warning = textPreview ? "RTF 使用浏览器端抽取，只保留可读文本片段。" : "未从 RTF 中抽取到可读文本。";
  } else if (!isImage && (isDocxAttachment(file) || isXlsxAttachment(file) || isPptxAttachment(file))) {
    const officeKind = isDocxAttachment(file) ? "docx" : isXlsxAttachment(file) ? "xlsx" : "pptx";
    const parserLabel = officeKind === "docx" ? "Word 片段" : officeKind === "xlsx" ? "Excel 片段" : "PPT 片段";
    try {
      textPreview = await readOfficeXmlTextPreview(file, officeKind, options);
      parseStatus = textPreview ? "parsed" : "failed";
      parser = parserLabel;
      warning = textPreview ? `${parserLabel}使用浏览器端抽取，只保留可读文本片段。` : `${parserLabel}暂未抽取到正文；后续可接桌面解析。`;
    } catch (error) {
      parseStatus = "failed";
      parser = parserLabel;
      warning = error instanceof Error ? `${parserLabel}解析失败：${error.message}` : `${parserLabel}解析失败。`;
    }
  } else if (!isImage && isTextLikeAttachment(file)) {
    textPreview = await (options.readAsTextPreview || readFileAsTextPreview)(file, maxTextChars);
    parseStatus = textPreview ? "parsed" : "failed";
    parser = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|java|kt|go|rs|c|h|cpp|cc|cxx|hpp|cs|php|rb|swift|dart|scala|r|lua|sql|css|scss|sass|less|html|htm|xml|svg|yml|yaml|toml|ini|env|properties|conf|config|sh|bash|zsh|fish|ps1|bat|cmd|dockerfile)$/i.test(file.name)
      || /^(dockerfile|makefile|rakefile|gemfile|procfile)$/i.test(file.name)
      ? "代码片段"
      : "文本片段";
    warning = textPreview ? "" : "文件可识别为文本，但没有读取到可用内容。";
  } else if (!isImage && isPdfAttachment(file)) {
    try {
      textPreview = await readPdfTextPreview(file, options);
      parseStatus = textPreview ? "parsed" : "metadata";
      parser = textPreview ? "PDF 片段" : "PDF 元数据";
      warning = textPreview
        ? "PDF 使用浏览器端轻量抽取，只保留可读文本片段；扫描版或压缩复杂 PDF 后续接桌面解析。"
        : "未从 PDF 中抽取到可读文本；如果是扫描件，需要后续桌面 OCR / PDF 解析。";
    } catch (error) {
      parseStatus = "failed";
      parser = "PDF 片段";
      warning = error instanceof Error ? `PDF 解析失败：${error.message}` : "PDF 解析失败。";
    }
  } else if (!isImage && isMetadataOnlyAttachment(file)) {
    parseStatus = "metadata";
    parser = "仅元数据";
    warning = "当前浏览器端只传文件名、类型和大小；正文解析待接入桌面端文件解析。";
  }

  const dataUrl = isImage
    ? normalizeImageDataUrlMime(await (options.readAsDataUrl || readFileAsDataUrl)(file), effectiveMimeType)
    : "";

  return {
    id: makeAttachmentId(options),
    kind: isImage ? "image" : "file",
    name: file.name,
    mimeType: effectiveMimeType,
    size: file.size,
    dataUrl: dataUrl || undefined,
    textPreview: textPreview || undefined,
    parseStatus,
    parser,
    warning: warning || undefined,
  };
}
