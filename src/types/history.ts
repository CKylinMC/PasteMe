export enum ClipKind {
  Text = 1,
  Image = 2,
  File = 3,
}

export interface ClipItem {
  id: number;
  kind: ClipKind;
  content: string;
  contentHash: string;
  preview?: string | null;
  extra?: string | null;
  isPinned: boolean;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClipboardDraftPayload {
  kind: ClipKind;
  text?: string;
  imageBase64?: string;
  filePath?: string;
  preview?: string;
  extra?: string;
  isPinned?: boolean;
  isFavorite?: boolean;
}

export type HistoryFilter =
  | "all"
  | "pinned"
  | "favorites"
  | "text"
  | "images"
  | "files"
  | "links"
  | "code"
  | "commands"
  | "json";

export type AiActionKind =
  | "translate"
  | "summarize"
  | "polish"
  | "jsonify"
  | "custom";

export interface AiActionRequest {
  action: AiActionKind;
  input: string;
  language?: string;
  customPrompt?: string;
  apiKey: string;
  baseUrl: string;
  model?: string;
  temperature?: number;
}

export interface AiActionResponse {
  result: string;
  used_prompt: string;
  finished_at: string;
}

export interface HistoryExportPayload {
  exported_at: number;
  items: ClipItem[];
}
