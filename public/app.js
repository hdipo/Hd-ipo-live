let appSettings = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem("hdAppSettings") || "{}");
    return {
      defaultCategory: ["all", "mainboard", "sme"].includes(raw.defaultCategory) ? raw.defaultCategory : "all",
      defaultTab: ["live", "upcoming", "closed"].includes(raw.defaultTab) ? raw.defaultTab : "live",
      defaultRegistrar: typeof raw.defaultRegistrar === "string" && raw.defaultRegistrar.startsWith("https://")
        ? raw.defaultRegistrar
        : "https://in.mpms.mufg.com/Initial_Offer/public-issues.html",
      autoInstallPopup: raw.autoInstallPopup !== false
    };
  } catch (_) {
    return {
      defaultCategory: "all",
      defaultTab: "live",
      defaultRegistrar: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html",
      autoInstallPopup: true
    };
  }
})();

let currentPage = "home";
let currentCategory = appSettings.defaultCategory;
let currentTab = appSettings.defaultTab;
let currentSearch = "";
let savedIds = JSON.parse(localStorage.getItem("hdIpoSaved") || "[]");
let customIPOs = JSON.parse(localStorage.getItem("hdCustomIPOs") || "[]");
let familyPans = JSON.parse(localStorage.getItem("hdFamilyPans") || "[]");
let remoteIPOs = JSON.parse(localStorage.getItem("hdRemoteIPOs") || "[]");
let selectedRegistrar = appSettings.defaultRegistrar;
let queueIndex = -1;

const mainContent = document.getElementById("mainContent");
const searchInput = document.getElementById("searchInput");
const searchSection = document.querySelector(".search-section");
const filterSection = document.querySelector(".filter-section");
const tabsBar = document.querySelector(".tabs-bar");
const chips = document.querySelectorAll(".chip");
const tabs = document.querySelectorAll(".tab-btn");
const navItems = document.querySelectorAll(".nav-item");
const analysisModal = document.getElementById("analysisModal");

function getAllIPOs() {
  const baseList = remoteIPOs.length > 0 ? remoteIPOs : ipoDatabase;
  return [...customIPOs, ...baseList];
}

function getVerdictClass(verdict) {
  if (!verdict) return "verdict-risky";
  if (verdict.includes("AVOID")) return "verdict-avoid";
  if (verdict.includes("RISKY") || verdict.includes("High Risk")) return "verdict-risky";
  return "verdict-apply";
}

