/**
 * HD IPO Firestore Security Rules — Dirty Dozen Adversarial Verification Spec
 * Maps each of the 12 attack vectors from security_spec.md to expected PERMISSION_DENIED outcomes.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  actor: { uid?: string; email?: string; email_verified?: boolean } | null;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED' | 'ALLOW';
}

export const dirtyDozenSecurityTests: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unverified admin email spoofing on hd_users list',
    actor: { uid: 'attacker1', email: 'prajapatih000@gmail.com', email_verified: false },
    operation: 'list',
    path: '/hd_users',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Cross-user PII read on hd_users/{otherUid}',
    actor: { uid: 'userA', email: 'a@example.com', email_verified: true },
    operation: 'get',
    path: '/hd_users/userB',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Regular user attempting to list all hd_users',
    actor: { uid: 'userA', email: 'a@example.com', email_verified: true },
    operation: 'list',
    path: '/hd_users',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow field (isAdmin) injection on hd_users create',
    actor: { uid: 'userA', email: 'a@example.com', email_verified: true },
    operation: 'create',
    path: '/hd_users/userA',
    payload: { uid: 'userA', name: 'Test User', mobile: '9876543210', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Invalid mobile number format on hd_users create',
    actor: { uid: 'userA', email: 'a@example.com', email_verified: true },
    operation: 'create',
    path: '/hd_users/userA',
    payload: { uid: 'userA', name: 'Test User', mobile: '12345' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Identity spoofing uid mismatch on hd_users create',
    actor: { uid: 'userA', email: 'a@example.com', email_verified: true },
    operation: 'create',
    path: '/hd_users/userA',
    payload: { uid: 'userB', name: 'Spoof', mobile: '9876543210' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Forged client timestamp on hd_users create',
    actor: { uid: 'userA', email: 'a@example.com', email_verified: true },
    operation: 'create',
    path: '/hd_users/userA',
    payload: { uid: 'userA', name: 'Test', mobile: '9876543210', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immutable email/createdAt mutation on hd_users update',
    actor: { uid: 'userA', email: 'a@example.com', email_verified: true },
    operation: 'update',
    path: '/hd_users/userA',
    payload: { email: 'prajapatih000@gmail.com' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Oversized savedIds array (>100) resource exhaustion',
    actor: { uid: 'userA', email: 'a@example.com', email_verified: true },
    operation: 'update',
    path: '/hd_users/userA',
    payload: { savedIds: Array.from({ length: 105 }, (_, i) => `ipo-${i}`) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Poisoned document ID with invalid characters',
    actor: { uid: 'userA', email: 'a@example.com', email_verified: true },
    operation: 'create',
    path: '/hd_activity/bad$id with spaces',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Orphaned hd_activity write before user registration',
    actor: { uid: 'unregisteredUser', email: 'u@example.com', email_verified: true },
    operation: 'create',
    path: '/hd_activity/act-1',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Activity log tampering or cross-user family_pans access',
    actor: { uid: 'userA', email: 'a@example.com', email_verified: true },
    operation: 'update',
    path: '/hd_activity/act-1',
    payload: { ipoName: 'Tampered' },
    expected: 'PERMISSION_DENIED',
  },
];
