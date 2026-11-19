import React from 'react';
import {
  BookmarkPlus,
  Calculator,
  ExternalLink,
  Plus,
  X,
} from 'lucide-react';
import type { IpoMarketStatus, LiveIpoItem } from '../types/ipo';
import type { LanguageMode } from '../types/vault';

interface IpoDetailDrawerProps {
  ipo: LiveIpoItem | null;
  lang: LanguageMode;
  alreadyTracked: boolean;
  trackingBusy: boolean;
  onClose: () => void;
  onTrack: (ipo: LiveIpoItem) => void;
  onOpenInCalculator: (ipo: LiveIpoItem) => void;
  onSaveToVault: (ipo: LiveIpoItem) => void;
}

export const INDIAN_REGISTRARS = [
  { name: 'MUFG Intime (Link Intime)', url: 'https://in.mpms.mufg.com/Initial_Offer/public-issues.html' },
  { name: 'KFinTech', url: 'https://ipostatus.kfintech.com/' },
  { name: 'Bigshare Services', url: 'https://ipo.bigshareonline.com/IPO_Status.html' },
  { name: 'Skyline Financial', url: 'https://www.skylinerta.com/ipo.php' },
  { name: 'Maashitla Securities', url: 'https://maashitla.com/allotment-status/public-issues' },
  { name: 'Cameo Corporate', url: 'https://ipo.cameoindia.com/' },
];

