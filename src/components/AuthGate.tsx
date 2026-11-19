import { ArrowRight, FolderOpen, Lock, Search, Upload } from 'lucide-react';
import { COPY } from '../lib/i18n';
import type { LanguageMode } from '../types/vault';

interface AuthGateProps {
  lang: LanguageMode;
  onChangeLang: (lang: LanguageMode) => void;
  onSignIn: () => Promise<void>;
  signingIn: boolean;
  authError: string | null;
}

export function AuthGate({
  lang,
  onChangeLang,
  onSignIn,
  signingIn,
  authError,
}: AuthGateProps) {
  const t = COPY[lang];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Top Bar Contract: 3 clean zones separated by gap-8 */}
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
            {t.appName}
          </span>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
            <a
              href="#how-it-works"
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              {lang === 'en' ? 'How It Works' : 'Kaise Kaam Karta Hai'}
            </a>
            <a
              href="#formats"
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Supported Chats
            </a>
            <a
              href="#privacy"
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Privacy
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => void onSignIn()}
              disabled={signingIn}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {signingIn
                ? lang === 'en'
                  ? 'Signing in...'
                  : 'Login ho raha hai...'
                : t.signInButton}
            </button>
          </div>
        </div>
      </header>

      {/* Main Split Workspace Hero */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg w-fit mb-6">
              <button
                type="button"
                onClick={() => onChangeLang('en')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
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
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  lang === 'hinglish'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                Hinglish
              </button>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-[1.15] [text-wrap:balance] mb-5">
              {t.signInTitle}
            </h1>

            <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl mb-8">
              {t.signInSubtitle}
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
              <button
                type="button"
                onClick={() => void onSignIn()}
                disabled={signingIn}
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <span>
                  {signingIn
                    ? lang === 'en'
                      ? 'Connecting...'
                      : 'Connect ho raha hai...'
                    : t.signInButton}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {authError && (
              <p className="text-sm text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-lg px-3.5 py-2.5 mt-2">
                {authError}
              </p>
            )}

            <p
              id="privacy"
              className="text-xs text-slate-500 dark:text-slate-400 mt-3 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{t.signInPrivacyNote}</span>
            </p>
          </div>

          <div className="lg:col-span-6 flex">
            <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex items-center justify-between gap-4">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">
                  {lang === 'en'
                    ? 'ChatVault / Work Notes / Temporary AI Session'
                    : 'ChatVault / Work Notes / Saved Temporary Chat'}
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                  3 messages
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {lang === 'en'
                        ? 'Monthly Budget & Tax Checklist'
                        : 'Monthly Budget & Zaroori Checklist'}
                    </h2>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <span>Temporary AI Chat</span>
                      <span className="mx-1.5">·</span>
                      <span>Saved permanently</span>
                      <span className="mx-1.5">·</span>
                      <span>#finance #checklist</span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-1">
                    <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 rounded-lg p-3.5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        You
                      </div>
                      <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                        {lang === 'en'
                          ? 'Summarize the documents I need to keep ready before filing my annual return.'
                          : 'Annual return file karne se pehle mujhe kaunse documents ready rakhne hain?'}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                      <div className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                        Assistant
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {lang === 'en'
                          ? '1. Salary slips and Form 16. 2. Annual bank interest statements. 3. Investment receipts and rent agreements.'
                          : '1. Salary slips aur Form 16. 2. Bank interest statements. 3. Investment proofs aur rent receipts.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    {lang === 'en'
                      ? 'Synced across your devices'
                      : 'Har device par safe aur synced'}
                  </span>
                  <span className="font-mono text-slate-400">.md / .txt / .json</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section
          id="how-it-works"
          className="mt-14 pt-10 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          <div id="formats">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-semibold text-sm mb-2">
              <Upload className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
              <span>
                {lang === 'en' ? 'Paste or Import in Seconds' : '1 Click mein Paste ya Import'}
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {lang === 'en'
                ? 'Paste raw temporary chats from AI tools, WhatsApp, or Telegram. Multi-turn conversations are automatically structured into readable turns.'
                : 'Temporary AI chat, WhatsApp ya Telegram se copy karke paste karein ya .txt/.md file import karein. Messages automatically organize ho jaate hain.'}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-semibold text-sm mb-2">
              <FolderOpen className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
              <span>
                {lang === 'en' ? 'Folders, Stars & Notes' : 'Folders, Stars aur Notes'}
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {lang === 'en'
                ? 'Group important chats into custom folders, star key answers inside long conversations, and keep adding follow-up messages anytime.'
                : 'Alag-alag folders banayein, lambe chats mein zaroori replies star karein, aur naye messages kabhi bhi usi chat mein aage jodein.'}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-semibold text-sm mb-2">
              <Search className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
              <span>
                {lang === 'en' ? 'Instant Search & Export' : 'Fast Search aur Backup'}
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {lang === 'en'
                ? 'Search across every word, code snippet, tag, and personal note. Export chats to Markdown, Text, Print/PDF, or full JSON backup.'
                : 'Har message, note aur tag ko turant search karein. Chats ko Markdown, Text, PDF print ya full JSON backup mein download karein.'}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
