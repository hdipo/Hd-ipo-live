import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  Archive,
  CheckSquare,
  ClipboardPaste,
  Download,
  FolderInput,
  Menu,
  MessageSquareText,
  Pin,
  Plus,
  Search,
  Square,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { ChatDetailPane } from './components/ChatDetailPane';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LiveIpoWorkspace } from './components/LiveIpoWorkspace';
import { OfflineIndicator } from './components/PWAInstallButton';
import { SaveChatModal } from './components/SaveChatModal';
import { Sidebar, type NavSelection, type WorkspaceMode } from './components/Sidebar';
import {
  deriveTitleFromText,
  parseRawChatText,
  triggerFileDownload,
} from './lib/chatParser';
import { auth, googleProvider } from './lib/firebase';
import { COPY } from './lib/i18n';
import {
  createIpoEntry,
  deleteIpoEntry,
  quickUpdateIpoStage,
  subscribeToIpoEntries,
  updateIpoEntry,
} from './lib/ipoService';
import {
  appendMessageToChat,
  bulkDeleteChats,
  bulkMoveChatsToFolder,
  bulkSetChatsStatus,
  createFolder,
  createSavedChat,
  deleteFolderAndUnassignChats,
  deleteMessageFromChat,
  deleteSavedChatWithMessages,
  setChatStatus,
  subscribeToChatMessages,
  subscribeToChats,
  subscribeToFolders,
  toggleChatPin,
  toggleMessageStar,
  updateFolder,
  updateMessageContent,
  updateSavedChatMeta,
} from './lib/vaultService';
import {
  CHAT_SOURCE_LABELS,
  type ChatMessage,
  type ChatSource,
  type Folder,
  type LanguageMode,
  type ParsedTurn,
  type SavedChat,
  type ThemeMode,
} from './types/vault';
import type { IpoEntry } from './types/ipo';

type SourceFilter = 'all' | ChatSource;
type SortMode = 'newest' | 'oldest' | 'title';