function parseNumericMultiple(str?: string): number {
  if (!str) return 0;
  const n = Number(str.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function getStatusTextClass(status: IpoMarketStatus): string {
  if (status === 'open') return 'text-emerald-700 dark:text-emerald-400 font-semibold';
  if (status === 'upcoming') return 'text-amber-700 dark:text-amber-400 font-semibold';
  return 'text-slate-600 dark:text-slate-400 font-medium';
}

function getStatusLabel(status: IpoMarketStatus): string {
  if (status === 'open') return 'Open Now';
  if (status === 'upcoming') return 'Upcoming';
  if (status === 'listed') return 'Listed';
  return 'Closed';
}

function formatGainPct(val?: number | null): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return `${val > 0 ? '+' : ''}${val.toFixed(1)}%`;
}

export function IpoDetailDrawer({
  ipo,
  lang,
  alreadyTracked,
  trackingBusy,
  onClose,
  onTrack,
  onOpenInCalculator,
  onSaveToVault,
}: IpoDetailDrawerProps) {
  if (!ipo) return null;

  const subBars = [
    { label: 'QIB', text: ipo.subscriptionQib || '—', value: parseNumericMultiple(ipo.subscriptionQib) },
    { label: 'bNII (>₹10L)', text: ipo.subscriptionBnii || '—', value: parseNumericMultiple(ipo.subscriptionBnii) },
    { label: 'sNII (₹2–10L)', text: ipo.subscriptionSnii || '—', value: parseNumericMultiple(ipo.subscriptionSnii) },
    { label: 'NII Total', text: ipo.subscriptionNii || '—', value: parseNumericMultiple(ipo.subscriptionNii) },
    { label: 'Retail', text: ipo.subscriptionRetail || '—', value: parseNumericMultiple(ipo.subscriptionRetail) },
    { label: 'Employee', text: ipo.subscriptionEmployee || '—', value: parseNumericMultiple(ipo.subscriptionEmployee) },
  ].filter((row) => row.text !== '—');

  const maxBarValue = Math.max(1, ...subBars.map((b) => b.value));

  const retailX = ipo.subscriptionRetailNum ?? parseNumericMultiple(ipo.subscriptionRetail);
  const retailAllotmentChance =
    retailX > 0 ? Math.min(100, Number(((1 / retailX) * 100).toFixed(1))) : null;

  const freshPct =
    ipo.freshIssuePct !== null && ipo.freshIssuePct !== undefined
      ? Math.max(0, Math.min(100, ipo.freshIssuePct))
      : null;
  const ofsPct =
    ipo.ofsPct !== null && ipo.ofsPct !== undefined
      ? Math.max(0, Math.min(100, ipo.ofsPct))
      : freshPct !== null
      ? Math.max(0, 100 - freshPct)
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50"
      role="dialog"
      aria-modal="true"
      aria-label={ipo.companyName}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-snug">
              {ipo.companyName}
            </h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{ipo.board === 'sme' ? 'SME IPO' : 'Mainboard IPO'}</span>
              <span>·</span>
              <span className={getStatusTextClass(ipo.status)}>{getStatusLabel(ipo.status)}</span>
              <span>·</span>
              <span>{ipo.exchange || 'NSE/BSE'}</span>
              {ipo.nseSymbol && (
                <>
                  <span>·</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{ipo.nseSymbol}</span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close IPO details"
            className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 rounded-md cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Strip */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-wrap items-center gap-2 shrink-0">
          {!alreadyTracked && (
            <button
              type="button"
              disabled={trackingBusy}
              onClick={() => onTrack(ipo)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'en' ? 'Add to My Tracker' : 'Tracker mein Jodein'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenInCalculator(ipo)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? 'Calculate GMP Gain' : 'GMP Calculate Karein'}</span>
          </button>
          <button
            type="button"
            onClick={() => onSaveToVault(ipo)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? 'Save to Vault' : 'Vault mein Save'}</span>
          </button>
          {ipo.detailUrl && (
            <a
              href={ipo.detailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap ml-auto"
            >
              <span>Full RHP / Details</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Core Issue Numbers */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {lang === 'en' ? 'Issue Overview & Schedule' : 'Issue Details aur Dates'}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-3 border-y border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <div className="text-slate-500 dark:text-slate-400">Price Band</div>
                <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {ipo.priceBand || 'TBA'}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Total Issue Size</div>
                <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {ipo.issueSize || 'TBA'}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Total Subscription</div>
                <div className="font-mono tabular-nums text-sm font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {ipo.subscription || '—'}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Open Date</div>
                <div className="font-mono tabular-nums text-slate-800 dark:text-slate-200 mt-0.5">
                  {ipo.openDate || 'TBA'}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Close Date</div>
                <div className="font-mono tabular-nums text-slate-800 dark:text-slate-200 mt-0.5">
                  {ipo.closeDate || 'TBA'}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Listing Date</div>
                <div className="font-mono tabular-nums text-slate-800 dark:text-slate-200 mt-0.5">
                  {ipo.listingDate || 'TBA'}
                </div>
              </div>
            </div>

            {/* Fresh Issue vs OFS Split */}
            {(freshPct !== null || ipo.freshIssue !== '—' || ipo.ofs !== '—') && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400">
                    Fresh Issue:{' '}
                    <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {ipo.freshIssue || '—'}
                      {freshPct !== null ? ` (${freshPct.toFixed(0)}%)` : ''}
                    </span>
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">
                    OFS:{' '}
                    <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {ipo.ofs || '—'}
                      {ofsPct !== null ? ` (${ofsPct.toFixed(0)}%)` : ''}
                    </span>
                  </span>
                </div>
                {freshPct !== null && (
                  <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-blue-600 dark:bg-blue-500"
                      style={{ width: `${freshPct}%` }}
                    />
                    <div
                      className="h-full bg-amber-500/80 dark:bg-amber-400/70"
                      style={{ width: `${Math.max(0, 100 - freshPct)}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Pricing: {ipo.pricingMethod || 'Bookbuilding'}</span>
              <span>·</span>
              <span>Lead Manager: {ipo.registrar || 'TBA'}</span>
              {ipo.applications && (
                <>
                  <span>·</span>
                  <span className="font-mono tabular-nums">
                    Applications: {ipo.applications}
                  </span>
                </>
              )}
            </div>
          </section>

          {/* Listing Day Performance (if listed) */}
          {ipo.listingClosePrice !== null && ipo.listingClosePrice !== undefined && (
            <section className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {lang === 'en' ? 'Listing & Live Market Performance' : 'Listing Gain aur Live Price'}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Issue Price</div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {ipo.issuePriceNum ? `₹${ipo.issuePriceNum}` : ipo.priceBand}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Listing Open</div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {ipo.listingOpenPrice ? `₹${ipo.listingOpenPrice}` : '—'}
                    <span
                      className={`ml-1 text-[11px] ${
                        (ipo.listingOpenGainPct ?? 0) >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {formatGainPct(ipo.listingOpenGainPct)}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Day 1 Close</div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    ₹{ipo.listingClosePrice}
                    <span
                      className={`ml-1 text-[11px] ${
                        (ipo.listingCloseGainPct ?? 0) >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {formatGainPct(ipo.listingCloseGainPct)}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Current CMP</div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {ipo.currentMarketPrice || '—'}
                    {ipo.currentGainPct !== null && ipo.currentGainPct !== undefined && (
                      <span
                        className={`ml-1 text-[11px] ${
                          ipo.currentGainPct >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {formatGainPct(ipo.currentGainPct)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Live Subscription Category Breakdown */}
          <section className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {lang === 'en' ? 'Live Category Subscription' : 'Live Category Subscription Breakup'}
              </h3>
              {ipo.subscriptionAsOn && (
                <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                  As on {ipo.subscriptionAsOn}
                </span>
              )}
            </div>

            {subBars.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {ipo.status === 'upcoming'
                  ? lang === 'en'
                    ? 'Bidding has not started yet. Live QIB/NII/Retail demand will appear once the IPO opens.'
                    : 'Abhi bidding shuru nahi hui hai. IPO khulne ke baad live subscription dikhega.'
                  : lang === 'en'
                  ? 'Category-wise bidding numbers are not published for this issue.'
                  : 'Is IPO ke category subscription numbers abhi available nahi hain.'}
              </p>
            ) : (
              <div className="space-y-2.5">
                {subBars.map((row) => {
                  const pct = Math.max(4, Math.min(100, (row.value / maxBarValue) * 100));
                  return (
                    <div key={row.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-300 font-medium">
                          {row.label}
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {row.text}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 dark:bg-blue-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Retail Allotment Probability Estimate */}
            {retailAllotmentChance !== null && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    {lang === 'en'
                      ? 'Estimated Retail 1-Lot Allotment Odds'
                      : 'Retail 1-Lot Allotment Probability'}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                    {retailX <= 1
                      ? lang === 'en'
                        ? 'Retail portion is under-subscribed — high chance of full allotment.'
                        : 'Retail quota abhi 1x se kam hai — full allotment ke high chances hain.'
                      : lang === 'en'
                      ? `Based on ${retailX.toFixed(2)}x retail subscription (lottery basis).`
                      : `${retailX.toFixed(2)}x retail subscription ke hisaab se estimated lottery chance.`}
                  </div>
                </div>
                <div className="font-mono tabular-nums text-base font-bold text-blue-700 dark:text-blue-400 shrink-0 pl-4">
                  ~{retailAllotmentChance}%
                </div>
              </div>
            )}
          </section>

          {/* Direct Indian Registrar Allotment Check Links */}
          <section className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {lang === 'en'
                ? 'Quick Allotment Check (Official Registrars)'
                : 'Allotment Status Check (Official Registrar Portals)'}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {INDIAN_REGISTRARS.map((reg) => (
                <a
                  key={reg.name}
                  href={reg.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-lg transition-colors"
                >
                  <span className="truncate">{reg.name}</span>
                  <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                </a>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
