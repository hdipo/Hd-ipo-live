# HD IPO Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **PII Isolation (`hd_users/{userId}`)**: Mobile numbers and emails are strictly private. Only the owning verified user (`request.auth.uid == userId`) or verified Admin (`prajapatih000@gmail.com` with `email_verified == true`) can read a user document. Only Admin can list `hd_users`.
2. **Private PAN Vault (`hd_users/{userId}/family_pans/{panDocId}`)**: Strictly Master-Gated to the parent `hd_users/{userId}` document and accessible ONLY to the owning user (`isOwner(userId)`).
3. **Immutable Ownership & Timestamps**: `uid` and `createdAt` can never be mutated after creation. `createdAt` on create and `lastActiveAt` on create/update must equal `request.time`.
4. **No Privilege Escalation / Shadow Fields**: Users cannot inject `isAdmin`, `role`, or arbitrary keys (`hasOnly` + `affectedKeys().hasOnly(...)`).
5. **Global Consistency (`hd_activity/{activityId}`)**: Activity entries require an existing `hd_users/$(request.auth.uid)` profile, match `request.auth.uid`, are immutable (no updates), and list queries enforce `isBootstrapAdmin() || resource.data.uid == request.auth.uid` without DB lookups.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Spoofing**: Admin email `prajapatih000@gmail.com` with `email_verified: false` reading `/hd_users` -> `PERMISSION_DENIED`.
2. **Cross-User PII Read**: User A attempting `get` on `/hd_users/userB` -> `PERMISSION_DENIED`.
3. **Non-Admin User Listing**: Regular user attempting `list` on `/hd_users` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: User creating `/hd_users/userA` with extra field `{ isAdmin: true }` -> `PERMISSION_DENIED`.
5. **Invalid Mobile Format**: User registering with `mobile: "12345"` or `"0000000000"` -> `PERMISSION_DENIED`.
6. **Spoofed UID on Create**: User A creating `/hd_users/userA` with `{ uid: "userB" }` -> `PERMISSION_DENIED`.
7. **Forged Timestamp**: User creating `/hd_users/userA` with client-supplied past `createdAt` -> `PERMISSION_DENIED`.
8. **Immutable Field Tampering**: User updating `createdAt` or `email` on `/hd_users/userA` -> `PERMISSION_DENIED`.
9. **Oversized Array / String Poisoning**: User writing 101 `savedIds` or 1MB `name` -> `PERMISSION_DENIED`.
10. **ID Poisoning**: Document ID containing spaces/special chars or >128 chars -> `PERMISSION_DENIED`.
11. **Orphaned Activity Write**: Creating `/hd_activity/act1` before `/hd_users/{uid}` exists -> `PERMISSION_DENIED`.
12. **Activity Log Tampering / Cross-User PAN Access**: Updating `/hd_activity/act1` or reading another user's `/hd_users/userB/family_pans/p1` -> `PERMISSION_DENIED`.
