export interface FinancialPeriodRow {
  period: string;
  revenue: string;
  profit: string;
  ebitda: string;
  netWorth: string;
  assets: string;
  borrowing: string;
  revenueNum: number | null;
  profitNum: number | null;
  netWorthNum: number | null;
  borrowingNum: number | null;
}

export interface IpoFinancialsReport {
  found: boolean;
  companyName: string;
  sourceUrl: string;
  financials: FinancialPeriodRow[];
  kpis: {
    roe: string;
    roeNum: number | null;
    roce: string;
    roceNum: number | null;
    debtToEquity: string;
    debtToEquityNum: number | null;
    ronw: string;
    patMargin: string;
    patMarginNum: number | null;
    ebitdaMargin: string;
    pb: string;
    prePe: number | null;
    postPe: number | null;
    preEps: string;
    postEps: string;
    marketCap: string;
  };
  issueDetails: {
    lotSize: number;
    minInvest: string;
    freshIssue: string;
    freshIssuePct: number | null;
    ofs: string;
    ofsPct: number | null;
    issueSize: string;
    priceBand: string;
    faceValue: string;
    listingDate: string;
    registrar: string;
    saleType: string;
  };
  subscription: {
    total: string;
    qib: string;
    nii: string;
    snii: string;
    bnii: string;
    retail: string;
    employee: string;
    applications: string;
    asOn: string;
    qibNum: number | null;
    totalNum: number | null;
  };
  business: {
    about: string;
    strengths: string[];
  };
  analysis: {
    revGrowthPct: number | null;
    patGrowthPct: number | null;
    allProfitable: boolean;
    businessScore: number;
    businessLabel: string;
    businessReasons: string[];
    demandScore: number;
    demandLabel: string;
    demandReasons: string[];
    verdictType: 'both_strong' | 'business_strong' | 'demand_hype' | 'weak';
    verdictHeadline: string;
    verdictSummary: string;
  };
}

interface DirectoryEntry {
  name: string;
  normName: string;
  slug: string;
  detailUrl: string;
  freshIssue: string;
  freshIssuePct: number | null;
  ofs: string;
  ofsPct: number | null;
  issueSize: string;
  priceBand: string;
  listingDate: string;
  subTotal: string;
  subTotalNum: number | null;
  subQib: string;
  subQibNum: number | null;
  subNii: string;
  subSnii: string;
  subBnii: string;
  subRetail: string;
  subEmployee: string;
  applications: string;
  subAsOn: string;
}

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
  Referer: 'https://www.chittorgarh.com/',
};

const DIR_CACHE_TTL_MS = 10 * 60 * 1000;
const REPORT_CACHE_TTL_MS = 15 * 60 * 1000;

let dirCache: { fetchedAt: number; entries: DirectoryEntry[] } | null = null;
const reportCache = new Map<string, { fetchedAt: number; data: IpoFinancialsReport }>();

