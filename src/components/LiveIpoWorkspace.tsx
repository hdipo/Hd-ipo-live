import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookmarkPlus,
  Calculator,
  ChevronRight,
  Download,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { INDIAN_REGISTRARS, IpoDetailDrawer } from './IpoDetailDrawer';
import { triggerFileDownload } from '../lib/chatParser';
import {
  fetchLiveIpos,
  lookupLiveIpo,
  type UpsertIpoEntryInput,
} from '../lib/ipoService';
import {
  IPO_LIMITS,
  TRACKER_STAGE_LABELS,
  UPI_MANDATE_LABELS,
  type GroundingSource,
  type IpoBoard,
  type IpoEntry,
  type IpoMarketStatus,
  type IpoTrackerStage,
  type LiveIpoFeedResponse,
  type LiveIpoItem,
  type LiveIpoLookupDetail,
  type UpiMandateStatus,
} from '../types/ipo';
import type { LanguageMode } from '../types/vault';

type IpoSubTab = 'live' | 'performance' | 'tracker' | 'calculator';
type LiveSortMode = 'default' | 'sub_desc' | 'size_desc' | 'gain_desc';

interface LiveIpoWorkspaceProps {
  lang: LanguageMode;
  entries: IpoEntry[];
  loadingEntries: boolean;
  onCreateEntry: (input: UpsertIpoEntryInput) => Promise<void>;
  onUpdateEntry: (entryId: string, input: UpsertIpoEntryInput) => Promise<void>;
  onQuickUpdateStage: (
    entryId: string,
    updates: { trackerStage?: IpoTrackerStage; upiMandate?: UpiMandateStatus }
  ) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onSaveLookupToVault: (title: string, summaryText: string) => Promise<void>;
}

function formatInr(amount: number): string {
  if (!Number.isFinite(amount)) return '₹0';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function parseUpperPrice(priceBand: string): number {
  const nums = priceBand.replace(/,/g, '').match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return 0;
  return Number(nums[nums.length - 1]) || 0;
}

function getStatusTextClass(status: IpoMarketStatus): string {
  if (status === 'open') return 'text-emerald-700 dark:text-emerald-400 font-semibold';
  if (status === 'upcoming') return 'text-amber-700 dark:text-amber-400 font-semibold';
  return 'text-slate-600 dark:text-slate-400 font-medium';
}

function getStatusLabel(status: IpoMarketStatus): string {
  if (status === 'open') return 'Open';
  if (status === 'upcoming') return 'Upcoming';
  if (status === 'listed') return 'Listed';
  return 'Closed';
}

function formatPctBadge(val?: number | null): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return `${val > 0 ? '+' : ''}${val.toFixed(1)}%`;
}

function csvEscape(val: string | number): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const EMPTY_FORM: UpsertIpoEntryInput = {
  companyName: '',
  board: 'mainboard',
  ipoStatus: 'open',
  priceBand: '',
  lotSize: 0,
  gmp: '',
  subscription: '',
  openDate: '',
  closeDate: '',
  listingDate: '',
  trackerStage: 'watching',
  lotsApplied: 1,
  bidAmount: 0,
  applicantName: 'Self',
  upiMandate: 'none',
  notes: '',
};

