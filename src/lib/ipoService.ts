import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  IPO_LIMITS,
  type GroundingSource,
  type IpoBoard,
  type IpoEntry,
  type IpoMarketStatus,
  type IpoTrackerStage,
  type LiveIpoFeedResponse,
  type LiveIpoLookupDetail,
  type UpiMandateStatus,
} from '../types/ipo';
import { db, handleFirestoreError, OperationType } from './firebase';

function makeSafeIpoId(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `ipo_${rand}`.slice(0, 128);
}

function clampInt(val: number, max: number): number {
  if (!Number.isFinite(val) || val < 0) return 0;
  return Math.min(Math.round(val), max);
}

function clampNum(val: number, max: number): number {
  if (!Number.isFinite(val) || val < 0) return 0;
  return Math.min(Number(val.toFixed(2)), max);
}

export async function fetchLiveIpos(
  category: 'all' | 'mainboard' | 'sme' = 'all',
  force = false
): Promise<LiveIpoFeedResponse> {
  const qs = new URLSearchParams({ category });
  if (force) qs.set('force', '1');
  const res = await fetch(`/api/ipo/live?${qs.toString()}`);
  const data = (await res.json()) as LiveIpoFeedResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Could not load live IPO data.');
  }
  return data;
}

export async function lookupLiveIpo(queryText: string): Promise<{
  ipo: LiveIpoLookupDetail;
  sources: GroundingSource[];
  fetchedAt: string;
}> {
  const res = await fetch('/api/ipo/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: queryText }),
  });
  const data = (await res.json()) as {
    ipo?: LiveIpoLookupDetail;
    sources?: GroundingSource[];
    fetchedAt?: string;
    error?: string;
  };
  if (!res.ok || !data.ipo) {
    throw new Error(data.error || 'Could not find live details for that IPO.');
  }
  return {
    ipo: data.ipo,
    sources: Array.isArray(data.sources) ? data.sources : [],
    fetchedAt: data.fetchedAt || new Date().toISOString(),
  };
}

export function subscribeToIpoEntries(
  uid: string,
  onData: (entries: IpoEntry[]) => void
): Unsubscribe {
  const path = 'ipoEntries';
  const q = query(collection(db, path), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: IpoEntry[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: data.ownerId,
          companyName: data.companyName,
          board: data.board === 'sme' ? 'sme' : 'mainboard',
          ipoStatus: ['open', 'upcoming', 'closed', 'listed'].includes(data.ipoStatus)
            ? data.ipoStatus
            : 'upcoming',
          priceBand: data.priceBand ?? '',
          lotSize: typeof data.lotSize === 'number' ? data.lotSize : 0,
          gmp: data.gmp ?? '',
          subscription: data.subscription ?? '',
          openDate: data.openDate ?? '',
          closeDate: data.closeDate ?? '',
          listingDate: data.listingDate ?? '',
          trackerStage: ['watching', 'applied', 'allotted', 'not_allotted', 'listed_sold'].includes(
            data.trackerStage
          )
            ? data.trackerStage
            : 'watching',
          lotsApplied: typeof data.lotsApplied === 'number' ? data.lotsApplied : 0,
          bidAmount: typeof data.bidAmount === 'number' ? data.bidAmount : 0,
          applicantName: data.applicantName ?? '',
          upiMandate: ['none', 'pending', 'approved'].includes(data.upiMandate)
            ? data.upiMandate
            : 'none',
          notes: data.notes ?? '',
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
        };
      });
      items.sort((a, b) => {
        const ta = a.updatedAt?.toMillis?.() ?? 0;
        const tb = b.updatedAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export interface UpsertIpoEntryInput {
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
}

function sanitizeIpoInput(input: UpsertIpoEntryInput) {
  const companyName = input.companyName.trim().slice(0, IPO_LIMITS.COMPANY_MAX);
  if (!companyName) throw new Error('Company name is required.');
  return {
    companyName,
    board: input.board === 'sme' ? ('sme' as const) : ('mainboard' as const),
    ipoStatus: (['open', 'upcoming', 'closed', 'listed'].includes(input.ipoStatus)
      ? input.ipoStatus
      : 'upcoming') as IpoMarketStatus,
    priceBand: input.priceBand.trim().slice(0, IPO_LIMITS.PRICE_BAND_MAX),
    lotSize: clampInt(input.lotSize, IPO_LIMITS.LOT_SIZE_MAX),
    gmp: input.gmp.trim().slice(0, IPO_LIMITS.GMP_MAX),
    subscription: input.subscription.trim().slice(0, IPO_LIMITS.SUBSCRIPTION_MAX),
    openDate: input.openDate.trim().slice(0, IPO_LIMITS.DATE_MAX),
    closeDate: input.closeDate.trim().slice(0, IPO_LIMITS.DATE_MAX),
    listingDate: input.listingDate.trim().slice(0, IPO_LIMITS.DATE_MAX),
    trackerStage: ([
      'watching',
      'applied',
      'allotted',
      'not_allotted',
      'listed_sold',
    ].includes(input.trackerStage)
      ? input.trackerStage
      : 'watching') as IpoTrackerStage,
    lotsApplied: clampInt(input.lotsApplied, IPO_LIMITS.LOTS_APPLIED_MAX),
    bidAmount: clampNum(input.bidAmount, IPO_LIMITS.BID_AMOUNT_MAX),
    applicantName: input.applicantName.trim().slice(0, IPO_LIMITS.APPLICANT_MAX),
    upiMandate: (['none', 'pending', 'approved'].includes(input.upiMandate)
      ? input.upiMandate
      : 'none') as UpiMandateStatus,
    notes: input.notes.trim().slice(0, IPO_LIMITS.NOTES_MAX),
  };
}

export async function createIpoEntry(
  uid: string,
  input: UpsertIpoEntryInput
): Promise<string> {
  const entryId = makeSafeIpoId();
  const path = `ipoEntries/${entryId}`;
  const clean = sanitizeIpoInput(input);
  try {
    await setDoc(doc(db, 'ipoEntries', entryId), {
      ownerId: uid,
      ...clean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return entryId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateIpoEntry(
  entryId: string,
  input: UpsertIpoEntryInput
): Promise<void> {
  const path = `ipoEntries/${entryId}`;
  const clean = sanitizeIpoInput(input);
  try {
    await updateDoc(doc(db, 'ipoEntries', entryId), {
      ...clean,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function quickUpdateIpoStage(
  entryId: string,
  updates: { trackerStage?: IpoTrackerStage; upiMandate?: UpiMandateStatus }
): Promise<void> {
  const path = `ipoEntries/${entryId}`;
  try {
    await updateDoc(doc(db, 'ipoEntries', entryId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteIpoEntry(entryId: string): Promise<void> {
  const path = `ipoEntries/${entryId}`;
  try {
    await deleteDoc(doc(db, 'ipoEntries', entryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
