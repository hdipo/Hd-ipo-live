import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { fetchIpoFinancialsReport } from './ipoFinancials.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const FALLBACK_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const LIVE_CACHE_TTL_MS = 60 * 1000;

interface GroundingSource {
  title: string;
  uri: string;
}

interface MergedLiveIpo {
  slug: string;
  companyName: string;
  detailUrl: string;
  logoUrl: string;
  board: 'mainboard' | 'sme';
  status: 'open' | 'upcoming' | 'closed' | 'listed';
  openDate: string;
  closeDate: string;
  listingDate: string;
  priceBand: string;
  lotSize: number;
  minInvestment: string;
  issueSize: string;
  issueSizeNum: number;
  pricingMethod: string;
  freshIssue: string;
  freshIssuePct: number | null;
  ofs: string;
  ofsPct: number | null;
  subscription: string;
  subscriptionNum: number | null;
  subscriptionQib: string;
  subscriptionSnii: string;
  subscriptionBnii: string;
  subscriptionNii: string;
  subscriptionRetail: string;
  subscriptionRetailNum: number | null;
  subscriptionEmployee: string;
  subscriptionAsOn: string;
  applications: string;
  gmp: string;
  registrar: string;
  exchange: string;
  nseSymbol: string;
  highlight: string;
  issuePriceNum: number | null;
  listingOpenPrice: number | null;
  listingOpenGainPct: number | null;
  listingClosePrice: number | null;
  listingCloseGainPct: number | null;
  currentMarketPrice: string;
  currentGainPct: number | null;
  sortTime: number;
}

interface CachedFeed {
  fetchedAt: number;
  asOf: string;
  allIpos: MergedLiveIpo[];
  sources: GroundingSource[];
}

let cachedFeed: CachedFeed | null = null;

function stripHtml(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/<span[^>]*>.*?<\/span>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTagsKeepText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHref(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const m = raw.match(/href="([^"]+)"/i);
  return m?.[1] ?? '';
}