export function LiveIpoWorkspace({
  lang,
  entries,
  loadingEntries,
  onCreateEntry,
  onUpdateEntry,
  onQuickUpdateStage,
  onDeleteEntry,
  onSaveLookupToVault,
}: LiveIpoWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<IpoSubTab>('live');

  // Live Feed State
  const [boardCategory, setBoardCategory] = useState<'all' | 'mainboard' | 'sme'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | IpoMarketStatus>('all');
  const [tableFilter, setTableFilter] = useState('');
  const [liveSort, setLiveSort] = useState<LiveSortMode>('default');
  const [liveFeed, setLiveFeed] = useState<LiveIpoFeedResponse | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [inspectedIpo, setInspectedIpo] = useState<LiveIpoItem | null>(null);

  // Listing Performance Filter
  const [perfSearch, setPerfSearch] = useState('');

  // Live IPO Lookup State
  const [lookupInput, setLookupInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<{
    ipo: LiveIpoLookupDetail;
    sources: GroundingSource[];
  } | null>(null);

  // Tracker State
  const [stageFilter, setStageFilter] = useState<'all' | IpoTrackerStage>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<UpsertIpoEntryInput>(EMPTY_FORM);
  const [savingEntry, setSavingEntry] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [trackingCompany, setTrackingCompany] = useState<string | null>(null);

  // Gain & Allotment Calculator State
  const [calcLabel, setCalcLabel] = useState('');
  const [calcPrice, setCalcPrice] = useState('450');
  const [calcLotSize, setCalcLotSize] = useState('33');
  const [calcLots, setCalcLots] = useState('1');
  const [calcGmp, setCalcGmp] = useState('85');
  const [calcRetailSub, setCalcRetailSub] = useState('12.5');

  const loadLiveFeed = useCallback(
    async (category: 'all' | 'mainboard' | 'sme', force = false) => {
      setLoadingLive(true);
      setLiveError(null);
      try {
        const data = await fetchLiveIpos(category, force);
        setLiveFeed(data);
      } catch (err) {
        setLiveError(err instanceof Error ? err.message : 'Unable to load live IPO feed.');
      } finally {
        setLoadingLive(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadLiveFeed(boardCategory, false);
  }, [boardCategory, loadLiveFeed]);

  const filteredLiveIpos = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    const list = (liveFeed?.ipos ?? []).filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (q) {
        const hay = `${item.companyName} ${item.exchange ?? ''} ${item.registrar ?? ''} ${item.nseSymbol ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (liveSort === 'sub_desc') {
      return [...list].sort((a, b) => (b.subscriptionNum ?? -1) - (a.subscriptionNum ?? -1));
    }
    if (liveSort === 'size_desc') {
      return [...list].sort((a, b) => (b.issueSizeNum ?? 0) - (a.issueSizeNum ?? 0));
    }
    if (liveSort === 'gain_desc') {
      return [...list].sort(
        (a, b) => (b.listingCloseGainPct ?? -999) - (a.listingCloseGainPct ?? -999)
      );
    }
    return list;
  }, [liveFeed, statusFilter, tableFilter, liveSort]);

  const filteredPerformance = useMemo(() => {
    const q = perfSearch.trim().toLowerCase();
    const list = liveFeed?.listedPerformance ?? [];
    if (!q) return list;
    return list.filter((item) =>
      `${item.companyName} ${item.nseSymbol ?? ''} ${item.exchange ?? ''}`.toLowerCase().includes(q)
    );
  }, [liveFeed, perfSearch]);

  const trackedNamesLower = useMemo(
    () => new Set(entries.map((e) => e.companyName.trim().toLowerCase())),
    [entries]
  );

  const uniqueAccounts = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      const name = (e.applicantName || 'Self').trim();
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (stageFilter !== 'all' && e.trackerStage !== stageFilter) return false;
      if (accountFilter !== 'all' && (e.applicantName || 'Self').trim() !== accountFilter) {
        return false;
      }
      return true;
    });
  }, [entries, stageFilter, accountFilter]);

  const trackerMetrics = useMemo(() => {
    const base =
      accountFilter === 'all'
        ? entries
        : entries.filter((e) => (e.applicantName || 'Self').trim() === accountFilter);
    const watching = base.filter((e) => e.trackerStage === 'watching').length;
    const applied = base.filter((e) => e.trackerStage === 'applied').length;
    const allotted = base.filter((e) => e.trackerStage === 'allotted').length;
    const totalAppliedAmount = base
      .filter((e) => e.trackerStage === 'applied' || e.trackerStage === 'allotted')
      .reduce((sum, e) => sum + (Number(e.bidAmount) || 0), 0);
    return { watching, applied, allotted, totalAppliedAmount };
  }, [entries, accountFilter]);

  const handleLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupInput.trim() || lookupLoading) return;
    setLookupLoading(true);
    setLookupError(null);
    try {
      const res = await lookupLiveIpo(lookupInput.trim());
      setLookupResult({ ipo: res.ipo, sources: res.sources });
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleQuickTrackLiveItem = async (item: LiveIpoItem) => {
    setTrackingCompany(item.companyName);
    const upperPrice = parseUpperPrice(item.priceBand);
    const lotSize = Number(item.lotSize) || 0;
    const estBid = upperPrice > 0 && lotSize > 0 ? upperPrice * lotSize : 0;

    try {
      await onCreateEntry({
        companyName: item.companyName,
        board: item.board === 'sme' ? 'sme' : 'mainboard',
        ipoStatus: item.status || 'upcoming',
        priceBand: item.priceBand || '',
        lotSize,
        gmp: item.gmp || '',
        subscription: item.subscription || '',
        openDate: item.openDate || '',
        closeDate: item.closeDate || '',
        listingDate: item.listingDate || '',
        trackerStage: 'watching',
        lotsApplied: 1,
        bidAmount: estBid,
        applicantName: 'Self',
        upiMandate: 'none',
        notes: [
          item.highlight,
          item.freshIssue && item.freshIssue !== '—' ? `Fresh: ${item.freshIssue}` : '',
          item.registrar ? `Lead Manager: ${item.registrar}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
    } finally {
      setTrackingCompany(null);
    }
  };

  const handleOpenInCalculator = (item: LiveIpoItem) => {
    const upper = parseUpperPrice(item.priceBand);
    setCalcLabel(item.companyName);
    if (upper > 0) {
      setCalcPrice(String(upper));
      // Estimate standard ~₹14,500 retail lot size if lotSize isn't supplied by feed
      const approxLot =
        item.lotSize > 0
          ? item.lotSize
          : item.board === 'sme'
          ? Math.max(100, Math.round(120000 / upper / 50) * 50)
          : Math.max(1, Math.floor(14900 / upper));
      setCalcLotSize(String(approxLot));
    }
    setCalcLots('1');
    if (item.subscriptionRetailNum && item.subscriptionRetailNum > 0) {
      setCalcRetailSub(String(item.subscriptionRetailNum));
    }
    setInspectedIpo(null);
    setActiveTab('calculator');
  };

  const handleSaveItemToVault = async (item: LiveIpoItem) => {
    const lines = [
      `IPO: ${item.companyName} (${item.board.toUpperCase()} · ${item.exchange || 'NSE/BSE'})`,
      `Status: ${getStatusLabel(item.status)} | Issue Size: ${item.issueSize}`,
      `Price Band: ${item.priceBand} | Fresh: ${item.freshIssue || '—'} | OFS: ${item.ofs || '—'}`,
      `Schedule: Open ${item.openDate} · Close ${item.closeDate} · Listing ${item.listingDate}`,
      `Subscription: Total ${item.subscription} (QIB: ${item.subscriptionQib || '—'}, NII: ${item.subscriptionNii || '—'}, Retail: ${item.subscriptionRetail || '—'})`,
      item.applications ? `Total Applications: ${item.applications}` : '',
      item.listingClosePrice !== null && item.listingClosePrice !== undefined
        ? `Listing Performance: Open ₹${item.listingOpenPrice ?? '—'} (${formatPctBadge(item.listingOpenGainPct)}) · Close ₹${item.listingClosePrice} (${formatPctBadge(item.listingCloseGainPct)}) · CMP ${item.currentMarketPrice || '—'}`
        : '',
      item.detailUrl ? `Reference: ${item.detailUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    await onSaveLookupToVault(`IPO Report — ${item.companyName}`, lines);
  };

  const handleTrackLookupResult = async () => {
    if (!lookupResult) return;
    const d = lookupResult.ipo;
    const upperPrice = parseUpperPrice(d.priceBand || '');
    const lotSize = Number(d.lotSize) || 0;
    const estBid = upperPrice > 0 && lotSize > 0 ? upperPrice * lotSize : 0;

    await onCreateEntry({
      companyName: d.companyName,
      board: d.board === 'sme' ? 'sme' : 'mainboard',
      ipoStatus: d.status || 'upcoming',
      priceBand: d.priceBand || '',
      lotSize,
      gmp: d.gmp || '',
      subscription: d.subscriptionTotal || '',
      openDate: d.openDate || '',
      closeDate: d.closeDate || '',
      listingDate: d.listingDate || '',
      trackerStage: 'watching',
      lotsApplied: 1,
      bidAmount: estBid,
      applicantName: 'Self',
      upiMandate: 'none',
      notes: [
        d.overview,
        `QIB: ${d.subscriptionQib} | NII: ${d.subscriptionNii} | Retail: ${d.subscriptionRetail}`,
        d.allotmentDate ? `Allotment: ${d.allotmentDate}` : '',
        d.registrar ? `Registrar: ${d.registrar}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
    setActiveTab('tracker');
  };

  const handleSaveLookupAsChat = async () => {
    if (!lookupResult) return;
    const d = lookupResult.ipo;
    const lines = [
      `IPO: ${d.companyName} (${d.board.toUpperCase()})`,
      `Status: ${getStatusLabel(d.status)}`,
      `Price Band: ${d.priceBand} | Lot Size: ${d.lotSize} | Min Investment: ${d.minInvestment}`,
      `Issue Size: ${d.issueSize} | Est. GMP: ${d.gmp}`,
      `Dates: Open ${d.openDate} · Close ${d.closeDate} · Allotment ${d.allotmentDate} · Listing ${d.listingDate}`,
      `Subscription: Total ${d.subscriptionTotal} (QIB: ${d.subscriptionQib}, NII: ${d.subscriptionNii}, Retail: ${d.subscriptionRetail})`,
      `Registrar: ${d.registrar}`,
      '',
      d.overview,
    ].join('\n');
    await onSaveLookupToVault(`IPO Snapshot — ${d.companyName}`, lines);
  };

  const handleExportTrackerCsv = () => {
    if (entries.length === 0) return;
    const headers = [
      'Company',
      'Board',
      'Account',
      'Stage',
      'UPI Mandate',
      'Price Band',
      'Lot Size',
      'Lots Applied',
      'Bid Amount (INR)',
      'Est. GMP',
      'Subscription',
      'Open Date',
      'Close Date',
      'Listing Date',
      'Notes',
    ];
    const rows = filteredEntries.map((e) =>
      [
        e.companyName,
        e.board.toUpperCase(),
        e.applicantName || 'Self',
        TRACKER_STAGE_LABELS[e.trackerStage],
        UPI_MANDATE_LABELS[e.upiMandate],
        e.priceBand,
        e.lotSize,
        e.lotsApplied,
        e.bidAmount,
        e.gmp,
        e.subscription,
        e.openDate,
        e.closeDate,
        e.listingDate,
        e.notes.replace(/\r?\n/g, ' '),
      ]
        .map(csvEscape)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const stamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(`ipo-tracker-${stamp}.csv`, csv, 'text/csv;charset=utf-8;');
  };

  const openAddForm = () => {
    setEditingId(null);
    setFormState(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (entry: IpoEntry) => {
    setEditingId(entry.id);
    setFormState({
      companyName: entry.companyName,
      board: entry.board,
      ipoStatus: entry.ipoStatus,
      priceBand: entry.priceBand,
      lotSize: entry.lotSize,
      gmp: entry.gmp,
      subscription: entry.subscription,
      openDate: entry.openDate,
      closeDate: entry.closeDate,
      listingDate: entry.listingDate,
      trackerStage: entry.trackerStage,
      lotsApplied: entry.lotsApplied,
      bidAmount: entry.bidAmount,
      applicantName: entry.applicantName,
      upiMandate: entry.upiMandate,
      notes: entry.notes,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formState.companyName.trim()) {
      setFormError(lang === 'en' ? 'Company name is required.' : 'Company ka naam zaroori hai.');
      return;
    }
    setSavingEntry(true);
    try {
      if (editingId) {
        await onUpdateEntry(editingId, formState);
      } else {
        await onCreateEntry(formState);
      }
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save IPO record.');
    } finally {
      setSavingEntry(false);
    }
  };

  // Calculator Derived Values
  const cPrice = Math.max(0, Number(calcPrice) || 0);
  const cLotSize = Math.max(0, Math.round(Number(calcLotSize) || 0));
  const cLots = Math.max(1, Math.round(Number(calcLots) || 1));
  const cGmp = Number(calcGmp) || 0;
  const cRetailSub = Math.max(0, Number(calcRetailSub) || 0);
  const totalShares = cLotSize * cLots;
  const totalInvestment = totalShares * cPrice;
  const estListingPrice = Math.max(0, cPrice + cGmp);
  const estProfit = totalShares * cGmp;
  const estGainPct = cPrice > 0 ? (cGmp / cPrice) * 100 : 0;
  const estAllotmentProb =
    cRetailSub > 0 ? Math.min(100, (1 / cRetailSub) * 100) : 100;

  const applyCategoryPreset = (preset: 'retail' | 'shni' | 'bhni') => {
    const lotCost = cPrice * cLotSize;
    if (lotCost <= 0) return;
    if (preset === 'retail') {
      setCalcLots('1');
    } else if (preset === 'shni') {
      setCalcLots(String(Math.max(1, Math.ceil(200001 / lotCost))));
    } else {
      setCalcLots(String(Math.max(1, Math.ceil(1000001 / lotCost))));
    }
  };

  const marketMetrics = liveFeed?.metrics;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Sub-Navigation Bar */}
      <div className="px-4 lg:px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('live')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'live'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {lang === 'en' ? 'Live IPO Market' : 'Live IPO Market'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('performance')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'performance'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {lang === 'en' ? 'Listing Gains' : 'Listing Gains'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tracker')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'tracker'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {lang === 'en' ? 'My Tracker' : 'Mera IPO Tracker'}{' '}
            <span className="font-mono tabular-nums text-slate-400 dark:text-slate-300">
              ({entries.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('calculator')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'calculator'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {lang === 'en' ? 'GMP Calculator' : 'GMP Calculator'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {(activeTab === 'live' || activeTab === 'performance') && (
            <button
              type="button"
              onClick={() => void loadLiveFeed(boardCategory, true)}
              disabled={loadingLive}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLive ? 'animate-spin' : ''}`} />
              <span>{loadingLive ? 'Updating...' : lang === 'en' ? 'Refresh Live' : 'Live Refresh'}</span>
            </button>
          )}
          {activeTab === 'tracker' && entries.length > 0 && (
            <button
              type="button"
              onClick={handleExportTrackerCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{lang === 'en' ? 'Export CSV' : 'CSV Download'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setActiveTab('tracker');
              openAddForm();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? 'Add IPO' : 'IPO Jodein'}</span>
          </button>
        </div>
      </div>

      {/* Main Scrollable Viewport */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        {/* TAB 1: LIVE MARKET FEED */}
        {activeTab === 'live' && (
          <div className="max-w-7xl mx-auto space-y-5">
            {/* Live 4-Column Market KPI Strip */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
              <div className="p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'en' ? 'Open for Bidding' : 'Abhi Open IPOs'}
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
                  {marketMetrics ? marketMetrics.openCount : '—'}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'en' ? 'Upcoming IPOs' : 'Aane Wale IPOs'}
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-1">
                  {marketMetrics ? marketMetrics.upcomingCount : '—'}
                </div>
              </div>
              <div className="p-4 min-w-0">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'en' ? 'Top Subscribed' : 'Sabse Zyada Demand'}
                </div>
                <div className="flex items-baseline gap-2 mt-1 min-w-0">
                  <span className="text-xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400 shrink-0">
                    {marketMetrics?.topSubscribedValue || '—'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {marketMetrics?.topSubscribedName || ''}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'en' ? 'Recent Avg Listing Gain' : 'Recent Avg Listing Gain'}
                </div>
                <div
                  className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                    (marketMetrics?.avgListingGainPct ?? 0) >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {formatPctBadge(marketMetrics?.avgListingGainPct)}
                </div>
              </div>
            </div>

            {/* Live Specific IPO Lookup Bar */}
            <form
              onSubmit={(e) => void handleLookupSubmit(e)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
            >
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={lookupInput}
                    onChange={(e) => setLookupInput(e.target.value)}
                    placeholder={
                      lang === 'en'
                        ? 'Look up any IPO by name (subscription, Fresh/OFS split, dates & registrar)...'
                        : 'Kisi bhi IPO ka naam likhein — live subscription, price band aur dates dekhein...'
                    }
                    className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:bg-white dark:focus:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={lookupLoading || !lookupInput.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {lookupLoading
                    ? lang === 'en'
                      ? 'Checking Live...'
                      : 'Check ho raha hai...'
                    : lang === 'en'
                    ? 'Check Live IPO'
                    : 'Live Check Karein'}
                </button>
              </div>

              {lookupError && (
                <p className="text-xs text-rose-700 dark:text-rose-400">{lookupError}</p>
              )}

              {lookupResult && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {lookupResult.ipo.companyName}
                      </h3>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span>{lookupResult.ipo.board === 'sme' ? 'SME IPO' : 'Mainboard IPO'}</span>
                        <span>·</span>
                        <span className={getStatusTextClass(lookupResult.ipo.status)}>
                          {getStatusLabel(lookupResult.ipo.status)}
                        </span>
                        <span>·</span>
                        <span>Lead Manager: {lookupResult.ipo.registrar || 'TBA'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleTrackLookupResult()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md whitespace-nowrap cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{lang === 'en' ? 'Add to Tracker' : 'Tracker mein Jodein'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveLookupAsChat()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 rounded-md whitespace-nowrap cursor-pointer"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        <span>{lang === 'en' ? 'Save to Vault' : 'Vault mein Save'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLookupResult(null)}
                        aria-label="Close lookup"
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Price Band</div>
                      <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                        {lookupResult.ipo.priceBand || 'TBA'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Issue Size</div>
                      <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                        {lookupResult.ipo.issueSize || 'TBA'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Applications / Exchange</div>
                      <div className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                        {lookupResult.ipo.gmp || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Total Subscription</div>
                      <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                        {lookupResult.ipo.subscriptionTotal || 'TBA'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Open – Close</div>
                      <div className="font-mono tabular-nums text-slate-800 dark:text-slate-200 mt-0.5">
                        {lookupResult.ipo.openDate} – {lookupResult.ipo.closeDate}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Listing Date</div>
                      <div className="font-mono tabular-nums text-slate-800 dark:text-slate-200 mt-0.5">
                        {lookupResult.ipo.listingDate}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-slate-500 dark:text-slate-400">
                        Category Subscription (QIB / NII / Retail)
                      </div>
                      <div className="font-mono tabular-nums text-slate-800 dark:text-slate-200 mt-0.5">
                        {lookupResult.ipo.subscriptionQib || '—'} /{' '}
                        {lookupResult.ipo.subscriptionNii || '—'} /{' '}
                        {lookupResult.ipo.subscriptionRetail || '—'}
                      </div>
                    </div>
                  </div>

                  {lookupResult.ipo.overview && (
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {lookupResult.ipo.overview}
                    </p>
                  )}

                  {lookupResult.sources.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-medium">Sources:</span>
                      {lookupResult.sources.slice(0, 4).map((src) => (
                        <a
                          key={src.uri}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline truncate max-w-[220px]"
                        >
                          <span className="truncate">{src.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </form>

            {/* Live Market Feed Table Container */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'en'
                      ? 'Live Indian IPO Board (NSE / BSE)'
                      : 'Live IPO List (Mainboard & SME)'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {lang === 'en'
                      ? 'Click any IPO row for Fresh/OFS split, QIB/bNII/sNII/Retail bars, allotment odds & registrar links.'
                      : 'Kisi bhi IPO row par click karein — Fresh/OFS, QIB/NII/Retail breakup aur allotment odds dekhein.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={tableFilter}
                      onChange={(e) => setTableFilter(e.target.value)}
                      placeholder={lang === 'en' ? 'Filter table...' : 'List filter...'}
                      className="w-36 sm:w-44 pl-8 pr-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 border-0 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>

                  <div className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
                    {(['all', 'mainboard', 'sme'] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBoardCategory(b)}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                          boardCategory === b
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {b === 'all' ? 'All Boards' : b === 'mainboard' ? 'Mainboard' : 'SME'}
                      </button>
                    ))}
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as 'all' | IpoMarketStatus)}
                    aria-label="Filter IPO status"
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-md border-0 cursor-pointer"
                  >
                    <option value="all">All Status</option>
                    <option value="open">Open Now</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="closed">Closed</option>
                    <option value="listed">Listed</option>
                  </select>

                  <select
                    value={liveSort}
                    onChange={(e) => setLiveSort(e.target.value as LiveSortMode)}
                    aria-label="Sort IPOs"
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-md border-0 cursor-pointer"
                  >
                    <option value="default">Sort: Active First</option>
                    <option value="sub_desc">Sort: Highest Sub</option>
                    <option value="size_desc">Sort: Largest Issue</option>
                    <option value="gain_desc">Sort: Listing Gain</option>
                  </select>
                </div>
              </div>

              {liveError ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm text-rose-700 dark:text-rose-400">{liveError}</p>
                  <button
                    type="button"
                    onClick={() => void loadLiveFeed(boardCategory, true)}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                  >
                    {lang === 'en' ? 'Retry Live Fetch' : 'Dobara Try Karein'}
                  </button>
                </div>
              ) : loadingLive && !liveFeed ? (
                <div className="p-5 space-y-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      className="h-11 bg-slate-100 dark:bg-slate-800/70 rounded-md animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredLiveIpos.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  {lang === 'en'
                    ? 'No IPOs match this filter right now. Try switching board or clearing search.'
                    : 'Is filter mein koi IPO nahi mila. Filter badalkar dekhein.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-4">Company</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Open – Close</th>
                        <th className="py-2.5 px-3 text-right">Price Band</th>
                        <th className="py-2.5 px-3 text-right">Issue Size</th>
                        <th className="py-2.5 px-3 text-right">Subscription</th>
                        <th className="py-2.5 px-3 text-right">QIB / NII / Retail</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                      {filteredLiveIpos.map((ipo, idx) => {
                        const alreadyTracked = trackedNamesLower.has(
                          ipo.companyName.trim().toLowerCase()
                        );
                        return (
                          <tr
                            key={`${ipo.companyName}-${idx}`}
                            onClick={() => setInspectedIpo(ipo)}
                            className="hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                          >
                            <td className="py-3 px-4 max-w-xs">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                <span className="truncate">{ipo.companyName}</span>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {ipo.board === 'sme' ? 'SME' : 'Mainboard'} · {ipo.exchange || 'NSE/BSE'}
                                {ipo.listingCloseGainPct !== null && ipo.listingCloseGainPct !== undefined
                                  ? ` · List ${formatPctBadge(ipo.listingCloseGainPct)}`
                                  : ipo.listingDate && ipo.listingDate !== 'TBA'
                                  ? ` · List ${ipo.listingDate}`
                                  : ''}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-xs whitespace-nowrap">
                              <span className={getStatusTextClass(ipo.status)}>
                                {getStatusLabel(ipo.status)}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {ipo.openDate || 'TBA'} – {ipo.closeDate || 'TBA'}
                            </td>
                            <td className="py-3 px-3 text-xs font-mono tabular-nums text-right text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {ipo.priceBand || 'TBA'}
                            </td>
                            <td className="py-3 px-3 text-xs font-mono tabular-nums text-right text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {ipo.issueSize || 'TBA'}
                            </td>
                            <td className="py-3 px-3 text-xs font-mono tabular-nums text-right font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                              {ipo.subscription || '—'}
                            </td>
                            <td className="py-3 px-3 text-xs font-mono tabular-nums text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {ipo.subscriptionQib && ipo.subscriptionQib !== '—'
                                ? `${ipo.subscriptionQib} / ${ipo.subscriptionNii || '—'} / ${
                                    ipo.subscriptionRetail || '—'
                                  }`
                                : '—'}
                            </td>
                            <td
                              className="py-3 px-4 text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  title="Calculate GMP Gain"
                                  onClick={() => handleOpenInCalculator(ipo)}
                                  className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 rounded cursor-pointer"
                                >
                                  <Calculator className="w-3.5 h-3.5" />
                                </button>
                                {alreadyTracked ? (
                                  <button
                                    type="button"
                                    onClick={() => setActiveTab('tracker')}
                                    className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                                  >
                                    {lang === 'en' ? 'Tracked' : 'Saved Hai'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={trackingCompany === ipo.companyName}
                                    onClick={() => void handleQuickTrackLiveItem(ipo)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/70 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-md transition-colors cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>{lang === 'en' ? 'Track' : 'Save'}</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sources Footer */}
              {liveFeed && liveFeed.sources.length > 0 && (
                <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-medium">Live Exchange Feeds:</span>
                    {liveFeed.sources.slice(0, 3).map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline truncate max-w-[220px]"
                      >
                        <span className="truncate">{src.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ))}
                  </div>
                  <span className="font-mono tabular-nums text-[11px]">
                    As of {liveFeed.asOf}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: LIVE LISTING PERFORMANCE */}
        {activeTab === 'performance' && (
          <div className="max-w-7xl mx-auto space-y-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'en'
                      ? 'Recent IPO Listing Day & Live CMP Performance'
                      : 'Recent IPO Listing Gains aur Live Market Price'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {lang === 'en'
                      ? 'Compare Offer Price vs Listing Open, Day-1 Close, and live trading price.'
                      : 'Issue price ke muqable listing open, close aur live price performance dekhein.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={perfSearch}
                      onChange={(e) => setPerfSearch(e.target.value)}
                      placeholder={lang === 'en' ? 'Search listed IPO...' : 'Listed IPO khojein...'}
                      className="w-40 sm:w-52 pl-8 pr-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 border-0 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>

                  <div className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
                    {(['all', 'mainboard', 'sme'] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBoardCategory(b)}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                          boardCategory === b
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {b === 'all' ? 'All' : b === 'mainboard' ? 'Mainboard' : 'SME'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {loadingLive && !liveFeed ? (
                <div className="p-5 space-y-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      className="h-11 bg-slate-100 dark:bg-slate-800/70 rounded-md animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredPerformance.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  {lang === 'en'
                    ? 'No recently listed IPOs match this filter.'
                    : 'Is filter mein koi listed IPO nahi mila.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-4">Company</th>
                        <th className="py-2.5 px-3">Listed On</th>
                        <th className="py-2.5 px-3 text-right">Issue Price</th>
                        <th className="py-2.5 px-3 text-right">Sub (x)</th>
                        <th className="py-2.5 px-3 text-right">Listing Open</th>
                        <th className="py-2.5 px-3 text-right">Day-1 Close</th>
                        <th className="py-2.5 px-4 text-right">Current CMP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                      {filteredPerformance.map((ipo, idx) => (
                        <tr
                          key={`${ipo.companyName}-perf-${idx}`}
                          onClick={() => setInspectedIpo(ipo)}
                          className="hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                        >
                          <td className="py-3 px-4 max-w-xs">
                            <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {ipo.companyName}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {ipo.board === 'sme' ? 'SME' : 'Mainboard'}
                              {ipo.nseSymbol ? ` · ${ipo.nseSymbol}` : ''} · {ipo.issueSize}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {ipo.listingDate || '—'}
                          </td>
                          <td className="py-3 px-3 text-xs font-mono tabular-nums text-right text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {ipo.issuePriceNum ? `₹${ipo.issuePriceNum}` : ipo.priceBand}
                          </td>
                          <td className="py-3 px-3 text-xs font-mono tabular-nums text-right text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {ipo.subscription || '—'}
                          </td>
                          <td className="py-3 px-3 text-xs font-mono tabular-nums text-right whitespace-nowrap">
                            <span className="text-slate-900 dark:text-slate-100">
                              {ipo.listingOpenPrice ? `₹${ipo.listingOpenPrice}` : '—'}
                            </span>
                            {ipo.listingOpenGainPct !== null &&
                              ipo.listingOpenGainPct !== undefined && (
                                <span
                                  className={`ml-1.5 font-semibold ${
                                    ipo.listingOpenGainPct >= 0
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-rose-700 dark:text-rose-400'
                                  }`}
                                >
                                  {formatPctBadge(ipo.listingOpenGainPct)}
                                </span>
                              )}
                          </td>
                          <td className="py-3 px-3 text-xs font-mono tabular-nums text-right whitespace-nowrap">
                            <span className="text-slate-900 dark:text-slate-100">
                              {ipo.listingClosePrice ? `₹${ipo.listingClosePrice}` : '—'}
                            </span>
                            {ipo.listingCloseGainPct !== null &&
                              ipo.listingCloseGainPct !== undefined && (
                                <span
                                  className={`ml-1.5 font-semibold ${
                                    ipo.listingCloseGainPct >= 0
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-rose-700 dark:text-rose-400'
                                  }`}
                                >
                                  {formatPctBadge(ipo.listingCloseGainPct)}
                                </span>
                              )}
                          </td>
                          <td className="py-3 px-4 text-xs font-mono tabular-nums text-right whitespace-nowrap">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {ipo.currentMarketPrice || '—'}
                            </span>
                            {ipo.currentGainPct !== null && ipo.currentGainPct !== undefined && (
                              <span
                                className={`ml-1.5 font-semibold ${
                                  ipo.currentGainPct >= 0
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-rose-700 dark:text-rose-400'
                                }`}
                              >
                                {formatPctBadge(ipo.currentGainPct)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: MY WATCHLIST & APPLICATION TRACKER */}
        {activeTab === 'tracker' && (
          <div className="max-w-7xl mx-auto space-y-5">
            {/* 4-Column Summary Strip */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
              <div className="p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'en' ? 'Active Blocked Capital' : 'Total Applied Amount'}
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                  {formatInr(trackerMetrics.totalAppliedAmount)}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">Watching</div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                  {trackerMetrics.watching}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">Applied</div>
                <div className="text-xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400 mt-1">
                  {trackerMetrics.applied}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">Allotted</div>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
                  {trackerMetrics.allotted}
                </div>
              </div>
            </div>

            {/* Tracker Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {(
                    [
                      ['all', 'All'],
                      ['watching', 'Watching'],
                      ['applied', 'Applied'],
                      ['allotted', 'Allotted'],
                      ['not_allotted', 'Not Allotted'],
                      ['listed_sold', 'Listed / Sold'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setStageFilter(id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        stageFilter === id
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {uniqueAccounts.length > 1 && (
                  <select
                    value={accountFilter}
                    onChange={(e) => setAccountFilter(e.target.value)}
                    aria-label="Filter by Demat account"
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-md border-0 cursor-pointer"
                  >
                    <option value="all">All Accounts ({uniqueAccounts.length})</option>
                    {uniqueAccounts.map((acc) => (
                      <option key={acc} value={acc}>
                        Account: {acc}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {loadingEntries ? (
                <div className="p-5 space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="h-12 bg-slate-100 dark:bg-slate-800/70 rounded-md animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <TrendingUp className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {lang === 'en'
                      ? 'No IPOs tracked in this view yet'
                      : 'Abhi koi IPO track nahi kiya gaya hai'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    {lang === 'en'
                      ? 'Click "Track" on any live IPO from the market tab, or log your family Demat applications here.'
                      : 'Live IPO Market tab se kisi bhi IPO ko Track karein ya apna IPO application yahan add karein.'}
                  </p>
                  <button
                    type="button"
                    onClick={openAddForm}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{lang === 'en' ? 'Add First IPO' : 'Pehla IPO Jodein'}</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-4">Company & Account</th>
                        <th className="py-2.5 px-3">Stage</th>
                        <th className="py-2.5 px-3">UPI Mandate</th>
                        <th className="py-2.5 px-3 text-right">Lots / Amount</th>
                        <th className="py-2.5 px-3 text-right">GMP / Sub</th>
                        <th className="py-2.5 px-3">Dates</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                      {filteredEntries.map((entry) => (
                        <tr
                          key={entry.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-4 max-w-xs">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {entry.companyName}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                              {entry.board === 'sme' ? 'SME' : 'Mainboard'} ·{' '}
                              {entry.applicantName || 'Self'}
                              {entry.priceBand ? ` · ${entry.priceBand}` : ''}
                            </div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <select
                              value={entry.trackerStage}
                              onChange={(e) =>
                                void onQuickUpdateStage(entry.id, {
                                  trackerStage: e.target.value as IpoTrackerStage,
                                })
                              }
                              aria-label="Tracker stage"
                              className="text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-md px-2 py-1 border-0 cursor-pointer"
                            >
                              {(Object.keys(TRACKER_STAGE_LABELS) as IpoTrackerStage[]).map(
                                (st) => (
                                  <option key={st} value={st}>
                                    {TRACKER_STAGE_LABELS[st]}
                                  </option>
                                )
                              )}
                            </select>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <select
                              value={entry.upiMandate}
                              onChange={(e) =>
                                void onQuickUpdateStage(entry.id, {
                                  upiMandate: e.target.value as UpiMandateStatus,
                                })
                              }
                              aria-label="UPI mandate status"
                              className={`text-xs font-medium rounded-md px-2 py-1 border-0 cursor-pointer ${
                                entry.upiMandate === 'approved'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                  : entry.upiMandate === 'pending'
                                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {(Object.keys(UPI_MANDATE_LABELS) as UpiMandateStatus[]).map((st) => (
                                <option key={st} value={st}>
                                  {UPI_MANDATE_LABELS[st]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-3 text-xs font-mono tabular-nums text-right whitespace-nowrap">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {entry.bidAmount > 0 ? formatInr(entry.bidAmount) : '—'}
                            </div>
                            <div className="text-slate-500 dark:text-slate-400">
                              {entry.lotsApplied} lot · {entry.lotSize} sh
                            </div>
                          </td>
                          <td className="py-3 px-3 text-xs font-mono tabular-nums text-right whitespace-nowrap">
                            <div className="text-emerald-700 dark:text-emerald-400 font-medium">
                              {entry.gmp || '—'}
                            </div>
                            <div className="text-slate-500 dark:text-slate-400">
                              {entry.subscription || '—'}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            <div>
                              {entry.openDate || 'TBA'} – {entry.closeDate || 'TBA'}
                            </div>
                            {entry.listingDate && (
                              <div className="text-[11px]">List: {entry.listingDate}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {confirmDeleteId === entry.id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteId(null);
                                    void onDeleteEntry(entry.id);
                                  }}
                                  className="px-2 py-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded cursor-pointer"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditForm(entry)}
                                  aria-label="Edit IPO"
                                  className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 rounded cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(entry.id)}
                                  aria-label="Delete IPO"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Official Registrar Allotment Quick Links */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {lang === 'en' ? 'Check PAN Allotment Status:' : 'Allotment Status Check (PAN):'}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                {INDIAN_REGISTRARS.map((reg) => (
                  <a
                    key={reg.name}
                    href={reg.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap"
                  >
                    <span>{reg.name}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LOT, GMP & ALLOTMENT ODDS CALCULATOR */}
        {activeTab === 'calculator' && (
          <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Calculator className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'en'
                      ? 'IPO Investment, GMP Gain & Allotment Calculator'
                      : 'IPO Investment, GMP aur Allotment Calculator'}
                  </h2>
                  {calcLabel && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Loaded: {calcLabel}
                    </p>
                  )}
                </div>
              </div>

              {liveFeed && liveFeed.ipos.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    const found = liveFeed.ipos.find((i) => i.companyName === e.target.value);
                    if (found) handleOpenInCalculator(found);
                  }}
                  aria-label="Load a live IPO into calculator"
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-md border-0 cursor-pointer max-w-[220px]"
                >
                  <option value="">
                    {lang === 'en' ? 'Load Live IPO...' : 'Live IPO Load Karein...'}
                  </option>
                  {liveFeed.ipos.slice(0, 20).map((i) => (
                    <option key={i.companyName} value={i.companyName}>
                      {i.companyName} ({i.priceBand})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Category Quick Presets */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                {lang === 'en' ? 'Bid Category Preset:' : 'Category Preset:'}
              </span>
              <button
                type="button"
                onClick={() => applyCategoryPreset('retail')}
                className="px-2.5 py-1 font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-md cursor-pointer"
              >
                Retail (1 Lot)
              </button>
              <button
                type="button"
                onClick={() => applyCategoryPreset('shni')}
                className="px-2.5 py-1 font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-md cursor-pointer"
              >
                sHNI (&gt;₹2 Lakh)
              </button>
              <button
                type="button"
                onClick={() => applyCategoryPreset('bhni')}
                className="px-2.5 py-1 font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-md cursor-pointer"
              >
                bHNI (&gt;₹10 Lakh)
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Offer / Upper Band Price (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={calcPrice}
                  onChange={(e) => setCalcPrice(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Shares per Lot (Lot Size)
                </label>
                <input
                  type="number"
                  min={0}
                  value={calcLotSize}
                  onChange={(e) => setCalcLotSize(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Number of Lots Applied
                </label>
                <input
                  type="number"
                  min={1}
                  value={calcLots}
                  onChange={(e) => setCalcLots(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Expected GMP per Share (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  value={calcGmp}
                  onChange={(e) => setCalcGmp(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Retail / Category Oversubscription (x) — for Allotment Odds
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={calcRetailSub}
                  onChange={(e) => setCalcRetailSub(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Total Shares</div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                  {totalShares.toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Total Investment</div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                  {formatInr(totalInvestment)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Est. Listing Price</div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                  {formatInr(estListingPrice)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Expected Gain</div>
                <div
                  className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                    estProfit >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {estProfit >= 0 ? '+' : ''}
                  {formatInr(estProfit)}{' '}
                  <span className="text-xs font-medium">
                    ({estGainPct >= 0 ? '+' : ''}
                    {estGainPct.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">1-Lot Odds</div>
                <div className="text-lg font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400 mt-0.5">
                  ~{estAllotmentProb.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* IPO Deep-Dive Drawer */}
      <IpoDetailDrawer
        ipo={inspectedIpo}
        lang={lang}
        alreadyTracked={
          inspectedIpo
            ? trackedNamesLower.has(inspectedIpo.companyName.trim().toLowerCase())
            : false
        }
        trackingBusy={inspectedIpo ? trackingCompany === inspectedIpo.companyName : false}
        onClose={() => setInspectedIpo(null)}
        onTrack={(item) => void handleQuickTrackLiveItem(item)}
        onOpenInCalculator={handleOpenInCalculator}
        onSaveToVault={(item) => void handleSaveItemToVault(item)}
      />

      {/* Add / Edit IPO Entry Modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingId
                  ? lang === 'en'
                    ? 'Edit Tracked IPO'
                    : 'IPO Details Edit Karein'
                  : lang === 'en'
                  ? 'Add IPO to Tracker'
                  : 'Naya IPO Track Karein'}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleFormSubmit(e)}
              className="p-6 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Company Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={IPO_LIMITS.COMPANY_MAX}
                    value={formState.companyName}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, companyName: e.target.value }))
                    }
                    placeholder="e.g. Acme Tech Ltd"
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Board
                  </label>
                  <select
                    value={formState.board}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, board: e.target.value as IpoBoard }))
                    }
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="mainboard">Mainboard</option>
                    <option value="sme">SME</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    IPO Market Status
                  </label>
                  <select
                    value={formState.ipoStatus}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        ipoStatus: e.target.value as IpoMarketStatus,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="open">Open</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="closed">Closed</option>
                    <option value="listed">Listed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Price Band
                  </label>
                  <input
                    type="text"
                    maxLength={IPO_LIMITS.PRICE_BAND_MAX}
                    value={formState.priceBand}
                    onChange={(e) => setFormState((s) => ({ ...s, priceBand: e.target.value }))}
                    placeholder="₹420 - ₹442"
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Lot Size (Shares)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={IPO_LIMITS.LOT_SIZE_MAX}
                    value={formState.lotSize}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, lotSize: Number(e.target.value) || 0 }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Lots Applied
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={IPO_LIMITS.LOTS_APPLIED_MAX}
                    value={formState.lotsApplied}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, lotsApplied: Number(e.target.value) || 0 }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Bid Amount (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={IPO_LIMITS.BID_AMOUNT_MAX}
                    value={formState.bidAmount}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, bidAmount: Number(e.target.value) || 0 }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Application Stage
                  </label>
                  <select
                    value={formState.trackerStage}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        trackerStage: e.target.value as IpoTrackerStage,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    {(Object.keys(TRACKER_STAGE_LABELS) as IpoTrackerStage[]).map((st) => (
                      <option key={st} value={st}>
                        {TRACKER_STAGE_LABELS[st]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    UPI Mandate
                  </label>
                  <select
                    value={formState.upiMandate}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        upiMandate: e.target.value as UpiMandateStatus,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    {(Object.keys(UPI_MANDATE_LABELS) as UpiMandateStatus[]).map((st) => (
                      <option key={st} value={st}>
                        {UPI_MANDATE_LABELS[st]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Applicant / Account Label
                  </label>
                  <input
                    type="text"
                    maxLength={IPO_LIMITS.APPLICANT_MAX}
                    value={formState.applicantName}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, applicantName: e.target.value }))
                    }
                    placeholder="Self / Family Demat"
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Est. GMP
                  </label>
                  <input
                    type="text"
                    maxLength={IPO_LIMITS.GMP_MAX}
                    value={formState.gmp}
                    onChange={(e) => setFormState((s) => ({ ...s, gmp: e.target.value }))}
                    placeholder="+₹65 (+15%)"
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Open Date
                  </label>
                  <input
                    type="text"
                    maxLength={IPO_LIMITS.DATE_MAX}
                    value={formState.openDate}
                    onChange={(e) => setFormState((s) => ({ ...s, openDate: e.target.value }))}
                    placeholder="Nov 18, 2026"
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Close / Listing Date
                  </label>
                  <input
                    type="text"
                    maxLength={IPO_LIMITS.DATE_MAX}
                    value={formState.closeDate}
                    onChange={(e) => setFormState((s) => ({ ...s, closeDate: e.target.value }))}
                    placeholder="Nov 20, 2026"
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    maxLength={IPO_LIMITS.NOTES_MAX}
                    value={formState.notes}
                    onChange={(e) => setFormState((s) => ({ ...s, notes: e.target.value }))}
                    placeholder="Registrar link, allotment strategy, listing plan..."
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-xs text-rose-700 dark:text-rose-400">{formError}</p>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEntry}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  {savingEntry ? 'Saving...' : editingId ? 'Save Changes' : 'Save IPO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
