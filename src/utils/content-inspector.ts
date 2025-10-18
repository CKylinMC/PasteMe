import type { AiActionKind, ClipItem, HistoryFilter } from "@/types/history";
import { ClipKind } from "@/types/history";

export type ContentFeature =
  | "url"
  | "code"
  | "command"
  | "json"
  | "file-path"
  | "markdown"
  | "text";

export interface ClipboardSuggestion {
  key: string;
  labelKey: string;
  fallback: string;
  action:
    | { type: "open-url"; url: string }
    | { type: "ai"; action: AiActionKind; language?: string }
    | { type: "copy"; payload: string }
    | { type: "share"; payload: string };
}

const URL_REGEX = /https?:\/\/[^\s]+/i;
const COMMAND_REGEX = /^(?:sudo|git|npm|pnpm|yarn|bun|docker|kubectl|python|node|go|cargo|pip|brew|ssh|scp|rsync|ls|cd|rm|mv|cp|mkdir|curl|wget|tar|zip|unzip)\b/i;
const URL_PREFIX_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;
const WINDOWS_DRIVE_PATH_REGEX = /^[a-zA-Z]:[\\\/]/;
const WINDOWS_UNC_PATH_REGEX = /^\\\\[^\\\/?%*:|"<>]+\\[^\\\/?%*:|"<>]+/;
const POSIX_PATH_REGEX = /^\/(?!\/)/;
const HOME_PATH_REGEX = /^~[\\\/]/;
const JSON_START_REGEX = /^[\[{].*[\]}]$/s;

export function isLikelyFilePath(value: string): boolean {
  const text = value.trim();
  if (!text) return false;

  if (text.startsWith("file://")) {
    return true;
  }

  if (URL_PREFIX_REGEX.test(text)) {
    return false;
  }

  if (text.startsWith("./") || text.startsWith("../")) {
    return text.length > 2;
  }

  if (HOME_PATH_REGEX.test(text)) {
    return text.length > 2;
  }

  if (WINDOWS_DRIVE_PATH_REGEX.test(text)) {
    const remainder = text.slice(3);
    return remainder.trim().length > 0;
  }

  if (WINDOWS_UNC_PATH_REGEX.test(text)) {
    const segments = text.replace(/^\\\\/, "").split(/\\+/);
    return segments.length >= 2 && segments[0].length > 0 && segments[1].length > 0;
  }

  if (POSIX_PATH_REGEX.test(text)) {
    return text.length > 1 && text.includes("/");
  }

  return false;
}
const CODE_KEYWORDS = [
  "function",
  "const",
  "let",
  "var",
  "class",
  "def",
  "import ",
  "export ",
  "public ",
  "private ",
  "return ",
];

function detectFeaturesFromText(content: string): Set<ContentFeature> {
  const features = new Set<ContentFeature>();
  const text = content.trim();
  if (!text) {
    return features;
  }
  features.add("text");

  if (URL_REGEX.test(text)) {
    features.add("url");
  }

  if (isLikelyFilePath(text)) {
    features.add("file-path");
  }

  if (JSON_START_REGEX.test(text)) {
    try {
      JSON.parse(text);
      features.add("json");
    } catch (error) {
      // ignore parsing failure
    }
  }

  const multiLine = text.includes("\n");
  const hasCodeFence = text.includes("```") || text.includes("<code>");
  const hasKeyword = CODE_KEYWORDS.some(keyword => text.includes(keyword));
  if (multiLine && (hasKeyword || hasCodeFence)) {
    features.add("code");
  }

  if (COMMAND_REGEX.test(text) && text.length < 400) {
    features.add("command");
  }

  if (/^#{1,6}\s+/.test(text) || text.includes("* ")) {
    features.add("markdown");
  }

  return features;
}

export function extractFeaturesFromClip(item: ClipItem): Set<ContentFeature> {
  if (item.kind === ClipKind.Image) {
    return new Set();
  }
  if (item.kind === ClipKind.File) {
    const features = new Set<ContentFeature>(["file-path"]);
    const normalized = item.content.trim();
    if (URL_REGEX.test(normalized)) {
      features.add("url");
    }
    return features;
  }
  return detectFeaturesFromText(item.content);
}

export function buildClipboardSuggestions(content: string): ClipboardSuggestion[] {
  const text = content.trim();
  if (!text) return [];
  const features = detectFeaturesFromText(text);
  const suggestions: ClipboardSuggestion[] = [];

  if (features.has("url")) {
    const urlMatch = text.match(URL_REGEX);
    const url = urlMatch?.[0] ?? text;
    suggestions.push({
      key: "open-url",
      labelKey: "clipboard.openLink",
      fallback: "打开链接",
      action: { type: "open-url", url },
    });
    suggestions.push({
      key: "summarize-link",
      labelKey: "clipboard.summarizeLink",
      fallback: "AI 摘要网页",
      action: { type: "ai", action: "summarize" },
    });
  }

  if (features.has("code")) {
    suggestions.push({
      key: "explain-code",
      labelKey: "clipboard.analyzeCode",
      fallback: "AI 代码解释",
      action: { type: "ai", action: "summarize" },
    });
  }

  if (features.has("command")) {
    suggestions.push({
      key: "copy-command",
      labelKey: "clipboard.runCommand",
      fallback: "复制命令",
      action: { type: "copy", payload: text },
    });
  }

  if (features.has("file-path")) {
    suggestions.push({
      key: "copy-path",
      labelKey: "clipboard.copyPath",
      fallback: "复制文件路径",
      action: { type: "copy", payload: text },
    });
  }

  if (features.has("markdown")) {
    suggestions.push({
      key: "share-markdown",
      labelKey: "clipboard.shareSnippet",
      fallback: "复制分享片段",
      action: { type: "share", payload: text },
    });
  }

  if (!features.has("url")) {
    suggestions.push({
      key: "translate",
      labelKey: "clipboard.translateText",
      fallback: "AI 翻译内容",
      action: { type: "ai", action: "translate" },
    });
  }

  suggestions.push({
    key: "polish",
    labelKey: "clipboard.polishText",
    fallback: "AI 润色表达",
    action: { type: "ai", action: "polish" },
  });

  return suggestions;
}

export function clipMatchesFilter(item: ClipItem, filter: HistoryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "pinned") return item.isPinned;
  if (filter === "favorites") return item.isFavorite;
  if (filter === "text") return item.kind === ClipKind.Text;
  if (filter === "images") return item.kind === ClipKind.Image;
  if (filter === "files") return item.kind === ClipKind.File;

  const features = extractFeaturesFromClip(item);
  switch (filter) {
    case "links":
      return features.has("url");
    case "code":
      return features.has("code");
    case "commands":
      return features.has("command");
    case "json":
      return features.has("json");
    default:
      return true;
  }
}
