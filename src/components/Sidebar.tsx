import React, { useMemo, useState } from 'react';
import {
  Archive,
  Check,
  Download,
  FolderPlus,
  Hash,
  Inbox,
  LogOut,
  Moon,
  Pencil,
  Pin,
  Plus,
  Sun,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { COPY } from '../lib/i18n';
import {
  BLUEPRINT_LIMITS,
  FOLDER_COLORS,
  type Folder,
  type FolderColor,
  type LanguageMode,
  type SavedChat,
  type ThemeMode,
} from '../types/vault';

export type NavSelection =
  | { kind: 'all' }
  | { kind: 'pinned' }
  | { kind: 'archived' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'tag'; tag: string };

export type WorkspaceMode = 'ipo' | 'chats';

interface SidebarProps {
  workspace: WorkspaceMode;
  onChangeWorkspace: (mode: WorkspaceMode) => void;
  ipoCount: number;
  lang: LanguageMode;
  onChangeLang: (lang: LanguageMode) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  userDisplayName: string;
  userEmail: string;
  userPhotoURL: string | null;
  chats: SavedChat[];
  folders: Folder[];
  selection: NavSelection;
  onSelect: (selection: NavSelection) => void;
  onOpenNewChat: () => void;
  onTriggerImport: () => void;
  onExportAll: () => void;
  onCreateFolder: (name: string, color: FolderColor) => Promise<void>;
  onRenameFolder: (folderId: string, name: string, color: FolderColor) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  workspace,
  onChangeWorkspace,
  ipoCount,
  lang,
  onChangeLang,
  theme,
  onToggleTheme,
  userDisplayName,
  userEmail,
  userPhotoURL,
  chats,
  folders,
  selection,
  onSelect,
  onOpenNewChat,
  onTriggerImport,
  onExportAll,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const t = COPY[lang];

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState<FolderColor>('blue');
  const [folderBusy, setFolderBusy] = useState(false);

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<FolderColor>('blue');

  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);

  const activeChats = useMemo(() => chats.filter((c) => c.status === 'active'), [chats]);
  const pinnedCount = activeChats.filter((c) => c.isPinned).length;
  const archivedCount = chats.filter((c) => c.status === 'archived').length;

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const chat of activeChats) {
      for (const tag of chat.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 14);
  }, [activeChats]);

  const getFolderCount = (folderId: string) =>
    activeChats.filter((c) => c.folderId === folderId).length;

  const getColorDot = (color: FolderColor) =>
    FOLDER_COLORS.find((c) => c.id === color)?.dotClass ?? 'bg-slate-500';

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || folderBusy) return;
    setFolderBusy(true);
    try {
      await onCreateFolder(newFolderName.trim(), newFolderColor);
      setNewFolderName('');
      setNewFolderColor('blue');
      setCreatingFolder(false);
    } finally {
      setFolderBusy(false);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent, folderId: string) => {
    e.preventDefault();
    if (!editName.trim() || folderBusy) return;
    setFolderBusy(true);
    try {
      await onRenameFolder(folderId, editName.trim(), editColor);
      setEditingFolderId(null);
    } finally {
      setFolderBusy(false);
    }
  };

  const handleNavClick = (next: NavSelection) => {
    onSelect(next);
    onCloseMobile();
  };

  const content = (
    <aside className="no-print w-64 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col select-none">
      {/* Brand Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
          {t.appName}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="lg:hidden p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Workspace Mode Switcher + Primary Action */}
      <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => {
              onChangeWorkspace('ipo');
              onCloseMobile();
            }}
            className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              workspace === 'ipo'
                ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
            <span>Live IPO</span>
            <span className="font-mono tabular-nums text-[10px] opacity-75">{ipoCount}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeWorkspace('chats');
              onCloseMobile();
            }}
            className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              workspace === 'chats'
                ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Inbox className="w-3.5 h-3.5 shrink-0" />
            <span>{lang === 'en' ? 'Chats' : 'Chats'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            onChangeWorkspace('chats');
            onOpenNewChat();
            onCloseMobile();
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>{t.saveChat}</span>
        </button>
      </div>

      {/* Scrollable Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-6">
        {/* Core Views */}
        <nav className="space-y-1">
          <button
            type="button"
            onClick={() => handleNavClick({ kind: 'all' })}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              selection.kind === 'all'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <Inbox className="w-4 h-4 shrink-0" />
              <span className="truncate">{t.allChats}</span>
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
              {activeChats.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleNavClick({ kind: 'pinned' })}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              selection.kind === 'pinned'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <Pin className="w-4 h-4 shrink-0" />
              <span className="truncate">{t.pinned}</span>
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
              {pinnedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleNavClick({ kind: 'archived' })}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              selection.kind === 'archived'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <Archive className="w-4 h-4 shrink-0" />
              <span className="truncate">{t.archived}</span>
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
              {archivedCount}
            </span>
          </button>
        </nav>

        {/* Folders Section */}
        <div>
          <div className="px-3 mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t.folders}
            </span>
            <button
              type="button"
              onClick={() => setCreatingFolder((v) => !v)}
              title={t.newFolder}
              className="p-1 text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 rounded transition-colors cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>

          {creatingFolder && (
            <form
              onSubmit={(e) => void handleCreateSubmit(e)}
              className="mb-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2"
            >
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.FOLDER_NAME_MAX}
                placeholder={lang === 'en' ? 'Folder name...' : 'Folder ka naam...'}
                autoFocus
                className="w-full px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {FOLDER_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNewFolderColor(c.id)}
                      aria-label={c.label}
                      className={`w-4 h-4 rounded-full ${c.dotClass} cursor-pointer transition-transform ${
                        newFolderColor === c.id
                          ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-slate-100 dark:ring-offset-slate-900 scale-110'
                          : ''
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCreatingFolder(false)}
                    className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="submit"
                    disabled={folderBusy || !newFolderName.trim()}
                    className="p-1 text-blue-700 dark:text-blue-400 hover:text-blue-900 disabled:opacity-40 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </form>
          )}

          {folders.length === 0 && !creatingFolder ? (
            <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
              {lang === 'en'
                ? 'Create folders to group work, study, or personal chats.'
                : 'Work, study ya personal chats ke liye folders banayein.'}
            </p>
          ) : (
            <div className="space-y-0.5">
              {folders.map((folder) => {
                const isSelected =
                  selection.kind === 'folder' && selection.folderId === folder.id;

                if (editingFolderId === folder.id) {
                  return (
                    <form
                      key={folder.id}
                      onSubmit={(e) => void handleRenameSubmit(e, folder.id)}
                      className="p-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2"
                    >
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={BLUEPRINT_LIMITS.FOLDER_NAME_MAX}
                        autoFocus
                        className="w-full px-2 py-1 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:border-blue-600"
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {FOLDER_COLORS.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setEditColor(c.id)}
                              className={`w-3.5 h-3.5 rounded-full ${c.dotClass} cursor-pointer ${
                                editColor === c.id
                                  ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-slate-100 dark:ring-offset-slate-900'
                                  : ''
                              }`}
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingFolderId(null)}
                            className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="submit"
                            disabled={folderBusy}
                            className="p-1 text-blue-700 dark:text-blue-400 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </form>
                  );
                }

                if (confirmDeleteFolderId === folder.id) {
                  return (
                    <div
                      key={folder.id}
                      className="px-2.5 py-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-xs"
                    >
                      <p className="text-rose-800 dark:text-rose-200 font-medium mb-1.5 truncate">
                        {lang === 'en' ? `Delete "${folder.name}"?` : `"${folder.name}" delete karein?`}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteFolderId(null);
                            void onDeleteFolder(folder.id);
                          }}
                          className="px-2 py-1 bg-rose-600 text-white rounded text-xs font-medium hover:bg-rose-700 cursor-pointer"
                        >
                          {t.delete}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteFolderId(null)}
                          className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 text-xs cursor-pointer"
                        >
                          {t.cancel}
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={folder.id}
                    className={`group flex items-center justify-between gap-1 px-3 py-2 rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleNavClick({ kind: 'folder', folderId: folder.id })}
                      className="flex-1 flex items-center gap-2.5 text-sm font-medium truncate text-left cursor-pointer"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${getColorDot(folder.color)}`} />
                      <span className="truncate">{folder.name}</span>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFolderId(folder.id);
                          setEditName(folder.name);
                          setEditColor(folder.color);
                        }}
                        aria-label="Rename folder"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-opacity cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteFolderId(folder.id)}
                        aria-label="Delete folder"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500 ml-1">
                        {getFolderCount(folder.id)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tag Explorer (Auto-aggregated, zero-pill clean links) */}
        {tagCounts.length > 0 && (
          <div>
            <div className="px-3 mb-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {lang === 'en' ? 'Tags' : 'Tags'}
              </span>
            </div>
            <div className="space-y-0.5">
              {tagCounts.map(([tag, count]) => {
                const isSelected = selection.kind === 'tag' && selection.tag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleNavClick({ kind: 'tag', tag })}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Hash className="w-3 h-3 shrink-0 text-slate-400" />
                      <span className="truncate">{tag}</span>
                    </span>
                    <span className="font-mono tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Data Tools */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
          <button
            type="button"
            onClick={() => {
              onTriggerImport();
              onCloseMobile();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.importFile}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onExportAll();
              onCloseMobile();
            }}
            disabled={chats.length === 0}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.exportVault}</span>
          </button>

          <PWAInstallButton lang={lang} onActionDone={onCloseMobile} />
        </div>
      </div>

      {/* Bottom Language & User Profile */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => onChangeLang('en')}
            className={`py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              lang === 'en'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => onChangeLang('hinglish')}
            className={`py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              lang === 'hinglish'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Hinglish
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2.5 min-w-0">
            {userPhotoURL ? (
              <img
                src={userPhotoURL}
                alt={userDisplayName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 text-xs font-semibold flex items-center justify-center shrink-0">
                {(userDisplayName || userEmail || 'U').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {userDisplayName || 'Account'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {userEmail}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onSignOut()}
            title={t.signOut}
            aria-label={t.signOut}
            className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block h-full shrink-0 no-print">{content}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
