import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  ClipboardPaste,
  Copy,
  Download,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Printer,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatChatAsMarkdown,
  formatChatAsText,
  triggerFileDownload,
} from '../lib/chatParser';
import { COPY } from '../lib/i18n';
import {
  BLUEPRINT_LIMITS,
  CHAT_SOURCE_LABELS,
  type ChatMessage,
  type ChatSource,
  type Folder,
  type LanguageMode,
  type SavedChat,
  type SenderRole,
} from '../types/vault';

interface ChatDetailPaneProps {
  lang: LanguageMode;
  chat: SavedChat;
  messages: ChatMessage[];
  loadingMessages: boolean;
  folders: Folder[];
  onBackMobile: () => void;
  onUpdateMeta: (updates: {
    title: string;
    source: ChatSource;
    folderId: string;
    notes: string;
    tags: string[];
  }) => Promise<void>;
  onTogglePin: () => Promise<void>;
  onToggleArchive: () => Promise<void>;
  onDeleteChat: () => Promise<void>;
  onAppendMessage: (turn: {
    sender: SenderRole;
    senderLabel: string;
    content: string;
  }) => Promise<void>;
  onUpdateMessage: (
    messageId: string,
    updates: { sender: SenderRole; senderLabel: string; content: string }
  ) => Promise<void>;
  onToggleStarMessage: (messageId: string, nextStarred: boolean) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
}

const SOURCES: ChatSource[] = ['chatgpt_temp', 'gemini_temp', 'whatsapp', 'telegram', 'other'];

function formatTimestamp(ts: SavedChat['updatedAt']): string {
  if (!ts) return 'Just now';
  try {
    return ts.toDate().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Saved';
  }
}

interface ContentBlock {
  type: 'text' | 'code';
  lang?: string;
  value: string;
}

