import type { Timestamp } from 'firebase/firestore';

export type ChatSource = 'chatgpt_temp' | 'gemini_temp' | 'whatsapp' | 'telegram' | 'other';

export type FolderColor = 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo';

export type SenderRole = 'user' | 'assistant' | 'other' | 'note';

export type ChatStatus = 'active' | 'archived';

export type LanguageMode = 'en' | 'hinglish';

export type ThemeMode = 'light' | 'dark';

export interface Folder {
  id: string;
  ownerId: string;
  name: string;
  color: FolderColor;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface SavedChat {
  id: string;
  ownerId: string;
  title: string;
  source: ChatSource;
  folderId: string;
  rawContent: string;
  notes: string;
  tags: string[];
  messageCount: number;
  isPinned: boolean;
  status: ChatStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ChatMessage {
  id: string;
  ownerId: string;
  chatId: string;
  sender: SenderRole;
  senderLabel: string;
  content: string;
  orderIndex: number;
  isStarred?: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ParsedTurn {
  sender: SenderRole;
  senderLabel: string;
  content: string;
}

export const BLUEPRINT_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  ID_MAX: 128,
  FOLDER_NAME_MAX: 60,
  CHAT_TITLE_MAX: 160,
  RAW_CONTENT_MAX: 200000,
  NOTES_MAX: 10000,
  TAGS_MAX_COUNT: 10,
  TAG_MAX_LEN: 32,
  SENDER_LABEL_MAX: 50,
  MESSAGE_CONTENT_MAX: 50000,
  MAX_MESSAGES_PER_CHAT: 5000,
} as const;

export const CHAT_SOURCE_LABELS: Record<ChatSource, string> = {
  chatgpt_temp: 'Temporary AI Chat',
  gemini_temp: 'Gemini Temporary',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  other: 'Other / Notes',
};

export const FOLDER_COLORS: { id: FolderColor; label: string; dotClass: string }[] = [
  { id: 'blue', label: 'Blue', dotClass: 'bg-blue-600' },
  { id: 'slate', label: 'Slate', dotClass: 'bg-slate-600' },
  { id: 'emerald', label: 'Green', dotClass: 'bg-emerald-600' },
  { id: 'amber', label: 'Amber', dotClass: 'bg-amber-600' },
  { id: 'rose', label: 'Rose', dotClass: 'bg-rose-600' },
  { id: 'indigo', label: 'Indigo', dotClass: 'bg-indigo-600' },
];