function decodeEntities(raw: string): string {
  return raw
    .replace(/&#8377;/g, '₹')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;|&#39;/g, "'")
    .replace(/&ndash;|&mdash;/g, '-')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return decodeEntities(raw.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHref(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const m = raw.match(/href="([^"]+)"/i);
  return m?.[1] ?? '';
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(limited|ltd|private|pvt|india|indian|ipo|sme|industries|enterprises|technologies|services|solutions|corp|corporation|co)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseNum(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/,/g, '').replace(/[₹%xX]/g, '').trim();
  const m = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function fmtMult(val: unknown): string {
  const n = parseNum(val);
  return n !== null ? `${n.toFixed(2)}x` : '—';
}

async function fetchJsonRows(url: string): Promise<Record<string, unknown>[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: HEADERS });
    if (!res.ok) return [];
    const data = (await res.json()) as { reportTableData?: Record<string, unknown>[] };
    return Array.isArray(data?.reportTableData) ? data.reportTableData : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function getDirectory(): Promise<DirectoryEntry[]> {
  const now = new Date();
  if (dirCache && now.getTime() - dirCache.fetchedAt < DIR_CACHE_TTL_MS) {
    return dirCache.entries;
  }

  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const curFy =
    month >= 4
      ? `${year}-${String(year + 1).slice(-2)}`
      : `${year - 1}-${String(year).slice(-2)}`;
  const prevYear = year - 1;
  const prevFy =
    month >= 4
      ? `${prevYear}-${String(prevYear + 1).slice(-2)}`
      : `${prevYear - 1}-${String(prevYear).slice(-2)}`;

  const base = 'https://webnodejs.chittorgarh.com/cloud/report/data-read';
  const [curList, prevList, mainSub, smeSub] = await Promise.all([
    fetchJsonRows(`${base}/82/1/${month}/${year}/${curFy}/0/all/0`),
    fetchJsonRows(`${base}/82/1/3/${prevYear}/${prevFy}/0/all/0`),
    fetchJsonRows(`${base}/21/1/${month}/${year}/${curFy}/0/mainboard/0`),
    fetchJsonRows(`${base}/21/1/${month}/${year}/${curFy}/0/sme/0`),
  ]);

  const subBySlug = new Map<string, Record<string, unknown>>();
  for (const r of [...mainSub, ...smeSub]) {
    const slug = String(r['~URLRewrite_Folder_Name'] ?? '').trim().toLowerCase();
    if (slug) subBySlug.set(slug, r);
  }

  const seen = new Set<string>();
  const entries: DirectoryEntry[] = [];
  for (const row of [...curList, ...prevList]) {
    const slug = String(row['~URLRewrite_Folder_Name'] ?? '').trim().toLowerCase();
    const detailUrl = extractHref(row['Company']);
    if (!detailUrl || (slug && seen.has(slug))) continue;
    if (slug) seen.add(slug);

    const name = cleanText(row['Company']) || cleanText(row['~IPO']);
    const sub = slug ? subBySlug.get(slug) : undefined;
    const freshCr = cleanText(row['Fresh Capital (Rs.cr.)']);
    const ofsCr = cleanText(row['Offer for sale (Rs.cr.)']);
    const totalCr = cleanText(row['Total Issue Amount (Incl.Firm reservations) (Rs.cr.)']);

    entries.push({
      name,
      normName: normalizeName(name),
      slug,
      detailUrl,
      freshIssue: freshCr ? `₹${freshCr} Cr` : '—',
      freshIssuePct: parseNum(row['Fresh Capital as % of Issue Amount']),
      ofs: ofsCr ? `₹${ofsCr} Cr` : '—',
      ofsPct: parseNum(row['Offer for sale as % of Issue Amount']),
      issueSize: totalCr ? `₹${totalCr} Cr` : 'TBA',
      priceBand: cleanText(row['Issue Price (Rs.)']),
      listingDate: cleanText(row['Listing Date']) || 'TBA',
      subTotal: sub ? fmtMult(sub['Total (x)']) : '—',
      subTotalNum: sub ? parseNum(sub['Total (x)']) : null,
      subQib: sub ? fmtMult(sub['QIB (x)']) : '—',
      subQibNum: sub ? parseNum(sub['QIB (x)']) : null,
      subNii: sub ? fmtMult(sub['NII (x)']) : '—',
      subSnii: sub ? fmtMult(sub['sNII (x)']) : '—',
      subBnii: sub ? fmtMult(sub['bNII (x)']) : '—',
      subRetail: sub ? fmtMult(sub['Retail (x)']) : '—',
      subEmployee: sub ? fmtMult(sub['Employee (x)']) : '—',
      applications: sub && sub['Applications'] ? String(sub['Applications']) : '',
      subAsOn: sub ? cleanText(sub['Subscription as on']) : '',
    });
  }

  dirCache = { fetchedAt: now.getTime(), entries };
  return entries;
}

function findBestDirectoryMatch(
  entries: DirectoryEntry[],
  name: string,
  slug: string
): DirectoryEntry | null {
  const slugClean = slug.toLowerCase().replace(/-ipo$/, '').trim();
  const normQuery = normalizeName(name);
  const queryWords = normQuery.split(' ').filter((w) => w.length >= 2);

  // 1. Exact slug or normalized name match
  for (const e of entries) {
    if (slugClean && (e.slug === slugClean || e.slug === `${slugClean}-ipo`)) return e;
    if (normQuery && e.normName === normQuery) return e;
  }

  // 2. Containment match
  for (const e of entries) {
    if (normQuery && normQuery.length >= 4 && (e.normName.includes(normQuery) || normQuery.includes(e.normName))) {
      if (e.normName.length >= 4) return e;
    }
    if (slugClean && slugClean.length >= 4 && e.slug.includes(slugClean)) {
      return e;
    }
  }

  // 3. Token overlap scoring (at least 2 strong words or >= 65% match)
  if (queryWords.length === 0) return null;
  let best: DirectoryEntry | null = null;
  let bestScore = 0;
  for (const e of entries) {
    const eWords = new Set(e.normName.split(' ').filter((w) => w.length >= 2));
    if (eWords.size === 0) continue;
    let hits = 0;
    for (const w of queryWords) {
      if (eWords.has(w)) hits++;
    }
    const ratio = hits / Math.max(queryWords.length, eWords.size);
    if (hits >= 2 || (hits >= 1 && ratio >= 0.65)) {
      if (ratio > bestScore) {
        bestScore = ratio;
        best = e;
      }
    }
  }
  return best;
}

function parseTableRows(tableHtml: string): string[][] {
  const trMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const rows: string[][] = [];
  for (const tr of trMatches) {
    const cellMatches = tr.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || [];
    const cells = cellMatches.map((c) => cleanText(c));
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function parseChittorgarhDetailHtml(
  html: string,
  entry: DirectoryEntry
): IpoFinancialsReport {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];

  const financials: FinancialPeriodRow[] = [];
  const kpis: IpoFinancialsReport['kpis'] = {
    roe: '—',
    roeNum: null,
    roce: '—',
    roceNum: null,
    debtToEquity: '—',
    debtToEquityNum: null,
    ronw: '—',
    patMargin: '—',
    patMarginNum: null,
    ebitdaMargin: '—',
    pb: '—',
    prePe: null,
    postPe: null,
    preEps: '—',
    postEps: '—',
    marketCap: '—',
  };

  const issueDetails: IpoFinancialsReport['issueDetails'] = {
    lotSize: 0,
    minInvest: '—',
    freshIssue: entry.freshIssue,
    freshIssuePct: entry.freshIssuePct,
    ofs: entry.ofs,
    ofsPct: entry.ofsPct,
    issueSize: entry.issueSize,
    priceBand: entry.priceBand ? `₹${entry.priceBand.replace(/^₹/, '')}` : 'TBA',
    faceValue: '—',
    listingDate: entry.listingDate,
    registrar: 'NSE / BSE',
    saleType: '',
  };

  for (const t of tables) {
    const rows = parseTableRows(t);
    if (rows.length === 0) continue;
    const flatText = rows.map((r) => r.join(' ')).join(' ');

    // 1. Financials table ("Period Ended" + "Profit After Tax" / "Total Income")
    if (
      financials.length === 0 &&
      /Period Ended/i.test(rows[0]?.[0] ?? '') &&
      /Profit After Tax|Total Income|Revenue/i.test(flatText)
    ) {
      const periods = rows[0].slice(1).filter(Boolean);
      const findRowVals = (pattern: RegExp): string[] => {
        const found = rows.find((r) => pattern.test(r[0] ?? ''));
        return found ? found.slice(1) : [];
      };
      const assetsVals = findRowVals(/^Assets/i);
      const revVals = findRowVals(/Total Income|Revenue/i);
      const patVals = findRowVals(/Profit After Tax|PAT/i);
      const ebitdaVals = findRowVals(/EBITDA/i);
      const nwVals = findRowVals(/NET Worth|Net Worth/i);
      const debtVals = findRowVals(/Total Borrowing|Borrowing|Total Debt/i);

      for (let i = 0; i < periods.length; i++) {
        const revRaw = revVals[i] || '';
        const patRaw = patVals[i] || '';
        const ebitdaRaw = ebitdaVals[i] || '';
        const nwRaw = nwVals[i] || '';
        const assetsRaw = assetsVals[i] || '';
        const debtRaw = debtVals[i] || '';

        financials.push({
          period: periods[i],
          revenue: revRaw ? `₹${revRaw} Cr` : '—',
          profit: patRaw ? `₹${patRaw} Cr` : '—',
          ebitda: ebitdaRaw ? `₹${ebitdaRaw} Cr` : '—',
          netWorth: nwRaw ? `₹${nwRaw} Cr` : '—',
          assets: assetsRaw ? `₹${assetsRaw} Cr` : '—',
          borrowing: debtRaw ? `₹${debtRaw} Cr` : '—',
          revenueNum: parseNum(revRaw),
          profitNum: parseNum(patRaw),
          netWorthNum: parseNum(nwRaw),
          borrowingNum: parseNum(debtRaw),
        });
      }
      continue;
    }

    // 2. KPI table (ROE, ROCE, Debt/Equity, PAT Margin, P/B)
    if (/Debt\/Equity|PAT Margin|RoNW/i.test(flatText) && /ROE|ROCE/i.test(flatText)) {
      const pickLastFullYearOrFirst = (vals: string[]): string => {
        // Chittorgarh KPI columns are often [Latest Quarter (annualized/unannualized), Latest Full FY]
        // Prefer full FY column (index 1) if present and non-empty, else index 0
        const v1 = vals[1]?.trim();
        const v0 = vals[0]?.trim();
        return v1 && v1 !== '-' && v1 !== '—' ? v1 : v0 || '—';
      };

      for (const r of rows) {
        const k = (r[0] ?? '').toLowerCase();
        const vals = r.slice(1);
        if (k === 'roe' || k.startsWith('roe ')) {
          kpis.roe = pickLastFullYearOrFirst(vals);
          kpis.roeNum = parseNum(kpis.roe);
        } else if (k === 'roce' || k.startsWith('roce ')) {
          kpis.roce = pickLastFullYearOrFirst(vals);
          kpis.roceNum = parseNum(kpis.roce);
        } else if (k.includes('debt/equity')) {
          kpis.debtToEquity = pickLastFullYearOrFirst(vals);
          kpis.debtToEquityNum = parseNum(kpis.debtToEquity);
        } else if (k.includes('ronw')) {
          kpis.ronw = pickLastFullYearOrFirst(vals);
        } else if (k.includes('pat margin')) {
          kpis.patMargin = pickLastFullYearOrFirst(vals);
          kpis.patMarginNum = parseNum(kpis.patMargin);
        } else if (k.includes('ebitda margin')) {
          kpis.ebitdaMargin = pickLastFullYearOrFirst(vals);
        } else if (k.includes('p/b')) {
          kpis.pb = pickLastFullYearOrFirst(vals);
        }
      }
      continue;
    }

    // 3. Valuation Metric table (Pre/Post EPS, P/E, Market Cap)
    if (/Valuation Metric|Pre IPO/i.test(flatText) && /P\/E/i.test(flatText)) {
      for (const r of rows) {
        const k = (r[0] ?? '').toLowerCase();
        if (k.includes('eps')) {
          kpis.preEps = r[1] || '—';
          kpis.postEps = r[2] || '—';
        } else if (k.includes('p/e')) {
          kpis.prePe = parseNum(r[1]);
          kpis.postPe = parseNum(r[2]);
        } else if (k.includes('market cap')) {
          kpis.marketCap = r[2] || r[1] || '—';
        }
      }
      continue;
    }

    // 4. Summary IPO Details table (Lot Size, Face Value, Sale Type)
    if (/Lot Size/i.test(flatText) && /Price Band|IPO Date/i.test(flatText)) {
      for (const r of rows) {
        const k = (r[0] ?? '').toLowerCase();
        const v = r[1] ?? '';
        if (k.includes('lot size')) {
          const lotNum = parseNum(v);
          if (lotNum && lotNum > 0) issueDetails.lotSize = Math.round(lotNum);
        } else if (k.includes('face value')) {
          issueDetails.faceValue = v;
        } else if (k.includes('sale type')) {
          issueDetails.saleType = v;
        } else if (k.includes('price band') && v) {
          issueDetails.priceBand = v;
        } else if (k.includes('listing date') && v) {
          issueDetails.listingDate = v.replace(/\s+T$/i, '');
        }
      }
      continue;
    }

    // 5. Retail Lot table (Retail Min Amount)
    if (/Retail \(Min\)/i.test(flatText)) {
      const retailRow = rows.find((r) => /Retail \(Min\)/i.test(r[0] ?? ''));
      if (retailRow) {
        const shares = parseNum(retailRow[2]);
        if (shares && shares > 0 && issueDetails.lotSize === 0) {
          issueDetails.lotSize = Math.round(shares);
        }
        if (retailRow[3]) issueDetails.minInvest = retailRow[3];
      }
    }
  }

  // Registrar extraction
  const regMatch = html.match(/class="registrar-name"[^>]*>([^<]+)</i);
  if (regMatch?.[1]) {
    issueDetails.registrar = cleanText(regMatch[1]);
  }

  // About Company extraction
  let about = '';
  const aboutMatch = html.match(/<h2[^>]*>About [^<]+<\/h2>([\s\S]{0,3000})/i);
  if (aboutMatch?.[1]) {
    const pMatches = aboutMatch[1].match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
    const goodParas = pMatches
      .map((p) => cleanText(p))
      .filter((p) => p.length > 45 && !/^Updated on /i.test(p));
    about = goodParas.slice(0, 2).join(' ').slice(0, 460);
  }

  // Competitive Strengths extraction
  const strengths: string[] = [];
  const strSection = html.match(/Competitive [Ss]trengths[\s\S]{0,2500}/i);
  if (strSection?.[0]) {
    const liMatches = strSection[0].match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
    for (const li of liMatches.slice(0, 5)) {
      const txt = cleanText(li);
      if (txt.length > 10 && txt.length < 220) strengths.push(txt);
    }
  }

  // Compute YoY Growth across full financial years (prefer '31 Mar' rows; fallback to oldest vs newest non-quarter)
  const fullYearRows = financials.filter((f) => /Mar/i.test(f.period));
  const series = fullYearRows.length >= 2 ? fullYearRows : financials;
  let revGrowthPct: number | null = null;
  let patGrowthPct: number | null = null;

  if (series.length >= 2) {
    // Series is newest-first (e.g. 31 Mar 2026, 31 Mar 2025, 31 Mar 2024)
    const latest = series[0];
    const prev = series[1];
    if (latest.revenueNum !== null && prev.revenueNum !== null && prev.revenueNum > 0) {
      revGrowthPct = Number((((latest.revenueNum - prev.revenueNum) / prev.revenueNum) * 100).toFixed(1));
    }
    if (latest.profitNum !== null && prev.profitNum !== null && prev.profitNum > 0) {
      patGrowthPct = Number((((latest.profitNum - prev.profitNum) / prev.profitNum) * 100).toFixed(1));
    }
  }

  const profitNums = financials
    .map((f) => f.profitNum)
    .filter((v): v is number => v !== null);
  const allProfitable = profitNums.length > 0 && profitNums.every((v) => v > 0);
  const anyLoss = profitNums.some((v) => v < 0);

  // Business Strength Score (0 - 10)
  let bizScore = 5.0;
  const businessReasons: string[] = [];

  if (allProfitable && profitNums.length >= 2) {
    bizScore += 1.2;
    businessReasons.push(`Pichhle ${profitNums.length} periods mein company lagatar profitable hai.`);
  } else if (anyLoss) {
    bizScore -= 1.5;
    businessReasons.push('Pichhle saalon mein company ko loss hua hai — profit consistency weak hai.');
  }

  if (revGrowthPct !== null) {
    if (revGrowthPct >= 20) {
      bizScore += 1.2;
      businessReasons.push(`Revenue mein strong +${revGrowthPct}% YoY growth dikh rahi hai.`);
    } else if (revGrowthPct >= 8) {
      bizScore += 0.6;
      businessReasons.push(`Revenue steady +${revGrowthPct}% YoY badh raha hai.`);
    } else if (revGrowthPct < 0) {
      bizScore -= 1.0;
      businessReasons.push(`Revenue pichhle saal ke muqable ${revGrowthPct}% gira hai.`);
    }
  }

  if (patGrowthPct !== null) {
    if (patGrowthPct >= 25) {
      bizScore += 1.2;
      businessReasons.push(`Profit (PAT) mein zabardast +${patGrowthPct}% YoY jump hai.`);
    } else if (patGrowthPct >= 10) {
      bizScore += 0.6;
      businessReasons.push(`Profit (PAT) +${patGrowthPct}% YoY badha hai.`);
    } else if (patGrowthPct < 0) {
      bizScore -= 1.0;
      businessReasons.push(`Profit (PAT) ${patGrowthPct}% kam hua hai.`);
    }
  }

  if (kpis.roeNum !== null) {
    if (kpis.roeNum >= 18) {
      bizScore += 1.0;
      businessReasons.push(`ROE ${kpis.roe} strong capital efficiency dikhata hai.`);
    } else if (kpis.roeNum < 8) {
      bizScore -= 0.6;
      businessReasons.push(`ROE (${kpis.roe}) thoda kam hai.`);
    }
  }

  if (kpis.debtToEquityNum !== null) {
    if (kpis.debtToEquityNum <= 0.5) {
      bizScore += 0.8;
      businessReasons.push(`Debt/Equity sirf ${kpis.debtToEquity} (Low Debt — safe balance sheet).`);
    } else if (kpis.debtToEquityNum >= 1.5) {
      bizScore -= 1.1;
      businessReasons.push(`Debt/Equity ${kpis.debtToEquity} high hai — karz (borrowing) zyada hai.`);
    }
  }

  if (issueDetails.freshIssuePct !== null) {
    if (issueDetails.freshIssuePct >= 70) {
      bizScore += 0.6;
      businessReasons.push(`${Math.round(issueDetails.freshIssuePct)}% Fresh Issue — paisa company growth/debt reduction mein lagega.`);
    } else if (issueDetails.freshIssuePct <= 30) {
      bizScore -= 0.7;
      businessReasons.push(`Zyada hissa OFS (${Math.round(100 - issueDetails.freshIssuePct)}%) hai — purane investors exit kar rahe hain.`);
    }
  }

  const effectivePe = kpis.prePe ?? kpis.postPe;
  if (effectivePe !== null && effectivePe > 0) {
    if (effectivePe <= 22) {
      bizScore += 0.5;
      businessReasons.push(`P/E valuation (${effectivePe}x) reasonable lag raha hai.`);
    } else if (effectivePe >= 45) {
      bizScore -= 0.9;
      businessReasons.push(`P/E (${effectivePe}x) mehnga (expensive valuation) hai.`);
    }
  }

  bizScore = Math.max(2.0, Math.min(9.5, Number(bizScore.toFixed(1))));
  const businessLabel =
    bizScore >= 7.2
      ? 'Strong Company'
      : bizScore >= 5.5
      ? 'Average / Stable'
      : 'Weak / Risky Fundamentals';

  // Market Demand Score (0 - 10)
  let demandScore = 5.0;
  const demandReasons: string[] = [];
  const totSub = entry.subTotalNum;
  const qibSub = entry.subQibNum;

  if (totSub === null) {
    demandScore = 5.0;
    demandReasons.push('Bidding data abhi start nahi hua ya update ho raha hai (Day 2/3 QIB demand zaroor dekhein).');
  } else {
    if (totSub >= 30) {
      demandScore = 9.0;
      demandReasons.push(`Total subscription ${entry.subTotal} — market mein zabardast craze hai.`);
    } else if (totSub >= 10) {
      demandScore = 7.8;
      demandReasons.push(`Total subscription ${entry.subTotal} — strong investor interest.`);
    } else if (totSub >= 3) {
      demandScore = 6.5;
      demandReasons.push(`Total subscription ${entry.subTotal} — decent demand.`);
    } else if (totSub >= 1) {
      demandScore = 5.4;
      demandReasons.push(`Total subscription ${entry.subTotal} — normal/early demand.`);
    } else {
      demandScore = 3.5;
      demandReasons.push(`Total subscription abhi sirf ${entry.subTotal} hai — weak demand.`);
    }

    if (qibSub !== null) {
      if (qibSub >= 15) {
        demandScore = Math.min(9.6, demandScore + 0.8);
        demandReasons.push(`QIB (Bade Institutions) ne ${entry.subQib} bhara hai — smart money confidence strong hai.`);
      } else if (qibSub >= 2) {
        demandReasons.push(`QIB Institutional demand ${entry.subQib} hai.`);
      } else if (qibSub < 1) {
        demandScore = Math.max(2.5, demandScore - 0.6);
        demandReasons.push(`QIB demand abhi ${entry.subQib} (1x se kam) hai.`);
      }
    }
    if (entry.applications) {
      demandReasons.push(`Total ${entry.applications} applications lag chuki hain.`);
    }
  }

  demandScore = Number(demandScore.toFixed(1));
  const demandLabel =
    totSub === null
      ? 'Bidding Pending'
      : demandScore >= 7.5
      ? 'High Market Demand'
      : demandScore >= 5.5
      ? 'Moderate Demand'
      : 'Low Demand';

  // Combine Business Strength vs Market Demand into clear Hinglish diagnosis
  let verdictType: IpoFinancialsReport['analysis']['verdictType'];
  let verdictHeadline: string;
  let verdictSummary: string;

  if (bizScore >= 6.8 && demandScore >= 7.0) {
    verdictType = 'both_strong';
    verdictHeadline = '💎 Kaam Bhi Strong Hai + Market Demand Bhi High!';
    verdictSummary =
      'Company ke pichhle 3 saal ke financials mazboot hain aur bade investors (QIB/Market) ki demand bhi acchi hai. Listing gain aur medium-to-long term dono ke liye positive profile hai.';
  } else if (bizScore >= 6.8 && demandScore < 7.0) {
    verdictType = 'business_strong';
    verdictHeadline = '🏭 Company Ka Kaam Strong Hai (Market Demand Abhi Moderate/Early)';
    verdictSummary =
      'Financials aur business model solid lag rahe hain, lekin market hype/subscription abhi moderate hai. Apply karne se pehle last day ke QIB numbers zaroor check karein; long-term quality achhi hai.';
  } else if (bizScore < 6.8 && demandScore >= 7.0) {
    verdictType = 'demand_hype';
    verdictHeadline = '🔥 Market Demand High Hai — Par Financials/Valuation Par Dhyan Dein';
    verdictSummary =
      'Is IPO mein market craze aur subscription strong hai, par company ke fundamentals (ya valuation/debt) average/risky hain. Aise IPO sirf short-term listing gain + tight Stop Loss ke liye dekhe jaate hain.';
  } else {
    verdictType = 'weak';
    verdictHeadline = '⚠️ Financials Bhi Average/Weak + Market Demand Bhi Kam';
    verdictSummary =
      'Na toh pichhle saalon ke financials mein strong strength dikh rahi hai aur na hi market demand tez hai. Jab tak Day-3 par strong QIB demand na aaye, risk zyada hai.';
  }

  return {
    found: true,
    companyName: entry.name,
    sourceUrl: entry.detailUrl,
    financials,
    kpis,
    issueDetails,
    subscription: {
      total: entry.subTotal,
      qib: entry.subQib,
      nii: entry.subNii,
      snii: entry.subSnii,
      bnii: entry.subBnii,
      retail: entry.subRetail,
      employee: entry.subEmployee,
      applications: entry.applications,
      asOn: entry.subAsOn,
      qibNum: entry.subQibNum,
      totalNum: entry.subTotalNum,
    },
    business: {
      about,
      strengths,
    },
    analysis: {
      revGrowthPct,
      patGrowthPct,
      allProfitable,
      businessScore: bizScore,
      businessLabel,
      businessReasons: businessReasons.slice(0, 5),
      demandScore,
      demandLabel,
      demandReasons: demandReasons.slice(0, 4),
      verdictType,
      verdictHeadline,
      verdictSummary,
    },
  };
}

export async function fetchIpoFinancialsReport(
  name: string,
  slug = ''
): Promise<IpoFinancialsReport | null> {
  const cacheKey = `${slug.toLowerCase()}|${normalizeName(name)}`;
  const cached = reportCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < REPORT_CACHE_TTL_MS) {
    return cached.data;
  }

  const entries = await getDirectory();
  const match = findBestDirectoryMatch(entries, name, slug);
  if (!match) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(match.detailUrl, { signal: controller.signal, headers: HEADERS });
    if (!res.ok) return null;
    const html = await res.text();
    const report = parseChittorgarhDetailHtml(html, match);
    reportCache.set(cacheKey, { fetchedAt: Date.now(), data: report });
    return report;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