function copyTextSafe(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else fallbackCopy(text);
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function showNotice(msg) {
  let el = document.getElementById("hdToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "hdToast";
    el.style.cssText =
      "position:fixed;left:50%;bottom:74px;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 14px;border-radius:10px;font-size:12px;font-weight:600;max-width:90%;text-align:center;z-index:9999;box-shadow:0 8px 20px rgba(15,23,42,0.28);transition:opacity 0.2s;";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(window.__hdToastTimer);
  window.__hdToastTimer = setTimeout(() => {
    el.style.opacity = "0";
  }, 2800);
}

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getScoreTone(val) {
  if (val >= 7.0) return "strong";
  if (val >= 5.0) return "avg";
  return "weak";
}

// AUTO-ANALYST ENGINE (Har IPO ka Real RHP Data + Market Demand Dekh Kar Verdict & Target/SL Banata Hai)
function runAutoAnalyst(ipo) {
  const pe = parseFloat(ipo.pe) || 0;
  const indPe = parseFloat(ipo.industryPe) || 26;
  const roe = parseFloat(ipo.roeVal) || 0;
  const ofs = parseFloat(ipo.ofsPercent) || 0;
  const qib = parseFloat(ipo.qibSub) || 0;
  const gmpPct = parseFloat(ipo.gmpPercent) || 0;
  const price = parseFloat(ipo.issuePrice) || 100;
  const listGain = ipo.actualListingGain;
  const de = ipo.debtToEquityNum != null ? Number(ipo.debtToEquityNum) : null;
  const da = ipo.deepAnalysis || null;

  let score = 5.5;
  if (da && typeof da.businessScore === "number") {
    const hasDemand = qib > 0 || (ipo.totalSubNum != null && ipo.totalSubNum > 0) || da.demandScore !== 5.0;
    if (hasDemand && ipo.status !== "upcoming") {
      score = da.businessScore * 0.55 + da.demandScore * 0.45;
    } else {
      score = da.businessScore * 0.78 + 1.1;
    }
    if (gmpPct >= 20) score += 0.4;
    if (listGain != null && listGain > 15) score += 0.4;
    if (ipo.category === "sme") score -= 0.3;
  } else {
    if (pe > 0) { if (pe < indPe) score += 1.4; else if (pe > indPe * 1.3) score -= 1.2; }
    if (roe >= 18) score += 0.9; else if (roe > 0 && roe < 10) score -= 0.7;
    if (ofs <= 30) score += 0.7; else if (ofs >= 70) score -= 1.0;
    if (qib >= 15) score += 1.3; else if (qib >= 5) score += 0.6;
    if (gmpPct >= 20) score += 0.7;
    if (listGain != null && listGain > 15) score += 0.6;
  }
  score = Math.min(9.5, Math.max(2.5, +score.toFixed(1)));

  const verdict = score >= 7.0 ? (ipo.category === "sme" ? "APPLY (High Risk)" : "APPLY")
                : score >= 5.3 ? "RISKY / MAY APPLY" : "AVOID";

  const plus = [];
  const minus = [];

  if (da) {
    if (da.revGrowthPct != null) {
      if (da.revGrowthPct >= 15) plus.push(`Revenue mein achhi growth (+${da.revGrowthPct}% YoY)`);
      else if (da.revGrowthPct < 0) minus.push(`Revenue pichhle saal gira hai (${da.revGrowthPct}% YoY)`);
    }
    if (da.patGrowthPct != null) {
      if (da.patGrowthPct >= 15) plus.push(`Profit (PAT) mein tez growth (+${da.patGrowthPct}% YoY)`);
      else if (da.patGrowthPct < 0) minus.push(`Profit (PAT) pichhle saal kam hua (${da.patGrowthPct}% YoY)`);
    }
    if (da.allProfitable && Array.isArray(ipo.financials) && ipo.financials.length >= 2) {
      plus.push(`Pichhle ${ipo.financials.length} periods se lagatar profit-making company`);
    } else if (da.allProfitable === false) {
      minus.push("Pichhle saalon mein company ko loss (negative PAT) hua hai");
    }
  }

  if (pe > 0 && pe < indPe) plus.push(`Valuation reasonable hai (P/E ${pe}x vs Industry ~${indPe}x)`);
  else if (pe > indPe * 1.15) minus.push(`Valuation mehnga lag raha hai (P/E ${pe}x vs Industry ~${indPe}x)`);

  if (roe >= 15) plus.push(`Strong ROE (${roe}%) — shareholders ke paise par achha return`);
  else if (roe > 0 && roe < 10) minus.push(`ROE kamzor (${roe}%) hai`);

  if (de != null) {
    if (de <= 0.5) plus.push(`Low Debt / Karz kam hai (Debt/Equity ${de}x)`);
    else if (de >= 1.5) minus.push(`Company par karz zyada hai (Debt/Equity ${de}x)`);
  }

  if (ofs <= 30 && (ipo.freshIssue && ipo.freshIssue !== "Check RHP")) {
    plus.push(`${100 - ofs}% Fresh Issue — paisa company ke kaam & growth mein lagega`);
  } else if (ofs >= 50) {
    minus.push(`${ofs}% OFS — purane investors apna hissa bech kar nikal rahe hain`);
  }

  if (qib >= 10) plus.push(`Strong QIB Institutional Demand (${qib}x)`);
  else if (ipo.status !== "upcoming" && qib > 0 && qib < 2) minus.push(`QIB Institutional Demand abhi kam (${qib}x) hai`);

  if (ipo.category === "sme") minus.push("SME IPO mein liquidity risk aur bada lot size hota hai");
  if (!plus.length) plus.push("Official NSE/BSE/SEBI feed se verified data");
  if (!minus.length) minus.push("Listing aur market mood ke hisab se disciplined SL rakhein");

  const fairVal = pe > 0 ? Math.round(price * Math.min(1.6, Math.max(0.85, indPe / pe))) : Math.round(price * 1.15);
  const slPrice = Math.round(price * (qib >= 15 ? 0.94 : 0.92));

  ipo.score = score;
  ipo.verdict = verdict;
  ipo.plusPoints = plus.slice(0, 6);
  ipo.minusPoints = minus.slice(0, 6);
  ipo.listingGain = listGain != null ? `Listed: ${listGain > 0 ? '+' : ''}${listGain.toFixed(1)}%`
                  : (gmpPct > 0 ? `Est. ${gmpPct}%` : (qib >= 15 ? "Strong Demand" : "Track Day-3 QIB"));
  ipo.shortTerm = score >= 7.0 ? "Hold 20-45 Days" : (da && da.verdictType === "demand_hype" ? "Listing Gain Book Karein" : "Book on Listing / Wait");
  ipo.longTerm = (da ? (da.businessScore >= 7.0 ? "Strong Business Hold" : da.businessScore >= 5.5 ? "Track Qtr Results" : "Avoid Long Term")
                     : ((pe > 0 && pe < indPe && roe >= 15) ? "Good Fundamental Hold" : "Track Qtr Results"));

  if (da && da.verdictSummary) {
    ipo.simpleSummary = `${da.verdictHeadline} — ${da.verdictSummary}`;
  } else {
    ipo.simpleSummary = `Auto-Analysis: Issue Price ₹${price}, QIB ${qib}x, OFS ${ofs}%${pe > 0 ? `, P/E ${pe}x` : ""}. ${score >= 7 ? "Demand aur fundamentals achhe hain." : "Apply ya hold karne se pehle QIB demand aur valuation zaroor dekhein."}`;
  }

  ipo.postListing = {
    holdingDays: verdict.includes("AVOID")
      ? "0 Days (Weak Fundamentals/Demand — Exit)"
      : (da && da.verdictType === "demand_hype")
        ? "1–3 Days (Sirf Hype Demand — Listing Gain Book Karein)"
        : (qib >= 15 || (da && da.businessScore >= 7.2))
          ? "30–60 Days (Anchor Lock-in se pehle review)"
          : "1–5 Days (Momentum Hold)",
    target1: `₹${fairVal} (Fair Value Estimate)`,
    target2: `₹${Math.round(fairVal * (qib >= 15 ? 1.12 : 1.05))} (QIB Momentum Target)`,
    stopLoss: `₹${slPrice} (Issue / Institutional Support)`,
    logic: `Yeh Target (₹${fairVal}) aur SL (₹${slPrice}) fixed 10%/5% par nahi, balki RHP P/E (${pe || 'N/A'}x), ROE (${roe ? roe + '%' : 'N/A'}), QIB (${qib}x), aur OFS (${ofs}%) ke hisab se nikala gaya hai.`
  };
  return ipo;
}

function parseUpperBandPrice(bandStr) {
  if (!bandStr) return 0;
  const nums = String(bandStr).replace(/,/g, "").match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return 0;
  return Number(nums[nums.length - 1]) || 0;
}

function extractCategorySub(cats, keyword) {
  if (!cats || typeof cats !== "object") return 0;
  for (const [k, v] of Object.entries(cats)) {
    if (k.toLowerCase().includes(keyword)) {
      const t = typeof v === "object" ? v?.times : v;
      if (t != null && Number.isFinite(Number(t))) return Number(t);
    }
  }
  return 0;
}

// NORMALIZE ANY IPOS.MARKETS RECORD
function mapOfficialRecord(item, subObj) {
  // Prioritize `stage` because `status: "active"` means post-listing exchange trading
  const rawStage = String(item.stage || item.status || "").toLowerCase();
  const status = (rawStage === "open" || rawStage === "live") ? "live"
               : (rawStage.includes("upcoming") || rawStage.includes("pipeline") || rawStage.includes("drhp") || rawStage.includes("sebi") || rawStage.includes("announce")) ? "upcoming"
               : "closed";

  const board = String(item.board || item.segment || "").toLowerCase();
  const category = board.includes("sme") ? "sme" : "mainboard";
  const rawBand = item.band || "";
  const issuePrice = Number(
    item.price || item.issue_price || item.price_high || item.upper_price || item.price_band_high || parseUpperBandPrice(rawBand) || 0
  ) || 100;
  const lowPrice = Number(item.price_low || item.lower_price || item.price_band_low || 0);
  const priceBand = rawBand
    ? (String(rawBand).startsWith("₹") || String(rawBand).toLowerCase().startsWith("rs") ? String(rawBand) : `₹${rawBand}`)
    : (lowPrice && lowPrice !== issuePrice ? `₹${lowPrice} - ₹${issuePrice}` : `₹${issuePrice}`);
  const lotSize = Number(item.lot_size || item.market_lot || 1);
  const minInvest = lotSize > 1 ? `₹${Math.round(issuePrice * lotSize).toLocaleString("en-IN")}` : "Check Lot";

  const openD = item.open || item.open_date || item.opens || item.bidding_start || "";
  const closeD = item.close || item.close_date || item.closes || item.bidding_end || "";
  const listingD = item.listing || item.listing_date || item.listed_on || "TBA";
  const dates = openD && closeD ? `${openD} to ${closeD}` : (openD || (listingD !== "TBA" ? `List: ${listingD}` : "Check Schedule"));

  const totSub = subObj?.total_times ?? subObj?.lower_bound_times ?? item.sub ?? item.subscription_total ?? item.total_times;
  const qibSub = Number(subObj?.categories?.QIB?.times ?? extractCategorySub(subObj?.categories, "qib") ?? item.qib_times ?? 0);
  const niiSub = Number(subObj?.categories?.NII?.times ?? extractCategorySub(subObj?.categories, "non institutional") ?? item.nii_times ?? 0);
  const riiSub = Number(subObj?.categories?.RII?.times ?? extractCategorySub(subObj?.categories, "retail") ?? item.rii_times ?? 0);

  const listPrice = Number(item.listing_close || item.listing_open || item.listing_price || 0);
  const currPrice = Number(item.cmp || item.current_price || item.ltp || listPrice || 0);
  const actualListingGain =
    item.gain != null && Number.isFinite(Number(item.gain))
      ? Number(item.gain)
      : (listPrice > 0 && issuePrice > 0 ? ((listPrice - issuePrice) / issuePrice) * 100 : null);
  const gmp = Number(item.gmp || 0);
  const gmpPercent = gmp > 0 && issuePrice > 0
    ? +((gmp / issuePrice) * 100).toFixed(1)
    : (actualListingGain != null ? +actualListingGain.toFixed(1) : 0);

  const sizeNum = item.size ?? item.issue_size_cr;
  const issueSize = sizeNum ? `₹${Number(sizeNum).toLocaleString("en-IN")} Cr` : (item.issue_size || "NSE/BSE");

  const mapped = {
    id: item.slug || item.symbol || item.name,
    slug: item.slug || "",
    symbol: item.symbol || item.exchange?.nse || "",
    name: item.name || item.company_name || "IPO Issue",
    category, status, dates,
    listingDate: listingD,
    openSort: openD || (listingD !== "TBA" ? listingD : (item.year ? `${item.year}-01-01` : "1999-01-01")),
    priceBand, issuePrice, lotSize, minInvest,
    issueSize,
    ofsPercent: Number(item.ofs_pct ?? item.ofs_percent ?? 0),
    freshIssue: item.ofs_pct != null ? `${100 - Number(item.ofs_pct)}% Fresh / ${item.ofs_pct}% OFS` : "Check RHP",
    gmp, gmpPercent, listPrice, currPrice, actualListingGain,
    subscription: {
      total: totSub != null ? Number(totSub).toFixed(2) + "x" : (status === "upcoming" ? "0.0x" : "View"),
      qib: qibSub ? qibSub.toFixed(2) + "x" : "-",
      nii: niiSub ? niiSub.toFixed(2) + "x" : "-",
      retail: riiSub ? riiSub.toFixed(2) + "x" : "-"
    },
    qibSub,
    totalSubNum: totSub != null ? Number(totSub) : null,
    registrar: item.registrar || item.rta || "NSE / BSE",
    pe: Number(item.pe || item.pe_ratio || 0),
    industryPe: Number(item.industry_pe || 26),
    roeVal: Number(item.roe || item.ronw || 0),
    financials: item.financials || [{ year: "Latest", revenue: "Tap to Load RHP", profit: "-", netWorth: "-" }],
    fundamentals: {
      peRatio: item.pe ? `${item.pe}x` : "Tap to Load RHP",
      roe: item.roe ? `${item.roe}%` : "Tap to Load RHP",
      debtToEquity: item.debt_to_equity || "Check RHP"
    },
    smartMoney: {
      fiiAllocation: qibSub ? `QIB ${qibSub.toFixed(2)}x` : "Exchange Book",
      anchorInvestors: item.anchor_amount ? `Anchor ₹${item.anchor_amount} Cr` : (item.anchor_pct ? `Anchor ${item.anchor_pct}%` : "Check RHP"),
      anchorLockIn30: item.lock_in_30 || "Listing + 30 Days",
      anchorLockIn90: item.lock_in_90 || "Listing + 90 Days",
      marketMood: "Live Market"
    }
  };
  return runAutoAnalyst(mapped);
}

// 100% AUTOMATIC LIVE + PAST + FUTURE SYNC
async function syncLiveData(manualClick = false) {
  const btn = document.getElementById("syncBtn");
  if (btn) btn.innerHTML = `<span class="dot"></span> SYNCING...`;
  try {
    const [idxRes, subRes] = await Promise.all([
      fetch("https://ipos.markets/data/issues_index.json?v=" + Date.now()),
      fetch("https://ipos.markets/api/v1/subscription?v=" + Date.now()).catch(() => null)
    ]);

    if (!idxRes.ok) throw new Error("Feed error");
    const rawIdx = await idxRes.json();
    const list = Array.isArray(rawIdx) ? rawIdx : (rawIdx.issues || rawIdx.data || Object.values(rawIdx));

    const subMap = {};
    if (subRes && subRes.ok) {
      const rawSub = await subRes.json();
      const sList = Array.isArray(rawSub) ? rawSub : (rawSub.issues || []);
      sList.forEach(s => {
        if (s.slug) subMap[s.slug] = s;
        if (s.symbol) subMap[s.symbol] = s;
      });
    }

    const equityOnly = list
      .filter(i => !String(i.board || i.instrument || i.offer_type || "").toLowerCase().includes("debt"))
      .map(i => mapOfficialRecord(i, subMap[i.slug] || subMap[i.symbol]))
      .sort((a, b) => String(b.openSort).localeCompare(String(a.openSort)));

    if (equityOnly.length > 0) {
      remoteIPOs = equityOnly;
      try { localStorage.setItem("hdRemoteIPOs", JSON.stringify(equityOnly.slice(0, 120))); } catch (_) {}
      renderCurrentPage();
      if (manualClick) showNotice(`Sync Complete! ${equityOnly.length} Past, Live & Upcoming IPOs loaded.`);
    }
  } catch (e) {
    if (manualClick) showNotice("Internet check karein ya thodi der baad SYNC LIVE dabayein!");
  }
  if (btn) btn.innerHTML = `<span class="dot"></span> SYNC`;
}

function renderCurrentPage() {
  const isHome = currentPage === "home";
  searchSection.classList.toggle("hidden", !isHome);
  filterSection.classList.toggle("hidden", !isHome);
  tabsBar.classList.toggle("hidden", !isHome);

  if (currentPage === "home") renderIPOs();
  else if (currentPage === "gmp") renderGMPPage();
  else if (currentPage === "watchlist") renderSavedPage();
  else if (currentPage === "allotment") renderAllotmentPage();
  else if (currentPage === "admin") renderAdminPage();
}

function renderIPOs() {
  const q = currentSearch.trim().toLowerCase();
  let filtered = getAllIPOs().filter((ipo) => {
    const matchCategory = currentCategory === "all" || ipo.category === currentCategory;
    const matchTab = q ? true : (ipo.status === currentTab);
    const matchSearch = ipo.name.toLowerCase().includes(q) || String(ipo.symbol || "").toLowerCase().includes(q);
    return matchCategory && matchTab && matchSearch;
  });

  if (filtered.length === 0) {
    mainContent.innerHTML = `<div class="empty-box">Is category mein abhi koi IPO nahi mila. (Upar Search mein koi bhi naam type karein!)</div>`;
    return;
  }

  const totalCount = filtered.length;
  const shown = filtered.slice(0, 50);
  const showBanner = !isStandaloneApp && !sessionStorage.getItem("hdInstallBannerDismissed");
  const cfg = (window.hdAuth && window.hdAuth.appConfig) ? window.hdAuth.appConfig : { apkUrl: "", appVersion: "v1.0" };
  const hasApk = Boolean(cfg.apkUrl && /^https:\/\//i.test(cfg.apkUrl));
  const installBannerHtml = showBanner ? `
    <div class="install-banner">
      <div class="install-banner-left">
        <b>📲 HD IPO Live App ${hasApk ? `(${escapeHtml(cfg.appVersion || "v1.0")})` : ""}</b>
        <small>Live GMP, 3-Yr Financials & Family Allotment — 1-Tap Install</small>
      </div>
      <div style="display:flex;align-items:center;gap:5px;">
        <button class="btn-analyze" style="background:#15803d;" onclick="openInstallPopup()">Install Now</button>
        <button class="btn-analyze" style="background:#1d4ed8;" onclick="openShareModal()" title="Share">📤</button>
        <button class="banner-close" onclick="sessionStorage.setItem('hdInstallBannerDismissed','1');renderIPOs();" aria-label="Close">✕</button>
      </div>
    </div>
  ` : "";

  const note = totalCount > 50
    ? `<p style="font-size:11.5px;color:#475569;margin-bottom:8px;">Showing latest 50 of <b>${totalCount}</b> IPOs — kisi bhi purane ya naye IPO ke liye upar Search karein!</p>`
    : (q ? `<p style="font-size:11.5px;color:#1d4ed8;margin-bottom:8px;">Search Results across Past, Live & Future: <b>${totalCount}</b> found</p>` : "");

  mainContent.innerHTML = installBannerHtml + note + shown.map(buildIPOCard).join("");
}

function buildIPOCard(ipo) {
  const catBadge = ipo.category === "sme"
    ? `<span class="badge badge-sme">SME IPO</span>`
    : `<span class="badge badge-mainboard">Mainboard</span>`;
  const gmpClass = ipo.gmpPercent >= 10 ? "gmp-green" : "gmp-red";
  const rightMetricLabel = ipo.currPrice > 0 ? "Current Price" : (ipo.gmp > 0 ? "Est. GMP" : "Status");
  const rightMetricVal = ipo.currPrice > 0
    ? `₹${ipo.currPrice} (${ipo.actualListingGain != null ? (ipo.actualListingGain >= 0 ? '+' : '') + ipo.actualListingGain.toFixed(1) + '%' : 'Listed'})`
    : (ipo.gmp > 0 ? `₹${ipo.gmp} (${ipo.gmpPercent}%)` : ipo.status.toUpperCase());

  return `
    <div class="ipo-card" onclick="openAnalysis('${String(ipo.id).replace(/'/g, "\\'")}')">
      <div class="card-top">
        <div>
          <div class="ipo-name">${escapeHtml(ipo.name)}</div>
          <div class="tag-row">
            ${catBadge}
            <span class="badge" style="background:#f1f5f9;color:#475569;">${escapeHtml(ipo.dates)}</span>
          </div>
        </div>
        <div class="verdict-box">
          <span class="verdict-pill ${getVerdictClass(ipo.verdict)}">${escapeHtml(ipo.verdict)}</span>
          <div class="score-text">Score: ${ipo.score}/10</div>
        </div>
      </div>

      <div class="card-grid">
        <div><div class="metric-label">Price Band</div><div class="metric-val">${escapeHtml(ipo.priceBand)}</div></div>
        <div><div class="metric-label">Min Invest</div><div class="metric-val">${escapeHtml(ipo.minInvest)}</div></div>
        <div><div class="metric-label">${rightMetricLabel}</div><div class="metric-val ${gmpClass}">${escapeHtml(rightMetricVal)}</div></div>
      </div>

      <div class="card-targets">
        <div class="target-info"><b>Sub:</b> ${escapeHtml(ipo.subscription.total)} • <b>QIB:</b> ${escapeHtml(ipo.subscription.qib)}</div>
        <button class="btn-analyze">Full Analysis →</button>
      </div>
    </div>
  `;
}

function renderGMPPage() {
  const top = [...getAllIPOs()]
    .filter(i => i.status === "live" || i.status === "upcoming" || i.actualListingGain != null)
    .slice(0, 40)
    .sort((a, b) => b.gmpPercent - a.gmpPercent);

  mainContent.innerHTML = `
    <div class="page-title">📈 Live Demand & Listing Gains</div>
    ${top.map(ipo => `
      <div class="gmp-row" onclick="openAnalysis('${String(ipo.id).replace(/'/g, "\\'")}')">
        <div class="gmp-left">
          <h4>${escapeHtml(ipo.name)}</h4>
          <p>Issue: ₹${ipo.issuePrice} ${ipo.currPrice ? `→ Live: <b>₹${ipo.currPrice}</b>` : `(${ipo.status.toUpperCase()})`}</p>
        </div>
        <div class="gmp-right">
          <div class="gmp-big" style="color:${ipo.gmpPercent >= 10 ? '#16a34a' : '#dc2626'}">${ipo.gmpPercent ? (ipo.gmpPercent > 0 ? '+' : '') + ipo.gmpPercent + '%' : escapeHtml(ipo.subscription.total)}</div>
          <span class="verdict-pill ${getVerdictClass(ipo.verdict)}" style="font-size:10px;padding:2px 6px;">${escapeHtml(ipo.verdict)}</span>
        </div>
      </div>
    `).join("")}
  `;
}

function renderSavedPage() {
  const savedList = getAllIPOs().filter(ipo => savedIds.includes(String(ipo.id)));
  if (savedList.length === 0) {
    mainContent.innerHTML = `<div class="empty-box"><b>Abhi koi IPO Saved nahi hai!</b><br><br>Kisi bhi IPO ki Analysis screen khol kar upar <b>☆ Save</b> dabayein.</div>`;
    return;
  }
  mainContent.innerHTML = `<div class="page-title">★ Saved Watchlist (${savedList.length})</div>` + savedList.map(buildIPOCard).join("");
}

function renderAllotmentPage() {
  const activeQueueMember = queueIndex >= 0 && familyPans[queueIndex] ? familyPans[queueIndex] : null;
  mainContent.innerHTML = `
    <div class="page-title">👨‍👩‍👧‍👦 Family PAN Vault & Fast Allotment</div>
    <div class="pan-card">
      <div class="section-heading">1️⃣ Registrar Chunein</div>
      <div class="form-field">
        <select id="regSelect" onchange="selectedRegistrar = this.value">
          <option value="https://in.mpms.mufg.com/Initial_Offer/public-issues.html" ${selectedRegistrar.includes('mufg') ? 'selected' : ''}>MUFG Intime (Link Intime)</option>
          <option value="https://ipostatus.kfintech.com/" ${selectedRegistrar.includes('kfintech') ? 'selected' : ''}>KFintech Registrar</option>
          <option value="https://www.bigshareonline.com/ipo_Allotment.html" ${selectedRegistrar.includes('bigshare') ? 'selected' : ''}>Bigshare Services</option>
          <option value="https://www.bseindia.com/investors/appli_check.aspx" ${selectedRegistrar.includes('bseindia') ? 'selected' : ''}>BSE India IPO Status</option>
          <option value="https://www.nseindia.com/products/dynaContent/equities/ipos/ipo_login.jsp" ${selectedRegistrar.includes('nseindia') ? 'selected' : ''}>NSE India IPO Status</option>
        </select>
      </div>
      <div class="section-heading" style="margin-top:10px;">2️⃣ Family Member PAN Add Karein</div>
      <div class="form-grid">
        <div class="form-field"><input type="text" id="panName" placeholder="Name (e.g. Papa)"></div>
        <div class="form-field"><input type="text" id="panNumber" placeholder="PAN (ABCDE1234F)" maxlength="10" style="text-transform:uppercase;"></div>
      </div>
      <button class="btn-primary-full" style="background:#15803d;margin-top:0;" onclick="addFamilyPan()">+ Save Family PAN</button>

      ${familyPans.length > 0 ? `
        <div style="margin-top:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <b style="font-size:12.5px;">Saved PANs (${familyPans.length})</b>
            <button class="btn-copy-open" style="background:#1d4ed8;" onclick="startFamilyQueue()">⚡ Check All 1-by-1</button>
          </div>
          ${activeQueueMember ? `
            <div class="queue-box">
              <div><b>Checking (${queueIndex + 1}/${familyPans.length}):</b> ${escapeHtml(activeQueueMember.name)} — <b>${escapeHtml(activeQueueMember.pan)}</b> ✅ (Copied!)</div>
              <div class="queue-btns">
                <button class="btn-copy-open" onclick="openRegistrarWithPan('${activeQueueMember.pan}')">Open Site & Paste ↗</button>
                <button class="btn-copy-open" style="background:#1d4ed8;" onclick="nextFamilyQueue()">Next →</button>
                <button class="del-btn" onclick="stopFamilyQueue()">Close</button>
              </div>
            </div>
          ` : ""}
          ${familyPans.map((p, idx) => `
            <div class="pan-row">
              <div class="pan-info"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.pan)}</small></div>
              <div class="pan-actions">
                <button class="btn-copy-open" onclick="openRegistrarWithPan('${p.pan}')">Copy & Check ↗</button>
                <button class="del-btn" onclick="deleteFamilyPan(${idx})">✕</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<p style="font-size:11.5px;color:#64748b;margin-top:8px;">Abhi koi Family PAN save nahi hai. Upar se add karein.</p>`}
    </div>
  `;
}

async function addFamilyPan() {
  const name = document.getElementById("panName").value.trim();
  const pan = document.getElementById("panNumber").value.trim().toUpperCase();
  if (!name) return showNotice("Naam likhein!");
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) return showNotice("Sahi 10-digit PAN daalein (e.g. ABCDE1234F)");
  const entry = { name, pan };
  if (window.hdAuth && window.hdAuth.hasAdvanceAccess()) {
    try {
      const docId = await window.hdAuth.syncFamilyPanAdd(name, pan);
      if (docId) entry.id = docId;
    } catch (_) {}
  }
  familyPans.push(entry);
  localStorage.setItem("hdFamilyPans", JSON.stringify(familyPans));
  renderAllotmentPage();
  showNotice(`${name} ka PAN save ho gaya!`);
}
function deleteFamilyPan(idx) {
  const removed = familyPans[idx];
  familyPans.splice(idx, 1);
  localStorage.setItem("hdFamilyPans", JSON.stringify(familyPans));
  if (removed && removed.id && window.hdAuth && window.hdAuth.hasAdvanceAccess()) {
    window.hdAuth.syncFamilyPanDelete(removed.id).catch(() => {});
  }
  queueIndex = -1;
  renderAllotmentPage();
}
function openRegistrarWithPan(pan) {
  copyTextSafe(pan);
  showNotice("PAN Copied: " + pan + " — Website par Paste karein!");
  const a = document.createElement("a");
  a.href = selectedRegistrar;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.click();
}
function startFamilyQueue() { if (!familyPans.length) return; queueIndex = 0; copyTextSafe(familyPans[0].pan); renderAllotmentPage(); }
function nextFamilyQueue() { if (queueIndex + 1 < familyPans.length) { queueIndex++; copyTextSafe(familyPans[queueIndex].pan); renderAllotmentPage(); } else { showNotice("Sab family PANs check ho gaye!"); queueIndex = -1; renderAllotmentPage(); } }
function stopFamilyQueue() { queueIndex = -1; renderAllotmentPage(); }

function toggleSave(id) {
  const sid = String(id);
  if (savedIds.includes(sid)) savedIds = savedIds.filter(item => item !== sid);
  else savedIds.push(sid);
  localStorage.setItem("hdIpoSaved", JSON.stringify(savedIds));
  if (window.hdAuth && window.hdAuth.hasAdvanceAccess()) {
    window.hdAuth.syncSavedIds(savedIds).catch(() => {});
  }
  const btn = document.getElementById("modalSaveBtn");
  if (btn) btn.textContent = savedIds.includes(sid) ? "★ Saved" : "☆ Save";
  if (currentPage === "watchlist") renderSavedPage();
}

let activeAnalysisIpoId = null;

function hasAdvanceUnlocked() {
  return Boolean(window.hdAuth && window.hdAuth.hasAdvanceAccess());
}

async function openAnalysis(id) {
  let ipo = getAllIPOs().find(item => String(item.id) === String(id));
  if (!ipo) return;
  activeAnalysisIpoId = String(ipo.id);

  const unlocked = hasAdvanceUnlocked();
  if (unlocked && window.hdAuth) {
    window.hdAuth.logIpoAdvanceView(ipo.name, ipo.category).catch(() => {});
  }

  const needsFetch = unlocked && !ipo.financialsLoaded;
  drawModal(ipo, needsFetch);

  if (!needsFetch) return;

  try {
    const finUrl = `/api/hdipo/financials?name=${encodeURIComponent(ipo.name)}&slug=${encodeURIComponent(ipo.slug || "")}`;
    const [finRes, detRes, subRes] = await Promise.all([
      fetch(finUrl).catch(() => null),
      ipo.slug ? fetch(`https://ipos.markets/data/issue/${ipo.slug}.json?v=${Date.now()}`).catch(() => null) : Promise.resolve(null),
      ipo.slug ? fetch(`https://ipos.markets/api/v1/subscription?symbol=${encodeURIComponent(ipo.slug)}`).catch(() => null) : Promise.resolve(null)
    ]);

    if (detRes && detRes.ok) {
      const d = await detRes.json();
      if (d.pe || d.fundamentals?.pe) ipo.pe = Number(d.pe || d.fundamentals.pe);
      if (d.roe || d.fundamentals?.roe) ipo.roeVal = Number(d.roe || d.fundamentals.roe);
      if (d.ofs_pct != null) { ipo.ofsPercent = Number(d.ofs_pct); ipo.freshIssue = `${100 - ipo.ofsPercent}% Fresh / ${ipo.ofsPercent}% OFS`; }
      if (Array.isArray(d.financials) && d.financials.length) {
        ipo.financials = d.financials.map(f => ({
          year: f.year || f.fy || "-",
          revenue: f.revenue ? `₹${f.revenue} Cr` : "-",
          profit: (f.pat ?? f.profit) != null ? `₹${f.pat ?? f.profit} Cr` : "-",
          netWorth: f.net_worth ? `₹${f.net_worth} Cr` : "-",
          borrowing: "-",
          profitNum: (f.pat ?? f.profit) != null ? Number(f.pat ?? f.profit) : null
        }));
      }
      if (d.registrar || d.registrar_slug) ipo.registrar = d.registrar || d.registrar_slug;
      if (d.current_price || d.cmp) ipo.currPrice = Number(d.current_price || d.cmp);
      if (d.issue_price_clean) ipo.issuePrice = Number(d.issue_price_clean);
      if (Array.isArray(d.lockins) && d.lockins.length) {
        if (d.lockins[0]?.date) ipo.smartMoney.anchorLockIn30 = d.lockins[0].date;
        if (d.lockins[1]?.date) ipo.smartMoney.anchorLockIn90 = d.lockins[1].date;
      }
      const latestSub = d.subscription?.latest;
      if (latestSub) {
        if (latestSub.total_times != null) {
          ipo.totalSubNum = Number(latestSub.total_times);
          ipo.subscription.total = ipo.totalSubNum.toFixed(2) + "x";
        }
        const qibT = extractCategorySub(latestSub.categories, "qib");
        const niiT = extractCategorySub(latestSub.categories, "non institutional");
        const retT = extractCategorySub(latestSub.categories, "retail");
        if (qibT > 0) { ipo.qibSub = qibT; ipo.subscription.qib = qibT.toFixed(2) + "x"; }
        if (niiT > 0) ipo.subscription.nii = niiT.toFixed(2) + "x";
        if (retT > 0) ipo.subscription.retail = retT.toFixed(2) + "x";
      }
    }

    if (subRes && subRes.ok) {
      const s = await subRes.json();
      const tot = s.total_times ?? s.lower_bound_times;
      if (tot != null) {
        ipo.totalSubNum = Number(tot);
        ipo.subscription.total = ipo.totalSubNum.toFixed(2) + "x";
      }
      if (s.categories?.QIB?.times != null) { ipo.qibSub = Number(s.categories.QIB.times); ipo.subscription.qib = ipo.qibSub.toFixed(2) + "x"; }
      if (s.categories?.NII?.times != null) ipo.subscription.nii = Number(s.categories.NII.times).toFixed(2) + "x";
      if (s.categories?.RII?.times != null) ipo.subscription.retail = Number(s.categories.RII.times).toFixed(2) + "x";
    }

    // Merge 3-4 Year RHP Financials, Ratios, Business Strengths & Deep Strength vs Demand Analysis
    if (finRes && finRes.ok) {
      const finData = await finRes.json();
      if (finData && finData.found) {
        ipo.financialsLoaded = true;
        ipo.financialsUnavailable = false;
        ipo.rhpSourceUrl = finData.sourceUrl || "";

        if (Array.isArray(finData.financials) && finData.financials.length) {
          ipo.financials = finData.financials.map(f => ({
            year: f.period || "-",
            revenue: f.revenue || "-",
            profit: f.profit || "-",
            ebitda: f.ebitda || "-",
            netWorth: f.netWorth || "-",
            assets: f.assets || "-",
            borrowing: f.borrowing || "-",
            profitNum: f.profitNum
          }));
        }

        const k = finData.kpis || {};
        ipo.kpis = k;
        if (k.prePe != null && k.prePe > 0) ipo.pe = Number(k.prePe);
        else if (k.postPe != null && k.postPe > 0) ipo.pe = Number(k.postPe);
        if (k.roeNum != null) ipo.roeVal = Number(k.roeNum);
        if (k.debtToEquityNum != null) ipo.debtToEquityNum = Number(k.debtToEquityNum);

        const peLabel = (k.prePe && k.postPe)
          ? `Pre ${k.prePe}x / Post ${k.postPe}x`
          : (k.prePe ? `${k.prePe}x (Pre)` : (k.postPe ? `${k.postPe}x (Post)` : (ipo.pe ? `${ipo.pe}x` : "N/A")));

        ipo.fundamentals = {
          peRatio: peLabel,
          roe: k.roe || (ipo.roeVal ? `${ipo.roeVal}%` : "N/A"),
          roce: k.roce || "",
          debtToEquity: k.debtToEquity || ipo.fundamentals?.debtToEquity || "N/A",
          patMargin: k.patMargin || "",
          ebitdaMargin: k.ebitdaMargin || "",
          pb: k.pb || "",
          marketCap: k.marketCap || ""
        };

        const det = finData.issueDetails || {};
        if (det.lotSize && det.lotSize > 0) ipo.lotSize = det.lotSize;
        if (det.minInvest) ipo.minInvest = det.minInvest;
        if (det.ofsPct != null) ipo.ofsPercent = Number(det.ofsPct);
        if (det.freshIssuePct != null && det.ofsPct != null) {
          ipo.freshIssue = `${det.freshIssuePct}% Fresh / ${det.ofsPct}% OFS`;
        } else if (det.freshIssue || det.ofs) {
          ipo.freshIssue = [det.freshIssue ? `Fresh: ${det.freshIssue}` : "", det.ofs ? `OFS: ${det.ofs}` : ""].filter(Boolean).join(" | ");
        }
        if (det.registrar) ipo.registrar = det.registrar;
        if (det.issueSize && (!ipo.issueSize || ipo.issueSize === "NSE/BSE")) ipo.issueSize = det.issueSize;
        if (det.priceBand && (!ipo.priceBand || ipo.priceBand === "₹100")) ipo.priceBand = det.priceBand;
        if (det.listingDate && (!ipo.listingDate || ipo.listingDate === "TBA")) ipo.listingDate = det.listingDate;

        const fs = finData.subscription || {};
        if (fs.totalNum != null && fs.totalNum > 0) {
          ipo.totalSubNum = fs.totalNum;
          ipo.subscription.total = fs.total || `${fs.totalNum.toFixed(2)}x`;
        } else if (fs.total && (ipo.subscription.total === "View" || ipo.subscription.total === "0.0x")) {
          ipo.subscription.total = fs.total;
        }
        if (fs.qibNum != null && fs.qibNum > 0) {
          ipo.qibSub = fs.qibNum;
          ipo.subscription.qib = fs.qib || `${fs.qibNum.toFixed(2)}x`;
        }
        if (fs.nii && ipo.subscription.nii === "-") ipo.subscription.nii = fs.nii;
        if (fs.retail && ipo.subscription.retail === "-") ipo.subscription.retail = fs.retail;
        if (fs.applications) ipo.subscription.applications = fs.applications;
        if (fs.asOn) ipo.subscription.asOn = fs.asOn;

        if (finData.business) ipo.business = finData.business;
        if (finData.analysis) ipo.deepAnalysis = finData.analysis;
      }
    }

    if (!ipo.financialsLoaded) {
      ipo.fundamentals = {
        peRatio: ipo.pe ? `${ipo.pe}x` : "N/A",
        roe: ipo.roeVal ? `${ipo.roeVal}%` : "N/A",
        debtToEquity: ipo.fundamentals?.debtToEquity || "N/A"
      };
      if (!Array.isArray(ipo.financials) || !ipo.financials.length || ipo.financials[0]?.revenue === "Tap to Load RHP") {
        ipo.financialsUnavailable = true;
      }
    }

    ipo = runAutoAnalyst(ipo);
    drawModal(ipo, false);
  } catch (_) {
    if (!ipo.financialsLoaded && (!Array.isArray(ipo.financials) || ipo.financials[0]?.revenue === "Tap to Load RHP")) {
      ipo.financialsUnavailable = true;
    }
    drawModal(ipo, false);
  }
}

