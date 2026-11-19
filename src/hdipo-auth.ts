import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const ADMIN_EMAIL = 'prajapatih000@gmail.com';
const MOBILE_REGEX = /^[6-9][0-9]{9}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export interface HdUserProfile {
  uid: string;
  name: string;
  mobile: string;
  email: string;
  photoUrl: string;
  platform: string;
  savedIds: string[];
  viewsCount: number;
  loginCount: number;
  lastIpoViewed: string;
  createdAt?: Timestamp | null;
  lastActiveAt?: Timestamp | null;
}

export interface HdActivityItem {
  id: string;
  uid: string;
  userName: string;
  userMobile: string;
  ipoName: string;
  ipoCategory: 'mainboard' | 'sme' | 'app';
  action: 'view_advance' | 'login' | 'save_ipo';
  createdAt?: Timestamp | null;
}

export interface FamilyPanEntry {
  id?: string;
  name: string;
  pan: string;
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

function detectPlatform(): string {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return isStandalone ? 'Android App' : 'Android Web';
  if (/iphone|ipad|ipod/.test(ua)) return isStandalone ? 'iPhone App' : 'iPhone Web';
  return isStandalone ? 'Desktop App' : 'Desktop Web';
}

function sanitizeSavedIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const clean: string[] = [];
  const seen = new Set<string>();
  for (const item of ids) {
    const s = String(item || '').trim().slice(0, 120);
    if (s && !seen.has(s)) {
      seen.add(s);
      clean.push(s);
      if (clean.length >= 100) break;
    }
  }
  return clean;
}

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

const sessionViewedIpos = new Set<string>();

interface HdAuthBridge {
  ready: boolean;
  user: User | null;
  profile: HdUserProfile | null;
  appConfig: { apkUrl: string; appVersion: string; updateNotes: string; loaded: boolean };
  isAdmin: () => boolean;
  isLoggedIn: () => boolean;
  needsMobileRegistration: () => boolean;
  hasAdvanceAccess: () => boolean;
  signInWithGoogle: () => Promise<{ status: 'complete' | 'needs_mobile' | 'cancelled'; error?: string }>;
  completeMobileProfile: (name: string, mobile: string, localSavedIds?: string[]) => Promise<HdUserProfile>;
  signOutUser: () => Promise<void>;
  logIpoAdvanceView: (ipoName: string, category: string) => Promise<void>;
  syncSavedIds: (ids: string[]) => Promise<void>;
  loadFamilyPans: () => Promise<FamilyPanEntry[]>;
  syncFamilyPanAdd: (memberName: string, panNumber: string) => Promise<string | null>;
  syncFamilyPanDelete: (panDocId: string) => Promise<void>;
  loadAppConfig: () => Promise<{ apkUrl: string; appVersion: string; updateNotes: string; loaded: boolean }>;
  saveAppConfig: (apkUrl: string, appVersion: string, updateNotes?: string) => Promise<{ apkUrl: string; appVersion: string; updateNotes: string; loaded: boolean }>;
  fetchAdminDashboard: () => Promise<{
    users: HdUserProfile[];
    activities: HdActivityItem[];
    stats: {
      totalUsers: number;
      activeToday: number;
      totalViews: number;
      appInstalls: number;
    };
  }>;
}

function notifyAuthChange() {
  window.dispatchEvent(new CustomEvent('hd-auth-changed'));
}