function parseNumberOrNull(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const cleaned = String(val).replace(/,/g, '').trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatPriceBand(raw: unknown): string {
  const s = stripHtml(raw);
  if (!s) return 'TBA';
  const cleaned = s.replace(/\.00\b/g, '').replace(/\s+to\s+/i, ' - ');
  return cleaned.startsWith('₹') ? cleaned : `₹${cleaned}`;
}

function formatMultiple(val: unknown): string {
  const num = parseNumberOrNull(val);
  if (num === null) return '—';
  return `${num.toFixed(2)}x`;
}

function formatIsoDateShort(iso: unknown, fallback: unknown): string {
  const fb = stripHtml(fallback);
  if (fb) return fb;
  if (typeof iso !== 'string' || !iso) return 'TBA';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'TBA';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function parseCmpAndPct(raw: unknown): { cmp: string; pct: number | null } {
  const text = stripTagsKeepText(raw);
  if (!text) return { cmp: '—', pct: null };
  const priceMatch = text.match(/([\d,]+\.?\d*)/);
  const pctMatch = text.match(/\(([-+]?\d+(?:\.\d+)?)%\)/);
  const cmp = priceMatch ? `₹${priceMatch[1]}` : text;
  const pct = pctMatch ? Number(pctMatch[1]) : null;
  return { cmp, pct: pct !== null && Number.isFinite(pct) ? pct : null };
}

function computeIpoStatus(row: Record<string, unknown>, nowMs: number): 'open' | 'upcoming' | 'closed' | 'listed' {
  const highlight = String(row['~Highlight_Row'] ?? '').toLowerCase();
  if (highlight.includes('green')) return 'open';

  const openIso = String(row['~Issue_Open_Date'] ?? '');
  const closeIso = String(row['~IssueCloseDate'] ?? '');
  const listIso = String(row['~ListingDate'] ?? '');

  const openMs = openIso ? Date.parse(openIso) : NaN;
  const closeEndMs = closeIso ? Date.parse(closeIso) + 24 * 60 * 60 * 1000 : NaN;
  const listMs = listIso ? Date.parse(listIso) : NaN;

  if (Number.isFinite(openMs) && Number.isFinite(closeEndMs)) {
    if (nowMs >= openMs && nowMs <= closeEndMs) return 'open';
    if (nowMs < openMs) return 'upcoming';
    if (Number.isFinite(listMs) && nowMs >= listMs) return 'listed';
    return 'closed';
  }

  if (Number.isFinite(openMs) && nowMs < openMs) return 'upcoming';
  if (Number.isFinite(listMs) && nowMs >= listMs) return 'listed';
  return 'closed';
}

function getIndianFyParams(now: Date) {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fy =
    month >= 4
      ? `${year}-${String(year + 1).slice(-2)}`
      : `${year - 1}-${String(year).slice(-2)}`;
  return { month, year, fy };
}

async function fetchJsonSafe(url: string): Promise<Record<string, unknown>[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/json',
        Referer: 'https://www.chittorgarh.com/',
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { reportTableData?: Record<string, unknown>[] };
    return Array.isArray(data?.reportTableData) ? data.reportTableData : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function getLiveChittorgarhFeed(forceRefresh = false): Promise<CachedFeed> {
  const now = new Date();
  const nowMs = now.getTime();
  if (!forceRefresh && cachedFeed && nowMs - cachedFeed.fetchedAt < LIVE_CACHE_TTL_MS) {
    return cachedFeed;
  }

  const { month, year, fy } = getIndianFyParams(now);
  const baseUrl = `https://webnodejs.chittorgarh.com/cloud/report/data-read`;
  const listUrl = `${baseUrl}/82/1/${month}/${year}/${fy}/0/all/0`;
  const mainSubUrl = `${baseUrl}/21/1/${month}/${year}/${fy}/0/mainboard/0`;
  const smeSubUrl = `${baseUrl}/21/1/${month}/${year}/${fy}/0/sme/0`;
  const perfUrl = `${baseUrl}/125/1/${month}/${year}/${fy}/0/all/0`;

  const [ipoRows, mainSubRows, smeSubRows, perfRows] = await Promise.all([
    fetchJsonSafe(listUrl),
    fetchJsonSafe(mainSubUrl),
    fetchJsonSafe(smeSubUrl),
    fetchJsonSafe(perfUrl),
  ]);

  if (ipoRows.length === 0) {
    throw new Error(
      'Unable to reach live IPO market feed right now. Please try refreshing in a moment.'
    );
  }

  const subBySlug = new Map<string, Record<string, unknown>>();
  for (const row of [...mainSubRows, ...smeSubRows]) {
    const slug = String(row['~URLRewrite_Folder_Name'] ?? '').trim().toLowerCase();
    if (slug) subBySlug.set(slug, row);
  }

  const perfBySlug = new Map<string, Record<string, unknown>>();
  for (const row of perfRows) {
    const slug = String(row['~URLRewrite_Folder_Name'] ?? '').trim().toLowerCase();
    if (slug) perfBySlug.set(slug, row);
  }

  const merged: MergedLiveIpo[] = ipoRows.map((row) => {
    const slug = String(row['~URLRewrite_Folder_Name'] ?? '').trim().toLowerCase();
    const sub = slug ? subBySlug.get(slug) : undefined;
    const perf = slug ? perfBySlug.get(slug) : undefined;

    const companyName = stripHtml(row['Company']) || stripHtml(row['~IPO']) || 'Unnamed IPO';
    const detailUrl = extractHref(row['Company']);
    const categoryRaw = String(row['Issue Category'] ?? '').toLowerCase();
    const board: 'mainboard' | 'sme' = categoryRaw.includes('sme') ? 'sme' : 'mainboard';

    let status = computeIpoStatus(row, nowMs);
    if (perf && parseNumberOrNull(perf['Close Price on Listing (Rs.)']) !== null) {
      status = 'listed';
    }

    const openDate = formatIsoDateShort(row['~Issue_Open_Date'], row['Opening Date']);
    const closeDate = formatIsoDateShort(row['~IssueCloseDate'], row['Closing Date']);
    const listingDate = formatIsoDateShort(
      row['~ListingDate'] || perf?.['~IPO_listing_date'],
      row['Listing Date'] || perf?.['Listing Date']
    );

    const issueCrRaw = stripHtml(row['Total Issue Amount (Incl.Firm reservations) (Rs.cr.)']);
    const issueSizeNum = parseNumberOrNull(issueCrRaw) ?? 0;
    const issueSize = issueCrRaw ? `₹${issueCrRaw} Cr` : 'TBA';

    const freshCrRaw = stripHtml(row['Fresh Capital (Rs.cr.)']);
    const freshIssue = freshCrRaw ? `₹${freshCrRaw} Cr` : '—';
    const freshIssuePct = parseNumberOrNull(row['Fresh Capital as % of Issue Amount']);

    const ofsCrRaw = stripHtml(row['Offer for sale (Rs.cr.)']);
    const ofs = ofsCrRaw ? `₹${ofsCrRaw} Cr` : '—';
    const ofsPct = parseNumberOrNull(row['Offer for sale as % of Issue Amount']);

    const pricingMethod = stripHtml(row['Pricing Method']) || 'Bookbuilding';
    const exchange = stripHtml(row['Listing at']) || (board === 'sme' ? 'NSE/BSE SME' : 'NSE, BSE');
    const leadManager = stripHtml(row['Left Lead Manager']);
    const nseSymbol = String(row['~nse_symbol'] || perf?.['~nse_symbol'] || '').trim();

    const subNum = sub
      ? parseNumberOrNull(sub['Total (x)'])
      : perf
      ? parseNumberOrNull(perf['Subscription (x)'])
      : null;
    const subTotal =
      subNum !== null
        ? `${subNum.toFixed(2)}x`
        : status === 'upcoming'
        ? 'Upcoming'
        : '—';

    const subQib = sub ? formatMultiple(sub['QIB (x)']) : '—';
    const subSnii = sub ? formatMultiple(sub['sNII (x)']) : '—';
    const subBnii = sub ? formatMultiple(sub['bNII (x)']) : '—';
    const subNii = sub ? formatMultiple(sub['NII (x)']) : '—';
    const subRetailNum = sub ? parseNumberOrNull(sub['Retail (x)']) : null;
    const subRetail = subRetailNum !== null ? `${subRetailNum.toFixed(2)}x` : '—';
    const subEmployee = sub ? formatMultiple(sub['Employee (x)']) : '—';
    const subscriptionAsOn = sub ? stripHtml(sub['Subscription as on']) : '';
    const applications = sub && sub['Applications'] ? String(sub['Applications']) : '';

    // Listing performance fields
    const issuePriceNum = perf ? parseNumberOrNull(perf['Issue Price (Rs.)']) : null;
    const listingOpenPrice = perf ? parseNumberOrNull(perf['Open Price on Listing (Rs.)']) : null;
    let listingOpenGainPct = perf
      ? parseNumberOrNull(perf['% Gain / Loss (Issue price v/s Open price on Listing)'])
      : null;
    if (
      listingOpenGainPct === null &&
      issuePriceNum !== null &&
      issuePriceNum > 0 &&
      listingOpenPrice !== null
    ) {
      listingOpenGainPct = Number(
        (((listingOpenPrice - issuePriceNum) / issuePriceNum) * 100).toFixed(2)
      );
    }

    const listingClosePrice = perf ? parseNumberOrNull(perf['Close Price on Listing (Rs.)']) : null;
    let listingCloseGainPct = perf
      ? parseNumberOrNull(perf['% Gain / Loss (Issue price v/s Close price on Listing)'])
      : null;
    if (
      listingCloseGainPct === null &&
      issuePriceNum !== null &&
      issuePriceNum > 0 &&
      listingClosePrice !== null
    ) {
      listingCloseGainPct = Number(
        (((listingClosePrice - issuePriceNum) / issuePriceNum) * 100).toFixed(2)
      );
    }

    const { cmp: currentMarketPrice, pct: currentGainPct } = perf
      ? parseCmpAndPct(perf['Market Price (Rs.)'])
      : { cmp: '—', pct: null };

    const openTs = Date.parse(String(row['~Issue_Open_Date'] ?? ''));
    const sortTime = Number.isFinite(openTs) ? openTs : 0;

    const logoRaw = String(row['~compare_image'] ?? '').trim();
    const logoUrl = /^https?:\/\//i.test(logoRaw) ? logoRaw : '';

    return {
      slug,
      companyName,
      detailUrl,
      logoUrl,
      board,
      status,
      openDate,
      closeDate,
      listingDate,
      priceBand: formatPriceBand(row['Issue Price (Rs.)']),
      lotSize: 0,
      minInvestment: '—',
      issueSize,
      issueSizeNum,
      pricingMethod,
      freshIssue,
      freshIssuePct,
      ofs,
      ofsPct,
      subscription: subTotal,
      subscriptionNum: subNum,
      subscriptionQib: subQib,
      subscriptionSnii: subSnii,
      subscriptionBnii: subBnii,
      subscriptionNii: subNii,
      subscriptionRetail: subRetail,
      subscriptionRetailNum: subRetailNum,
      subscriptionEmployee: subEmployee,
      subscriptionAsOn,
      applications,
      gmp: applications ? `${applications} bids` : exchange,
      registrar: leadManager || exchange,
      exchange,
      nseSymbol,
      highlight: [
        exchange,
        leadManager ? `Lead Manager: ${leadManager}` : '',
        applications ? `Applications: ${applications}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      issuePriceNum,
      listingOpenPrice,
      listingOpenGainPct,
      listingClosePrice,
      listingCloseGainPct,
      currentMarketPrice,
      currentGainPct,
      sortTime,
    };
  });

  const rank: Record<MergedLiveIpo['status'], number> = {
    open: 0,
    upcoming: 1,
    closed: 2,
    listed: 3,
  };

  merged.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.status === 'upcoming') return a.sortTime - b.sortTime;
    return b.sortTime - a.sortTime;
  });

  const feed: CachedFeed = {
    fetchedAt: nowMs,
    asOf: now.toISOString().slice(0, 10),
    allIpos: merged,
    sources: [
      {
        title: 'Chittorgarh Live IPO Calendar (Mainboard & SME)',
        uri: 'https://www.chittorgarh.com/report/ipo-in-india-list-main-board-sme/82/',
      },
      {
        title: 'Chittorgarh Live IPO Subscription Status',
        uri: 'https://www.chittorgarh.com/report/ipo-subscription-status-live-bidding-data-bse-nse/21/',
      },
      {
        title: 'Chittorgarh IPO Listing Day Performance',
        uri: 'https://www.chittorgarh.com/report/ipo-performance-tracker-in-india/125/',
      },
    ],
  };

  cachedFeed = feed;
  return feed;
}

interface CardMetaItem {
  normName: string;
  name: string;
  slug: string;
  logoUrl: string;
  lotSize: number;
  issueSize: string;
  gmp: number;
  gmpPercent: number;
  subNum: number | null;
  subQib: string;
  subNii: string;
  subRetail: string;
  subAsOn: string;
  ofsPct: number | null;
  freshIssuePct: number | null;
  priceBand: string;
  openIso: string;
  closeIso: string;
  pe: number;
}

let cachedCardsMeta: { fetchedAt: number; items: CardMetaItem[] } | null = null;

function normIpoKey(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\b(limited|ltd|private|pvt|india|indian|ipo|sme|industries|enterprises|technologies|services|solutions|corp|corporation|co)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function fetchInvestorGainGmpRows(): Promise<Record<string, unknown>[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch('https://www.investorgain.com/report/live-ipo-gmp/331/', {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const chunks: string[] = [];
    const re = /self\.__next_f\.push\(\[1,("((?:\\.|[^"\\])*)")\]\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      try {
        chunks.push(JSON.parse(m[1]));
      } catch {
        // ignore malformed chunk
      }
    }
    const full = chunks.join('');
    const idx = full.indexOf('"reportTableData":[');
    if (idx === -1) return [];
    const arrStart = full.indexOf('[', idx);
    let depth = 0;
    let end = -1;
    let inStr = false;
    let esc = false;
    for (let i = arrStart; i < full.length; i++) {
      const ch = full[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (!inStr) {
        if (ch === '[') depth++;
        else if (ch === ']') {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
    }
    if (end === -1) return [];
    const parsed = JSON.parse(full.slice(arrStart, end));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function getHdIpoCardsMeta(forceRefresh = false): Promise<CardMetaItem[]> {
  const nowMs = Date.now();
  if (!forceRefresh && cachedCardsMeta && nowMs - cachedCardsMeta.fetchedAt < LIVE_CACHE_TTL_MS) {
    return cachedCardsMeta.items;
  }

  const [feedResult, gmpRows] = await Promise.all([
    getLiveChittorgarhFeed(forceRefresh).catch(() => null),
    fetchInvestorGainGmpRows(),
  ]);

  const byKey = new Map<string, CardMetaItem>();

  if (feedResult && Array.isArray(feedResult.allIpos)) {
    for (const ipo of feedResult.allIpos) {
      const key = normIpoKey(ipo.companyName);
      if (!key) continue;
      byKey.set(key, {
        normName: key,
        name: ipo.companyName,
        slug: ipo.slug,
        logoUrl: ipo.logoUrl || '',
        lotSize: ipo.lotSize || 0,
        issueSize: ipo.issueSize && ipo.issueSize !== 'TBA' ? ipo.issueSize : '',
        gmp: 0,
        gmpPercent: 0,
        subNum: ipo.subscriptionNum,
        subQib: ipo.subscriptionQib && ipo.subscriptionQib !== '—' ? ipo.subscriptionQib : '',
        subNii: ipo.subscriptionNii && ipo.subscriptionNii !== '—' ? ipo.subscriptionNii : '',
        subRetail: ipo.subscriptionRetail && ipo.subscriptionRetail !== '—' ? ipo.subscriptionRetail : '',
        subAsOn: ipo.subscriptionAsOn || '',
        ofsPct: ipo.ofsPct ?? null,
        freshIssuePct: ipo.freshIssuePct ?? null,
        priceBand: ipo.priceBand && ipo.priceBand !== 'TBA' ? ipo.priceBand : '',
        openIso: '',
        closeIso: '',
        pe: 0,
      });
    }
  }

  for (const row of gmpRows) {
    const rawName = String(row['~ipo_name'] || '').trim();
    const key = normIpoKey(rawName);
    if (!key) continue;

    const gmpClean = String(row['GMP'] || '')
      .replace(/&#8377;/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const gmpMatch = gmpClean.match(/(-?\d+(?:\.\d+)?)\s*\(\s*(-?\d+(?:\.\d+)?)%\s*\)/);
    const gmpVal = gmpMatch ? Number(gmpMatch[1]) : 0;
    const gmpPctRaw = parseNumberOrNull(row['~gmp_percent_calc']);
    const gmpPct = gmpPctRaw !== null ? gmpPctRaw : gmpMatch ? Number(gmpMatch[2]) : 0;

    const lotVal = Number(String(row['Lot'] || '0').replace(/\D/g, '')) || 0;
    const sizeClean = String(row['IPO Size'] || '')
      .replace(/&#8377;/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    const subClean = String(row['Sub'] || '').replace(/<[^>]+>/g, '').replace(/[xX]/g, '').trim();
    const subVal = parseNumberOrNull(subClean);
    const peVal = parseNumberOrNull(row['~P/E']) ?? 0;
    const openIso = String(row['~Srt_Open'] || '').trim();
    const closeIso = String(row['~Srt_Close'] || '').trim();

    let existing = byKey.get(key);
    if (!existing) {
      // Fuzzy prefix match against Chittorgarh entries so logoUrl merges even if suffixes differ
      for (const [ck, cv] of byKey.entries()) {
        if (ck.startsWith(key) || key.startsWith(ck)) {
          existing = cv;
          break;
        }
      }
    }

    if (existing) {
      if (lotVal > 0) existing.lotSize = lotVal;
      if (sizeClean && !existing.issueSize) existing.issueSize = sizeClean;
      if (Number.isFinite(gmpVal)) existing.gmp = gmpVal;
      if (Number.isFinite(gmpPct)) existing.gmpPercent = gmpPct;
      if (subVal !== null && (existing.subNum === null || subVal > existing.subNum)) {
        existing.subNum = subVal;
      }
      if (peVal > 0) existing.pe = peVal;
      if (openIso) existing.openIso = openIso;
      if (closeIso) existing.closeIso = closeIso;
    } else {
      byKey.set(key, {
        normName: key,
        name: rawName,
        slug: String(row['~urlrewrite_folder_name'] || '').replace(/^\/gmp\/|\/$/g, ''),
        logoUrl: '',
        lotSize: lotVal,
        issueSize: sizeClean,
        gmp: Number.isFinite(gmpVal) ? gmpVal : 0,
        gmpPercent: Number.isFinite(gmpPct) ? gmpPct : 0,
        subNum: subVal,
        subQib: '',
        subNii: '',
        subRetail: '',
        subAsOn: '',
        ofsPct: null,
        freshIssuePct: null,
        priceBand: row['Price (₹)'] ? `₹${String(row['Price (₹)']).trim()}` : '',
        openIso,
        closeIso,
        pe: peVal,
      });
    }
  }

  const items = Array.from(byKey.values());
  cachedCardsMeta = { fetchedAt: nowMs, items };
  return items;
}

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractGroundingSources(response: unknown): GroundingSource[] {
  const resp = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
      };
    }>;
  };
  const chunks = resp?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: GroundingSource[] = [];
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    const title = chunk?.web?.title || uri || 'Source';
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ title, uri });
    }
  }
  return sources.slice(0, 8);
}

function extractJsonBlock(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/manifest.json', (_req, res) => {
    const prodFile = path.resolve(__dirname, 'dist', 'manifest.json');
    const devFile = path.resolve(__dirname, 'public', 'manifest.json');
    const target = fs.existsSync(prodFile) ? prodFile : devFile;
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(target);
  });

  app.get('/sw.js', (_req, res) => {
    const prodFile = path.resolve(__dirname, 'dist', 'sw.js');
    const devFile = path.resolve(__dirname, 'public', 'sw.js');
    const target = fs.existsSync(prodFile) ? prodFile : devFile;
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(target);
  });

  // Real-time 3-Year RHP Financials + Business Strength vs Market Demand Analysis for HD IPO
  app.get('/api/hdipo/financials', async (req, res) => {
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
    if (!name && !slug) {
      res.status(400).json({ found: false, error: 'Missing IPO name or slug.' });
      return;
    }
    try {
      const report = await fetchIpoFinancialsReport(name, slug);
      if (!report) {
        res.status(404).json({
          found: false,
          error: 'Is IPO ka 3-year RHP financial table abhi exchange directory mein available nahi hai.',
        });
        return;
      }
      res.json(report);
    } catch (err) {
      console.error('HD IPO financials error:', err);
      res.status(502).json({
        found: false,
        error: 'Financial data load nahi ho saka. Thodi der baad dobara try karein.',
      });
    }
  });

  // Live Card Enrichment (Company Logos + Live GMP + Lot Size + Issue Size)
  app.get('/api/hdipo/cards-meta', async (req, res) => {
    const force = req.query.force === '1' || req.query.force === 'true';
    try {
      const items = await getHdIpoCardsMeta(force);
      res.json({ ok: true, count: items.length, items });
    } catch (err) {
      console.error('HD IPO cards-meta error:', err);
      res.json({ ok: false, count: 0, items: [] });
    }
  });

  // Live Indian IPO Feed (direct real-time NSE/BSE Mainboard & SME data + live subscription + listing performance)
  app.get('/api/ipo/live', async (req, res) => {
    const category =
      typeof req.query.category === 'string' ? req.query.category.toLowerCase() : 'all';
    const force = req.query.force === '1' || req.query.force === 'true';

    try {
      const feed = await getLiveChittorgarhFeed(force);
      const filtered =
        category === 'mainboard'
          ? feed.allIpos.filter((i) => i.board === 'mainboard')
          : category === 'sme'
          ? feed.allIpos.filter((i) => i.board === 'sme')
          : feed.allIpos;

      const openCount = filtered.filter((i) => i.status === 'open').length;
      const upcomingCount = filtered.filter((i) => i.status === 'upcoming').length;

      const activeAndRecent = [
        ...filtered.filter((i) => i.status === 'open' || i.status === 'upcoming'),
        ...filtered.filter((i) => i.status === 'closed' || i.status === 'listed').slice(0, 40),
      ];

      const listedPerformance = filtered
        .filter((i) => i.status === 'listed' && i.listingClosePrice !== null)
        .slice(0, 40);

      // Compute real KPIs
      const withSub = activeAndRecent.filter((i) => i.subscriptionNum !== null && i.subscriptionNum > 0);
      const topSub = withSub.sort((a, b) => (b.subscriptionNum ?? 0) - (a.subscriptionNum ?? 0))[0];

      const gainsForAvg = listedPerformance
        .slice(0, 20)
        .map((i) => i.listingCloseGainPct)
        .filter((v): v is number => v !== null && Number.isFinite(v));
      const avgListingGainPct =
        gainsForAvg.length > 0
          ? Number((gainsForAvg.reduce((a, b) => a + b, 0) / gainsForAvg.length).toFixed(1))
          : null;

      res.json({
        asOf: feed.asOf,
        marketSummary: `${openCount} IPO${openCount === 1 ? '' : 's'} currently open for bidding and ${upcomingCount} upcoming across NSE/BSE.`,
        metrics: {
          openCount,
          upcomingCount,
          listedCount: listedPerformance.length,
          topSubscribedName: topSub ? topSub.companyName : '—',
          topSubscribedValue: topSub ? topSub.subscription : '—',
          avgListingGainPct,
        },
        ipos: activeAndRecent,
        listedPerformance,
        sources: feed.sources,
        fetchedAt: new Date(feed.fetchedAt).toISOString(),
      });
    } catch (error) {
      console.error('Live IPO feed error:', error);
      const message =
        error instanceof Error ? error.message : 'Unable to fetch live IPO data right now.';
      res.status(502).json({ error: message });
    }
  });

  // Live IPO Lookup: checks live Chittorgarh directory first (instant, zero quota), falls back to Gemini Search Grounding only if not found
  app.post('/api/ipo/lookup', async (req, res) => {
    const queryText =
      typeof req.body?.query === 'string' ? req.body.query.trim().slice(0, 120) : '';
    if (!queryText) {
      res.status(400).json({ error: 'Please enter an IPO name to look up.' });
      return;
    }

    try {
      const feed = await getLiveChittorgarhFeed(false);
      const qLower = queryText.toLowerCase();
      const match =
        feed.allIpos.find((i) => i.companyName.toLowerCase() === qLower) ||
        feed.allIpos.find((i) => i.companyName.toLowerCase().includes(qLower)) ||
        feed.allIpos.find((i) => i.slug.includes(qLower.replace(/\s+/g, '-')));

      if (match) {
        res.json({
          ipo: {
            companyName: match.companyName,
            board: match.board,
            status: match.status,
            openDate: match.openDate,
            closeDate: match.closeDate,
            allotmentDate: 'Check registrar after close',
            listingDate: match.listingDate,
            priceBand: match.priceBand,
            lotSize: match.lotSize,
            minInvestment: match.minInvestment,
            issueSize: match.issueSize,
            gmp: match.gmp,
            subscriptionTotal: match.subscription,
            subscriptionQib: match.subscriptionQib,
            subscriptionNii: match.subscriptionNii,
            subscriptionRetail: match.subscriptionRetail,
            registrar: match.registrar,
            overview: `${match.companyName} is a ${
              match.board === 'sme' ? 'SME' : 'Mainboard'
            } IPO (${match.exchange}, ${match.pricingMethod}) with total issue size ${match.issueSize} (Fresh: ${match.freshIssue}, OFS: ${match.ofs}) and price band ${
              match.priceBand
            }.${match.applications ? ` Total applications received: ${match.applications}.` : ''}${
              match.listingClosePrice !== null
                ? ` Listed at ₹${match.listingOpenPrice ?? match.listingClosePrice} (Day close: ₹${match.listingClosePrice}, ${match.listingCloseGainPct ?? 0}%).`
                : ''
            }`,
          },
          sources: [
            ...(match.detailUrl
              ? [{ title: `${match.companyName} — Live IPO Details`, uri: match.detailUrl }]
              : []),
            ...feed.sources,
          ],
          fetchedAt: new Date(feed.fetchedAt).toISOString(),
        });
        return;
      }

      const ai = getAiClient();
      if (!ai) {
        res.status(404).json({
          error: `No live IPO matching "${queryText}" was found in the current NSE/BSE IPO directory.`,
        });
        return;
      }

      const todayIso = new Date().toISOString().slice(0, 10);
      const prompt = [
        `Search the web for the latest live IPO details for "${queryText}" in India (as of ${todayIso}).`,
        'Return ONLY a valid JSON object with fields: companyName, board ("mainboard"|"sme"), status ("open"|"upcoming"|"closed"|"listed"), openDate, closeDate, allotmentDate, listingDate, priceBand, lotSize (number), minInvestment, issueSize, gmp, subscriptionTotal, subscriptionQib, subscriptionNii, subscriptionRetail, registrar, overview.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: FALLBACK_GEMINI_MODEL,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const parsed = JSON.parse(extractJsonBlock(response.text ?? '')) as Record<string, unknown>;
      res.json({
        ipo: parsed,
        sources: extractGroundingSources(response),
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : String(error);
      if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error:
            'Search quota limit reached on the current API key. Try searching an active IPO from the live table, or select a billing-enabled API key in Settings > Secrets.',
        });
        return;
      }
      console.error('IPO lookup error:', error);
      res.status(502).json({
        error: `Could not find live IPO details for "${queryText}". Try a shorter company name.`,
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