function drawModal(ipo, isLoading) {
  const isSaved = savedIds.includes(String(ipo.id));
  const safeId = String(ipo.id).replace(/'/g, "\\'");
  const da = ipo.deepAnalysis || null;
  const hasRealFinancials = Array.isArray(ipo.financials) && ipo.financials.length > 0 && ipo.financials[0].revenue !== "Tap to Load RHP";
  const hasDebtCol = hasRealFinancials && ipo.financials.some(f => f.borrowing && f.borrowing !== "-" && f.borrowing !== "");

  const businessVsDemandHtml = da ? `
    <div class="section-card">
      <div class="section-heading">🏢 Company Strong Hai ya 🔥 Sirf Market Demand?</div>
      <div class="biz-demand-grid">
        <div class="bd-box tone-${getScoreTone(da.businessScore)}">
          <div class="bd-label">🏢 Company Ka Kaam</div>
          <div class="bd-score">${da.businessScore}<span>/10</span></div>
          <div class="bd-bar"><div class="bd-fill" style="width:${Math.min(100, Math.round(da.businessScore * 10))}%"></div></div>
          <div class="bd-tag">${escapeHtml(da.businessLabel)}</div>
        </div>
        <div class="bd-box tone-${getScoreTone(da.demandScore)}">
          <div class="bd-label">🔥 Market Demand</div>
          <div class="bd-score">${da.demandScore}<span>/10</span></div>
          <div class="bd-bar"><div class="bd-fill" style="width:${Math.min(100, Math.round(da.demandScore * 10))}%"></div></div>
          <div class="bd-tag">${escapeHtml(da.demandLabel)}</div>
        </div>
      </div>

      <div class="diagnosis-box diag-${escapeHtml(da.verdictType || "weak")}">
        <div class="diag-title">${escapeHtml(da.verdictHeadline)}</div>
        <div class="diag-desc">${escapeHtml(da.verdictSummary)}</div>
      </div>

      ${Array.isArray(da.businessReasons) && da.businessReasons.length ? `
        <div class="mini-subhead">Company Fundamentals Check:</div>
        <ul class="pm-list compact-list">${da.businessReasons.map(r => `<li>• ${escapeHtml(r)}</li>`).join("")}</ul>
      ` : ""}
      ${Array.isArray(da.demandReasons) && da.demandReasons.length ? `
        <div class="mini-subhead" style="margin-top:8px;">Market Demand Check:</div>
        <ul class="pm-list compact-list">${da.demandReasons.map(r => `<li>• ${escapeHtml(r)}</li>`).join("")}</ul>
      ` : ""}
    </div>
  ` : "";

  const growthStripHtml = (da && (da.revGrowthPct != null || da.patGrowthPct != null)) ? `
    <div class="growth-strip">
      <div class="growth-pill">
        <small>Revenue YoY</small>
        <strong class="${da.revGrowthPct != null && da.revGrowthPct >= 0 ? 'gmp-green' : 'gmp-red'}">
          ${da.revGrowthPct != null ? (da.revGrowthPct > 0 ? '+' : '') + da.revGrowthPct + '%' : 'N/A'}
        </strong>
      </div>
      <div class="growth-pill">
        <small>Profit (PAT) YoY</small>
        <strong class="${da.patGrowthPct != null && da.patGrowthPct >= 0 ? 'gmp-green' : 'gmp-red'}">
          ${da.patGrowthPct != null ? (da.patGrowthPct > 0 ? '+' : '') + da.patGrowthPct + '%' : 'N/A'}
        </strong>
      </div>
      <div class="growth-pill">
        <small>Profit Track</small>
        <strong class="${da.allProfitable ? 'gmp-green' : 'gmp-red'}">
          ${da.allProfitable ? 'Consistent ✅' : 'Loss Year ⚠️'}
        </strong>
      </div>
    </div>
  ` : "";

  const financialsBodyHtml = hasRealFinancials ? `
    ${growthStripHtml}
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Revenue</th>
            <th>Profit (PAT)</th>
            <th>Net Worth</th>
            ${hasDebtCol ? "<th>Debt</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${ipo.financials.map(f => {
            const isLoss = (f.profitNum != null && f.profitNum < 0) || String(f.profit || "").trim().startsWith("-");
            const patColor = isLoss ? "#dc2626" : "#15803d";
            return `<tr>
              <td><b>${escapeHtml(f.year)}</b></td>
              <td>${escapeHtml(f.revenue)}</td>
              <td style="color:${patColor};font-weight:700;">${escapeHtml(f.profit)}</td>
              <td>${escapeHtml(f.netWorth)}</td>
              ${hasDebtCol ? `<td>${escapeHtml(f.borrowing || "-")}</td>` : ""}
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div class="fin-footnote">RHP Restated Financials (₹ Crore mein) • Latest period upar dikhaya gaya hai.</div>
  ` : (isLoading ? `
    <p class="fin-loading">⏳ Pichhle 3–4 saal ka RHP Revenue, Profit, Net Worth aur Debt data fetch ho raha hai...</p>
  ` : `
    <p class="fin-empty">Is purane ya unlisted IPO ka 3-saal ka RHP financial table abhi exchange directory mein available nahi hai.</p>
  `);

  const businessOverviewHtml = (ipo.business && (ipo.business.about || (ipo.business.strengths && ipo.business.strengths.length))) ? `
    <div class="section-card">
      <div class="section-heading">🏭 Company Kya Kaam Karti Hai & Strengths</div>
      ${ipo.business.about ? `<p class="about-text">${escapeHtml(ipo.business.about)}</p>` : ""}
      ${Array.isArray(ipo.business.strengths) && ipo.business.strengths.length ? `
        <div class="mini-subhead" style="margin-top:8px;">Key Competitive Strengths:</div>
        <ul class="pm-list compact-list">
          ${ipo.business.strengths.slice(0, 5).map(s => `<li>✅ ${escapeHtml(s)}</li>`).join("")}
        </ul>
      ` : ""}
    </div>
  ` : "";

  const roeRoceVal = [ipo.fundamentals.roe, ipo.fundamentals.roce ? `ROCE ${ipo.fundamentals.roce}` : ""].filter(Boolean).join(" | ");
  const debtMarginVal = [
    ipo.fundamentals.debtToEquity ? `D/E ${ipo.fundamentals.debtToEquity}` : "",
    ipo.fundamentals.patMargin ? `PAT ${ipo.fundamentals.patMargin}` : ""
  ].filter(Boolean).join(" | ") || "N/A";

  const unlocked = hasAdvanceUnlocked();

  const advanceLockedHtml = `
    <div class="section-card">
      <div class="section-heading">📋 Basic Issue Details (Sabke Liye Free)</div>
      <div class="kv-row"><span class="kv-label">Issue Price / Size</span><span class="kv-val">${escapeHtml(ipo.priceBand)} | ${escapeHtml(ipo.issueSize)}</span></div>
      <div class="kv-row"><span class="kv-label">Dates / Status</span><span class="kv-val">${escapeHtml(ipo.dates)} (${escapeHtml(ipo.status.toUpperCase())})</span></div>
      <div class="kv-row"><span class="kv-label">Subscription (Tot / QIB / NII / Ret)</span><span class="kv-val">${escapeHtml(ipo.subscription.total)} | ${escapeHtml(ipo.subscription.qib)} / ${escapeHtml(ipo.subscription.nii)} / ${escapeHtml(ipo.subscription.retail)}</span></div>
      <div class="kv-row" style="border:none;"><span class="kv-label">Registrar</span><span class="kv-val">${escapeHtml(ipo.registrar)}</span></div>
    </div>

    <div class="advance-lock-card">
      <span class="lock-badge">🔒 ADVANCE DATA ANALYSIS</span>
      <h3>3–4 Saal ka Pichhla Data & Deep Analysis Unlock Karein</h3>
      <p>Basic details sabko free dikhti hain. Advance research aur targets dekhne ke liye sirf 1 baar Free Mobile Login karein:</p>
      <ul class="lock-features">
        <li>🏢 <b>Company Strong Hai ya Sirf Market Demand?</b> (Business vs Demand Score)</li>
        <li>📊 <b>3–4 Saal ka RHP Pichhla Data</b> (Revenue, Profit, Net Worth, Debt & YoY Growth)</li>
        <li>🏦 <b>Full Ratios & Strengths</b> (Pre/Post P/E, ROE, ROCE, Debt/Equity, Fresh vs OFS)</li>
        <li>📈 <b>Post-Listing Target 1, Target 2, Stop Loss</b> & Live Price Analyzer</li>
      </ul>
      <button class="google-btn" onclick="openAuthModal('${safeId}')">🔓 Free Mobile Login & Unlock Karein →</button>
    </div>
  `;

  const advanceUnlockedHtml = `
      ${businessVsDemandHtml}

      <div class="section-card">
        <div class="section-heading">📊 Pichhla Data (${hasRealFinancials ? ipo.financials.length + " Periods" : "3-Year"} Financials)</div>
        ${financialsBodyHtml}
      </div>

      <div class="section-card">
        <div class="section-heading">✅ Plus Points & ⚠️ Risks</div>
        <ul class="pm-list">${ipo.plusPoints.map(p => `<li>🟢 ${escapeHtml(p)}</li>`).join("")}</ul>
        <ul class="pm-list" style="margin-top:8px;">${ipo.minusPoints.map(m => `<li>🔴 ${escapeHtml(m)}</li>`).join("")}</ul>
      </div>

      ${businessOverviewHtml}

      <div class="section-card">
        <div class="section-heading">🏦 Fundamental Ratios + Subscription + Registrar</div>
        <div class="kv-row"><span class="kv-label">Issue Price / Size</span><span class="kv-val">${escapeHtml(ipo.priceBand)} | ${escapeHtml(ipo.issueSize)}</span></div>
        <div class="kv-row"><span class="kv-label">Lot Size / Min Invest</span><span class="kv-val">${ipo.lotSize > 1 ? `${ipo.lotSize} Shares` : "Check Lot"} | ${escapeHtml(ipo.minInvest)}</span></div>
        <div class="kv-row"><span class="kv-label">P/E Ratio</span><span class="kv-val">${escapeHtml(ipo.fundamentals.peRatio)}</span></div>
        <div class="kv-row"><span class="kv-label">ROE / ROCE</span><span class="kv-val">${escapeHtml(roeRoceVal || "N/A")}</span></div>
        <div class="kv-row"><span class="kv-label">Debt/Equity & Margin</span><span class="kv-val">${escapeHtml(debtMarginVal)}</span></div>
        ${ipo.fundamentals.marketCap || ipo.fundamentals.pb ? `<div class="kv-row"><span class="kv-label">Market Cap / P/B</span><span class="kv-val">${escapeHtml([ipo.fundamentals.marketCap, ipo.fundamentals.pb ? `P/B ${ipo.fundamentals.pb}` : ""].filter(Boolean).join(" | "))}</span></div>` : ""}
        <div class="kv-row"><span class="kv-label">Fresh vs OFS</span><span class="kv-val">${escapeHtml(ipo.freshIssue)}</span></div>
        <div class="kv-row"><span class="kv-label">Subscription (Tot / QIB / NII / Ret)</span><span class="kv-val">${escapeHtml(ipo.subscription.total)} | ${escapeHtml(ipo.subscription.qib)} / ${escapeHtml(ipo.subscription.nii)} / ${escapeHtml(ipo.subscription.retail)}</span></div>
        ${ipo.subscription.applications ? `<div class="kv-row"><span class="kv-label">Total Applications</span><span class="kv-val">${escapeHtml(ipo.subscription.applications)}${ipo.subscription.asOn ? ` (${escapeHtml(ipo.subscription.asOn)})` : ""}</span></div>` : ""}
        <div class="kv-row"><span class="kv-label">Anchor Lock-in (30 / 90 Day)</span><span class="kv-val">${escapeHtml(ipo.smartMoney.anchorLockIn30)} | ${escapeHtml(ipo.smartMoney.anchorLockIn90)}</span></div>
        <div class="kv-row" style="border:none;"><span class="kv-label">Registrar</span><span class="kv-val">${escapeHtml(ipo.registrar)}</span></div>
        ${ipo.rhpSourceUrl ? `<div style="margin-top:8px;text-align:right;"><a href="${escapeHtml(ipo.rhpSourceUrl)}" target="_blank" rel="noopener noreferrer" class="rhp-link">Official RHP / Detail Page ↗</a></div>` : ""}
      </div>

      <div class="section-card post-card">
        <div class="section-heading">📈 Post-Listing Strategy (Data ke Hisab se)</div>
        <div class="kv-row"><span class="kv-label">Kitne Din Rakhna Hai?</span><span class="kv-val">${escapeHtml(ipo.postListing.holdingDays)}</span></div>
        <div class="target-sl-grid">
          <div class="ts-box target"><small>Target 1 & Target 2</small><strong>${escapeHtml(ipo.postListing.target1)}<br>${escapeHtml(ipo.postListing.target2)}</strong></div>
          <div class="ts-box sl"><small>Data-Based Stop Loss (SL)</small><strong>${escapeHtml(ipo.postListing.stopLoss)}</strong></div>
        </div>
        <div class="logic-note"><b>💡 Kyun yeh Target & SL?</b><br>${escapeHtml(ipo.postListing.logic)}</div>

        <div class="calc-box">
          <b style="font-size:12.5px;">🧮 Live Listing Price Analyzer</b>
          <div class="calc-row">
            <input type="number" id="livePriceInput" value="${ipo.currPrice || ''}" placeholder="Live Price (₹) daalein...">
            <button onclick="analyzeLivePrice('${safeId}')">Check</button>
          </div>
          <div id="liveCalcResult" class="calc-result hidden"></div>
        </div>
      </div>
  `;

  analysisModal.innerHTML = `
    <div class="modal-header">
      <button class="back-btn" onclick="closeAnalysis()">← Back</button>
      <div class="modal-title">${escapeHtml(ipo.name)}</div>
      <button id="modalSaveBtn" class="save-btn" onclick="toggleSave('${safeId}')">${isSaved ? "★ Saved" : "☆ Save"}</button>
    </div>
    <div class="modal-body">
      ${isLoading && unlocked ? `<p class="loading-banner">⏳ 3–4 Saal ka RHP Pichhla Data (Financials), Ratios & Market Demand load ho raha hai...</p>` : ""}

      <div class="section-card hero-decision">
        <div class="hero-top">
          <span class="verdict-pill ${getVerdictClass(ipo.verdict)}" style="font-size:13px;padding:6px 12px;">Faisla: ${escapeHtml(ipo.verdict)}</span>
          <div class="score-big">HD Score: ${ipo.score}/10</div>
        </div>
        <div class="summary-text">${escapeHtml(unlocked ? ipo.simpleSummary : `Issue Price ${ipo.priceBand} | Subscription ${ipo.subscription.total}. Full 3-Year Financials aur Company vs Market Demand analysis ke liye niche Login karein.`)}</div>
        <div class="horizon-grid">
          <div class="horizon-box"><small>Listing Gain</small><strong>${escapeHtml(ipo.listingGain)}</strong></div>
          <div class="horizon-box"><small>Short Term</small><strong>${escapeHtml(ipo.shortTerm)}</strong></div>
          <div class="horizon-box"><small>Long Term</small><strong>${escapeHtml(ipo.longTerm)}</strong></div>
        </div>
      </div>

      ${unlocked ? advanceUnlockedHtml : advanceLockedHtml}

      <p class="disclaimer">Data powered by NSE/BSE/SEBI RHP & live exchange feeds. Educational purpose only — consult your advisor before investing.</p>
    </div>
  `;
  analysisModal.classList.remove("hidden");
  analysisModal.scrollTop = 0;
}

function closeAnalysis() {
  activeAnalysisIpoId = null;
  analysisModal.classList.add("hidden");
}

function analyzeLivePrice(id) {
  const ipo = getAllIPOs().find(item => String(item.id) === String(id));
  const price = parseFloat(document.getElementById("livePriceInput").value);
  const resBox = document.getElementById("liveCalcResult");
  if (!price || price <= 0) { resBox.innerHTML = "Sahi Live Price (₹) daalein."; resBox.classList.remove("hidden"); return; }

  const gainPct = ((price - ipo.issuePrice) / ipo.issuePrice) * 100;
  const pe = ipo.pe || 24;
  const indPe = ipo.industryPe || 26;
  const peLive = +(pe * (price / ipo.issuePrice)).toFixed(1);
  const fairVal = Math.round(ipo.issuePrice * (indPe / pe));
  const strongInst = ipo.qibSub >= 15 && ipo.ofsPercent <= 40;

  let action, hold, target, sl, reason;
  if (peLive > indPe * 1.15 && ipo.qibSub < 5) {
    action = "🔴 EXIT / SELL ON RISE"; hold = "0–2 Days";
    target = "₹" + Math.round(price * 1.04); sl = "₹" + Math.round(price * 0.97);
    reason = `P/E (${peLive}x) mehanga hai aur QIB support kamzor hai.`;
  } else if (price >= fairVal * 1.15) {
    action = "🟡 60% PROFIT BOOK, 40% TRAIL"; hold = "7–15 Days";
    target = "₹" + Math.round(price * (strongInst ? 1.14 : 1.06));
    sl = "₹" + Math.round(ipo.issuePrice + (price - ipo.issuePrice) * 0.65);
    reason = `Fair Value (₹${fairVal}) se upar hai—aadha profit lock karein.`;
  } else if (peLive <= indPe && strongInst && gainPct >= 0) {
    action = "🟢 STRONG HOLD / ADD ON DIPS"; hold = "30–90 Days";
    target = "₹" + Math.round(Math.max(fairVal, price * 1.18));
    sl = "₹" + Math.round(Math.max(ipo.issuePrice * 0.96, price * 0.91));
    reason = `P/E (${peLive}x) sasta hai aur QIB (${ipo.qibSub}x) mazboot hai.`;
  } else {
    action = "🟡 CAUTIOUS HOLD WITH SL"; hold = "5–15 Days";
    target = "₹" + Math.round(Math.max(fairVal, price * 1.08));
    sl = "₹" + Math.round(price * 0.94);
    reason = `Valuation (${peLive}x) aur ${ipo.ofsPercent}% OFS ke hisab se tight SL rakhein.`;
  }
  resBox.innerHTML = `
    <div><b>Action:</b> ${action}</div>
    <div><b>Gain/Loss:</b> ${gainPct.toFixed(1)}% (Live P/E: ${peLive}x)</div>
    <div><b>Hold:</b> ${hold}</div>
    <div><b>Target:</b> ${target} | <b>Stop Loss:</b> ${sl}</div>
    <div style="margin-top:4px;color:#334155;">${reason}</div>
  `;
  resBox.classList.remove("hidden");
}

// EVENT LISTENERS (Search, Category Chips, Status Tabs, Bottom Navigation)
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    currentSearch = e.target.value;
    renderCurrentPage();
  });
}

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    chips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    currentCategory = chip.dataset.category || "all";
    renderCurrentPage();
  });
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentTab = tab.dataset.tab || "live";
    renderCurrentPage();
  });
});

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    navItems.forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    currentPage = item.dataset.page || "home";
    renderCurrentPage();
  });
});

// ===== PWA INSTALL POPUP, DIRECT APK DOWNLOAD, RICH SHARE & VERSION UPDATE POPUP =====
let deferredInstallPrompt = null;
const installBtn = document.getElementById("installBtn");
const popupOverlay = document.getElementById("hdPopupOverlay");
const isStandaloneApp = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroidDevice = /android/i.test(navigator.userAgent);
const isInIframe = (() => { try { return window.self !== window.top; } catch (_) { return true; } })();

const HD_VERSION_STORAGE_KEY = "hdUserAppVersion";
let updatePopupShownThisSession = false;
let autoInstallPopupTriggered = false;

if (installBtn && isStandaloneApp) {
  installBtn.classList.add("hidden");
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (installBtn && !isStandaloneApp) {
    installBtn.classList.remove("hidden");
    installBtn.textContent = "📲 Install Now";
  }
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  if (installBtn) installBtn.classList.add("hidden");
  closePopupOverlay();
  showNotice("HD IPO App aapke mobile par install ho gaya!");
});

function closePopupOverlay() {
  if (popupOverlay) {
    popupOverlay.classList.add("hidden");
    popupOverlay.innerHTML = "";
  }
}

function getAppConfigSafe() {
  return (window.hdAuth && window.hdAuth.appConfig)
    ? window.hdAuth.appConfig
    : { apkUrl: "", appVersion: "v1.0", updateNotes: "", loaded: false };
}

function normalizeVersionParts(ver) {
  const clean = String(ver || "1.0").trim().replace(/^v/i, "");
  const nums = clean.split(/[^0-9]+/).filter(Boolean).map(n => parseInt(n, 10));
  return nums.length ? nums : [1, 0];
}

function compareAppVersions(vA, vB) {
  const a = normalizeVersionParts(vA);
  const b = normalizeVersionParts(vB);
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const na = a[i] || 0;
    const nb = b[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function getLocalAppVersion(remoteVersion) {
  let savedVer = localStorage.getItem(HD_VERSION_STORAGE_KEY);
  if (savedVer) return savedVer;
  const hasPreviousData = Boolean(
    localStorage.getItem("hdRemoteIPOs") ||
    localStorage.getItem("hdIpoSaved") ||
    localStorage.getItem("hdFamilyPans") ||
    localStorage.getItem("hdCustomIPOs")
  );
  // Returning users who used earlier versions start from v1.0 so they receive new update prompts
  savedVer = hasPreviousData ? "v1.0" : (remoteVersion || "v1.0");
  try { localStorage.setItem(HD_VERSION_STORAGE_KEY, savedVer); } catch (_) {}
  return savedVer;
}

function startApkFileDownload(apkUrl) {
  if (!apkUrl || !/^https:\/\//i.test(apkUrl)) return false;
  const a = document.createElement("a");
  a.href = apkUrl;
  a.setAttribute("download", "HD-IPO.apk");
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}

function openInstallPopup() {
  const cfg = getAppConfigSafe();
  const hasApk = Boolean(cfg.apkUrl && /^https:\/\//i.test(cfg.apkUrl));
  const canNativeInstall = Boolean(deferredInstallPrompt);
  const versionLabel = cfg.appVersion || "v1.0";

  if (!popupOverlay) {
    openInstallGuide();
    return;
  }

  const primaryLabel = hasApk && (isAndroidDevice || !canNativeInstall)
    ? `📲 Install Now (Download APK ${escapeHtml(versionLabel)})`
    : "📲 Install Now";

  popupOverlay.innerHTML = `
    <div class="hd-popup-card">
      <button class="hd-popup-x" onclick="dismissInstallPopup()" aria-label="Close">✕</button>
      <div class="hd-popup-brand">
        <img src="/pwa-192x192.png" alt="HD IPO" class="hd-popup-icon">
        <div>
          <div class="hd-popup-badge">OFFICIAL MOBILE APP • ${escapeHtml(versionLabel)}</div>
          <h3 class="hd-popup-title">HD IPO Live Install Karein</h3>
        </div>
      </div>

      <p class="hd-popup-desc">
        Apne phone par <b>HD IPO</b> install karein — bina browser ke fast full-screen experience aur live updates ke saath:
      </p>

      <ul class="hd-popup-features">
        <li>📈 <b>Live Mainboard & SME GMP</b> + Listing Gain Estimate</li>
        <li>📊 <b>3–4 Saal ka Real Financial Data</b> (Company Strong vs Market Demand)</li>
        <li>👨‍👩‍👧‍👦 <b>1-Click Family PAN Allotment</b> Checker & Target/SL</li>
      </ul>

      <div id="installPopupStatus" class="hd-popup-status hidden"></div>

      <button id="popupInstallNowBtn" class="hd-popup-btn-primary" onclick="handleDirectInstallNow()">
        ${primaryLabel}
      </button>

      ${hasApk && canNativeInstall ? `
        <button class="hd-popup-btn-blue" onclick="runNativeInstallPrompt()">
          ⚡ 1-Tap Instant Web App Install (Bina APK Download)
        </button>
      ` : ""}

      <div class="hd-popup-row">
        <button class="hd-popup-btn-outline" onclick="openShareModal()">📤 Share App</button>
        <button class="hd-popup-btn-cancel" onclick="dismissInstallPopup()">✖️ Cancel</button>
      </div>
    </div>
  `;
  popupOverlay.classList.remove("hidden");
}

function dismissInstallPopup() {
  sessionStorage.setItem("hdInstallPopupClosed", "1");
  closePopupOverlay();
}

async function handleDirectInstallNow() {
  const cfg = getAppConfigSafe();
  const hasApk = Boolean(cfg.apkUrl && /^https:\/\//i.test(cfg.apkUrl));
  const statusEl = document.getElementById("installPopupStatus");

  // 1) If native 1-tap install is ready AND (not Android APK or no APK configured) -> trigger native install immediately!
  if (deferredInstallPrompt && (!hasApk || !isAndroidDevice)) {
    await runNativeInstallPrompt();
    return;
  }

  // 2) If direct APK link is configured -> start APK download immediately on single click!
  if (hasApk) {
    startApkFileDownload(cfg.apkUrl);
    try { localStorage.setItem(HD_VERSION_STORAGE_KEY, cfg.appVersion || "v1.0"); } catch (_) {}
    showNotice("⬇️ HD IPO APK download shuru ho gaya! File par tap karke Install karein.");
    if (statusEl) {
      statusEl.innerHTML = `
        <b>✅ APK Download Shuru Ho Gaya!</b><br>
        Download complete hone par file par tap karein → <b>Install</b> dabayein.<br>
        <a href="${escapeHtml(cfg.apkUrl)}" target="_blank" rel="noopener noreferrer" download style="color:#15803d;font-weight:800;text-decoration:underline;">Agar download na ho to yahan tap karein ↗</a>
      `;
      statusEl.classList.remove("hidden");
    }
    return;
  }

  // 3) If native 1-tap install prompt is ready (fallback) -> trigger native install
  if (deferredInstallPrompt) {
    await runNativeInstallPrompt();
    return;
  }

  // 4) Otherwise show instant manual 2-step guide right inside the popup
  const currentUrl = window.location.origin + "/?install=1";
  if (statusEl) {
    if (isInIframe) {
      statusEl.innerHTML = `
        <b>1-Tap Install ke liye Full Browser mein kholein:</b><br>
        <a href="${escapeHtml(currentUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;background:#1d4ed8;color:#fff;padding:6px 10px;border-radius:7px;text-decoration:none;font-weight:700;">🌐 Chrome / Safari mein Kholein ↗</a>
      `;
    } else if (isIosDevice) {
      statusEl.innerHTML = `<b>iPhone Install:</b> Safari mein niche <b>Share (↑)</b> dabayein → <b>"Add to Home Screen"</b> → <b>Add</b>.`;
    } else {
      statusEl.innerHTML = `<b>Android Chrome Install:</b> Upar-right <b>3 Dots (⋮)</b> par tap karein → <b>"Install app"</b> ya <b>"Add to Home screen" → Install</b>.`;
    }
    statusEl.classList.remove("hidden");
  } else {
    openInstallGuide();
  }
}

function openInstallGuide() {
  openInstallPopup();
}

async function runNativeInstallPrompt() {
  if (!deferredInstallPrompt) {
    openInstallPopup();
    return;
  }
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  if (choice && choice.outcome === "accepted") {
    const cfg = getAppConfigSafe();
    try { localStorage.setItem(HD_VERSION_STORAGE_KEY, cfg.appVersion || "v1.0"); } catch (_) {}
    if (installBtn) installBtn.classList.add("hidden");
    closePopupOverlay();
    closeAnalysis();
  }
}

async function triggerInstallApp() {
  openInstallPopup();
}

// ===== APP UPDATE POPUP (Har Baar Open Par Aayega Jab Tak Update Now Na Ho) =====
function openUpdatePopup(isPreview = false) {
  if (!popupOverlay) return;
  const cfg = getAppConfigSafe();
  const remoteVer = cfg.appVersion || "v1.1";
  const localVer = isPreview ? "v1.0" : (localStorage.getItem(HD_VERSION_STORAGE_KEY) || "v1.0");
  const hasApk = Boolean(cfg.apkUrl && /^https:\/\//i.test(cfg.apkUrl));
  const notes = (cfg.updateNotes || "").trim();

  popupOverlay.innerHTML = `
    <div class="hd-popup-card update-card">
      <button class="hd-popup-x" onclick="cancelUpdatePopup()" aria-label="Close">✕</button>
      <div class="hd-popup-brand">
        <img src="/pwa-192x192.png" alt="HD IPO" class="hd-popup-icon">
        <div>
          <div class="hd-popup-badge update-badge">${isPreview ? "PREVIEW • " : ""}🚀 NEW UPDATE AVAILABLE</div>
          <h3 class="hd-popup-title">HD IPO Update Karein!</h3>
        </div>
      </div>

      <div class="version-compare-bar">
        <span>Purana: <b>${escapeHtml(localVer)}</b></span>
        <span style="color:#1d4ed8;font-weight:900;">→</span>
        <span style="color:#15803d;">Naya: <b>${escapeHtml(remoteVer)}</b></span>
      </div>

      <p class="hd-popup-desc">
        HD IPO ka naya version (<b>${escapeHtml(remoteVer)}</b>) aa gaya hai. Naye features aur fast performance ke liye abhi update karein!
      </p>

      ${notes ? `
        <div class="update-notes-box">
          <b>✨ Is Update mein Kya Naya Hai:</b>
          <div>${escapeHtml(notes)}</div>
        </div>
      ` : ""}

      <div id="updatePopupStatus" class="hd-popup-status hidden"></div>

      <button class="hd-popup-btn-primary" onclick="runAppUpdateNow(${isPreview ? "true" : "false"})">
        ⬇️ Update Now (${escapeHtml(remoteVer)})
      </button>

      <button class="hd-popup-btn-cancel" style="width:100%;margin-top:8px;" onclick="cancelUpdatePopup()">
        ✖️ Cancel (Baad Mein Update Karein)
      </button>
      <p style="font-size:10.5px;color:#64748b;text-align:center;margin-top:6px;">
        Cancel karne par agli baar app kholne par fir se Update option dikhega.
      </p>
    </div>
  `;
  popupOverlay.classList.remove("hidden");
}

function cancelUpdatePopup() {
  // Deliberately DO NOT update HD_VERSION_STORAGE_KEY in localStorage,
  // so every time the user re-opens the app, the Update Now popup appears again!
  closePopupOverlay();
}

async function runAppUpdateNow(isPreview = false) {
  const cfg = getAppConfigSafe();
  const remoteVer = cfg.appVersion || "v1.0";
  const hasApk = Boolean(cfg.apkUrl && /^https:\/\//i.test(cfg.apkUrl));
  const statusEl = document.getElementById("updatePopupStatus");

  if (isPreview) {
    showNotice("Preview Mode: Asli user par ye button naya APK download / App update shuru karega!");
    closePopupOverlay();
    return;
  }

  try { localStorage.setItem(HD_VERSION_STORAGE_KEY, remoteVer); } catch (_) {}

  if (hasApk) {
    startApkFileDownload(cfg.apkUrl);
    showNotice(`⬇️ HD IPO ${remoteVer} download shuru ho gaya! File tap karke Update/Install karein.`);
    if (statusEl) {
      statusEl.innerHTML = `
        <b>✅ Naya APK (${escapeHtml(remoteVer)}) Download Shuru Ho Gaya!</b><br>
        Download hone ke baad file par tap karke <b>Update / Install</b> karein.<br>
        <a href="${escapeHtml(cfg.apkUrl)}" target="_blank" rel="noopener noreferrer" download style="color:#15803d;font-weight:800;text-decoration:underline;">Direct Download Link ↗</a>
      `;
      statusEl.classList.remove("hidden");
    }
    return;
  }

  // PWA / Web update: clear caches, update Service Worker, and reload fresh!
  showNotice(`⏳ HD IPO ${remoteVer} par update ho raha hai...`);
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.update().catch(() => {})));
    }
  } catch (_) {}
  window.location.reload();
}

function checkStartupPopups() {
  const cfg = getAppConfigSafe();
  const remoteVer = cfg.appVersion || "v1.0";
  const localVer = getLocalAppVersion(remoteVer);

  // 1) Priority: If Admin published a newer appVersion -> show Update Now / Cancel popup on EVERY app open!
  if (cfg.loaded && compareAppVersions(remoteVer, localVer) > 0 && !updatePopupShownThisSession) {
    updatePopupShownThisSession = true;
    openUpdatePopup(false);
    return;
  }

  // 2) If opened in browser (not installed standalone) -> show sleek Install Now popup!
  const openedViaShareLink = /[?&](install|share|ref)=/i.test(window.location.search);
  const popupAlreadyOpen = popupOverlay && !popupOverlay.classList.contains("hidden");
  const modalAlreadyOpen = analysisModal && !analysisModal.classList.contains("hidden");
  const allowAutoPopup = openedViaShareLink || (appSettings.autoInstallPopup && !sessionStorage.getItem("hdInstallPopupClosed"));
  if (
    !isStandaloneApp &&
    !autoInstallPopupTriggered &&
    !updatePopupShownThisSession &&
    !popupAlreadyOpen &&
    !modalAlreadyOpen &&
    allowAutoPopup
  ) {
    autoInstallPopupTriggered = true;
    const delayMs = openedViaShareLink ? 450 : 1200;
    setTimeout(() => {
      const stillClear =
        (!popupOverlay || popupOverlay.classList.contains("hidden")) &&
        (!analysisModal || analysisModal.classList.contains("hidden"));
      if (stillClear && !isStandaloneApp && !updatePopupShownThisSession) {
        openInstallPopup();
      }
    }, delayMs);
  }
}

window.addEventListener("hd-config-loaded", () => {
  if (currentPage === "home") renderIPOs();
  refreshOpenDrawer();
  checkStartupPopups();
});

// ===== MOBILE LOGIN, CLOUD SYNC & OWNER ADMIN DASHBOARD =====
let pendingReturnIpoId = null;
let adminSearchText = "";
let cachedAdminData = null;

function formatShortTime(ts) {
  if (!ts) return "Just now";
  const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function getShareAppLink() {
  return window.location.origin + "/?install=1";
}

function buildSharePromoMessage() {
  const url = getShareAppLink();
  const cfg = getAppConfigSafe();
  const ver = cfg.appVersion || "v1.0";
  return [
    `🚀 *HD IPO Live (${ver}) — Free IPO GMP & Allotment App*`,
    ``,
    `Ab har IPO mein apply karne se pehle poora data ek jagah dekhein:`,
    `✅ *Live Mainboard & SME IPO GMP* (Estimated Profit ke saath)`,
    `✅ *3–4 Saal ka Real Financial Data* (Revenue, Profit, Net Worth & Debt)`,
    `✅ *Company Strong hai ya Sirf Market Demand?* (Smart Data Score)`,
    `✅ *1-Click Family PAN Allotment Checker* (Sabhi family members ek saath)`,
    `✅ *Live Subscription, Listing Target & Stop-Loss Calculator*`,
    `✅ *100% Free & Real-Time Updates!*`,
    ``,
    `📲 *Direct Install / Download Link:*`,
    url
  ].join("\n");
}

function openShareModal() {
  if (!popupOverlay) {
    shareNativeDirect();
    return;
  }
  const msg = buildSharePromoMessage();
  const waUrl = "https://wa.me/?text=" + encodeURIComponent(msg);

  popupOverlay.innerHTML = `
    <div class="hd-popup-card">
      <button class="hd-popup-x" onclick="closePopupOverlay()" aria-label="Close">✕</button>
      <div class="hd-popup-brand">
        <img src="/pwa-192x192.png" alt="HD IPO" class="hd-popup-icon">
        <div>
          <div class="hd-popup-badge">SHARE HD IPO LIVE</div>
          <h3 class="hd-popup-title">Doston & Family ko Bhejein</h3>
        </div>
      </div>

      <p class="hd-popup-desc">
        Neeche diya gaya message <b>HD IPO Live</b> ke sabhi fayde & features aur direct <b>Install Link</b> ke saath share hoga:
      </p>

      <div class="share-preview-box">${escapeHtml(msg).replace(/\n/g, "<br>")}</div>

      <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="hd-popup-btn-primary" style="text-decoration:none;display:block;text-align:center;">
        💬 WhatsApp par Bhejein
      </a>

      <div class="hd-popup-row" style="margin-top:8px;">
        <button class="hd-popup-btn-blue" style="margin-top:0;flex:1;" onclick="shareNativeDirect()">📲 Share (All Apps)</button>
        <button class="hd-popup-btn-outline" style="flex:1;" onclick="copyFullShareMessage()">📋 Copy Text</button>
      </div>
    </div>
  `;
  popupOverlay.classList.remove("hidden");
}

function copyFullShareMessage() {
  copyTextSafe(buildSharePromoMessage());
  showNotice("HD IPO Live ka message + Install Link Copy ho gaya! Kahin bhi Paste karke bhej dein.");
}

function shareNativeDirect() {
  const url = getShareAppLink();
  const text = buildSharePromoMessage();
  if (navigator.share) {
    navigator.share({
      title: "HD IPO Live — GMP, Financials & Allotment App",
      text,
      url
    }).catch(() => {
      copyFullShareMessage();
    });
  } else {
    copyFullShareMessage();
  }
}

function shareAppWithFriends() {
  openShareModal();
}

function openAuthModal(returnIpoId = null) {
  if (returnIpoId) pendingReturnIpoId = String(returnIpoId);
  const ha = window.hdAuth;
  const isLogged = ha && ha.isLoggedIn();
  const needsMobile = ha && ha.needsMobileRegistration();
  const profile = ha && ha.profile;
  const isAdmin = ha && ha.isAdmin();

  let bodyHtml = "";
  if (!isLogged) {
    bodyHtml = `
      <div class="section-card" style="text-align:center;">
        <div class="lock-badge">FREE MEMBER ACCOUNT</div>
        <h3 style="font-size:16px;font-weight:800;margin-bottom:6px;">HD IPO Mobile Login</h3>
        <p class="about-text" style="margin-bottom:12px;">
          10 seconds mein login karein aur har IPO ka <b>3–4 Saal ka Pichhla Data</b>, <b>Company Strong vs Market Demand Score</b>, aur <b>Target / Stop Loss</b> free unlock karein!
        </p>
        <button id="googleSignInBtn" class="google-btn" onclick="handleGoogleSignIn()">
          🔐 Continue with Google (Step 1 of 2)
        </button>
        <p style="font-size:11px;color:#64748b;margin-top:8px;">Google verify hone ke baad apna 10-digit Mobile Number enter karein.</p>
      </div>
      <div class="section-card">
        <div class="section-heading">📤 Family & Doston ke saath Share Karein</div>
        <p class="about-text" style="margin-bottom:10px;">Apne family members aur doston ko bhi HD IPO app link WhatsApp par share karein.</p>
        <button class="btn-primary-full" style="background:#15803d;" onclick="shareAppWithFriends()">📤 Share HD IPO App Link</button>
      </div>
    `;
  } else if (needsMobile && !isAdmin) {
    const defaultName = (ha.user && ha.user.displayName) ? ha.user.displayName : "";
    bodyHtml = `
      <div class="section-card" style="border:1.5px solid #3b82f6;">
        <div class="section-heading">📱 Step 2 of 2: Mobile Number Register Karein</div>
        <p class="about-text" style="margin-bottom:10px;">
          Google account verify ho gaya (<b>${escapeHtml(ha.user.email || "")}</b>). Advance IPO Analysis unlock karne ke liye apna Naam aur 10-digit Mobile Number daalein:
        </p>
        <div class="form-field">
          <label>Aapka Poora Naam</label>
          <input type="text" id="regUserName" value="${escapeHtml(defaultName)}" placeholder="e.g. Rahul Sharma" maxlength="80">
        </div>
        <div class="form-field">
          <label>10-Digit Mobile Number (+91)</label>
          <input type="tel" id="regUserMobile" placeholder="e.g. 9876543210" maxlength="10" inputmode="numeric">
        </div>
        <button id="saveProfileBtn" class="btn-primary-full" onclick="handleCompleteMobileProfile()">✅ Save & Unlock Advance Analysis</button>
      </div>
    `;
  } else {
    const pName = profile ? profile.name : (ha.user.displayName || "Admin");
    const pMobile = profile ? profile.mobile : "Not added yet";
    bodyHtml = `
      <div class="section-card hero-decision">
        <div class="section-heading">${isAdmin ? "👑 Owner / Admin Account" : "✅ Verified HD IPO Member"}</div>
        <div class="kv-row"><span class="kv-label">Name</span><span class="kv-val">${escapeHtml(pName)}</span></div>
        <div class="kv-row"><span class="kv-label">Mobile Number</span><span class="kv-val">${escapeHtml(pMobile)}</span></div>
        <div class="kv-row"><span class="kv-label">Email</span><span class="kv-val">${escapeHtml(ha.user.email || "")}</span></div>
        <div class="kv-row"><span class="kv-label">Advance Access</span><span class="kv-val" style="color:#15803d;">UNLOCKED ✅</span></div>
        <div class="kv-row" style="border:none;"><span class="kv-label">IPOs Analyzed</span><span class="kv-val">${profile ? (profile.viewsCount || 0) : 0}</span></div>
      </div>

      ${needsMobile && isAdmin ? `
        <div class="section-card">
          <div class="section-heading">📱 Apna Mobile Number Add Karein (Optional)</div>
          <div class="form-grid">
            <div class="form-field"><input type="text" id="regUserName" value="${escapeHtml(pName)}" placeholder="Name"></div>
            <div class="form-field"><input type="tel" id="regUserMobile" placeholder="10-digit Mobile" maxlength="10"></div>
          </div>
          <button id="saveProfileBtn" class="btn-primary-full" style="margin-top:0;" onclick="handleCompleteMobileProfile()">Save Mobile Profile</button>
        </div>
      ` : ""}

      ${isAdmin ? `
        <div class="section-card" style="background:#eff6ff;border:1.5px solid #3b82f6;">
          <div class="section-heading">👑 Owner User Analytics Dashboard</div>
          <p class="about-text" style="margin-bottom:8px;">Dekhein kitne logon ne app install/login kiya, unke Mobile Numbers, aur kaunse IPO check ho rahe hain.</p>
          <button class="btn-primary-full" onclick="openAdminFromModal()">📊 Open Users Dashboard →</button>
        </div>
      ` : ""}

      <div class="section-card">
        <div class="section-heading">📤 Family & Doston ko Share Karein</div>
        <button class="btn-primary-full" style="background:#15803d;margin-top:0;" onclick="shareAppWithFriends()">📤 Share HD IPO App Link</button>
      </div>

      <button class="btn-primary-full" style="background:#dc2626;" onclick="handleLogout()">Logout</button>
    `;
  }

  analysisModal.innerHTML = `
    <div class="modal-header">
      <button class="back-btn" onclick="closeAnalysis()">← Back</button>
      <div class="modal-title">${isLogged ? "👤 My Account" : "🔐 HD IPO Login"}</div>
      <span style="width:48px;"></span>
    </div>
    <div class="modal-body">${bodyHtml}</div>
  `;
  analysisModal.classList.remove("hidden");
  analysisModal.scrollTop = 0;
}

function openAdminFromModal() {
  closeAnalysis();
  navItems.forEach((n) => n.classList.remove("active"));
  const adm = document.getElementById("adminNavItem");
  if (adm) adm.classList.add("active");
  currentPage = "admin";
  renderCurrentPage();
}

async function handleGoogleSignIn() {
  if (!window.hdAuth) return showNotice("Auth load ho raha hai, 2 second baad try karein.");
  const btn = document.getElementById("googleSignInBtn");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Connecting to Google..."; }
  const res = await window.hdAuth.signInWithGoogle();
  if (res.status === "complete") {
    showNotice("Login Successful! Advance Analysis Unlock ho gaya ✅");
    if (pendingReturnIpoId) {
      const targetId = pendingReturnIpoId;
      pendingReturnIpoId = null;
      openAnalysis(targetId);
    } else {
      closeAnalysis();
    }
  } else if (res.status === "needs_mobile") {
    openAuthModal(pendingReturnIpoId);
  } else {
    if (btn) { btn.disabled = false; btn.textContent = "🔐 Continue with Google (Step 1 of 2)"; }
    if (res.error) showNotice("Login nahi ho saka — popup allow karein ya full browser mein kholein.");
  }
}

async function handleCompleteMobileProfile() {
  const nameEl = document.getElementById("regUserName");
  const mobEl = document.getElementById("regUserMobile");
  const btn = document.getElementById("saveProfileBtn");
  const nameVal = nameEl ? nameEl.value.trim() : "";
  const mobVal = mobEl ? mobEl.value.trim() : "";

  if (btn) { btn.disabled = true; btn.textContent = "⏳ Saving..."; }
  try {
    await window.hdAuth.completeMobileProfile(nameVal, mobVal, savedIds);
    showNotice("Swagat hai " + nameVal + "! Advance IPO Analysis Unlock ho gaya ✅");
    if (pendingReturnIpoId) {
      const targetId = pendingReturnIpoId;
      pendingReturnIpoId = null;
      openAnalysis(targetId);
    } else {
      closeAnalysis();
    }
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = "✅ Save & Unlock Advance Analysis"; }
    showNotice(err && err.message ? err.message : "Sahi Naam aur 10-digit Mobile Number daalein.");
  }
}

async function handleLogout() {
  if (!window.hdAuth) return;
  await window.hdAuth.signOutUser();
  cachedAdminData = null;
  if (currentPage === "admin") {
    currentPage = "home";
    navItems.forEach((n) => n.classList.toggle("active", n.dataset.page === "home"));
  }
  closeAnalysis();
  renderCurrentPage();
  showNotice("Logout ho gaya!");
}

function updateAuthHeaderUI() {
  const ha = window.hdAuth;
  const accBtn = document.getElementById("accountBtn");
  const admNav = document.getElementById("adminNavItem");
  if (!ha) return;

  const isAdmin = ha.isAdmin();
  if (admNav) admNav.classList.toggle("hidden", !isAdmin);

  if (accBtn) {
    if (ha.hasAdvanceAccess()) {
      const label = isAdmin ? "👑 Admin" : ("👤 " + String(ha.profile?.name || "Member").split(" ")[0].slice(0, 8));
      accBtn.textContent = label;
      accBtn.classList.add("logged-in");
    } else if (ha.isLoggedIn()) {
      accBtn.textContent = "📱 Add No.";
      accBtn.classList.remove("logged-in");
    } else {
      accBtn.textContent = "👤 Login";
      accBtn.classList.remove("logged-in");
    }
  }

  // Merge cloud savedIds & private Family PANs on login
  if (ha.profile && Array.isArray(ha.profile.savedIds) && ha.profile.savedIds.length) {
    const merged = Array.from(new Set([...savedIds, ...ha.profile.savedIds]));
    if (merged.length !== savedIds.length) {
      savedIds = merged;
      localStorage.setItem("hdIpoSaved", JSON.stringify(savedIds));
    }
  }
  if (ha.hasAdvanceAccess() && ha.profile && !window.__hdPansSynced) {
    window.__hdPansSynced = true;
    ha.loadFamilyPans().then((cloudPans) => {
      if (Array.isArray(cloudPans) && cloudPans.length) {
        const existingPans = new Set(familyPans.map(p => p.pan));
        let changed = false;
        cloudPans.forEach(cp => {
          if (!existingPans.has(cp.pan)) {
            familyPans.push(cp);
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem("hdFamilyPans", JSON.stringify(familyPans));
          if (currentPage === "allotment") renderAllotmentPage();
        }
      }
    }).catch(() => {});
  }
}

async function renderAdminPage(forceReload = false) {
  if (!window.hdAuth || !window.hdAuth.isAdmin()) {
    mainContent.innerHTML = `<div class="empty-box">Sirf App Owner (Admin) is page ko dekh sakte hain.</div>`;
    return;
  }

  if (!cachedAdminData || forceReload) {
    mainContent.innerHTML = `<div class="empty-box">⏳ Live Users & Activity Data load ho raha hai...</div>`;
    try {
      cachedAdminData = await window.hdAuth.fetchAdminDashboard();
    } catch (err) {
      mainContent.innerHTML = `<div class="empty-box">Admin data load nahi ho saka. Dubara try karein.<br><br><button class="btn-analyze" onclick="renderAdminPage(true)">Retry</button></div>`;
      return;
    }
  }

  const { users, activities, stats } = cachedAdminData;
  const q = adminSearchText.trim().toLowerCase();
  const filteredUsers = users.filter(u =>
    !q ||
    String(u.name || "").toLowerCase().includes(q) ||
    String(u.mobile || "").includes(q) ||
    String(u.email || "").toLowerCase().includes(q)
  );

  mainContent.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div class="page-title" style="margin:0;">👑 Owner User Tracker</div>
      <div style="display:flex;gap:6px;">
        <button class="btn-copy-open" style="background:#15803d;" onclick="shareAppWithFriends()">📤 Share</button>
        <button class="btn-copy-open" style="background:#1d4ed8;" onclick="renderAdminPage(true)">↻ Refresh</button>
      </div>
    </div>

    <div class="admin-stats-grid">
      <div class="admin-stat-box"><small>Total Registered Users</small><strong>${stats.totalUsers}</strong></div>
      <div class="admin-stat-box"><small>Active Today</small><strong style="color:#15803d;">${stats.activeToday}</strong></div>
      <div class="admin-stat-box"><small>Total Advance Views</small><strong>${stats.totalViews}</strong></div>
      <div class="admin-stat-box"><small>Mobile App Installs</small><strong style="color:#b45309;">${stats.appInstalls}</strong></div>
    </div>

    <div class="section-card" style="background:#f0fdf4;border:1.5px solid #86efac;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
        <div class="section-heading" style="margin:0;">📦 APK Version & Auto-Update Control</div>
        <span class="badge badge-mainboard">Live: ${escapeHtml(window.hdAuth.appConfig?.appVersion || "v1.0")}</span>
      </div>
      <p class="about-text" style="margin-bottom:8px;">
        Jab bhi aap naya APK / Update laayein, yahan <b>Version badha kar</b> (jaise <b>v1.0 → v1.1</b>) aur naya APK link daal kar Save karein — sabhi purane users ko <b>har baar app open karne par Update Now / Cancel</b> popup dikhega!
      </p>
      <div class="form-field">
        <label>Direct APK Download URL (https://...)</label>
        <input type="url" id="adminApkUrl" value="${escapeHtml(window.hdAuth.appConfig?.apkUrl || "")}" placeholder="https://github.com/hdipo/.../releases/download/v1.1/HD-IPO.apk">
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label>APK / App Version (e.g. v1.1)</label>
          <input type="text" id="adminApkVersion" value="${escapeHtml(window.hdAuth.appConfig?.appVersion || "v1.0")}" placeholder="v1.1" maxlength="30">
        </div>
        <div class="form-field">
          <label>Update Notes (Kya Naya Hai)</label>
          <input type="text" id="adminUpdateNotes" value="${escapeHtml(window.hdAuth.appConfig?.updateNotes || "")}" placeholder="Fast Live GMP & Bug Fixes" maxlength="240">
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="saveApkCfgBtn" class="btn-primary-full" style="background:#15803d;margin:0;flex:1;" onclick="handleSaveApkConfig()">🚀 Save & Push Update</button>
        <button class="btn-copy-open" style="background:#1d4ed8;padding:10px 12px;" onclick="openUpdatePopup(true)">👁️ Preview Popup</button>
      </div>
    </div>

    <div class="section-card">
      <div class="section-heading">👥 Registered Users (${filteredUsers.length})</div>
      <div class="form-field">
        <input type="text" value="${escapeHtml(adminSearchText)}" oninput="adminSearchText=this.value;renderAdminPage(false)" placeholder="Naam, Mobile Number ya Email search karein...">
      </div>
      ${filteredUsers.length === 0 ? `<p class="fin-empty">Abhi koi user register nahi hua hai. Apna App link family & doston ko share karein!</p>` : filteredUsers.map(u => `
        <div class="admin-user-card">
          <div class="admin-user-top">
            <div>
              <div class="admin-user-name">${escapeHtml(u.name)}</div>
              <div class="admin-user-meta">📞 <b>+91 ${escapeHtml(u.mobile)}</b> • ${escapeHtml(u.platform || "Web")}</div>
              <div class="admin-user-meta">✉️ ${escapeHtml(u.email || "-")}</div>
            </div>
            <span class="badge badge-mainboard">${u.viewsCount || 0} Views</span>
          </div>
          <div class="admin-user-meta">
            <b>Last Active:</b> ${escapeHtml(formatShortTime(u.lastActiveAt))} • <b>Logins:</b> ${u.loginCount || 1} • <b>Saved:</b> ${(u.savedIds || []).length}
            ${u.lastIpoViewed ? `<br><b>Last IPO:</b> ${escapeHtml(u.lastIpoViewed)}` : ""}
          </div>
          <div class="admin-user-actions">
            <button class="btn-copy-open" onclick="copyTextSafe('${escapeHtml(u.mobile)}');showNotice('Mobile Copied: ${escapeHtml(u.mobile)}')">📋 Copy No.</button>
            <a class="btn-copy-open" style="background:#16a34a;text-decoration:none;" href="https://wa.me/91${escapeHtml(u.mobile)}" target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>
          </div>
        </div>
      `).join("")}
    </div>

    <div class="section-card">
      <div class="section-heading">⚡ Recent Live Activity (${activities.length})</div>
      ${activities.length === 0 ? `<p class="fin-empty">Abhi koi activity record nahi hai.</p>` : activities.slice(0, 20).map(a => `
        <div class="activity-row">
          <b>${escapeHtml(a.userName)}</b> (${escapeHtml(a.userMobile)}) —
          <span style="color:#1d4ed8;font-weight:700;">${a.action === "view_advance" ? "Viewed " + escapeHtml(a.ipoName) : escapeHtml(a.ipoName)}</span>
          <div style="font-size:10.5px;color:#64748b;">${escapeHtml(formatShortTime(a.createdAt))}</div>
        </div>
      `).join("")}
    </div>
  `;
}

async function handleSaveApkConfig() {
  const urlEl = document.getElementById("adminApkUrl");
  const verEl = document.getElementById("adminApkVersion");
  const notesEl = document.getElementById("adminUpdateNotes");
  const btn = document.getElementById("saveApkCfgBtn");
  const urlVal = urlEl ? urlEl.value.trim() : "";
  const verVal = verEl ? verEl.value.trim() : "v1.0";
  const notesVal = notesEl ? notesEl.value.trim() : "";
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Saving..."; }
  try {
    await window.hdAuth.saveAppConfig(urlVal, verVal, notesVal);
    showNotice(`✅ ${verVal} Save & Live ho gaya! Purane users ko ab app open karte hi Update Now popup dikhega.`);
    renderAdminPage(false);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = "🚀 Save & Push Update"; }
    showNotice(err && err.message ? err.message : "Sahi https:// APK link aur version daalein.");
  }
}

