/* HD IPO — Pure Standalone Native Android APK Live Engine
 * Mirrors server.ts (/api/hdipo/cards-meta) & ipoFinancials.ts (/api/hdipo/financials)
 * directly on-device via window.HdAndroid.fetchUrlAsync (zero CORS, zero server dependency).
 */
(function () {
  "use strict";

  const DIR_CACHE_TTL_MS = 10 * 60 * 1000;
  const REPORT_CACHE_TTL_MS = 15 * 60 * 1000;
  const LIVE_META_TTL_MS = 45 * 1000;

  let dirCache = null; // { fetchedAt, entries }
  let liveMetaCache = null; // { fetchedAt, items }
  const reportCache = new Map();

  // ---- Native Android External Links & Share Sheet Bridge ----
  if (typeof window !== "undefined" && window.HdAndroid) {
    // Intercept window.open so Allotment Registrars & WhatsApp open natively
    const origOpen = window.open;
    window.open = function (url) {
      const s = String(url || "").trim();
      if (/^(https?:|whatsapp:|mailto:|tel:)/i.test(s) && typeof window.HdAndroid.openExternalUrl === "function") {
        window.HdAndroid.openExternalUrl(s);
        return null;
      }
      return origOpen ? origOpen.apply(window, arguments) : null;
    };

    // Intercept <a target="_blank"> or external https/whatsapp links across the entire app
    document.addEventListener(
      "click",
      function (ev) {
        const anchor = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
        if (!anchor) return;
        const href = String(anchor.getAttribute("href") || "").trim();
        if (/^(https?:|whatsapp:|mailto:|tel:)/i.test(href) && typeof window.HdAndroid.openExternalUrl === "function") {
          ev.preventDefault();
          ev.stopPropagation();
          window.HdAndroid.openExternalUrl(href);
        }
      },
      true
    );

    // Provide native Android Share Sheet via navigator.share if WebView doesn't expose it
    if (typeof navigator !== "undefined" && !navigator.share && typeof window.HdAndroid.shareText === "function") {
      navigator.share = function (data) {
        try {
          const text = [data && data.text ? data.text : "", data && data.url ? data.url : ""]
            .filter(Boolean)
            .join("\n");
          if (text) window.HdAndroid.shareText(text);
          return Promise.resolve();
        } catch (err) {
          return Promise.reject(err);
        }
      };
    }

    // ---- Direct In-App Auto-Updater (Reads Firestore hd_config/app via Native HTTP — Zero Login, Zero WhatsApp!) ----
    const FIRESTORE_APP_CONFIG_URL =
      "https://firestore.googleapis.com/v1/projects/brilliant-spider-391ww/databases/ai-studio-191c3477-6537-4a80-991c-8f51853b2a93/documents/hd_config/app";

    const readInstalledApkVersion = function () {
      try {
        if (window.HdAndroid && typeof window.HdAndroid.getAppVersionName === "function") {
          const v = String(window.HdAndroid.getAppVersionName() || "").trim();
          if (v) return /^v/i.test(v) ? v : "v" + v;
        }
      } catch (_) {}
      return "v1.3";
    };

    const nativeConfigState = {
      apkUrl: "",
      appVersion: readInstalledApkVersion(),
      updateNotes: "",
      loaded: false,
    };

    const fetchFirestoreAppConfig = async function () {
      try {
        const url = FIRESTORE_APP_CONFIG_URL + "?t=" + Date.now();
        let text = "";
        if (typeof window.hdFetchText === "function") {
          const res = await window.hdFetchText(url, "");
          if (res && res.ok) text = await res.text();
        } else {
          const res = await fetch(url);
          if (res && res.ok) text = await res.text();
        }
        if (text) {
          const json = JSON.parse(text);
          const f = (json && json.fields) || {};
          const apkUrl = String((f.apkUrl && f.apkUrl.stringValue) || "").trim().slice(0, 500);
          const appVersion = String((f.appVersion && f.appVersion.stringValue) || "").trim().slice(0, 30);
          const updateNotes = String((f.updateNotes && f.updateNotes.stringValue) || "").trim().slice(0, 240);
          const installedVer = readInstalledApkVersion();
          const verCmp = function (a, b) {
            const pa = String(a || "1.0").replace(/^v/i, "").split(/[^0-9]+/).filter(Boolean).map(Number);
            const pb = String(b || "1.0").replace(/^v/i, "").split(/[^0-9]+/).filter(Boolean).map(Number);
            const len = Math.max(pa.length, pb.length);
            for (let i = 0; i < len; i++) {
              const na = pa[i] || 0, nb = pb[i] || 0;
              if (na > nb) return 1;
              if (na < nb) return -1;
            }
            return 0;
          };
          nativeConfigState.appVersion = (appVersion && verCmp(appVersion, installedVer) > 0) ? appVersion : installedVer;
          nativeConfigState.apkUrl = apkUrl;
          nativeConfigState.updateNotes = updateNotes;
          nativeConfigState.loaded = true;
          try {
            localStorage.setItem("hdCachedRemoteConfig", JSON.stringify(nativeConfigState));
          } catch (_) {}
        }
      } catch (_) {
        try {
          const saved = JSON.parse(localStorage.getItem("hdCachedRemoteConfig") || "null");
          if (saved && saved.appVersion) {
            nativeConfigState.apkUrl = saved.apkUrl || "";
            nativeConfigState.appVersion = saved.appVersion;
            nativeConfigState.updateNotes = saved.updateNotes || "";
            nativeConfigState.loaded = true;
          }
        } catch (_) {}
      }
      window.dispatchEvent(new CustomEvent("hd-config-loaded", { detail: nativeConfigState }));
      return nativeConfigState;
    };

    if (!window.hdAuth) {
      window.hdAuth = {
        ready: true,
        user: null,
        profile: null,
        appConfig: nativeConfigState,
        isAdmin: function () { return false; },
        hasAdvanceAccess: function () { return true; },
        logIpoAdvanceView: async function () {},
        syncSavedIds: async function () {},
        syncFamilyPanAdd: async function () { return null; },
        syncFamilyPanDelete: async function () {},
        loadAppConfig: fetchFirestoreAppConfig,
      };
    }

    // Trigger live update check right after app.js mounts, on app resume (throttled 3m), and every 20 min
    let lastConfigCheckAt = 0;
    const triggerConfigCheck = function (force) {
      const now = Date.now();
      if (!force && now - lastConfigCheckAt < 3 * 60 * 1000) return;
      lastConfigCheckAt = now;
      fetchFirestoreAppConfig().catch(function () {});
    };
    window.hdCheckRemoteConfigNow = function () {
      return fetchFirestoreAppConfig();
    };
    setTimeout(function () {
      triggerConfigCheck(true);
    }, 900);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        triggerConfigCheck(false);
      }
    });
    setInterval(function () {
      if (document.visibilityState === "visible") {
        triggerConfigCheck(true);
      }
    }, 20 * 60 * 1000);
  }

  // ---- Shared Helpers ----
  function decodeEntities(raw) {
    return String(raw || "")
      .replace(/&#8377;/g, "₹")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&lsquo;|&rsquo;|&#39;/g, "'")
      .replace(/&ndash;|&mdash;/g, "-")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  function cleanText(raw) {
    if (typeof raw !== "string") return "";
    return decodeEntities(raw.replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripHtmlNoSpan(raw) {
    if (typeof raw !== "string") return "";
    return decodeEntities(
      raw
        .replace(/<span[^>]*>.*?<\/span>/gi, "")
        .replace(/<[^>]+>/g, "")
    )
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractHref(raw) {
    if (typeof raw !== "string") return "";
    const m = raw.match(/href="([^"]+)"/i);
    return m && m[1] ? m[1] : "";
  }

  function parseNum(raw) {
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    const cleaned = String(raw).replace(/,/g, "").replace(/[₹%xX]/g, "").trim();
    const m = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }

  function parseNumberOrNull(val) {
    if (val === null || val === undefined || val === "") return null;
    if (typeof val === "number") return Number.isFinite(val) ? val : null;
    const cleaned = String(val).replace(/^(?:₹|rs\.?)\s*/i, "").replace(/,/g, "").trim();
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  function fmtMult(val) {
    const n = parseNum(val);
    return n !== null ? n.toFixed(2) + "x" : "—";
  }

  function normalizeFinName(s) {
    return String(s || "")
      .toLowerCase()
      .replace(
        /\b(limited|ltd|private|pvt|india|indian|ipo|sme|industries|enterprises|technologies|services|solutions|corp|corporation|co)\b/g,
        " "
      )
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function normIpoKey(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/&/g, " ")
      .replace(/['’`]/g, "")
      .replace(
        /\b(and|the|of|for|limited|ltd|private|pvt|india|indian|ipo|sme|industries|industry|enterprises|enterprise|technologies|technology|tech|services|service|solutions|solution|corp|corporation|company|co|infra|infrastructure|engineering|engg)\b/g,
        " "
      )
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  }

  function formatPriceBand(raw) {
    const s = stripHtmlNoSpan(raw);
    if (!s) return "TBA";
    const cleaned = s.replace(/\.00\b/g, "").replace(/\s+to\s+/i, " - ");
    return cleaned.startsWith("₹") ? cleaned : "₹" + cleaned;
  }

  function toIsoDateOnly(raw) {
    if (!raw) return "";
    const s = stripHtmlNoSpan(String(raw)).trim();
    if (!s) return "";
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return isoMatch[1] + "-" + isoMatch[2] + "-" + isoMatch[3];
    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    const y = d.getUTCFullYear();
    if (y < 1990 || y > 2035) return "";
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function parseCmpAndPct(raw) {
    const text = cleanText(raw);
    if (!text) return { cmp: null, pct: null };
    const priceMatch = text.match(/([\d,]+\.?\d*)/);
    const pctMatch = text.match(/\(([-+]?\d+(?:\.\d+)?)%\)/);
    const cmp = priceMatch ? parseNumberOrNull(priceMatch[1]) : null;
    const pct = pctMatch ? Number(pctMatch[1]) : null;
    return { cmp, pct: pct !== null && Number.isFinite(pct) ? pct : null };
  }

  function computeIpoStatus(row, nowMs) {
    const highlight = String(row["~Highlight_Row"] || "").toLowerCase();
    if (highlight.includes("green")) return "open";

    const openIso = String(row["~Issue_Open_Date"] || "");
    const closeIso = String(row["~IssueCloseDate"] || "");
    const listIso = String(row["~ListingDate"] || "");

    const openMs = openIso ? Date.parse(openIso) : NaN;
    const closeEndMs = closeIso ? Date.parse(closeIso) + 24 * 60 * 60 * 1000 : NaN;
    const listMs = listIso ? Date.parse(listIso) : NaN;

    if (Number.isFinite(openMs) && Number.isFinite(closeEndMs)) {
      if (nowMs >= openMs && nowMs <= closeEndMs) return "open";
      if (nowMs < openMs) return "upcoming";
      if (Number.isFinite(listMs) && nowMs >= listMs) return "listed";
      return "closed";
    }
    if (Number.isFinite(openMs) && nowMs < openMs) return "upcoming";
    if (Number.isFinite(listMs) && nowMs >= listMs) return "listed";
    return "closed";
  }

  function getIndianFyParams(now) {
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const fy =
      month >= 4
        ? year + "-" + String(year + 1).slice(-2)
        : year - 1 + "-" + String(year).slice(-2);
    const prevYear = year - 1;
    const prevFy =
      month >= 4
        ? prevYear + "-" + String(prevYear + 1).slice(-2)
        : prevYear - 1 + "-" + String(prevYear).slice(-2);
    return { month, year, fy, prevYear, prevFy };
  }

  const SHAREHOLDER_PARENT_RULES = [
    { re: /\b(mahanadi|south eastern|eastern|western|central|northern|bharat coking)\s+coalfields?\b|\bcmpdi\b|\bcentral mine planning\b/i, parent: "Coal India Ltd." },
    { re: /\bnlc india\b/i, parent: "NLC India Ltd." },
    { re: /\bjsw\s+(one|cement|energy|infra)/i, parent: "JSW Steel Ltd." },
    { re: /\bsbi\s+(funds|mutual|general|payment)/i, parent: "State Bank of India (SBI)" },
    { re: /\b(jio platforms|reliance jio|reliance retail)\b/i, parent: "Reliance Industries Ltd." },
    { re: /\bhero\s+fincorp\b/i, parent: "Hero MotoCorp Ltd." },
    { re: /\bcanara\s+(hsbc|robeco)\b/i, parent: "Canara Bank" },
    { re: /\bntpc\s+(green|renewable|vidyut)/i, parent: "NTPC Ltd." },
    { re: /\bongc\s+(green|petro|videsh)/i, parent: "ONGC Ltd." },
    { re: /\bhdfc\s+(credila|securities|ergo)\b/i, parent: "HDFC Bank Ltd." },
    { re: /\bicici\s+(direct|prudential amc|ventures)\b/i, parent: "ICICI Bank Ltd." },
    { re: /\btata\s+(capital|autocomp|play|passenger|electronics|digital)\b/i, parent: "Tata Group (Check RHP Parent)" },
    { re: /\bgreaves\s+electric\b/i, parent: "Greaves Cotton Ltd." },
    { re: /\bprestige\s+hospitality\b/i, parent: "Prestige Estates Projects" },
    { re: /\bbrigade\s+hotel\b/i, parent: "Brigade Enterprises Ltd." },
  ];

  function detectShareholderParent(companyName) {
    const s = String(companyName || "").trim();
    for (let i = 0; i < SHAREHOLDER_PARENT_RULES.length; i++) {
      if (SHAREHOLDER_PARENT_RULES[i].re.test(s)) return SHAREHOLDER_PARENT_RULES[i].parent;
    }
    return "";
  }

  function cleanUpcomingIssueSize(raw) {
    const s = stripHtmlNoSpan(String(raw || "")).replace(/\s+/g, " ").trim();
    if (!s) return "";
    const matches = s.match(/Rs\.?\s*[\d,]+(?:\.\d+)?\s*cr/gi) || [];
    if (matches.length) {
      let total = 0;
      matches.forEach((m) => {
        const n = m.match(/[\d,]+(?:\.\d+)?/);
        if (n) total += parseFloat(n[0].replace(/,/g, "")) || 0;
      });
      if (total > 0) return "₹" + Math.round(total).toLocaleString("en-IN") + " Cr";
    }
    return "";
  }

  async function fetchJsonRows(url, referer) {
    try {
      if (typeof window.hdFetchText !== "function") return [];
      const res = await window.hdFetchText(url, referer || "https://www.chittorgarh.com/");
      if (!res || !res.ok) return [];
      const data = await res.json();
      return Array.isArray(data && data.reportTableData) ? data.reportTableData : [];
    } catch (_) {
      return [];
    }
  }

  async function fetchInvestorGainGmpRows() {
    try {
      if (typeof window.hdFetchText !== "function") return [];
      const urls = [
        "https://www.investorgain.com/report/ipo-gmp-live/331/",
        "https://www.investorgain.com/report/live-ipo-gmp/331/"
      ];
      let html = "";
      for (let uIdx = 0; uIdx < urls.length; uIdx++) {
        try {
          const res = await window.hdFetchText(urls[uIdx], "https://www.investorgain.com/");
          if (res && res.ok) {
            const txt = await res.text();
            if (txt && txt.indexOf("reportTableData") !== -1) {
              html = txt;
              break;
            }
          }
        } catch (_) {}
      }
      if (!html) return [];
      const chunks = [];
      const re = /self\.__next_f\.push\(\[1,("((?:\\.|[^"\\])*)")\]\)/g;
      let m;
      while ((m = re.exec(html))) {
        try {
          chunks.push(JSON.parse(m[1]));
        } catch (_) {}
      }
      const full = chunks.join("");
      const idx = full.indexOf('"reportTableData":[');
      if (idx === -1) return [];
      const arrStart = full.indexOf("[", idx);
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
        if (ch === "\\") {
          esc = true;
          continue;
        }
        if (ch === '"') {
          inStr = !inStr;
          continue;
        }
        if (!inStr) {
          if (ch === "[") depth++;
          else if (ch === "]") {
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
    } catch (_) {
      return [];
    }
  }

  // ---- Build & Cache Chittorgarh Directory (Used for 3-Year Financials HTML Lookup) ----
  function buildDirectoryEntries(listRows, mainSub, smeSub) {
    const subBySlug = new Map();
    [...(mainSub || []), ...(smeSub || [])].forEach((r) => {
      const slug = String(r["~URLRewrite_Folder_Name"] || "").trim().toLowerCase();
      if (slug) subBySlug.set(slug, r);
    });

    const seen = new Set();
    const entries = [];
    (listRows || []).forEach((row) => {
      const slug = String(row["~URLRewrite_Folder_Name"] || "").trim().toLowerCase();
      const detailUrl = extractHref(row["Company"]);
      if (!detailUrl || (slug && seen.has(slug))) return;
      if (slug) seen.add(slug);

      const name = cleanText(row["Company"]) || cleanText(row["~IPO"]);
      const sub = slug ? subBySlug.get(slug) : null;
      const freshCr = cleanText(row["Fresh Capital (Rs.cr.)"]);
      const ofsCr = cleanText(row["Offer for sale (Rs.cr.)"]);
      const totalCr = cleanText(row["Total Issue Amount (Incl.Firm reservations) (Rs.cr.)"]);

      entries.push({
        name,
        normName: normalizeFinName(name),
        slug,
        detailUrl,
        freshIssue: freshCr ? "₹" + freshCr + " Cr" : "—",
        freshIssuePct: parseNum(row["Fresh Capital as % of Issue Amount"]),
        ofs: ofsCr ? "₹" + ofsCr + " Cr" : "—",
        ofsPct: parseNum(row["Offer for sale as % of Issue Amount"]),
        issueSize: totalCr ? "₹" + totalCr + " Cr" : "TBA",
        priceBand: cleanText(row["Issue Price (Rs.)"]),
        listingDate: cleanText(row["Listing Date"]) || "TBA",
        subTotal: sub ? fmtMult(sub["Total (x)"]) : "—",
        subTotalNum: sub ? parseNum(sub["Total (x)"]) : null,
        subQib: sub ? fmtMult(sub["QIB (x)"]) : "—",
        subQibNum: sub ? parseNum(sub["QIB (x)"]) : null,
        subNii: sub ? fmtMult(sub["NII (x)"]) : "—",
        subSnii: sub ? fmtMult(sub["sNII (x)"]) : "—",
        subBnii: sub ? fmtMult(sub["bNII (x)"]) : "—",
        subRetail: sub ? fmtMult(sub["Retail (x)"]) : "—",
        subEmployee: sub ? fmtMult(sub["Employee (x)"]) : "—",
        applications: sub && sub["Applications"] ? String(sub["Applications"]) : "",
        subAsOn: sub ? cleanText(sub["Subscription as on"]) : "",
      });
    });

    return entries;
  }

  async function getDirectory() {
    const now = new Date();
    if (dirCache && now.getTime() - dirCache.fetchedAt < DIR_CACHE_TTL_MS && dirCache.entries.length > 0) {
      return dirCache.entries;
    }

    const { month, year, fy, prevYear, prevFy } = getIndianFyParams(now);
    const base = "https://webnodejs.chittorgarh.com/cloud/report/data-read";
    const [curList, prevList, mainSub, smeSub, mainUp, smeUp] = await Promise.all([
      fetchJsonRows(`${base}/82/1/${month}/${year}/${fy}/0/all/0`),
      fetchJsonRows(`${base}/82/1/3/${prevYear}/${prevFy}/0/all/0`),
      fetchJsonRows(`${base}/21/1/${month}/${year}/${fy}/0/mainboard/0`),
      fetchJsonRows(`${base}/21/1/${month}/${year}/${fy}/0/sme/0`),
      fetchJsonRows(`${base}/158/1/${month}/${year}/${fy}/0/all/0`),
      fetchJsonRows(`${base}/154/1/${month}/${year}/${fy}/0/all/0`),
    ]);

    const entries = buildDirectoryEntries([...curList, ...prevList, ...mainUp, ...smeUp], mainSub, smeSub);
    if (entries.length > 0) {
      dirCache = { fetchedAt: now.getTime(), entries };
    }
    return entries;
  }

  function findBestDirectoryMatch(entries, name, slug) {
    const slugClean = String(slug || "").toLowerCase().replace(/-ipo$/, "").trim();
    const normQuery = normalizeFinName(name);
    const queryWords = normQuery.split(" ").filter((w) => w.length >= 2);

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (slugClean && (e.slug === slugClean || e.slug === slugClean + "-ipo")) return e;
      if (normQuery && e.normName === normQuery) return e;
    }

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (normQuery && normQuery.length >= 4 && (e.normName.includes(normQuery) || normQuery.includes(e.normName))) {
        if (e.normName.length >= 4) return e;
      }
      if (slugClean && slugClean.length >= 4 && e.slug.includes(slugClean)) {
        return e;
      }
    }

    if (queryWords.length === 0) return null;
    let best = null;
    let bestScore = 0;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const eWords = new Set(e.normName.split(" ").filter((w) => w.length >= 2));
      if (eWords.size === 0) continue;
      let hits = 0;
      for (let j = 0; j < queryWords.length; j++) {
        if (eWords.has(queryWords[j])) hits++;
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

  function parseTableRows(tableHtml) {
    const trMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const rows = [];
    for (let i = 0; i < trMatches.length; i++) {
      const cellMatches = trMatches[i].match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || [];
      const cells = cellMatches.map((c) => cleanText(c));
      if (cells.length > 0) rows.push(cells);
    }
    return rows;
  }

  // ---- Exact Port of ipoFinancials.ts parseChittorgarhDetailHtml ----
  function parseChittorgarhDetailHtml(html, entry) {
    const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];

    const financials = [];
    const kpis = {
      roe: "—",
      roeNum: null,
      roce: "—",
      roceNum: null,
      debtToEquity: "—",
      debtToEquityNum: null,
      ronw: "—",
      patMargin: "—",
      patMarginNum: null,
      ebitdaMargin: "—",
      pb: "—",
      prePe: null,
      postPe: null,
      preEps: "—",
      postEps: "—",
      marketCap: "—",
    };

    const issueDetails = {
      lotSize: 0,
      minInvest: "—",
      freshIssue: entry.freshIssue,
      freshIssuePct: entry.freshIssuePct,
      ofs: entry.ofs,
      ofsPct: entry.ofsPct,
      issueSize: entry.issueSize,
      priceBand: entry.priceBand ? "₹" + entry.priceBand.replace(/^₹/, "") : "TBA",
      faceValue: "—",
      listingDate: entry.listingDate,
      registrar: "NSE / BSE",
      saleType: "",
    };

    for (let ti = 0; ti < tables.length; ti++) {
      const rows = parseTableRows(tables[ti]);
      if (rows.length === 0) continue;
      const flatText = rows.map((r) => r.join(" ")).join(" ");

      // 1. Financials table ("Period Ended" + "Profit After Tax" / "Total Income")
      if (
        financials.length === 0 &&
        /Period Ended/i.test(rows[0] && rows[0][0] ? rows[0][0] : "") &&
        /Profit After Tax|Total Income|Revenue/i.test(flatText)
      ) {
        const periods = rows[0].slice(1).filter(Boolean);
        const findRowVals = (pattern) => {
          const found = rows.find((r) => pattern.test(r[0] || ""));
          return found ? found.slice(1) : [];
        };
        const assetsVals = findRowVals(/^Assets/i);
        const revVals = findRowVals(/Total Income|Revenue/i);
        const patVals = findRowVals(/Profit After Tax|PAT/i);
        const ebitdaVals = findRowVals(/EBITDA/i);
        const nwVals = findRowVals(/NET Worth|Net Worth/i);
        const debtVals = findRowVals(/Total Borrowing|Borrowing|Total Debt/i);

        for (let i = 0; i < periods.length; i++) {
          const revRaw = revVals[i] || "";
          const patRaw = patVals[i] || "";
          const ebitdaRaw = ebitdaVals[i] || "";
          const nwRaw = nwVals[i] || "";
          const assetsRaw = assetsVals[i] || "";
          const debtRaw = debtVals[i] || "";

          financials.push({
            period: periods[i],
            revenue: revRaw ? "₹" + revRaw + " Cr" : "—",
            profit: patRaw ? "₹" + patRaw + " Cr" : "—",
            ebitda: ebitdaRaw ? "₹" + ebitdaRaw + " Cr" : "—",
            netWorth: nwRaw ? "₹" + nwRaw + " Cr" : "—",
            assets: assetsRaw ? "₹" + assetsRaw + " Cr" : "—",
            borrowing: debtRaw ? "₹" + debtRaw + " Cr" : "—",
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
        const pickLastFullYearOrFirst = (vals) => {
          const v1 = vals[1] ? vals[1].trim() : "";
          const v0 = vals[0] ? vals[0].trim() : "";
          return v1 && v1 !== "-" && v1 !== "—" ? v1 : v0 || "—";
        };
        for (let ri = 0; ri < rows.length; ri++) {
          const r = rows[ri];
          const k = (r[0] || "").toLowerCase();
          const vals = r.slice(1);
          if (k === "roe" || k.startsWith("roe ")) {
            kpis.roe = pickLastFullYearOrFirst(vals);
            kpis.roeNum = parseNum(kpis.roe);
          } else if (k === "roce" || k.startsWith("roce ")) {
            kpis.roce = pickLastFullYearOrFirst(vals);
            kpis.roceNum = parseNum(kpis.roce);
          } else if (k.includes("debt/equity")) {
            kpis.debtToEquity = pickLastFullYearOrFirst(vals);
            kpis.debtToEquityNum = parseNum(kpis.debtToEquity);
          } else if (k.includes("ronw")) {
            kpis.ronw = pickLastFullYearOrFirst(vals);
          } else if (k.includes("pat margin")) {
            kpis.patMargin = pickLastFullYearOrFirst(vals);
            kpis.patMarginNum = parseNum(kpis.patMargin);
          } else if (k.includes("ebitda margin")) {
            kpis.ebitdaMargin = pickLastFullYearOrFirst(vals);
          } else if (k.includes("p/b")) {
            kpis.pb = pickLastFullYearOrFirst(vals);
          }
        }
        continue;
      }

      // 3. Valuation Metric table (Pre/Post EPS, P/E, Market Cap)
      if (/Valuation Metric|Pre IPO/i.test(flatText) && /P\/E/i.test(flatText)) {
        for (let ri = 0; ri < rows.length; ri++) {
          const r = rows[ri];
          const k = (r[0] || "").toLowerCase();
          if (k.includes("eps")) {
            kpis.preEps = r[1] || "—";
            kpis.postEps = r[2] || "—";
          } else if (k.includes("p/e")) {
            kpis.prePe = parseNum(r[1]);
            kpis.postPe = parseNum(r[2]);
          } else if (k.includes("market cap")) {
            kpis.marketCap = r[2] || r[1] || "—";
          }
        }
        continue;
      }

      // 4. Summary IPO Details table
      if (/Lot Size/i.test(flatText) && /Price Band|IPO Date/i.test(flatText)) {
        for (let ri = 0; ri < rows.length; ri++) {
          const r = rows[ri];
          const k = (r[0] || "").toLowerCase();
          const v = r[1] || "";
          if (k.includes("lot size")) {
            const lotNum = parseNum(v);
            if (lotNum && lotNum > 0) issueDetails.lotSize = Math.round(lotNum);
          } else if (k.includes("face value")) {
            issueDetails.faceValue = v;
          } else if (k.includes("sale type")) {
            issueDetails.saleType = v;
          } else if (k.includes("price band") && v) {
            issueDetails.priceBand = v;
          } else if (k.includes("listing date") && v) {
            issueDetails.listingDate = v.replace(/\s+T$/i, "");
          }
        }
        continue;
      }

      // 5. Retail Lot table
      if (/Retail \(Min\)/i.test(flatText)) {
        const retailRow = rows.find((r) => /Retail \(Min\)/i.test(r[0] || ""));
        if (retailRow) {
          const shares = parseNum(retailRow[2]);
          if (shares && shares > 0 && issueDetails.lotSize === 0) {
            issueDetails.lotSize = Math.round(shares);
          }
          if (retailRow[3]) issueDetails.minInvest = retailRow[3];
        }
      }
    }

    // Registrar
    const regMatch = html.match(/class="registrar-name"[^>]*>([^<]+)</i);
    if (regMatch && regMatch[1]) {
      issueDetails.registrar = cleanText(regMatch[1]);
    }

    // About Company
    let about = "";
    const aboutMatch = html.match(/<h2[^>]*>About [^<]+<\/h2>([\s\S]{0,3000})/i);
    if (aboutMatch && aboutMatch[1]) {
      const pMatches = aboutMatch[1].match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
      const goodParas = pMatches
        .map((p) => cleanText(p))
        .filter((p) => p.length > 45 && !/^Updated on /i.test(p));
      about = goodParas.slice(0, 2).join(" ").slice(0, 460);
    }

    // Competitive Strengths
    const strengths = [];
    const strSection = html.match(/Competitive [Ss]trengths[\s\S]{0,2500}/i);
    if (strSection && strSection[0]) {
      const liMatches = strSection[0].match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
      for (let i = 0; i < Math.min(5, liMatches.length); i++) {
        const txt = cleanText(liMatches[i]);
        if (txt.length > 10 && txt.length < 220) strengths.push(txt);
      }
    }

    // YoY Growth
    const fullYearRows = financials.filter((f) => /Mar/i.test(f.period));
    const series = fullYearRows.length >= 2 ? fullYearRows : financials;
    let revGrowthPct = null;
    let patGrowthPct = null;

    if (series.length >= 2) {
      const latest = series[0];
      const prev = series[1];
      if (latest.revenueNum !== null && prev.revenueNum !== null && prev.revenueNum > 0) {
        revGrowthPct = Number((((latest.revenueNum - prev.revenueNum) / prev.revenueNum) * 100).toFixed(1));
      }
      if (latest.profitNum !== null && prev.profitNum !== null && prev.profitNum > 0) {
        patGrowthPct = Number((((latest.profitNum - prev.profitNum) / prev.profitNum) * 100).toFixed(1));
      }
    }

    const profitNums = financials.map((f) => f.profitNum).filter((v) => v !== null);
    const allProfitable = profitNums.length > 0 && profitNums.every((v) => v > 0);
    const anyLoss = profitNums.some((v) => v < 0);

    let bizScore = 5.0;
    const businessReasons = [];

    if (allProfitable && profitNums.length >= 2) {
      bizScore += 1.2;
      businessReasons.push(`Pichhle ${profitNums.length} periods mein company lagatar profitable hai.`);
    } else if (anyLoss) {
      bizScore -= 1.5;
      businessReasons.push("Pichhle saalon mein company ko loss hua hai — profit consistency weak hai.");
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
        businessReasons.push(
          `${Math.round(issueDetails.freshIssuePct)}% Fresh Issue — paisa company growth/debt reduction mein lagega.`
        );
      } else if (issueDetails.freshIssuePct <= 30) {
        bizScore -= 0.7;
        businessReasons.push(
          `Zyada hissa OFS (${Math.round(100 - issueDetails.freshIssuePct)}%) hai — purane investors exit kar rahe hain.`
        );
      }
    }

    const effectivePe = kpis.prePe != null ? kpis.prePe : kpis.postPe;
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
        ? "Strong Company"
        : bizScore >= 5.5
        ? "Average / Stable"
        : "Weak / Risky Fundamentals";

    let demandScore = 5.0;
    const demandReasons = [];
    const totSub = entry.subTotalNum;
    const qibSub = entry.subQibNum;

    if (totSub === null) {
      demandScore = 5.0;
      demandReasons.push(
        "Bidding data abhi start nahi hua ya update ho raha hai (Day 2/3 QIB demand zaroor dekhein)."
      );
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
          demandReasons.push(
            `QIB (Bade Institutions) ne ${entry.subQib} bhara hai — smart money confidence strong hai.`
          );
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
        ? "Bidding Pending"
        : demandScore >= 7.5
        ? "High Market Demand"
        : demandScore >= 5.5
        ? "Moderate Demand"
        : "Low Demand";

    let verdictType;
    let verdictHeadline;
    let verdictSummary;

    if (bizScore >= 6.8 && demandScore >= 7.0) {
      verdictType = "both_strong";
      verdictHeadline = "💎 Kaam Bhi Strong Hai + Market Demand Bhi High!";
      verdictSummary =
        "Company ke pichhle 3 saal ke financials mazboot hain aur bade investors (QIB/Market) ki demand bhi acchi hai. Listing gain aur medium-to-long term dono ke liye positive profile hai.";
    } else if (bizScore >= 6.8 && demandScore < 7.0) {
      verdictType = "business_strong";
      verdictHeadline = "🏭 Company Ka Kaam Strong Hai (Market Demand Abhi Moderate/Early)";
      verdictSummary =
        "Financials aur business model solid lag rahe hain, lekin market hype/subscription abhi moderate hai. Apply karne se pehle last day ke QIB numbers zaroor check karein; long-term quality achhi hai.";
    } else if (bizScore < 6.8 && demandScore >= 7.0) {
      verdictType = "demand_hype";
      verdictHeadline = "🔥 Market Demand High Hai — Par Financials/Valuation Par Dhyan Dein";
      verdictSummary =
        "Is IPO mein market craze aur subscription strong hai, par company ke fundamentals (ya valuation/debt) average/risky hain. Aise IPO sirf short-term listing gain + tight Stop Loss ke liye dekhe jaate hain.";
    } else {
      verdictType = "weak";
      verdictHeadline = "⚠️ Financials Bhi Average/Weak + Market Demand Bhi Kam";
      verdictSummary =
        "Na toh pichhle saalon ke financials mein strong strength dikh rahi hai aur na hi market demand tez hai. Jab tak Day-3 par strong QIB demand na aaye, risk zyada hai.";
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

  function findBundledFinancials(name, slug) {
    const map = window.HD_BUNDLED_FINANCIALS;
    if (!map || typeof map !== "object") return null;
    const slugLow = String(slug || "").toLowerCase().trim();
    const normK = normIpoKey(name);
    const finK = normalizeFinName(name);

    if (slugLow && map[slugLow] && map[slugLow].found) return map[slugLow];
    if (normK && map[normK] && map[normK].found) return map[normK];
    if (finK && map[finK] && map[finK].found) return map[finK];

    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (normK && normK.length >= 5 && (k.includes(normK) || normK.includes(k))) {
        if (map[k] && map[k].found) return map[k];
      }
    }
    return null;
  }

  // Persistent on-device 3-Year Financials cache (instant 0ms repeat load + offline fallback)
  const FIN_DISK_KEY = "hdFinDiskCacheV1";
  const FIN_DISK_TTL_MS = 24 * 60 * 60 * 1000;
  function readDiskFinancials(cacheKey) {
    try {
      const store = JSON.parse(localStorage.getItem(FIN_DISK_KEY) || "{}");
      const item = store && store[cacheKey];
      if (item && item.data && item.data.found && Date.now() - Number(item.t || 0) < FIN_DISK_TTL_MS) {
        return item.data;
      }
    } catch (_) {}
    return null;
  }
  function saveDiskFinancials(cacheKey, report) {
    if (!report || !report.found) return;
    try {
      const store = JSON.parse(localStorage.getItem(FIN_DISK_KEY) || "{}") || {};
      store[cacheKey] = { t: Date.now(), data: report };
      const keys = Object.keys(store);
      if (keys.length > 40) {
        keys
          .sort((a, b) => Number((store[a] && store[a].t) || 0) - Number((store[b] && store[b].t) || 0))
          .slice(0, keys.length - 40)
          .forEach((k) => { delete store[k]; });
      }
      localStorage.setItem(FIN_DISK_KEY, JSON.stringify(store));
    } catch (_) {}
  }

  // ---- Public API 1: Full 3-Year RHP Financials & Deep Analysis ----
  window.fetchNativeIpoFinancialsReport = async function (name, slug) {
    const safeSlug = String(slug || "").toLowerCase().trim();
    const cacheKey = safeSlug + "|" + normalizeFinName(name);
    const cached = reportCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < REPORT_CACHE_TTL_MS) {
      return cached.data;
    }

    // 1. Live fetch from Chittorgarh on-device (matches Web App 100%)
    try {
      const entries = await getDirectory();
      const match = findBestDirectoryMatch(entries, name, safeSlug);
      if (match && match.detailUrl && typeof window.hdFetchText === "function") {
        const res = await window.hdFetchText(match.detailUrl, "https://www.chittorgarh.com/");
        if (res && res.ok) {
          const html = await res.text();
          if (html && html.length > 500) {
            const report = parseChittorgarhDetailHtml(html, match);
            if (report && report.found) {
              reportCache.set(cacheKey, { fetchedAt: Date.now(), data: report });
              saveDiskFinancials(cacheKey, report);
              return report;
            }
          }
        }
      }
    } catch (_) {
      // fallback to disk / pre-bundled snapshot below
    }

    // 2. Persistent disk cache fallback
    const disk = readDiskFinancials(cacheKey);
    if (disk) {
      reportCache.set(cacheKey, { fetchedAt: Date.now(), data: disk });
      return disk;
    }

    // 3. Fallback to instant pre-bundled financials snapshot (offline / Chittorgarh hiccup)
    const bundled = findBundledFinancials(name, safeSlug);
    if (bundled) {
      reportCache.set(cacheKey, { fetchedAt: Date.now(), data: bundled });
      return bundled;
    }
    return null;
  };

  // Fast instant lookup (0ms) for cached or pre-bundled 3-Year Financials before network finishes
  window.getBundledIpoFinancialsInstant = function (name, slug) {
    const safeSlug = String(slug || "").toLowerCase().trim();
    const cacheKey = safeSlug + "|" + normalizeFinName(name);
    const disk = readDiskFinancials(cacheKey);
    if (disk) return disk;
    return findBundledFinancials(name, safeSlug);
  };

  // ---- Public API 2: Full Cards Meta (100% Parity with /api/hdipo/cards-meta) ----
  window.fetchNativeFullCardsMeta = async function (forceRefresh) {
    const now = new Date();
    const nowMs = now.getTime();
    if (!forceRefresh && liveMetaCache && nowMs - liveMetaCache.fetchedAt < LIVE_META_TTL_MS) {
      return liveMetaCache.items;
    }

    const byKey = new Map();
    // Seed with bundled snapshot so offline/partial failures never drop IPOs
    if (Array.isArray(window.HD_BUNDLED_CARDS_META)) {
      window.HD_BUNDLED_CARDS_META.forEach((m) => {
        if (m && m.normName) byKey.set(m.normName, Object.assign({}, m));
      });
    }

    try {
      const { month, year, fy, prevYear, prevFy } = getIndianFyParams(now);
      const baseUrl = "https://webnodejs.chittorgarh.com/cloud/report/data-read";

      const [ipoRows, prevIpoRows, mainSubRows, smeSubRows, perfRows, gmpRows, mainUpcomingRows, smeUpcomingRows] =
        await Promise.all([
          fetchJsonRows(`${baseUrl}/82/1/${month}/${year}/${fy}/0/all/0`),
          fetchJsonRows(`${baseUrl}/82/1/3/${prevYear}/${prevFy}/0/all/0`),
          fetchJsonRows(`${baseUrl}/21/1/${month}/${year}/${fy}/0/mainboard/0`),
          fetchJsonRows(`${baseUrl}/21/1/${month}/${year}/${fy}/0/sme/0`),
          fetchJsonRows(`${baseUrl}/125/1/${month}/${year}/${fy}/0/all/0`),
          fetchInvestorGainGmpRows(),
          fetchJsonRows(`${baseUrl}/158/1/${month}/${year}/${fy}/0/all/0`),
          fetchJsonRows(`${baseUrl}/154/1/${month}/${year}/${fy}/0/all/0`),
        ]);

      // Warm directory cache right here so clicking any IPO for 3-Year Financials is instant!
      const dirEntries = buildDirectoryEntries(
        [...ipoRows, ...prevIpoRows, ...mainUpcomingRows, ...smeUpcomingRows],
        mainSubRows,
        smeSubRows
      );
      if (dirEntries.length > 0) {
        dirCache = { fetchedAt: nowMs, entries: dirEntries };
      }

      const subBySlug = new Map();
      [...mainSubRows, ...smeSubRows].forEach((r) => {
        const slug = String(r["~URLRewrite_Folder_Name"] || "").trim().toLowerCase();
        if (slug) subBySlug.set(slug, r);
      });

      const perfBySlug = new Map();
      perfRows.forEach((r) => {
        const slug = String(r["~URLRewrite_Folder_Name"] || "").trim().toLowerCase();
        if (slug) perfBySlug.set(slug, r);
      });

      // Merge Chittorgarh Report 82 + 21 + 125 (Current FY)
      ipoRows.forEach((row) => {
        const slug = String(row["~URLRewrite_Folder_Name"] || "").trim().toLowerCase();
        const sub = slug ? subBySlug.get(slug) : null;
        const perf = slug ? perfBySlug.get(slug) : null;
        const companyName = stripHtmlNoSpan(row["Company"]) || stripHtmlNoSpan(row["~IPO"]) || "";
        const key = normIpoKey(companyName);
        if (!key) return;

        const categoryRaw = String(row["Issue Category"] || "").toLowerCase();
        const board = categoryRaw.includes("sme") ? "sme" : "mainboard";
        let status = computeIpoStatus(row, nowMs);
        if (perf && parseNumberOrNull(perf["Close Price on Listing (Rs.)"]) !== null) {
          status = "listed";
        }

        const openIso = toIsoDateOnly(row["~Issue_Open_Date"] || row["Opening Date"]);
        const closeIso = toIsoDateOnly(row["~IssueCloseDate"] || row["Closing Date"]);
        const listingIso = toIsoDateOnly(row["~ListingDate"] || (perf && perf["~IPO_listing_date"]) || row["Listing Date"]);

        const issueCrRaw = stripHtmlNoSpan(row["Total Issue Amount (Incl.Firm reservations) (Rs.cr.)"]);
        const issueSize = issueCrRaw ? "₹" + issueCrRaw + " Cr" : "";
        const freshIssuePct = parseNumberOrNull(row["Fresh Capital as % of Issue Amount"]);
        const ofsPct = parseNumberOrNull(row["Offer for sale as % of Issue Amount"]);
        const leadManager = stripHtmlNoSpan(row["Left Lead Manager"]);
        const exchange = stripHtmlNoSpan(row["Listing at"]) || (board === "sme" ? "NSE/BSE SME" : "NSE, BSE");
        const logoRaw = String(row["~compare_image"] || "").trim();
        const logoUrl = /^https?:\/\//i.test(logoRaw) ? logoRaw : "";

        const subNum = sub
          ? parseNumberOrNull(sub["Total (x)"])
          : perf
          ? parseNumberOrNull(perf["Subscription (x)"])
          : null;
        const subQib = sub ? fmtMult(sub["QIB (x)"]) : "";
        const subNii = sub ? fmtMult(sub["NII (x)"]) : "";
        const subRetail = sub ? fmtMult(sub["Retail (x)"]) : "";
        const subAsOn = sub ? stripHtmlNoSpan(sub["Subscription as on"]) : "";

        const issuePriceNum = perf ? parseNumberOrNull(perf["Issue Price (Rs.)"]) : null;
        const listingOpenPrice = perf ? parseNumberOrNull(perf["Open Price on Listing (Rs.)"]) : null;
        let listingOpenGainPct = perf
          ? parseNumberOrNull(perf["% Gain / Loss (Issue price v/s Open price on Listing)"])
          : null;
        if (listingOpenGainPct === null && issuePriceNum && listingOpenPrice !== null) {
          listingOpenGainPct = Number((((listingOpenPrice - issuePriceNum) / issuePriceNum) * 100).toFixed(2));
        }

        const listingClosePrice = perf ? parseNumberOrNull(perf["Close Price on Listing (Rs.)"]) : null;
        let listingCloseGainPct = perf
          ? parseNumberOrNull(perf["% Gain / Loss (Issue price v/s Close price on Listing)"])
          : null;
        if (listingCloseGainPct === null && issuePriceNum && listingClosePrice !== null) {
          listingCloseGainPct = Number((((listingClosePrice - issuePriceNum) / issuePriceNum) * 100).toFixed(2));
        }

        const cmpObj = perf ? parseCmpAndPct(perf["Market Price (Rs.)"]) : { cmp: null, pct: null };
        const priceBand = formatPriceBand(row["Issue Price (Rs.)"]);

        const prev = byKey.get(key);
        byKey.set(key, {
          normName: key,
          name: companyName,
          slug: slug || (prev && prev.slug) || key,
          board,
          status,
          logoUrl: logoUrl || (prev && prev.logoUrl) || "",
          lotSize: (prev && prev.lotSize) || 0,
          issueSize: issueSize || (prev && prev.issueSize) || "",
          issuePriceNum: issuePriceNum !== null ? issuePriceNum : (prev ? prev.issuePriceNum : null),
          registrar: leadManager || exchange || (prev && prev.registrar) || "NSE / BSE",
          gmp: prev && Number.isFinite(prev.gmp) ? prev.gmp : 0,
          gmpPercent: prev && Number.isFinite(prev.gmpPercent) ? prev.gmpPercent : 0,
          subNum: subNum !== null ? subNum : (prev ? prev.subNum : null),
          subQib: subQib && subQib !== "—" ? subQib : ((prev && prev.subQib) || ""),
          subNii: subNii && subNii !== "—" ? subNii : ((prev && prev.subNii) || ""),
          subRetail: subRetail && subRetail !== "—" ? subRetail : ((prev && prev.subRetail) || ""),
          subAsOn: subAsOn || (prev && prev.subAsOn) || "",
          ofsPct: ofsPct !== null ? ofsPct : (prev ? prev.ofsPct : null),
          freshIssuePct: freshIssuePct !== null ? freshIssuePct : (prev ? prev.freshIssuePct : null),
          listingOpenPrice: listingOpenPrice !== null ? listingOpenPrice : (prev ? prev.listingOpenPrice : null),
          listingOpenGainPct: listingOpenGainPct !== null ? listingOpenGainPct : (prev ? prev.listingOpenGainPct : null),
          listingClosePrice: listingClosePrice !== null ? listingClosePrice : (prev ? prev.listingClosePrice : null),
          listingCloseGainPct: listingCloseGainPct !== null ? listingCloseGainPct : (prev ? prev.listingCloseGainPct : null),
          cmpPrice: cmpObj.cmp !== null ? cmpObj.cmp : (prev ? prev.cmpPrice : null),
          cmpGainPct: cmpObj.pct !== null ? cmpObj.pct : (prev ? prev.cmpGainPct : null),
          priceBand: priceBand && priceBand !== "TBA" ? priceBand : ((prev && prev.priceBand) || ""),
          openIso: openIso || (prev && prev.openIso) || "",
          closeIso: closeIso || (prev && prev.closeIso) || "",
          listingIso: listingIso || (prev && prev.listingIso) || "",
          pe: (prev && prev.pe) || 0,
          upcomingTier: status === "upcoming" ? "confirmed" : ((prev && prev.upcomingTier) || ""),
          shareholderParent: detectShareholderParent(companyName) || (prev && prev.shareholderParent) || "",
        });
      });

      // Merge InvestorGain Live GMP rows (Exact parity with server.ts)
      const todayIso = new Date(nowMs + 5.5 * 3600000).toISOString().slice(0, 10);
      gmpRows.forEach((row) => {
        const rawName = String(row["~ipo_name"] || "").trim();
        const key = normIpoKey(rawName);
        if (!key) return;

        const gmpClean = String(row["GMP"] || "")
          .replace(/&#8377;/g, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const gmpMatch = gmpClean.match(/(-?\d+(?:\.\d+)?)\s*\(\s*(-?\d+(?:\.\d+)?)%\s*\)/);
        const gmpVal = gmpMatch ? Number(gmpMatch[1]) : 0;
        const gmpPctRaw = parseNumberOrNull(row["~gmp_percent_calc"]);
        const gmpPct = gmpPctRaw !== null ? gmpPctRaw : gmpMatch ? Number(gmpMatch[2]) : 0;

        const lotVal = Number(String(row["Lot"] || "0").replace(/\D/g, "")) || 0;
        const sizeClean = String(row["IPO Size"] || "")
          .replace(/&#8377;/g, "")
          .replace(/<[^>]+>/g, "")
          .trim();
        const subClean = String(row["Sub"] || "").replace(/<[^>]+>/g, "").replace(/[xX]/g, "").trim();
        const subVal = parseNumberOrNull(subClean);
        const peVal = parseNumberOrNull(row["~P/E"]) || 0;
        const openIso = toIsoDateOnly(row["~Srt_Open"]);
        const closeIso = toIsoDateOnly(row["~Srt_Close"]);
        const listingIso = toIsoDateOnly(row["~Str_Listing"]);
        const igCat = String(row["~IPO_Category"] || "").toLowerCase();
        const igBoard = igCat.includes("sme") ? "sme" : "mainboard";

        let existing = byKey.get(key);
        if (!existing) {
          for (const [ck, cv] of byKey.entries()) {
            if (ck.startsWith(key) || key.startsWith(ck)) {
              existing = cv;
              break;
            }
          }
        }

        const listedAtMatch = String(row["GMP"] || "").match(/L@\s*(?:&#8377;|₹)?\s*(\d+(?:\.\d+)?)/i);
        const listedAtVal = listedAtMatch ? Number(listedAtMatch[1]) : null;
        const priceNumIg = parseNumberOrNull(row["Price (₹)"]);
        const listedAtPct =
          listedAtVal !== null && priceNumIg !== null && priceNumIg > 0
            ? Number((((listedAtVal - priceNumIg) / priceNumIg) * 100).toFixed(2))
            : null;

        if (existing) {
          if (lotVal > 0) existing.lotSize = lotVal;
          if (sizeClean && !existing.issueSize) existing.issueSize = sizeClean;
          if (Number.isFinite(gmpVal)) existing.gmp = gmpVal;
          if (Number.isFinite(gmpPct)) existing.gmpPercent = gmpPct;
          if (subVal !== null && (existing.subNum === null || subVal > existing.subNum)) {
            existing.subNum = subVal;
          }
          if (peVal > 0) existing.pe = peVal;
          if (openIso && !existing.openIso) existing.openIso = openIso;
          if (closeIso && !existing.closeIso) existing.closeIso = closeIso;
          if (listingIso && !existing.listingIso) existing.listingIso = listingIso;
          if (listedAtVal !== null && existing.listingOpenPrice === null) {
            existing.listingOpenPrice = listedAtVal;
            existing.listingOpenGainPct = listedAtPct;
          }
        } else {
          let igStatus = "closed";
          if (listedAtVal !== null) igStatus = "listed";
          else if (openIso && closeIso && openIso <= todayIso && todayIso <= closeIso) igStatus = "open";
          else if (openIso && openIso > todayIso) igStatus = "upcoming";
          else if (!openIso && !closeIso) igStatus = "upcoming";

          byKey.set(key, {
            normName: key,
            name: rawName,
            slug: String(row["~urlrewrite_folder_name"] || "").replace(/^\/gmp\/|\/$/g, ""),
            board: igBoard,
            status: igStatus,
            logoUrl: "",
            lotSize: lotVal,
            issueSize: sizeClean,
            issuePriceNum: priceNumIg,
            registrar: "NSE / BSE",
            gmp: Number.isFinite(gmpVal) ? gmpVal : 0,
            gmpPercent: Number.isFinite(gmpPct) ? gmpPct : 0,
            subNum: subVal,
            subQib: "",
            subNii: "",
            subRetail: "",
            subAsOn: "",
            ofsPct: null,
            freshIssuePct: null,
            listingOpenPrice: listedAtVal,
            listingOpenGainPct: listedAtPct,
            listingClosePrice: null,
            listingCloseGainPct: null,
            cmpPrice: null,
            cmpGainPct: null,
            priceBand: row["Price (₹)"] ? "₹" + String(row["Price (₹)"]).trim() : "",
            openIso,
            closeIso,
            listingIso,
            pe: peVal,
            upcomingTier: igStatus === "upcoming" && openIso ? "confirmed" : "",
            shareholderParent: detectShareholderParent(rawName),
          });
        }
      });

      // Merge Curated Upcoming IPOs (Shareholder Quota + Latest SEBI Approved)
      const mergeCuratedUpcoming = (rows, board, maxApproved) => {
        const parsed = (rows || [])
          .map((r) => {
            const name = stripHtmlNoSpan(r["Company"]).trim();
            const statusStr = stripHtmlNoSpan(r["Status"]).trim();
            const apprStr = stripHtmlNoSpan(r["Approval Date"]).trim();
            const drhpStr = stripHtmlNoSpan(r["DRHP Filing Date"]).trim();
            const isApproved = /approval received/i.test(statusStr);
            const apprMs = Date.parse(apprStr) || 0;
            const drhpMs = Date.parse(drhpStr) || 0;
            const shParent = detectShareholderParent(name);
            const issueSize = cleanUpcomingIssueSize(r["Estimated Issue Size"]);
            const rawImg = String(r["~compare_image"] || "").trim();
            const logoUrl = /^https?:\/\//i.test(rawImg) ? rawImg : "";
            const slug = String(r["~URLRewrite_Folder_Name"] || "").trim().toLowerCase();
            return { name, isApproved, apprStr, drhpStr, apprMs, drhpMs, shParent, issueSize, logoUrl, slug };
          })
          .filter((x) => x.name.length > 2);

        const shareholderRows = parsed.filter((x) => Boolean(x.shParent));
        const approvedRows = parsed
          .filter((x) => x.isApproved)
          .sort((a, b) => (b.apprMs || b.drhpMs) - (a.apprMs || a.drhpMs))
          .slice(0, maxApproved);

        [...shareholderRows, ...approvedRows].forEach((item) => {
          const key = normIpoKey(item.name);
          if (!key) return;
          const existing = byKey.get(key);
          const tier = item.shParent ? "shareholder" : "sebi_approved";
          if (existing) {
            if (item.shParent && !existing.shareholderParent) existing.shareholderParent = item.shParent;
            if (item.apprStr && !existing.sebiApprovalDate) existing.sebiApprovalDate = item.apprStr;
            if (item.drhpStr && !existing.drhpDate) existing.drhpDate = item.drhpStr;
            if (item.issueSize && !existing.issueSize) existing.issueSize = item.issueSize;
            if (item.logoUrl && !existing.logoUrl) existing.logoUrl = item.logoUrl;
            if (item.slug && (!existing.slug || existing.slug === key)) existing.slug = item.slug;
            if (existing.status === "upcoming" && !existing.upcomingTier) existing.upcomingTier = tier;
          } else {
            byKey.set(key, {
              normName: key,
              name: item.name,
              slug: item.slug || key,
              board,
              status: "upcoming",
              logoUrl: item.logoUrl,
              lotSize: 0,
              issueSize: item.issueSize,
              issuePriceNum: null,
              registrar: "NSE / BSE",
              gmp: 0,
              gmpPercent: 0,
              subNum: null,
              subQib: "",
              subNii: "",
              subRetail: "",
              subAsOn: "",
              ofsPct: null,
              freshIssuePct: null,
              listingOpenPrice: null,
              listingOpenGainPct: null,
              listingClosePrice: null,
              listingCloseGainPct: null,
              cmpPrice: null,
              cmpGainPct: null,
              priceBand: "",
              openIso: "",
              closeIso: "",
              listingIso: "",
              pe: 0,
              upcomingTier: tier,
              sebiApprovalDate: item.apprStr || "",
              drhpDate: item.drhpStr || "",
              shareholderParent: item.shParent || "",
            });
          }
        });
      };

      mergeCuratedUpcoming(mainUpcomingRows, "mainboard", 18);
      mergeCuratedUpcoming(smeUpcomingRows, "sme", 6);
    } catch (_) {
      // Keep bundled snapshot silently if offline
    }

    const items = Array.from(byKey.values());
    liveMetaCache = { fetchedAt: nowMs, items };
    return items;
  };
})();
