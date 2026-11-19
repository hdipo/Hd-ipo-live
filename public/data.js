const ipoDatabase = [
  {
    id: 1,
    name: "Nova Green Energy Ltd",
    category: "mainboard",
    status: "live",
    dates: "18 Nov - 21 Nov",
    listingDate: "26 Nov",
    priceBand: "₹240 - ₹252",
    issuePrice: 252,
    lotSize: 59,
    minInvest: "₹14,868",
    issueSize: "₹1,450 Cr",
    freshIssue: "80% Fresh / 20% OFS",
    ofsPercent: 20,
    gmp: 88,
    gmpPercent: 34.9,
    subscription: { total: "14.6x", qib: "22.4x", nii: "18.1x", retail: "7.8x" },
    qibSub: 22.4,
    registrar: "Link Intime",

    score: 8.6,
    verdict: "APPLY",
    listingGain: "Strong (30%+)",
    shortTerm: "Hold 30-45 Days",
    longTerm: "Strong Compounder",
    simpleSummary: "Profit har saal 35%+ badh raha hai, karz bahut kam hai aur QIB (22.4x) + FII demand zabardast hai. Listing gain aur long term dono ke liye best hai.",

    plusPoints: [
      "Revenue aur Profit har saal 35%+ ki speed se badh raha hai",
      "80% Fresh Issue — paisa naye solar plant mein lagega",
      "QIB 22.4x aur Anchor book 100% Top Mutual Funds/FIIs ne bhara",
      "Industry P/E (34x) ke mukable sasta (24.5x) mil raha hai"
    ],
    minusPoints: [
      "Raw material ke daam badhne se margin par asar pad sakta hai",
      "30-Day Anchor Lock-in ke aas-paas thodi profit booking aa sakti hai"
    ],

    financials: [
      { year: "FY24", revenue: "620 Cr", profit: "58 Cr", netWorth: "210 Cr" },
      { year: "FY25", revenue: "890 Cr", profit: "94 Cr", netWorth: "305 Cr" },
      { year: "FY26", revenue: "1,240 Cr", profit: "148 Cr", netWorth: "452 Cr" }
    ],

    pe: 24.5,
    industryPe: 34.0,
    fundamentals: {
      peRatio: "24.5x (Industry: 34x — Sasta)",
      roe: "28.4% (Bahut Badhiya)",
      debtToEquity: "0.22 (Bahut Kam Karz)"
    },

    smartMoney: {
      fiiAllocation: "38% Anchor + QIB mein FIIs ki bhaari hissa-dari",
      anchorInvestors: "SBI MF, HDFC MF, Nomura, Abu Dhabi Fund",
      anchorLockIn30: "26 Dec (50% Anchor Shares)",
      anchorLockIn90: "24 Feb (Remaining 50%)",
      marketMood: "Bullish" // "Bullish", "Neutral", "Weak"
    },

    postListing: {
      holdingDays: "25–30 Days (Anchor Lock-in se pehle review) ya 1+ Year Long Term",
      target1: "₹350 (Fair Industry P/E 34x Value)",
      target2: "₹388 (High QIB Re-rating Zone)",
      stopLoss: "₹268 (Anchor & Institutional Support ke neeche)",
      logic: "Valuation abhi bhi Industry se 28% sasta hai aur OFS sirf 20% hai, isliye listing par saara bechne ki zaroorat nahi. SL ₹268 isliye rakha hai kyunki QIB/Anchor buying ₹252 par hui hai—iske upar institutional support mazboot hai."
    }
  },

  {
    id: 2,
    name: "Apex Precision Tech SME",
    category: "sme",
    status: "live",
    dates: "19 Nov - 22 Nov",
    listingDate: "27 Nov",
    priceBand: "₹115 - ₹120",
    issuePrice: 120,
    lotSize: 1200,
    minInvest: "₹1,44,000",
    issueSize: "₹42 Cr",
    freshIssue: "100% Fresh Issue",
    ofsPercent: 0,
    gmp: 54,
    gmpPercent: 45.0,
    subscription: { total: "48.2x", qib: "15.0x", nii: "62.5x", retail: "55.4x" },
    qibSub: 15.0,
    registrar: "Bigshare Services",

    score: 7.4,
    verdict: "APPLY (High Risk)",
    listingGain: "Very High (40%+)",
    shortTerm: "Book Profit on Day 1-3",
    longTerm: "Wait for Qtr Results",
    simpleSummary: "SME IPO mein ₹1.44 Lakh lagte hain aur liquidity risk rehta hai, lekin 100% Fresh Issue aur 48x demand se zabardast listing gain mil sakta hai.",

    plusPoints: [
      "100% Fresh Issue — promoter ek bhi share nahi bech rahe",
      "45% GMP aur 48x subscription se heavy demand dikh rahi hai",
      "18 mahine ki strong order book"
    ],
    minusPoints: [
      "SME segment mein circuit lagne par nikalna mushkil hota hai",
      "Sirf 3 bade clients par 60% business depend karta hai"
    ],

    financials: [
      { year: "FY24", revenue: "45 Cr", profit: "4.1 Cr", netWorth: "14 Cr" },
      { year: "FY25", revenue: "68 Cr", profit: "7.8 Cr", netWorth: "22 Cr" },
      { year: "FY26", revenue: "96 Cr", profit: "12.4 Cr", netWorth: "35 Cr" }
    ],

    pe: 19.2,
    industryPe: 26.0,
    fundamentals: {
      peRatio: "19.2x (Industry: 26x — Sasta)",
      roe: "31.0% (Strong)",
      debtToEquity: "0.45 (Normal)"
    },

    smartMoney: {
      fiiAllocation: "12% FII + HNI Heavy Participation",
      anchorInvestors: "3 Domestic SME Funds (₹11 Cr)",
      anchorLockIn30: "27 Dec",
      anchorLockIn90: "25 Feb",
      marketMood: "Bullish"
    },

    postListing: {
      holdingDays: "1–3 Days Only (SME Liquidity Rule)",
      target1: "₹168 (Fair Value + SME Momentum)",
      target2: "₹185 (Upper Circuit Extension)",
      stopLoss: "₹142 (Listing Day Low / Issue Cushion)",
      logic: "SME mein lot size ₹1.44 Lakh ka hota hai aur FII support kam hota hai. Agar ₹165+ par list ho toh listing day par profit book karna safe hai; agar hold karein toh ₹142 ka strict trailing SL rakhein."
    }
  },

  {
    id: 3,
    name: "Metro Retail Mart Ltd",
    category: "mainboard",
    status: "upcoming",
    dates: "25 Nov - 28 Nov",
    listingDate: "03 Dec",
    priceBand: "₹410 - ₹432",
    issuePrice: 432,
    lotSize: 34,
    minInvest: "₹14,688",
    issueSize: "₹2,100 Cr",
    freshIssue: "25% Fresh / 75% OFS",
    ofsPercent: 75,
    gmp: 12,
    gmpPercent: 2.8,
    subscription: { total: "0.0x", qib: "0x", nii: "0x", retail: "0x" },
    qibSub: 0.5,
    registrar: "KFinTech",

    score: 4.5,
    verdict: "AVOID",
    listingGain: "Weak (0% - 5%)",
    shortTerm: "Avoid",
    longTerm: "Wait Below ₹340",
    simpleSummary: "75% paisa purane malik (OFS) bech kar nikal rahe hain, karz zyada hai aur P/E 68x bahut mehnga hai. Is IPO se door rehna sahi rahega.",

    plusPoints: [
      "Tier-2 shehron mein 180+ stores ka achha network",
      "Brand ki pehchan achhi hai"
    ],
    minusPoints: [
      "75% Offer For Sale (OFS) — heavy selling pressure aa sakta hai",
      "P/E Ratio 68x hai jabki Industry 42x par hai (Bahut Mehnga)",
      "₹820 Cr ka bada karz aur ROE sirf 9.6%"
    ],

    financials: [
      { year: "FY24", revenue: "1,850 Cr", profit: "62 Cr", netWorth: "510 Cr" },
      { year: "FY25", revenue: "2,010 Cr", profit: "54 Cr", netWorth: "560 Cr" },
      { year: "FY26", revenue: "2,180 Cr", profit: "59 Cr", netWorth: "615 Cr" }
    ],

    pe: 68.0,
    industryPe: 42.0,
    fundamentals: {
      peRatio: "68.0x (Industry: 42x — Bahut Mehnga)",
      roe: "9.6% (Kamzor)",
      debtToEquity: "1.33 (Zyada Karz)"
    },

    smartMoney: {
      fiiAllocation: "Low FII Interest Expected",
      anchorInvestors: "Anchor Book Pending",
      anchorLockIn30: "02 Jan",
      anchorLockIn90: "03 Mar",
      marketMood: "Neutral"
    },

    postListing: {
      holdingDays: "0 Days (Listing par hi Exit karein agar galti se bhara ho)",
      target1: "₹445 (Sirf Minor Bounce)",
      target2: "No Long Target (Overvalued)",
      stopLoss: "₹415 (Flat/Discount open par turant Exit)",
      logic: "P/E 68x aur 75% OFS ki wajah se bade investors support nahi karenge. Agar galti se allotment mil bhi jaye toh flat ya halka upar milte hi exit kar dein, wait na karein."
    }
  },

  {
    id: 4,
    name: "FinCare Digital Bank",
    category: "mainboard",
    status: "closed",
    dates: "10 Nov - 13 Nov",
    listingDate: "18 Nov",
    priceBand: "₹310 - ₹325",
    issuePrice: 325,
    lotSize: 46,
    minInvest: "₹14,950",
    issueSize: "₹980 Cr",
    freshIssue: "65% Fresh / 35% OFS",
    ofsPercent: 35,
    gmp: 74,
    gmpPercent: 22.8,
    subscription: { total: "28.4x", qib: "45.2x", nii: "26.0x", retail: "14.2x" },
    qibSub: 45.2,
    registrar: "Link Intime",

    score: 8.1,
    verdict: "APPLY",
    listingGain: "Good (20% - 25%)",
    shortTerm: "Hold 2-3 Months",
    longTerm: "Strong Compounder",
    simpleSummary: "QIB 45.2x bhara tha aur profit pichle 3 saal mein double se zyada hua hai. FII aur Mutual Funds ki strong buying ki wajah se post-listing hold karna badhiya rahega.",

    plusPoints: [
      "NPA (kharab loan) sirf 0.8% hai jo banking mein best hai",
      "Profit 3 saal mein ₹92 Cr se ₹212 Cr pahuncha",
      "QIB 45.2x — institutions mein bhaari maang"
    ],
    minusPoints: [
      "35% OFS hone se listing ke pehle 2 din thoda supply aa sakta hai",
      "RBI interest rate changes ka short-term asar"
    ],

    financials: [
      { year: "FY24", revenue: "710 Cr", profit: "92 Cr", netWorth: "480 Cr" },
      { year: "FY25", revenue: "980 Cr", profit: "145 Cr", netWorth: "625 Cr" },
      { year: "FY26", revenue: "1,350 Cr", profit: "212 Cr", netWorth: "840 Cr" }
    ],

    pe: 21.8,
    industryPe: 29.0,
    fundamentals: {
      peRatio: "21.8x (Industry: 29x — Sasta)",
      roe: "25.2% (Badhiya)",
      debtToEquity: "CAR: 19.5% (Strong Bank Capital)"
    },

    smartMoney: {
      fiiAllocation: "44% FII & Sovereign Funds in QIB",
      anchorInvestors: "ICICI Pru, Kotak MF, Goldman Sachs, Fidelity",
      anchorLockIn30: "18 Dec",
      anchorLockIn90: "16 Feb",
      marketMood: "Bullish"
    },

    postListing: {
      holdingDays: "45–90 Days (Quarterly Result & FII Accumulation tak)",
      target1: "₹415 (Fair Banking P/E 28x)",
      target2: "₹448 (FII Follow-on Buying Target)",
      stopLoss: "₹348 (Agar ₹395+ list ho toh) / ₹312 (Flat open par)",
      logic: "QIB 45x bhara tha—jinko allotment nahi mila woh FIIs open market se share kharidenge. Isliye ₹390 ke aas-paas list hone par bhi ₹415-₹448 tak hold kiya ja sakta hai."
    }
  }
];
