import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';
import type { LanguageMode } from '../types/vault';

interface PWAInstallButtonProps {
  lang: LanguageMode;
  onActionDone?: () => void;
}

export function PWAInstallButton({ lang, onActionDone }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (isInstalled) {
    return null;
  }

  const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok && onActionDone) onActionDone();
      return;
    }
    setShowGuide(true);
  };

  const handleCopyUrl = async () => {
    if (!currentUrl) return;
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors cursor-pointer"
      >
        <Smartphone className="w-4 h-4 shrink-0" />
        <span className="truncate">
          {isInstallable
            ? lang === 'en'
              ? 'Install App'
              : 'Phone mein Install'
            : lang === 'en'
            ? 'Install App / APK Guide'
            : 'App Install / APK'}
        </span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {isIOS
                  ? lang === 'en'
                    ? 'Install on iPhone / iPad'
                    : 'iPhone par Install Karein'
                  : lang === 'en'
                  ? 'Install on Android or Generate APK'
                  : 'Android par Install ya APK Banayein'}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install guide"
                className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm text-slate-700 dark:text-slate-300">
              {isIOS ? (
                <ol className="list-decimal list-inside space-y-2 text-xs leading-relaxed">
                  <li>
                    Open this app URL in <strong>Safari</strong>.
                  </li>
                  <li>
                    Tap the <strong>Share</strong> icon in the bottom toolbar.
                  </li>
                  <li>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </li>
                </ol>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {lang === 'en'
                        ? 'Option 1: Direct Android App Install (Recommended)'
                        : 'Tarika 1: Direct Android Install (Sabse Aasan)'}
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      <li>
                        {lang === 'en'
                          ? 'Open the app URL directly in Chrome on your Android phone.'
                          : 'Apne Android phone ke Chrome browser mein app URL kholein.'}
                      </li>
                      <li>
                        {lang === 'en'
                          ? 'Tap the Chrome menu (⋮) and choose "Install app" or "Add to Home screen".'
                          : 'Chrome ke upar right menu (⋮) par tap karein aur "Install app" ya "Add to Home screen" chunein.'}
                      </li>
                    </ol>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {lang === 'en'
                        ? 'Option 2: Download a Standalone .APK File'
                        : 'Tarika 2: Asli .APK File Download Karein'}
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      <li>
                        {lang === 'en'
                          ? 'Copy your live app URL below.'
                          : 'Niche diya gaya App URL copy karein.'}
                      </li>
                      <li>
                        {lang === 'en'
                          ? 'Open PWABuilder.com, paste the URL, and click Start.'
                          : 'Browser mein PWABuilder.com kholein, URL paste karke Start karein.'}
                      </li>
                      <li>
                        {lang === 'en'
                          ? 'Select Package for Stores → Android → Generate Package to download your .apk file.'
                          : 'Package for Stores → Android → Generate Package par click karke .apk download karein.'}
                      </li>
                    </ol>

                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopyUrl()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md cursor-pointer"
                      >
                        {copiedUrl ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedUrl ? 'Copied URL' : 'Copy App URL'}</span>
                      </button>

                      <a
                        href="https://www.pwabuilder.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 rounded-md"
                      >
                        <span>Open PWABuilder</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-4 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                {lang === 'en' ? 'Close' : 'Band Karein'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator({ lang }: { lang: LanguageMode }) {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-md">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        {lang === 'en'
          ? 'Offline Mode — Cached app view active'
          : 'Offline Mode — Internet connect hone par live data update hoga'}
      </span>
    </div>
  );
}