// ===== 3-LINE SIDE DRAWER MENU & PROFESSIONAL SETTINGS =====
const sideDrawerOverlay = document.getElementById("sideDrawerOverlay");
const sideDrawer = document.getElementById("sideDrawer");

function renderSideDrawer() {
  if (!sideDrawer) return;
  const ha = window.hdAuth;
  const isLogged = Boolean(ha && ha.isLoggedIn());
  const isAdmin = Boolean(ha && ha.isAdmin());
  const hasAdvance = Boolean(ha && ha.hasAdvanceAccess());
  const profile = ha && ha.profile;
  const cfg = getAppConfigSafe();
  const hasApk = Boolean(cfg.apkUrl && /^https:\/\//i.test(cfg.apkUrl));
  const remoteVer = cfg.appVersion || "v1.0";
  const localVer = getLocalAppVersion(remoteVer);
  const hasUpdate = cfg.loaded && compareAppVersions(remoteVer, localVer) > 0;

  const displayName = isLogged
    ? (profile?.name || ha.user?.displayName || (isAdmin ? "App Owner" : "HD IPO Member"))
    : "Guest Investor";
  const subInfo = isLogged
    ? (profile?.mobile ? `+91 ${profile.mobile}` : (ha.user?.email || "Verified Account"))
    : "Login karke 3–4 Saal ka Financial Data unlock karein";
  const photoUrl = isLogged && ha.user?.photoURL ? ha.user.photoURL : "";
  const initials = displayName.trim().slice(0, 2).toUpperCase() || "HD";

  sideDrawer.innerHTML = `
    <div class="drawer-header">
      <button class="drawer-close-btn" onclick="closeSideDrawer()" aria-label="Close Menu">✕</button>
      <div class="drawer-profile-row">
        <div class="drawer-avatar">
          ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(displayName)}">` : escapeHtml(initials)}
        </div>
        <div class="drawer-user-info">
          <div class="drawer-user-name">${escapeHtml(displayName)}</div>
          <div class="drawer-user-sub">${escapeHtml(subInfo)}</div>
          ${isAdmin
            ? `<span class="drawer-role-tag admin">👑 Owner / Admin</span>`
            : (hasAdvance
                ? `<span class="drawer-role-tag verified">✓ Advance Unlocked</span>`
                : `<span class="drawer-role-tag guest">Basic Mode</span>`)}
        </div>
      </div>
      ${!isLogged ? `
        <button class="drawer-login-cta" onclick="closeSideDrawer();openAuthModal()">
          🔐 Free Mobile Login Karein →
        </button>
      ` : (!hasAdvance && !isAdmin ? `
        <button class="drawer-login-cta" onclick="closeSideDrawer();openAuthModal()">
          📱 Mobile Number Add Karein (Step 2) →
        </button>
      ` : "")}
    </div>

    <div class="drawer-body">
      <div class="drawer-section-label">ACCOUNT & ACCESS</div>

      <button class="drawer-item" onclick="closeSideDrawer();openAuthModal()">
        <span class="drawer-item-icon icon-blue">👤</span>
        <span class="drawer-item-text">
          <b>${isLogged ? "My Profile & Account" : "Login / Register"}</b>
          <small>${isLogged ? "Account details & Advance status" : "10 sec free login — Unlock full data"}</small>
        </span>
        <span class="drawer-chevron">›</span>
      </button>

      ${isAdmin ? `
        <button class="drawer-item" onclick="closeSideDrawer();openAdminFromModal()">
          <span class="drawer-item-icon icon-amber">👑</span>
          <span class="drawer-item-text">
            <b>Owner Dashboard & APK Control</b>
            <small>Live users, mobile numbers & updates</small>
          </span>
          <span class="drawer-item-badge badge-blue">Admin</span>
        </button>
      ` : ""}

      <div class="drawer-section-label">APP & SHARING</div>

      <button class="drawer-item" onclick="closeSideDrawer();openInstallPopup()">
        <span class="drawer-item-icon icon-green">📲</span>
        <span class="drawer-item-text">
          <b>Install / Download App</b>
          <small>${hasApk ? `Direct Android APK (${escapeHtml(remoteVer)})` : "Phone par 1-Tap App install karein"}</small>
        </span>
        <span class="drawer-item-badge badge-green">${hasApk ? "APK" : "Free"}</span>
      </button>

      <button class="drawer-item" onclick="closeSideDrawer();openShareModal()">
        <span class="drawer-item-icon icon-emerald">📤</span>
        <span class="drawer-item-text">
          <b>Share HD IPO Live</b>
          <small>Fayde & Features ke saath doston ko bhejein</small>
        </span>
        <span class="drawer-chevron">›</span>
      </button>

      <button class="drawer-item" onclick="closeSideDrawer();checkForUpdatesManual()">
        <span class="drawer-item-icon icon-indigo">🔄</span>
        <span class="drawer-item-text">
          <b>Check App Update</b>
          <small>Installed: ${escapeHtml(localVer)} • Latest: ${escapeHtml(remoteVer)}</small>
        </span>
        ${hasUpdate ? `<span class="drawer-item-badge badge-red">NEW</span>` : `<span class="drawer-chevron">›</span>`}
      </button>

      <div class="drawer-section-label">PREFERENCES & TOOLS</div>

      <button class="drawer-item" onclick="closeSideDrawer();openSettingsModal()">
        <span class="drawer-item-icon icon-slate">⚙️</span>
        <span class="drawer-item-text">
          <b>Settings</b>
          <small>Default IPO tab, Registrar & cache</small>
        </span>
        <span class="drawer-chevron">›</span>
      </button>

      <button class="drawer-item" onclick="closeSideDrawer();syncLiveData(true)">
        <span class="drawer-item-icon icon-sky">↻</span>
        <span class="drawer-item-text">
          <b>Sync Live IPO Data</b>
          <small>Latest GMP, subscription & prices</small>
        </span>
        <span class="drawer-chevron">›</span>
      </button>

      ${isLogged ? `
        <div class="drawer-divider"></div>
        <button class="drawer-item drawer-item-danger" onclick="closeSideDrawer();handleLogout()">
          <span class="drawer-item-icon icon-red">🚪</span>
          <span class="drawer-item-text">
            <b>Logout</b>
            <small>Is device se sign out karein</small>
          </span>
          <span class="drawer-chevron">›</span>
        </button>
      ` : ""}
    </div>

    <div class="drawer-footer">
      <div><b>HD IPO Live</b> • ${escapeHtml(remoteVer)}</div>
      <small>Mainboard • SME • RHP Financials • Allotment</small>
    </div>
  `;
}

function openSideDrawer() {
  if (!sideDrawerOverlay || !sideDrawer) return;
  renderSideDrawer();
  sideDrawerOverlay.classList.remove("hidden");
  requestAnimationFrame(() => {
    sideDrawerOverlay.classList.add("open");
  });
}

function closeSideDrawer() {
  if (!sideDrawerOverlay) return;
  sideDrawerOverlay.classList.remove("open");
  setTimeout(() => {
    if (!sideDrawerOverlay.classList.contains("open")) {
      sideDrawerOverlay.classList.add("hidden");
    }
  }, 220);
}

function refreshOpenDrawer() {
  if (sideDrawerOverlay && !sideDrawerOverlay.classList.contains("hidden")) {
    renderSideDrawer();
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeSideDrawer();
    closePopupOverlay();
  }
});

async function checkForUpdatesManual() {
  showNotice("🔄 Latest update check ho raha hai...");
  try {
    if (window.hdAuth && typeof window.hdAuth.loadAppConfig === "function") {
      await window.hdAuth.loadAppConfig();
    }
  } catch (_) {}
  const cfg = getAppConfigSafe();
  const remoteVer = cfg.appVersion || "v1.0";
  const localVer = getLocalAppVersion(remoteVer);
  if (compareAppVersions(remoteVer, localVer) > 0) {
    openUpdatePopup(false);
  } else {
    showNotice(`✅ Aapka HD IPO App bilkul latest version (${remoteVer}) par hai!`);
  }
}

function saveAppSetting(key, value) {
  appSettings[key] = value;
  try { localStorage.setItem("hdAppSettings", JSON.stringify(appSettings)); } catch (_) {}

  if (key === "defaultCategory") {
    currentCategory = value;
    chips.forEach((c) => c.classList.toggle("active", (c.dataset.category || "all") === value));
    if (currentPage === "home") renderIPOs();
  } else if (key === "defaultTab") {
    currentTab = value;
    tabs.forEach((t) => t.classList.toggle("active", (t.dataset.tab || "live") === value));
    if (currentPage === "home") renderIPOs();
  } else if (key === "defaultRegistrar") {
    selectedRegistrar = value;
    if (currentPage === "allotment") renderAllotmentPage();
  }
  showNotice("✅ Setting save ho gayi!");
}

async function clearAppCacheAndReload() {
  try { localStorage.removeItem("hdRemoteIPOs"); } catch (_) {}
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (_) {}
  showNotice("🧹 Cache clear ho gaya! Fresh live data load ho raha hai...");
  closeAnalysis();
  await syncLiveData(true);
}

function openSettingsModal() {
  const cfg = getAppConfigSafe();
  const remoteVer = cfg.appVersion || "v1.0";
  const localVer = getLocalAppVersion(remoteVer);

  analysisModal.innerHTML = `
    <div class="modal-header">
      <button class="back-btn" onclick="closeAnalysis()">← Back</button>
      <div class="modal-title">⚙️ App Settings</div>
      <span style="width:48px;"></span>
    </div>
    <div class="modal-body">
      <div class="section-card">
        <div class="section-heading">🏠 Home Screen Preferences</div>

        <div class="form-field">
          <label>Default IPO Category</label>
          <select onchange="saveAppSetting('defaultCategory', this.value)">
            <option value="all" ${appSettings.defaultCategory === "all" ? "selected" : ""}>All IPOs (Mainboard + SME)</option>
            <option value="mainboard" ${appSettings.defaultCategory === "mainboard" ? "selected" : ""}>Mainboard Only</option>
            <option value="sme" ${appSettings.defaultCategory === "sme" ? "selected" : ""}>SME IPO Only</option>
          </select>
        </div>

        <div class="form-field" style="margin-bottom:0;">
          <label>Default Home Tab</label>
          <select onchange="saveAppSetting('defaultTab', this.value)">
            <option value="live" ${appSettings.defaultTab === "live" ? "selected" : ""}>Live IPOs</option>
            <option value="upcoming" ${appSettings.defaultTab === "upcoming" ? "selected" : ""}>Upcoming IPOs</option>
            <option value="closed" ${appSettings.defaultTab === "closed" ? "selected" : ""}>Closed / Listed IPOs</option>
          </select>
        </div>
      </div>

      <div class="section-card">
        <div class="section-heading">👨‍👩‍👧‍👦 Allotment & Popup Preferences</div>

        <div class="form-field">
          <label>Default Allotment Registrar</label>
          <select onchange="saveAppSetting('defaultRegistrar', this.value)">
            <option value="https://in.mpms.mufg.com/Initial_Offer/public-issues.html" ${appSettings.defaultRegistrar.includes("mufg") ? "selected" : ""}>MUFG Intime (Link Intime)</option>
            <option value="https://ipostatus.kfintech.com/" ${appSettings.defaultRegistrar.includes("kfintech") ? "selected" : ""}>KFintech Registrar</option>
            <option value="https://www.bigshareonline.com/ipo_Allotment.html" ${appSettings.defaultRegistrar.includes("bigshare") ? "selected" : ""}>Bigshare Services</option>
            <option value="https://www.bseindia.com/investors/appli_check.aspx" ${appSettings.defaultRegistrar.includes("bseindia") ? "selected" : ""}>BSE India IPO Status</option>
            <option value="https://www.nseindia.com/products/dynaContent/equities/ipos/ipo_login.jsp" ${appSettings.defaultRegistrar.includes("nseindia") ? "selected" : ""}>NSE India IPO Status</option>
          </select>
        </div>

        <div class="settings-toggle-row">
          <div>
            <b>Browser mein Auto Install Popup</b>
            <small>Web browser mein kholne par Install popup dikhayein</small>
          </div>
          <label class="hd-switch">
            <input type="checkbox" ${appSettings.autoInstallPopup ? "checked" : ""} onchange="saveAppSetting('autoInstallPopup', this.checked)">
            <span class="hd-slider"></span>
          </label>
        </div>
      </div>

      <div class="section-card">
        <div class="section-heading">📦 App Version & Data</div>
        <div class="kv-row"><span class="kv-label">Installed Version</span><span class="kv-val">${escapeHtml(localVer)}</span></div>
        <div class="kv-row"><span class="kv-label">Latest Live Version</span><span class="kv-val" style="color:#15803d;">${escapeHtml(remoteVer)}</span></div>
        <div class="kv-row" style="border:none;"><span class="kv-label">Saved Watchlist / PANs</span><span class="kv-val">${savedIds.length} IPOs • ${familyPans.length} PANs</span></div>

        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="btn-primary-full" style="margin:0;flex:1;background:#1d4ed8;" onclick="checkForUpdatesManual()">🔄 Check Update</button>
          <button class="btn-primary-full" style="margin:0;flex:1;background:#475569;" onclick="clearAppCacheAndReload()">🧹 Refresh Cache</button>
        </div>
      </div>

      <div class="section-card">
        <div class="section-heading">ℹ️ About HD IPO Live</div>
        <p class="about-text" style="margin-bottom:10px;">
          HD IPO Live aapko Mainboard & SME IPO ka real-time GMP, 3–4 saal ka RHP financial data, Company vs Market Demand analysis aur 1-Click Family PAN Allotment status deta hai.
        </p>
        <div style="display:flex;gap:8px;">
          <button class="btn-primary-full" style="margin:0;flex:1;background:#15803d;" onclick="openShareModal()">📤 Share App</button>
          <button class="btn-primary-full" style="margin:0;flex:1;background:#0f172a;" onclick="openInstallPopup()">📲 Install / APK</button>
        </div>
      </div>

      <p class="disclaimer">Educational & informational purpose only. Always verify RHP and consult a SEBI-registered advisor before investing.</p>
    </div>
  `;
  analysisModal.classList.remove("hidden");
  analysisModal.scrollTop = 0;
}

window.addEventListener("hd-auth-changed", () => {
  updateAuthHeaderUI();
  refreshOpenDrawer();
  if (currentPage === "home") renderIPOs();
  if (activeAnalysisIpoId && !analysisModal.classList.contains("hidden")) {
    const ipo = getAllIPOs().find(item => String(item.id) === String(activeAnalysisIpoId));
    if (ipo) openAnalysis(ipo.id);
  }
});

// APPLY SAVED DEFAULT CATEGORY & TAB CHIPS + INITIAL RENDER + AUTO LIVE SYNC
chips.forEach((c) => c.classList.toggle("active", (c.dataset.category || "all") === currentCategory));
tabs.forEach((t) => t.classList.toggle("active", (t.dataset.tab || "live") === currentTab));
updateAuthHeaderUI();
renderCurrentPage();
syncLiveData(false);
if (window.hdAuth && window.hdAuth.appConfig && window.hdAuth.appConfig.loaded) {
  checkStartupPopups();
} else {
  // Fallback if Firestore config takes longer than 2s (e.g., offline)
  setTimeout(() => { checkStartupPopups(); }, 2200);
}

