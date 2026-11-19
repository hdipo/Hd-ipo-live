import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, Eye, EyeOff, Pin, X } from 'lucide-react';
import { deriveTitleFromText, parseRawChatText } from '../lib/chatParser';
import { COPY } from '../lib/i18n';
import {
  BLUEPRINT_LIMITS,
  CHAT_SOURCE_LABELS,
  type ChatSource,
  type Folder,
  type LanguageMode,
  type ParsedTurn,
} from '../types/vault';

interface SaveChatModalProps {
  open: boolean;
  lang: LanguageMode;
  folders: Folder[];
  defaultFolderId: string;
  initialRawText?: string;
  initialTitle?: string;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    source: ChatSource;
    folderId: string;
    notes: string;
    tags: string[];
    turns: ParsedTurn[];
    isPinned: boolean;
  }) => Promise<void>;
}

const SOURCES: ChatSource[] = ['chatgpt_temp', 'gemini_temp', 'whatsapp', 'telegram', 'other'];

export function SaveChatModal({
  open,
  lang,
  folders,
  defaultFolderId,
  initialRawText = '',
  initialTitle = '',
  onClose,
  onSave,
}: SaveChatModalProps) {
  const t = COPY[lang];

  const [rawText, setRawText] = useState(initialRawText);
  const [title, setTitle] = useState(initialTitle);
  const [titleTouched, setTitleTouched] = useState(Boolean(initialTitle));
  const [source, setSource] = useState<ChatSource>('chatgpt_temp');
  const [folderId, setFolderId] = useState(defaultFolderId);
  const [tagsInput, setTagsInput] = useState('');
  const [notes, setNotes] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRawText(initialRawText);
      setTitle(initialTitle || (initialRawText ? deriveTitleFromText(initialRawText) : ''));
      setTitleTouched(Boolean(initialTitle));
      setFolderId(defaultFolderId);
      setTagsInput('');
      setNotes('');
      setIsPinned(false);
      setShowPreview(false);
      setClipboardError(null);
      setSubmitError(null);
    }
  }, [open, initialRawText, initialTitle, defaultFolderId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  const parsedTurns = useMemo(() => parseRawChatText(rawText), [rawText]);

  if (!open) return null;

  const handleRawChange = (value: string) => {
    setRawText(value);
    if (!titleTouched) {
      setTitle(value.trim() ? deriveTitleFromText(value) : '');
    }
  };

  const handlePasteClipboard = async () => {
    setClipboardError(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setClipboardError(lang === 'en' ? 'Clipboard is empty.' : 'Clipboard khaali hai.');
        return;
      }
      const nextText = rawText.trim() ? `${rawText.trim()}\n\n${text}` : text;
      handleRawChange(nextText);
    } catch {
      setClipboardError(
        lang === 'en'
          ? 'Browser blocked clipboard access. Press Ctrl+V / Cmd+V inside the box below.'
          : 'Browser ne clipboard access roka. Niche box mein Ctrl+V / long-press karke paste karein.'
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!rawText.trim() || parsedTurns.length === 0) {
      setSubmitError(
        lang === 'en'
          ? 'Please paste or type your temporary chat content first.'
          : 'Kripya pehle apna temporary chat content paste ya type karein.'
      );
      return;
    }

    const finalTitle = (title.trim() || deriveTitleFromText(rawText)).slice(
      0,
      BLUEPRINT_LIMITS.CHAT_TITLE_MAX
    );

    const parsedTags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    setSaving(true);
    try {
      await onSave({
        title: finalTitle,
        source,
        folderId,
        notes,
        tags: parsedTags,
        turns: parsedTurns,
        isPinned,
      });
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not save chat. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-chat-modal-title"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <h2
            id="save-chat-modal-title"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            {t.saveChat}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="p-6 space-y-5 max-h-[82vh] overflow-y-auto"
        >
          {/* Chat Content Area */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <label
                htmlFor="chat-raw-input"
                className="text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                {lang === 'en' ? 'Temporary Chat Content' : 'Temporary Chat ka Data'}
              </label>
              <div className="flex items-center gap-2">
                {parsedTurns.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {showPreview ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {showPreview
                        ? lang === 'en'
                          ? 'Edit Text'
                          : 'Text Edit Karein'
                        : `Preview (${parsedTurns.length})`}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handlePasteClipboard()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:text-blue-800 bg-blue-50 dark:bg-blue-950/70 hover:bg-blue-100/80 dark:hover:bg-blue-900/60 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>{t.pasteFromClipboard}</span>
                </button>
              </div>
            </div>

            {clipboardError && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">{clipboardError}</p>
            )}

            {showPreview ? (
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950 p-3.5 max-h-56 overflow-y-auto space-y-2.5">
                {parsedTurns.map((turn, index) => (
                  <div
                    key={`${turn.senderLabel}-${index}`}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3"
                  >
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      {turn.senderLabel}
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
                      {turn.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <textarea
                id="chat-raw-input"
                value={rawText}
                onChange={(e) => handleRawChange(e.target.value)}
                rows={7}
                placeholder={t.pastePlaceholder}
                autoFocus
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 resize-y font-sans leading-relaxed"
              />
            )}

            {parsedTurns.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-mono tabular-nums">
                {parsedTurns.length} {t.parsedTurnsHint}
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <label
              htmlFor="chat-title-input"
              className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1.5"
            >
              {t.titleLabel}
            </label>
            <input
              id="chat-title-input"
              type="text"
              value={title}
              maxLength={BLUEPRINT_LIMITS.CHAT_TITLE_MAX}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              placeholder={t.titlePlaceholder}
              className="w-full px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          {/* Source + Folder Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="chat-source-select"
                className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1.5"
              >
                {t.sourceLabel}
              </label>
              <select
                id="chat-source-select"
                value={source}
                onChange={(e) => setSource(e.target.value as ChatSource)}
                className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {CHAT_SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="chat-folder-select"
                className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1.5"
              >
                {t.folderLabel}
              </label>
              <select
                id="chat-folder-select"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="">{t.noFolder}</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags & Pin */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="chat-tags-input"
                className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1.5"
              >
                {t.tagsLabel}
              </label>
              <input
                id="chat-tags-input"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder={t.tagsPlaceholder}
                className="w-full px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600"
                />
                <Pin className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>{lang === 'en' ? 'Pin to top of vault' : 'Upar pin karke rakhein'}</span>
              </label>
            </div>
          </div>

          <div>
            <label
              htmlFor="chat-notes-input"
              className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1.5"
            >
              {t.notesLabel}
            </label>
            <textarea
              id="chat-notes-input"
              value={notes}
              maxLength={BLUEPRINT_LIMITS.NOTES_MAX}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t.notesPlaceholder}
              className="w-full px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 resize-y"
            />
          </div>

          {submitError && (
            <div className="text-sm text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-lg px-3.5 py-2.5">
              {submitError}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={saving || !rawText.trim()}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {saving ? t.saving : t.savePermanently}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
