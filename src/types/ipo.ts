import type { Timestamp } from 'firebase/firestore';

export type IpoBoard = 'mainboard' | 'sme';

export type IpoMarketStatus = 'open' | 'upcoming' | 'closed' | 'listed';

export type IpoTrackerStage =
  | 'watching'
  | 'applied'
  | 'allotted'
  | 'not_allotted'
  | 'listed_sold';

export type UpiMandateStatus = 'none' | 'pending' | 'approved';

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface LiveIpoItem {
  slug?: string;
  companyName: string;
  detailUrl?: string;
  board: IpoBoard;
  status: IpoMarketStatus;
  openDate: string;
  closeDate: string;
  listingDate: string;
  priceBand: string;
  lotSize: number;
  minInvestment: string;
  issueSize: string;
  issueSizeNum?: number;
  pricingMethod?: string;
  freshIssue?: string;
  freshIssuePct?: number | null;
  ofs?: string;
  ofsPct?: number | null;
  subscription: string;
  subscriptionNum?: number | null;
  subscriptionQib?: string;
  subscriptionSnii?: string;
  subscriptionBnii?: string;
  subscriptionNii?: string;
  subscriptionRetail?: string;
  subscriptionRetailNum?: number | null;
  subscriptionEmployee?: string;
  subscriptionAsOn?: string;
  applications?: string;
  exchange?: string;
  nseSymbol?: string;
  gmp: string;
  registrar: string;
  highlight: string;
  // Listing performance metrics (populated for listed IPOs from live exchange feed)
  issuePriceNum?: number | null;
  listingOpenPrice?: number | null;
  listingOpenGainPct?: number | null;
  listingClosePrice?: number | null;
  listingCloseGainPct?: number | null;
  currentMarketPrice?: string;
  currentGainPct?: number | null;
}

export interface LiveIpoFeedMetrics {
  openCount: number;
  upcomingCount: number;
  listedCount: number;
  topSubscribedName: string;
  topSubscribedValue: string;
  avgListingGainPct: number | null;
}

export interface LiveIpoFeedResponse {
  asOf: string;
  marketSummary: string;
  metrics?: LiveIpoFeedMetrics;
  ipos: LiveIpoItem[];
  listedPerformance?: LiveIpoItem[];
  sources: GroundingSource[];
  fetchedAt: string;
}

export interface LiveIpoLookupDetail {
  companyName: string;
  board: IpoBoard;
  status: IpoMarketStatus;
  openDate: string;
  closeDate: string;
  allotmentDate: string;
  listingDate: string;
  priceBand: string;
  lotSize: number;
  minInvestment: string;
  issueSize: string;
  gmp: string;
  subscriptionTotal: string;
  subscriptionQib: string;
  subscriptionNii: string;
  subscriptionRetail: string;
  registrar: string;
  overview: string;
}

export interface IpoEntry {
  id: string;
  ownerId: string;
  companyName: string;
  board: IpoBoard;
  ipoStatus: IpoMarketStatus;
  priceBand: string;
  lotSize: number;
  gmp: string;
  subscription: string;
  openDate: string;
  closeDate: string;
  listingDate: string;
  trackerStage: IpoTrackerStage;
  lotsApplied: number;
  bidAmount: number;
  applicantName: string;
  upiMandate: UpiMandateStatus;
  notes: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export const IPO_LIMITS = {
  COMPANY_MAX: 140,
  PRICE_BAND_MAX: 60,
  GMP_MAX: 60,
  SUBSCRIPTION_MAX: 60,
  DATE_MAX: 40,
  APPLICANT_MAX: 80,
  NOTES_MAX: 5000,
  LOT_SIZE_MAX: 1000000,
  LOTS_APPLIED_MAX: 1000,
  BID_AMOUNT_MAX: 100000000,
} as const;

export const TRACKER_STAGE_LABELS: Record<IpoTrackerStage, string> = {
  watching: 'Watching',
  applied: 'Applied',
  allotted: 'Allotted',
  not_allotted: 'Not Allotted',
  listed_sold: 'Listed / Sold',
};

export const UPI_MANDATE_LABELS: Record<UpiMandateStatus, string> = {
  none: 'Not Sent',
  pending: 'Pending',
  approved: 'Approved',
};