async function fetchUserProfile(uid: string): Promise<HdUserProfile | null> {
  const path = `hd_users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'hd_users', uid));
    if (!snap.exists()) return null;
    return snap.data() as HdUserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

async function recordActivity(
  profile: HdUserProfile,
  ipoName: string,
  ipoCategory: 'mainboard' | 'sme' | 'app',
  action: 'view_advance' | 'login' | 'save_ipo'
): Promise<void> {
  if (!auth.currentUser) return;
  const actId = makeDocId('act');
  const path = `hd_activity/${actId}`;
  try {
    await setDoc(doc(db, 'hd_activity', actId), {
      uid: auth.currentUser.uid,
      userName: profile.name.slice(0, 80),
      userMobile: profile.mobile,
      ipoName: (ipoName || 'HD IPO App').slice(0, 120),
      ipoCategory,
      action,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

const hdAuth: HdAuthBridge = {
  ready: false,
  user: null,
  profile: null,
  appConfig: { apkUrl: '', appVersion: 'v1.0', updateNotes: '', loaded: false },

  isAdmin() {
    return Boolean(
      this.user &&
        this.user.emailVerified &&
        String(this.user.email || '').toLowerCase() === ADMIN_EMAIL
    );
  },

  isLoggedIn() {
    return Boolean(this.user && this.user.emailVerified);
  },

  needsMobileRegistration() {
    return Boolean(this.isLoggedIn() && (!this.profile || !MOBILE_REGEX.test(this.profile.mobile || '')));
  },

  hasAdvanceAccess() {
    if (this.isAdmin()) return true;
    return Boolean(this.isLoggedIn() && this.profile && MOBILE_REGEX.test(this.profile.mobile || ''));
  },

  async signInWithGoogle() {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      this.user = cred.user;
      const existing = await fetchUserProfile(cred.user.uid);
      if (existing && MOBILE_REGEX.test(existing.mobile || '')) {
        this.profile = existing;
        const path = `hd_users/${cred.user.uid}`;
        try {
          await updateDoc(doc(db, 'hd_users', cred.user.uid), {
            loginCount: increment(1),
            platform: detectPlatform().slice(0, 40),
            lastActiveAt: serverTimestamp(),
          });
          this.profile.loginCount = (this.profile.loginCount || 0) + 1;
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
        await recordActivity(this.profile, 'App Login', 'app', 'login').catch(() => {});
        notifyAuthChange();
        return { status: 'complete' };
      }
      this.profile = existing;
      notifyAuthChange();
      return { status: 'needs_mobile' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('popup-closed-by-user') || msg.includes('cancelled-popup-request')) {
        return { status: 'cancelled' };
      }
      console.error('Google Sign-In error:', err);
      return { status: 'cancelled', error: msg };
    }
  },

  async completeMobileProfile(rawName: string, rawMobile: string, localSavedIds: string[] = []) {
    if (!auth.currentUser || !auth.currentUser.emailVerified) {
      throw new Error('Pehle Google se sign in karein.');
    }
    const cleanName = String(rawName || '').trim().slice(0, 80);
    const cleanMobile = String(rawMobile || '').replace(/\D/g, '').slice(-10);
    if (cleanName.length < 2) {
      throw new Error('Apna sahi naam (kam se kam 2 akshar) likhein.');
    }
    if (!MOBILE_REGEX.test(cleanMobile)) {
      throw new Error('Sahi 10-digit Indian mobile number daalein (6, 7, 8 ya 9 se shuru).');
    }

    const uid = auth.currentUser.uid;
    const path = `hd_users/${uid}`;
    const existing = await fetchUserProfile(uid);
    const platform = detectPlatform().slice(0, 40);

    if (existing) {
      try {
        await updateDoc(doc(db, 'hd_users', uid), {
          name: cleanName,
          mobile: cleanMobile,
          photoUrl: String(auth.currentUser.photoURL || '').slice(0, 500),
          platform,
          lastActiveAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
      const updated: HdUserProfile = {
        ...existing,
        name: cleanName,
        mobile: cleanMobile,
        platform,
      };
      this.profile = updated;
      await recordActivity(updated, 'Profile Updated', 'app', 'login').catch(() => {});
      notifyAuthChange();
      return updated;
    }

    const newProfile: HdUserProfile = {
      uid,
      name: cleanName,
      mobile: cleanMobile,
      email: String(auth.currentUser.email || '').slice(0, 150),
      photoUrl: String(auth.currentUser.photoURL || '').slice(0, 500),
      platform,
      savedIds: sanitizeSavedIds(localSavedIds),
      viewsCount: 0,
      loginCount: 1,
      lastIpoViewed: '',
    };

    try {
      await setDoc(doc(db, 'hd_users', uid), {
        ...newProfile,
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }

    this.profile = newProfile;
    await recordActivity(newProfile, 'New Registration', 'app', 'login').catch(() => {});
    notifyAuthChange();
    return newProfile;
  },

  async signOutUser() {
    await signOut(auth);
    this.user = null;
    this.profile = null;
    sessionViewedIpos.clear();
    notifyAuthChange();
  },

  async logIpoAdvanceView(ipoName: string, category: string) {
    if (!auth.currentUser || !this.profile || !MOBILE_REGEX.test(this.profile.mobile)) return;
    const cleanName = String(ipoName || '').trim().slice(0, 120);
    if (!cleanName || sessionViewedIpos.has(cleanName)) return;
    sessionViewedIpos.add(cleanName);

    const cat: 'mainboard' | 'sme' = category === 'sme' ? 'sme' : 'mainboard';
    const uid = auth.currentUser.uid;
    const path = `hd_users/${uid}`;
    try {
      await updateDoc(doc(db, 'hd_users', uid), {
        viewsCount: increment(1),
        lastIpoViewed: cleanName,
        platform: detectPlatform().slice(0, 40),
        lastActiveAt: serverTimestamp(),
      });
      this.profile.viewsCount = (this.profile.viewsCount || 0) + 1;
      this.profile.lastIpoViewed = cleanName;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
    await recordActivity(this.profile, cleanName, cat, 'view_advance').catch(() => {});
  },

  async syncSavedIds(ids: string[]) {
    if (!auth.currentUser || !this.profile) return;
    const clean = sanitizeSavedIds(ids);
    const uid = auth.currentUser.uid;
    const path = `hd_users/${uid}`;
    try {
      await updateDoc(doc(db, 'hd_users', uid), {
        savedIds: clean,
        lastActiveAt: serverTimestamp(),
      });
      this.profile.savedIds = clean;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  },

  async loadFamilyPans() {
    if (!auth.currentUser || !this.profile) return [];
    const uid = auth.currentUser.uid;
    const path = `hd_users/${uid}/family_pans`;
    try {
      const q = query(
        collection(db, 'hd_users', uid, 'family_pans'),
        where('uid', '==', uid),
        limit(50)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.memberName || ''),
          pan: String(data.panNumber || ''),
        };
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async syncFamilyPanAdd(memberName: string, panNumber: string) {
    if (!auth.currentUser || !this.profile) return null;
    const cleanName = String(memberName || '').trim().slice(0, 60);
    const cleanPan = String(panNumber || '').trim().toUpperCase();
    if (!cleanName || !PAN_REGEX.test(cleanPan)) return null;

    const uid = auth.currentUser.uid;
    const docId = makeDocId('pan');
    const path = `hd_users/${uid}/family_pans/${docId}`;
    try {
      await setDoc(doc(db, 'hd_users', uid, 'family_pans', docId), {
        uid,
        memberName: cleanName,
        panNumber: cleanPan,
        createdAt: serverTimestamp(),
      });
      return docId;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  },

  async syncFamilyPanDelete(panDocId: string) {
    if (!auth.currentUser || !this.profile || !panDocId) return;
    const uid = auth.currentUser.uid;
    const path = `hd_users/${uid}/family_pans/${panDocId}`;
    try {
      await deleteDoc(doc(db, 'hd_users', uid, 'family_pans', panDocId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  async loadAppConfig() {
    const path = 'hd_config/app';
    try {
      let snap;
      try {
        snap = await getDocFromServer(doc(db, 'hd_config', 'app'));
      } catch (_) {
        snap = await getDoc(doc(db, 'hd_config', 'app'));
      }
      if (snap.exists()) {
        const d = snap.data();
        this.appConfig = {
          apkUrl: String(d.apkUrl || '').slice(0, 500),
          appVersion: String(d.appVersion || 'v1.0').slice(0, 30),
          updateNotes: String(d.updateNotes || '').slice(0, 240),
          loaded: true,
        };
      } else {
        this.appConfig = {
          ...this.appConfig,
          loaded: true,
        };
      }
      window.dispatchEvent(new CustomEvent('hd-config-loaded', { detail: this.appConfig }));
      return this.appConfig;
    } catch (err) {
      this.appConfig = { ...this.appConfig, loaded: true };
      window.dispatchEvent(new CustomEvent('hd-config-loaded', { detail: this.appConfig }));
      handleFirestoreError(err, OperationType.GET, path);
    }
  },

  async saveAppConfig(rawApkUrl: string, rawVersion: string, rawNotes = '') {
    if (!this.isAdmin()) {
      throw new Error('Sirf Admin APK link aur version update kar sakte hain.');
    }
    const cleanUrl = String(rawApkUrl || '').trim().slice(0, 500);
    const cleanVersion = String(rawVersion || 'v1.0').trim().slice(0, 30) || 'v1.0';
    const cleanNotes = String(rawNotes || '').trim().slice(0, 240);
    if (cleanUrl && !/^https:\/\/.+/i.test(cleanUrl)) {
      throw new Error('APK Link https:// se shuru hona chahiye (e.g. GitHub Release ya Google Drive link).');
    }
    const path = 'hd_config/app';
    try {
      await setDoc(doc(db, 'hd_config', 'app'), {
        apkUrl: cleanUrl,
        appVersion: cleanVersion,
        updateNotes: cleanNotes,
        updatedAt: serverTimestamp(),
      });
      this.appConfig = { apkUrl: cleanUrl, appVersion: cleanVersion, updateNotes: cleanNotes, loaded: true };
      notifyAuthChange();
      window.dispatchEvent(new CustomEvent('hd-config-loaded', { detail: this.appConfig }));
      return this.appConfig;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async fetchAdminDashboard() {
    if (!this.isAdmin()) {
      throw new Error('Sirf Admin is dashboard ko dekh sakte hain.');
    }

    let users: HdUserProfile[] = [];
    let activities: HdActivityItem[] = [];

    try {
      const uq = query(collection(db, 'hd_users'), orderBy('lastActiveAt', 'desc'), limit(200));
      const uSnap = await getDocs(uq);
      users = uSnap.docs.map((d) => d.data() as HdUserProfile);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'hd_users');
    }

    try {
      const aq = query(collection(db, 'hd_activity'), orderBy('createdAt', 'desc'), limit(50));
      const aSnap = await getDocs(aq);
      activities = aSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HdActivityItem, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'hd_activity');
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();

    let activeToday = 0;
    let totalViews = 0;
    let appInstalls = 0;
    for (const u of users) {
      totalViews += Number(u.viewsCount || 0);
      if (String(u.platform || '').includes('App')) appInstalls++;
      const ts = u.lastActiveAt as Timestamp | undefined;
      if (ts && typeof ts.toMillis === 'function' && ts.toMillis() >= todayMs) {
        activeToday++;
      }
    }

    return {
      users,
      activities,
      stats: {
        totalUsers: users.length,
        activeToday,
        totalViews,
        appInstalls,
      },
    };
  },
};

onAuthStateChanged(auth, async (user) => {
  hdAuth.user = user;
  if (user && user.emailVerified) {
    try {
      hdAuth.profile = await fetchUserProfile(user.uid);
    } catch (_) {
      hdAuth.profile = null;
    }
  } else {
    hdAuth.profile = null;
  }
  hdAuth.ready = true;
  notifyAuthChange();
});

void hdAuth.loadAppConfig().then(() => notifyAuthChange()).catch(() => {});

declare global {
  interface Window {
    hdAuth: HdAuthBridge;
  }
}

window.hdAuth = hdAuth;