function formatShortDate(ts: SavedChat['updatedAt']): string {
  if (!ts) return 'Now';
  try {
    return ts.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function VaultWorkspace() {
  const [lang, setLang] = useState<LanguageMode>(() => {
    try {
      const saved = localStorage.getItem('chatvault_lang');
      return saved === 'hinglish' ? 'hinglish' : 'en';
    } catch {
      return 'en';
    }
  });

  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('chatvault_theme');
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('chatvault_theme', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const handleLangChange = (next: LanguageMode) => {
    setLang(next);
    try {
      localStorage.setItem('chatvault_lang', next);
    } catch {
      // Ignore storage failures
    }
  };

  const t = COPY[lang];

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Workspace Mode (defaults to Live IPO as requested)
  const [workspace, setWorkspace] = useState<WorkspaceMode>('ipo');

  // Firestore Collections State
  const [folders, setFolders] = useState<Folder[]>([]);
  const [chats, setChats] = useState<SavedChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [ipoEntries, setIpoEntries] = useState<IpoEntry[]>([]);
  const [loadingIpoEntries, setLoadingIpoEntries] = useState(true);

  // Selected Chat & Messages State
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Navigation & Filtering State
  const [selection, setSelection] = useState<NavSelection>({ kind: 'all' });
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  // Quick-Save Instant Capture Strip
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  // Bulk Multi-Select State
  const [selectMode, setSelectMode] = useState(false);
  const [checkedChatIds, setCheckedChatIds] = useState<string[]>([]);
  const [bulkFolderTarget, setBulkFolderTarget] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Modal & Toast State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialRaw, setModalInitialRaw] = useState('');
  const [modalInitialTitle, setModalInitialTitle] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2800);
  };

  // Global keyboard shortcuts: Ctrl/Cmd+K -> Search, Alt+N -> New Save Chat
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setModalInitialRaw('');
        setModalInitialTitle('');
        setModalOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Subscribe to Firebase Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setFolders([]);
        setChats([]);
        setIpoEntries([]);
        setMessages([]);
        setSelectedChatId(null);
        setLoadingChats(false);
        setLoadingIpoEntries(false);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to user's Folders, Chats & IPO Tracker Entries when authenticated
  useEffect(() => {
    if (!authReady || !user) return;
    setLoadingChats(true);
    setLoadingIpoEntries(true);
    const unsubFolders = subscribeToFolders(user.uid, (nextFolders) => {
      setFolders(nextFolders);
    });
    const unsubChats = subscribeToChats(user.uid, (nextChats) => {
      setChats(nextChats);
      setLoadingChats(false);
    });
    const unsubIpos = subscribeToIpoEntries(user.uid, (nextIpos) => {
      setIpoEntries(nextIpos);
      setLoadingIpoEntries(false);
    });
    return () => {
      unsubFolders();
      unsubChats();
      unsubIpos();
    };
  }, [authReady, user]);

  // Subscribe to selected Chat's messages
  useEffect(() => {
    if (!authReady || !user || !selectedChatId) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    setLoadingMessages(true);
    const unsub = subscribeToChatMessages(user.uid, selectedChatId, (nextMsgs) => {
      setMessages(nextMsgs);
      setLoadingMessages(false);
    });
    return () => unsub();
  }, [authReady, user, selectedChatId]);

  const handleSignIn = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'Sign-in was cancelled or blocked. Please allow popups and try again.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // Filtered and Sorted Chat List
  const filteredChats = useMemo(() => {
    const queryLower = searchQuery.trim().toLowerCase();

    const matched = chats.filter((chat) => {
      if (selection.kind === 'archived') {
        if (chat.status !== 'archived') return false;
      } else {
        if (chat.status !== 'active') return false;
        if (selection.kind === 'pinned' && !chat.isPinned) return false;
        if (selection.kind === 'folder' && chat.folderId !== selection.folderId) return false;
        if (selection.kind === 'tag' && !chat.tags.includes(selection.tag)) return false;
      }

      if (sourceFilter !== 'all' && chat.source !== sourceFilter) return false;

      if (queryLower) {
        const haystack = [
          chat.title,
          chat.rawContent,
          chat.notes,
          chat.tags.join(' '),
          CHAT_SOURCE_LABELS[chat.source],
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(queryLower)) return false;
      }

      return true;
    });

    matched.sort((a, b) => {
      if (a.isPinned !== b.isPinned && selection.kind !== 'archived') {
        return a.isPinned ? -1 : 1;
      }
      if (sortMode === 'title') {
        return a.title.localeCompare(b.title);
      }
      const timeA = a.updatedAt?.toMillis?.() ?? 0;
      const timeB = b.updatedAt?.toMillis?.() ?? 0;
      return sortMode === 'oldest' ? timeA - timeB : timeB - timeA;
    });

    return matched;
  }, [chats, selection, sourceFilter, searchQuery, sortMode]);

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) ?? null,
    [chats, selectedChatId]
  );

  // Auto-select first chat on desktop when list updates and nothing is selected
  useEffect(() => {
    if (selectedChatId && !chats.some((c) => c.id === selectedChatId)) {
      setSelectedChatId(null);
      setMobileShowDetail(false);
    } else if (!selectedChatId && filteredChats.length > 0) {
      setSelectedChatId(filteredChats[0].id);
    }
  }, [chats, filteredChats, selectedChatId]);

  const openSaveModal = (initialRaw = '', initialTitle = '') => {
    setModalInitialRaw(initialRaw);
    setModalInitialTitle(initialTitle);
    setModalOpen(true);
  };

  const handleQuickPasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        openSaveModal(text, deriveTitleFromText(text));
        return;
      }
    } catch {
      // Fallback to opening empty modal
    }
    openSaveModal();
  };

  const handleInstantQuickSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !quickText.trim() || quickSaving) return;
    const turns = parseRawChatText(quickText);
    if (turns.length === 0) return;

    setQuickSaving(true);
    try {
      const newId = await createSavedChat(user.uid, {
        title: deriveTitleFromText(quickText),
        source: 'chatgpt_temp',
        folderId: selection.kind === 'folder' ? selection.folderId : '',
        notes: '',
        tags: selection.kind === 'tag' ? [selection.tag] : [],
        turns,
        isPinned: selection.kind === 'pinned',
      });
      setQuickText('');
      setQuickOpen(false);
      setSelectedChatId(newId);
      setMobileShowDetail(true);
      showToast(
        lang === 'en'
          ? `Saved instantly (${turns.length} turns).`
          : `Turant save ho gaya (${turns.length} messages).`
      );
    } finally {
      setQuickSaving(false);
    }
  };

  const toggleCheckChat = (chatId: string) => {
    setCheckedChatIds((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId]
    );
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setCheckedChatIds([]);
    setConfirmBulkDelete(false);
  };

  const handleBulkMove = async (targetFolderId: string) => {
    if (checkedChatIds.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      await bulkMoveChatsToFolder(checkedChatIds, targetFolderId);
      showToast(
        lang === 'en'
          ? `Moved ${checkedChatIds.length} chats.`
          : `${checkedChatIds.length} chats move ho gaye.`
      );
      exitSelectMode();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkArchive = async () => {
    if (checkedChatIds.length === 0 || bulkBusy) return;
    const nextStatus = selection.kind === 'archived' ? 'active' : 'archived';
    setBulkBusy(true);
    try {
      await bulkSetChatsStatus(checkedChatIds, nextStatus);
      showToast(
        nextStatus === 'archived'
          ? lang === 'en'
            ? `Archived ${checkedChatIds.length} chats.`
            : `${checkedChatIds.length} chats archive ho gaye.`
          : lang === 'en'
          ? `Restored ${checkedChatIds.length} chats.`
          : `${checkedChatIds.length} chats restore ho gaye.`
      );
      exitSelectMode();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkExport = () => {
    const selected = chats.filter((c) => checkedChatIds.includes(c.id));
    if (selected.length === 0) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'ChatVault',
      chats: selected.map((c) => ({
        title: c.title,
        source: c.source,
        folderName: folders.find((f) => f.id === c.folderId)?.name ?? '',
        notes: c.notes,
        tags: c.tags,
        rawContent: c.rawContent,
      })),
    };
    const stamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(
      `chatvault-selected-${stamp}.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    );
    showToast(
      lang === 'en'
        ? `Exported ${selected.length} selected chats.`
        : `${selected.length} chats download ho gaye.`
    );
  };

  const handleBulkDelete = async () => {
    if (!user || checkedChatIds.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const targets = [...checkedChatIds];
      if (selectedChatId && targets.includes(selectedChatId)) {
        setSelectedChatId(null);
        setMobileShowDetail(false);
      }
      await bulkDeleteChats(user.uid, targets);
      showToast(
        lang === 'en'
          ? `Deleted ${targets.length} chats permanently.`
          : `${targets.length} chats delete ho gaye.`
      );
      exitSelectMode();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;

    try {
      const text = await file.text();
      if (!text.trim()) return;

      if (file.name.toLowerCase().endsWith('.json')) {
        try {
          const parsed = JSON.parse(text) as {
            chats?: Array<{
              title?: string;
              source?: ChatSource;
              notes?: string;
              tags?: string[];
              rawContent?: string;
              messages?: ParsedTurn[];
            }>;
          };
          if (Array.isArray(parsed.chats) && parsed.chats.length > 0) {
            let imported = 0;
            for (const item of parsed.chats.slice(0, 25)) {
              const turns: ParsedTurn[] =
                Array.isArray(item.messages) && item.messages.length > 0
                  ? item.messages
                  : parseRawChatText(item.rawContent || '');
              if (turns.length === 0) continue;
              const validSource: ChatSource =
                item.source && item.source in CHAT_SOURCE_LABELS ? item.source : 'other';
              await createSavedChat(user.uid, {
                title: item.title || deriveTitleFromText(turns[0].content),
                source: validSource,
                folderId: selection.kind === 'folder' ? selection.folderId : '',
                notes: item.notes || '',
                tags: Array.isArray(item.tags) ? item.tags : [],
                turns,
              });
              imported++;
            }
            showToast(
              lang === 'en'
                ? `Imported ${imported} saved chats from backup.`
                : `Backup se ${imported} chats import ho gaye.`
            );
            return;
          }
        } catch {
          // Treat as plain text if JSON structure differs
        }
      }

      const fileTitle = file.name.replace(/\.[^.]+$/, '');
      openSaveModal(text, fileTitle);
    } catch {
      showToast(lang === 'en' ? 'Could not read that file.' : 'File read nahi ho saki.');
    }
  };

  const handleExportAll = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      app: 'ChatVault',
      folders: folders.map((f) => ({ id: f.id, name: f.name, color: f.color })),
      chats: chats.map((c) => ({
        title: c.title,
        source: c.source,
        folderName: folders.find((f) => f.id === c.folderId)?.name ?? '',
        notes: c.notes,
        tags: c.tags,
        isPinned: c.isPinned,
        status: c.status,
        rawContent: c.rawContent,
      })),
    };
    const stamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(
      `chatvault-backup-${stamp}.json`,
      JSON.stringify(backup, null, 2),
      'application/json'
    );
    showToast(lang === 'en' ? 'Vault backup downloaded.' : 'Full backup download ho gaya.');
  };

  const currentBreadcrumb = useMemo(() => {
    if (selection.kind === 'all') return t.allChats;
    if (selection.kind === 'pinned') return t.pinned;
    if (selection.kind === 'archived') return t.archived;
    if (selection.kind === 'tag') return `#${selection.tag}`;
    return folders.find((f) => f.id === selection.folderId)?.name ?? t.folders;
  }, [selection, folders, t]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-sm text-slate-500 dark:text-slate-400">Loading ChatVault...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthGate
        lang={lang}
        onChangeLang={handleLangChange}
        onSignIn={handleSignIn}
        signingIn={signingIn}
        authError={authError}
      />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 flex">
      {/* Hidden File Input for Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.json,text/plain,text/markdown,application/json"
        onChange={(e) => void handleImportFileChange(e)}
        className="hidden"
      />

      {/* Left Sidebar Rail */}
      <Sidebar
        workspace={workspace}
        onChangeWorkspace={(nextMode) => setWorkspace(nextMode)}
        ipoCount={ipoEntries.length}
        lang={lang}
        onChangeLang={handleLangChange}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        userDisplayName={user.displayName || 'User'}
        userEmail={user.email || ''}
        userPhotoURL={user.photoURL}
        chats={chats}
        folders={folders}
        selection={selection}
        onSelect={(next) => {
          setWorkspace('chats');
          setSelection(next);
          setMobileShowDetail(false);
          exitSelectMode();
        }}
        onOpenNewChat={() => openSaveModal()}
        onTriggerImport={() => fileInputRef.current?.click()}
        onExportAll={handleExportAll}
        onCreateFolder={async (name, color) => {
          await createFolder(user.uid, name, color);
          showToast(lang === 'en' ? 'Folder created.' : 'Naya folder ban gaya.');
        }}
        onRenameFolder={async (folderId, name, color) => {
          await updateFolder(folderId, name, color);
        }}
        onDeleteFolder={async (folderId) => {
          const affected = chats.filter((c) => c.folderId === folderId);
          await deleteFolderAndUnassignChats(user.uid, folderId, affected);
          if (selection.kind === 'folder' && selection.folderId === folderId) {
            setSelection({ kind: 'all' });
          }
          showToast(lang === 'en' ? 'Folder deleted.' : 'Folder delete ho gaya.');
        }}
        onSignOut={handleSignOut}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      {/* Right Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top Workspace Header */}
        <header className="no-print h-14 px-4 lg:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
                {t.appName}
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {workspace === 'ipo'
                  ? lang === 'en'
                    ? 'Live IPO Hub'
                    : 'Live IPO Hub'
                  : currentBreadcrumb}
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500 whitespace-nowrap">
                ({workspace === 'ipo' ? ipoEntries.length : filteredChats.length})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {workspace === 'chats' && (
              <>
                <button
                  type="button"
                  onClick={() => setQuickOpen((v) => !v)}
                  className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    quickOpen
                      ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300'
                      : 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{lang === 'en' ? 'Quick Save' : 'Turant Save'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleQuickPasteFromClipboard()}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>{t.pasteFromClipboard}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => openSaveModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.saveChat}</span>
            </button>
          </div>
        </header>

        {workspace === 'ipo' ? (
          <LiveIpoWorkspace
            lang={lang}
            entries={ipoEntries}
            loadingEntries={loadingIpoEntries}
            onCreateEntry={async (input) => {
              await createIpoEntry(user.uid, input);
              showToast(
                lang === 'en'
                  ? `Saved "${input.companyName}" to your IPO tracker.`
                  : `"${input.companyName}" aapke IPO tracker mein save ho gaya.`
              );
            }}
            onUpdateEntry={async (entryId, input) => {
              await updateIpoEntry(entryId, input);
              showToast(lang === 'en' ? 'IPO entry updated.' : 'IPO details update ho gayi.');
            }}
            onQuickUpdateStage={async (entryId, updates) => {
              await quickUpdateIpoStage(entryId, updates);
            }}
            onDeleteEntry={async (entryId) => {
              await deleteIpoEntry(entryId);
              showToast(lang === 'en' ? 'IPO removed from tracker.' : 'IPO tracker se hataya gaya.');
            }}
            onSaveLookupToVault={async (title, summaryText) => {
              const turns = parseRawChatText(summaryText);
              const newId = await createSavedChat(user.uid, {
                title,
                source: 'other',
                folderId: '',
                notes: 'Saved from Live IPO lookup',
                tags: ['ipo', 'market'],
                turns,
              });
              setSelectedChatId(newId);
              showToast(
                lang === 'en'
                  ? 'IPO snapshot saved to your ChatVault.'
                  : 'IPO report aapke ChatVault mein save ho gayi.'
              );
            }}
          />
        ) : (
          <>
        {/* Collapsible Instant Quick-Save Capture Strip */}
        {quickOpen && (
          <form
            onSubmit={(e) => void handleInstantQuickSave(e)}
            className="no-print px-4 lg:px-6 py-3 bg-blue-50/60 dark:bg-blue-950/30 border-b border-blue-200/80 dark:border-blue-900/60 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0"
          >
            <textarea
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              rows={2}
              autoFocus
              placeholder={
                lang === 'en'
                  ? 'Quick paste temporary chat text here — title and turns are auto-detected on save...'
                  : 'Temporary chat yahan turant paste karein — title aur messages automatically save ho jayenge...'
              }
              className="flex-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600 resize-none"
            />
            <div className="flex items-center gap-2 shrink-0 justify-end">
              <button
                type="button"
                onClick={() => {
                  const text = quickText;
                  setQuickOpen(false);
                  setQuickText('');
                  openSaveModal(text, text.trim() ? deriveTitleFromText(text) : '');
                }}
                className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg whitespace-nowrap cursor-pointer"
              >
                {lang === 'en' ? 'More Options' : 'Aur Options'}
              </button>
              <button
                type="submit"
                disabled={quickSaving || !quickText.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 disabled:opacity-50 rounded-lg whitespace-nowrap cursor-pointer"
              >
                {quickSaving
                  ? t.saving
                  : lang === 'en'
                  ? 'Save Instantly'
                  : 'Turant Save Karein'}
              </button>
              <button
                type="button"
                onClick={() => setQuickOpen(false)}
                aria-label="Close quick save"
                className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* Master-Detail Content Area */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Chat List Pane */}
          <div
            className={`no-print ${
              mobileShowDetail ? 'hidden md:flex' : 'flex'
            } w-full md:w-80 xl:w-96 border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex-col shrink-0`}
          >
            {/* Search & Filters */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="w-full pl-9 pr-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:bg-white dark:focus:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {(
                    [
                      { id: 'all', label: lang === 'en' ? 'All' : 'Sab' },
                      { id: 'chatgpt_temp', label: 'AI Temp' },
                      { id: 'whatsapp', label: 'WhatsApp' },
                      { id: 'other', label: 'Other' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSourceFilter(tab.id)}
                      className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        sourceFilter === tab.id
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    aria-label="Sort chats"
                    className="text-xs text-slate-600 dark:text-slate-400 bg-transparent border-0 focus:outline-none cursor-pointer"
                  >
                    <option value="newest" className="dark:bg-slate-900">
                      {lang === 'en' ? 'Newest' : 'Naya'}
                    </option>
                    <option value="oldest" className="dark:bg-slate-900">
                      {lang === 'en' ? 'Oldest' : 'Purana'}
                    </option>
                    <option value="title" className="dark:bg-slate-900">
                      A–Z
                    </option>
                  </select>

                  {filteredChats.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectMode) {
                          exitSelectMode();
                        } else {
                          setSelectMode(true);
                        }
                      }}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                        selectMode
                          ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {selectMode ? t.cancel : lang === 'en' ? 'Select' : 'Chunein'}
                    </button>
                  )}
                </div>
              </div>

              {/* Bulk Action Toolbar */}
              {selectMode && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        if (checkedChatIds.length === filteredChats.length) {
                          setCheckedChatIds([]);
                        } else {
                          setCheckedChatIds(filteredChats.map((c) => c.id));
                        }
                      }}
                      className="text-blue-700 dark:text-blue-400 font-medium hover:underline cursor-pointer"
                    >
                      {checkedChatIds.length === filteredChats.length
                        ? lang === 'en'
                          ? 'Deselect All'
                          : 'Sab Hataayein'
                        : lang === 'en'
                        ? 'Select All'
                        : 'Sab Chunein'}
                    </button>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {checkedChatIds.length} selected
                    </span>
                  </div>

                  {checkedChatIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="flex items-center gap-1">
                        <FolderInput className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <select
                          value={bulkFolderTarget}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBulkFolderTarget('');
                            if (val !== '__pick__') {
                              void handleBulkMove(val);
                            }
                          }}
                          disabled={bulkBusy}
                          className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded px-2 py-1 border-0 cursor-pointer"
                        >
                          <option value="__pick__">
                            {lang === 'en' ? 'Move to...' : 'Folder badlein...'}
                          </option>
                          <option value="">{t.noFolder}</option>
                          {folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        disabled={bulkBusy}
                        onClick={() => void handleBulkArchive()}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer"
                      >
                        <Archive className="w-3 h-3" />
                        <span>{selection.kind === 'archived' ? t.restore : t.archive}</span>
                      </button>

                      <button
                        type="button"
                        disabled={bulkBusy}
                        onClick={handleBulkExport}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>JSON</span>
                      </button>

                      {confirmBulkDelete ? (
                        <button
                          type="button"
                          disabled={bulkBusy}
                          onClick={() => void handleBulkDelete()}
                          className="px-2 py-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded cursor-pointer"
                        >
                          {lang === 'en' ? 'Confirm Delete' : 'Pakka Delete'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={bulkBusy}
                          onClick={() => setConfirmBulkDelete(true)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{t.delete}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chat List Scrollable */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-200/80 dark:divide-slate-800">
              {loadingChats ? (
                <div className="p-3 space-y-2.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredChats.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <MessageSquareText className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    {searchQuery.trim()
                      ? lang === 'en'
                        ? 'No matching chats found'
                        : 'Koi matching chat nahi mila'
                      : t.noChatsTitle}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                    {searchQuery.trim()
                      ? lang === 'en'
                        ? 'Try another keyword or clear your search filter.'
                        : 'Koi aur shabd search karein ya filter hataayein.'
                      : t.noChatsDesc}
                  </p>
                  {!searchQuery.trim() && (
                    <div className="flex flex-col gap-2 items-center">
                      <button
                        type="button"
                        onClick={() => openSaveModal()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t.saveFirstChat}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{t.importFile}</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                filteredChats.map((chat) => {
                  const isActive = selectedChatId === chat.id;
                  const isChecked = checkedChatIds.includes(chat.id);
                  const snippet = chat.rawContent.replace(/\s+/g, ' ').trim().slice(0, 110);
                  const folderName = folders.find((f) => f.id === chat.folderId)?.name;

                  return (
                    <div
                      key={chat.id}
                      className={`flex items-start transition-colors ${
                        isActive
                          ? 'bg-blue-50/75 dark:bg-blue-950/40'
                          : 'bg-white dark:bg-slate-900/80 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      {selectMode && (
                        <button
                          type="button"
                          onClick={() => toggleCheckChat(chat.id)}
                          aria-label={`Select ${chat.title}`}
                          className="pl-3.5 pt-4 text-slate-500 dark:text-slate-400 hover:text-blue-700 cursor-pointer shrink-0"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          if (selectMode) {
                            toggleCheckChat(chat.id);
                            return;
                          }
                          setSelectedChatId(chat.id);
                          setMobileShowDetail(true);
                        }}
                        className="flex-1 text-left px-4 py-3.5 min-w-0 cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span
                            className={`text-sm font-semibold leading-snug line-clamp-1 ${
                              isActive
                                ? 'text-blue-900 dark:text-blue-200'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {chat.title}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {chat.isPinned && (
                              <Pin className="w-3 h-3 text-blue-700 dark:text-blue-400" />
                            )}
                            <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                              {formatShortDate(chat.updatedAt)}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed mb-1.5">
                          {snippet || (lang === 'en' ? 'Empty chat' : 'Khaali chat')}
                        </p>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 truncate">
                          <span>{CHAT_SOURCE_LABELS[chat.source]}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{chat.messageCount} msg</span>
                          {folderName && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-slate-500 dark:text-slate-400 truncate">
                                {folderName}
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Detail Pane */}
          <div className={`${mobileShowDetail ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 h-full`}>
            {selectedChat ? (
              <ChatDetailPane
                lang={lang}
                chat={selectedChat}
                messages={messages}
                loadingMessages={loadingMessages}
                folders={folders}
                onBackMobile={() => setMobileShowDetail(false)}
                onUpdateMeta={async (updates) => {
                  await updateSavedChatMeta(selectedChat.id, updates);
                  showToast(lang === 'en' ? 'Chat details updated.' : 'Details update ho gayi.');
                }}
                onTogglePin={async () => {
                  await toggleChatPin(selectedChat.id, !selectedChat.isPinned);
                }}
                onToggleArchive={async () => {
                  const nextStatus = selectedChat.status === 'archived' ? 'active' : 'archived';
                  await setChatStatus(selectedChat.id, nextStatus);
                  showToast(
                    nextStatus === 'archived'
                      ? lang === 'en'
                        ? 'Moved to Archive.'
                        : 'Archive mein bhej diya.'
                      : lang === 'en'
                      ? 'Restored to Vault.'
                      : 'Vault mein wapas aa gaya.'
                  );
                }}
                onDeleteChat={async () => {
                  const targetId = selectedChat.id;
                  setSelectedChatId(null);
                  setMobileShowDetail(false);
                  await deleteSavedChatWithMessages(user.uid, targetId);
                  showToast(lang === 'en' ? 'Chat deleted permanently.' : 'Chat delete ho gaya.');
                }}
                onAppendMessage={async (turn) => {
                  await appendMessageToChat(user.uid, selectedChat, messages, turn);
                }}
                onUpdateMessage={async (messageId, updates) => {
                  await updateMessageContent(selectedChat, messages, messageId, updates);
                }}
                onToggleStarMessage={async (messageId, nextStarred) => {
                  await toggleMessageStar(selectedChat.id, messageId, nextStarred);
                }}
                onDeleteMessage={async (messageId) => {
                  await deleteMessageFromChat(selectedChat, messages, messageId);
                }}
              />
            ) : (
              <div className="flex-1 bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
                <MessageSquareText className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3" />
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  {t.selectChatPrompt}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-5">
                  {t.selectChatSub}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openSaveModal()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t.saveChat}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleQuickPasteFromClipboard()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <ClipboardPaste className="w-4 h-4" />
                    <span>{t.pasteFromClipboard}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </div>

      {/* Save Chat Modal */}
      <SaveChatModal
        open={modalOpen}
        lang={lang}
        folders={folders}
        defaultFolderId={selection.kind === 'folder' ? selection.folderId : ''}
        initialRawText={modalInitialRaw}
        initialTitle={modalInitialTitle}
        onClose={() => setModalOpen(false)}
        onSave={async (payload) => {
          const newId = await createSavedChat(user.uid, payload);
          setSelectedChatId(newId);
          setMobileShowDetail(true);
          if (selection.kind === 'archived') {
            setSelection({ kind: 'all' });
          }
          showToast(
            lang === 'en'
              ? 'Temporary chat saved permanently to your vault.'
              : 'Temporary chat aapke vault mein permanently save ho gaya.'
          );
        }}
      />

      {/* Offline Mode Indicator */}
      <OfflineIndicator lang={lang} />

      {/* Quiet Feedback Toast */}
      {toastMessage && (
        <div
          role="status"
          className="no-print fixed bottom-5 right-5 z-50 px-4 py-2.5 text-xs font-medium text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-lg shadow-md"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <VaultWorkspace />
    </ErrorBoundary>
  );
}