function splitMessageBlocks(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    blocks.push({
      type: 'code',
      lang: match[1] || 'code',
      value: match[2].replace(/\n$/, ''),
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    blocks.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return blocks.length > 0 ? blocks : [{ type: 'text', value: text }];
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(text: string, query: string): React.ReactNode {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const regex = new RegExp(`(${escapeRegExp(trimmed)})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, idx) =>
    part.toLowerCase() === trimmed.toLowerCase() ? (
      <mark
        key={idx}
        className="bg-amber-200 dark:bg-amber-600/60 text-slate-900 dark:text-slate-50 rounded-xs px-0.5"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function ChatDetailPane({
  lang,
  chat,
  messages,
  loadingMessages,
  folders,
  onBackMobile,
  onUpdateMeta,
  onTogglePin,
  onToggleArchive,
  onDeleteChat,
  onAppendMessage,
  onUpdateMessage,
  onToggleStarMessage,
  onDeleteMessage,
}: ChatDetailPaneProps) {
  const t = COPY[lang];

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // In-chat search & starred filter
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [inChatQuery, setInChatQuery] = useState('');
  const [messageFilter, setMessageFilter] = useState<'all' | 'starred'>('all');

  // Edit Meta state
  const [editTitle, setEditTitle] = useState(chat.title);
  const [editSource, setEditSource] = useState<ChatSource>(chat.source);
  const [editFolderId, setEditFolderId] = useState(chat.folderId);
  const [editTags, setEditTags] = useState(chat.tags.join(', '));
  const [editNotes, setEditNotes] = useState(chat.notes);
  const [savingMeta, setSavingMeta] = useState(false);

  // Inline Message Edit state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editMsgSender, setEditMsgSender] = useState<SenderRole>('user');
  const [editMsgLabel, setEditMsgLabel] = useState('');
  const [editMsgContent, setEditMsgContent] = useState('');
  const [savingMsg, setSavingMsg] = useState(false);

  // Append Composer state
  const [appendSender, setAppendSender] = useState<SenderRole>('user');
  const [appendContent, setAppendContent] = useState('');
  const [appending, setAppending] = useState(false);

  useEffect(() => {
    setEditingMeta(false);
    setConfirmDelete(false);
    setEditingMsgId(null);
    setShowInChatSearch(false);
    setInChatQuery('');
    setMessageFilter('all');
    setEditTitle(chat.title);
    setEditSource(chat.source);
    setEditFolderId(chat.folderId);
    setEditTags(chat.tags.join(', '));
    setEditNotes(chat.notes);
  }, [chat]);

  const starredCount = useMemo(
    () => messages.filter((m) => Boolean(m.isStarred)).length,
    [messages]
  );

  const visibleMessages = useMemo(() => {
    const q = inChatQuery.trim().toLowerCase();
    return messages.filter((m) => {
      if (messageFilter === 'starred' && !m.isStarred) return false;
      if (q) {
        return (
          m.content.toLowerCase().includes(q) || m.senderLabel.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [messages, messageFilter, inChatQuery]);

  const folderName = folders.find((f) => f.id === chat.folderId)?.name;

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1600);
    } catch {
      // Clipboard write unavailable
    }
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim() || savingMeta) return;
    setSavingMeta(true);
    try {
      await onUpdateMeta({
        title: editTitle,
        source: editSource,
        folderId: editFolderId,
        notes: editNotes,
        tags: editTags
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setEditingMeta(false);
    } finally {
      setSavingMeta(false);
    }
  };

  const handleAppendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appendContent.trim() || appending) return;

    const labelMap: Record<SenderRole, string> = {
      user: 'You',
      assistant: 'Assistant',
      other: 'Participant',
      note: 'Note',
    };

    setAppending(true);
    try {
      await onAppendMessage({
        sender: appendSender,
        senderLabel: labelMap[appendSender],
        content: appendContent,
      });
      setAppendContent('');
    } finally {
      setAppending(false);
    }
  };

  const handlePasteIntoAppend = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setAppendContent((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
      }
    } catch {
      // Clipboard blocked
    }
  };

  const handleSaveMessageEdit = async (e: React.FormEvent, messageId: string) => {
    e.preventDefault();
    if (!editMsgContent.trim() || savingMsg) return;
    setSavingMsg(true);
    try {
      await onUpdateMessage(messageId, {
        sender: editMsgSender,
        senderLabel: editMsgLabel.trim() || 'Message',
        content: editMsgContent,
      });
      setEditingMsgId(null);
    } finally {
      setSavingMsg(false);
    }
  };

  const handleExportMd = () => {
    const safeName = chat.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'chat';
    triggerFileDownload(`${safeName}.md`, formatChatAsMarkdown(chat, messages), 'text/markdown');
  };

  const handleExportTxt = () => {
    const safeName = chat.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'chat';
    triggerFileDownload(`${safeName}.txt`, formatChatAsText(chat, messages), 'text/plain');
  };

  return (
    <section className="flex-1 h-full bg-white dark:bg-slate-950 flex flex-col min-w-0">
      {/* Detail Header */}
      <div className="px-5 lg:px-8 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackMobile}
              aria-label="Back to chat list"
              className="no-print md:hidden mt-0.5 p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                {chat.title}
              </h1>
              {/* Zero-pill clean inline metadata */}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span>{CHAT_SOURCE_LABELS[chat.source]}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {messages.length || chat.messageCount} {t.messagesUnit}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{formatTimestamp(chat.updatedAt)}</span>
                {folderName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {folderName}
                    </span>
                  </>
                )}
                {chat.tags.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-blue-700 dark:text-blue-400">
                      {chat.tags.map((tag) => `#${tag}`).join(' ')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Controls */}
          <div className="no-print flex items-center gap-1 shrink-0 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => {
                setShowInChatSearch((v) => !v);
                if (showInChatSearch) setInChatQuery('');
              }}
              title={lang === 'en' ? 'Find inside chat' : 'Is chat mein search karein'}
              aria-label="Find inside chat"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                showInChatSearch
                  ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/70'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => void copyText('all', formatChatAsText(chat, messages))}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              {copiedKey === 'all' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedKey === 'all' ? t.copied : t.copyAll}</span>
            </button>

            <button
              type="button"
              onClick={handleExportMd}
              title="Download Markdown"
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.md</span>
            </button>

            <button
              type="button"
              onClick={handleExportTxt}
              title="Download Plain Text"
              className="hidden sm:inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.txt</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              title={lang === 'en' ? 'Print / Save PDF' : 'Print / PDF Save Karein'}
              aria-label="Print or save PDF"
              className="hidden sm:inline-flex p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => void onTogglePin()}
              title={chat.isPinned ? t.unpin : t.pin}
              aria-label={chat.isPinned ? t.unpin : t.pin}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                chat.isPinned
                  ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/70 hover:bg-blue-100'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {chat.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setEditingMeta((v) => !v)}
              title={t.edit}
              aria-label={t.edit}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                editingMeta
                  ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/70'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Pencil className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => void onToggleArchive()}
              title={chat.status === 'archived' ? t.restore : t.archive}
              aria-label={chat.status === 'archived' ? t.restore : t.archive}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            >
              {chat.status === 'archived' ? (
                <ArchiveRestore className="w-4 h-4" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
            </button>

            {confirmDelete ? (
              <div className="inline-flex items-center gap-1.5 pl-2 ml-1 border-l border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => void onDeleteChat()}
                  className="px-2.5 py-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md whitespace-nowrap cursor-pointer"
                >
                  {lang === 'en' ? 'Confirm Delete' : 'Delete Pakka'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                title={t.delete}
                aria-label={t.delete}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* In-Chat Search & Starred Filter Sub-bar */}
        {(showInChatSearch || starredCount > 0) && (
          <div className="no-print mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            {showInChatSearch ? (
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={inChatQuery}
                  onChange={(e) => setInChatQuery(e.target.value)}
                  autoFocus
                  placeholder={
                    lang === 'en'
                      ? 'Find words inside this conversation...'
                      : 'Is chat ke andar koi shabd khojein...'
                  }
                  className="w-full pl-8 pr-20 py-1.5 text-xs text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-blue-600"
                />
                {inChatQuery.trim() && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {visibleMessages.length}/{messages.length}
                  </span>
                )}
              </div>
            ) : (
              <div />
            )}

            {starredCount > 0 && (
              <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
                <button
                  type="button"
                  onClick={() => setMessageFilter('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    messageFilter === 'all'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {lang === 'en' ? 'All Turns' : 'Sabhi'} ({messages.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMessageFilter('starred')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    messageFilter === 'starred'
                      ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                  <span>
                    {lang === 'en' ? 'Starred' : 'Starred'} ({starredCount})
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Inline Metadata Edit Form */}
        {editingMeta && (
          <form
            onSubmit={(e) => void handleSaveMeta(e)}
            className="no-print mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t.titleLabel}
              </label>
              <input
                type="text"
                value={editTitle}
                maxLength={BLUEPRINT_LIMITS.CHAT_TITLE_MAX}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t.sourceLabel}
              </label>
              <select
                value={editSource}
                onChange={(e) => setEditSource(e.target.value as ChatSource)}
                className="w-full px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-blue-600"
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {CHAT_SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t.folderLabel}
              </label>
              <select
                value={editFolderId}
                onChange={(e) => setEditFolderId(e.target.value)}
                className="w-full px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-blue-600"
              >
                <option value="">{t.noFolder}</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t.tagsLabel}
              </label>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder={t.tagsPlaceholder}
                className="w-full px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t.notesLabel}
              </label>
              <textarea
                value={editNotes}
                maxLength={BLUEPRINT_LIMITS.NOTES_MAX}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="md:col-span-2 flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingMeta(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={savingMeta || !editTitle.trim()}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 rounded-md cursor-pointer"
              >
                {savingMeta ? t.saving : lang === 'en' ? 'Save Changes' : 'Changes Save Karein'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Scrollable Conversation Body */}
      <div className="flex-1 overflow-y-auto px-5 lg:px-8 py-6 space-y-5">
        {chat.notes.trim() && !editingMeta && (
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 max-w-4xl">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              {lang === 'en' ? 'Personal Notes' : 'Aapke Notes'}
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
              {chat.notes}
            </p>
          </div>
        )}

        {loadingMessages ? (
          <div className="space-y-4 max-w-4xl">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-24 rounded-lg bg-slate-100 dark:bg-slate-900 animate-pulse border border-slate-200/70 dark:border-slate-800"
              />
            ))}
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            {inChatQuery.trim()
              ? lang === 'en'
                ? 'No messages match your search inside this chat.'
                : 'Is chat mein aapki search se koi message nahi mila.'
              : messageFilter === 'starred'
              ? lang === 'en'
                ? 'No starred messages in this chat.'
                : 'Is chat mein abhi koi starred message nahi hai.'
              : lang === 'en'
              ? 'No messages in this chat yet. Add a message below.'
              : 'Is chat mein abhi koi message nahi hai. Niche se naya message jodein.'}
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl">
            {visibleMessages.map((msg) => {
              const isUserTurn = msg.sender === 'user';
              const blocks = splitMessageBlocks(msg.content);

              if (editingMsgId === msg.id) {
                return (
                  <form
                    key={msg.id}
                    onSubmit={(e) => void handleSaveMessageEdit(e, msg.id)}
                    className="border border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-950/30 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        value={editMsgSender}
                        onChange={(e) => setEditMsgSender(e.target.value as SenderRole)}
                        className="px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                      >
                        <option value="user">You</option>
                        <option value="assistant">Assistant / AI</option>
                        <option value="other">Participant</option>
                        <option value="note">Note</option>
                      </select>
                      <input
                        type="text"
                        value={editMsgLabel}
                        maxLength={BLUEPRINT_LIMITS.SENDER_LABEL_MAX}
                        onChange={(e) => setEditMsgLabel(e.target.value)}
                        className="px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                        placeholder="Speaker label"
                      />
                    </div>
                    <textarea
                      value={editMsgContent}
                      maxLength={BLUEPRINT_LIMITS.MESSAGE_CONTENT_MAX}
                      onChange={(e) => setEditMsgContent(e.target.value)}
                      rows={5}
                      className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-600"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingMsgId(null)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                      >
                        {t.cancel}
                      </button>
                      <button
                        type="submit"
                        disabled={savingMsg || !editMsgContent.trim()}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 rounded-md cursor-pointer"
                      >
                        {savingMsg ? t.saving : lang === 'en' ? 'Save Message' : 'Save Karein'}
                      </button>
                    </div>
                  </form>
                );
              }

              return (
                <article
                  key={msg.id}
                  className={`group rounded-lg border px-4 py-3.5 transition-colors ${
                    msg.isStarred
                      ? 'bg-amber-50/45 dark:bg-amber-950/20 border-amber-300/80 dark:border-amber-800/70'
                      : isUserTurn
                      ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      : 'bg-white dark:bg-slate-950 border-slate-200/90 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          msg.sender === 'assistant'
                            ? 'text-blue-700 dark:text-blue-400'
                            : isUserTurn
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {msg.senderLabel}
                      </span>
                      <span className="text-slate-400 dark:text-slate-500 font-mono tabular-nums">
                        #{msg.orderIndex + 1}
                      </span>
                      {msg.isStarred && (
                        <span className="text-amber-700 dark:text-amber-400 font-medium">
                          · {lang === 'en' ? 'Starred' : 'Important'}
                        </span>
                      )}
                    </div>

                    <div className="no-print flex items-center gap-1 opacity-75 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => void onToggleStarMessage(msg.id, !msg.isStarred)}
                        title={msg.isStarred ? 'Remove star' : 'Star key message'}
                        aria-label={msg.isStarred ? 'Remove star' : 'Star key message'}
                        className={`p-1 rounded cursor-pointer ${
                          msg.isStarred
                            ? 'text-amber-500 hover:text-amber-600'
                            : 'text-slate-400 hover:text-amber-500'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${msg.isStarred ? 'fill-amber-500' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyText(msg.id, msg.content)}
                        title="Copy message"
                        className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 rounded cursor-pointer"
                      >
                        {copiedKey === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMsgId(msg.id);
                          setEditMsgSender(msg.sender);
                          setEditMsgLabel(msg.senderLabel);
                          setEditMsgContent(msg.content);
                        }}
                        title="Edit message"
                        className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 rounded cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteMessage(msg.id)}
                        title="Delete message"
                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
                    {blocks.map((block, bIdx) =>
                      block.type === 'code' ? (
                        <div
                          key={bIdx}
                          className="rounded-lg bg-slate-900 dark:bg-slate-900 border border-slate-800 text-slate-100 overflow-hidden"
                        >
                          <div className="px-3.5 py-1.5 bg-slate-800/90 flex items-center justify-between text-xs text-slate-300 font-mono">
                            <span>{block.lang}</span>
                            <button
                              type="button"
                              onClick={() => void copyText(`${msg.id}-c-${bIdx}`, block.value)}
                              className="no-print inline-flex items-center gap-1 hover:text-white cursor-pointer"
                            >
                              {copiedKey === `${msg.id}-c-${bIdx}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>
                                {copiedKey === `${msg.id}-c-${bIdx}` ? t.copied : 'Copy'}
                              </span>
                            </button>
                          </div>
                          <pre className="p-3.5 text-xs font-mono overflow-x-auto leading-relaxed">
                            <code>{block.value}</code>
                          </pre>
                        </div>
                      ) : (
                        <p key={bIdx} className="whitespace-pre-wrap break-words">
                          {renderHighlightedText(block.value.trim(), inChatQuery)}
                        </p>
                      )
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Append Composer */}
      <form
        onSubmit={(e) => void handleAppendSubmit(e)}
        className="no-print px-5 lg:px-8 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 shrink-0"
      >
        <div className="max-w-4xl flex flex-col sm:flex-row gap-2.5">
          <select
            value={appendSender}
            onChange={(e) => setAppendSender(e.target.value as SenderRole)}
            aria-label="Message speaker"
            className="sm:w-36 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600 shrink-0"
          >
            <option value="user">You</option>
            <option value="assistant">Assistant / AI</option>
            <option value="other">Participant</option>
            <option value="note">Note</option>
          </select>

          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={appendContent}
              maxLength={BLUEPRINT_LIMITS.MESSAGE_CONTENT_MAX}
              onChange={(e) => setAppendContent(e.target.value)}
              placeholder={t.appendPlaceholder}
              className="flex-1 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
            <button
              type="button"
              onClick={() => void handlePasteIntoAppend()}
              title={t.pasteFromClipboard}
              aria-label={t.pasteFromClipboard}
              className="px-2.5 py-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            >
              <ClipboardPaste className="w-4 h-4" />
            </button>
          </div>

          <button
            type="submit"
            disabled={appending || !appendContent.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t.addMessage}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
