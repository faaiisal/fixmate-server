/**
 * Collection name constants
 * Important: BetterAuth uses `user` (singular) as its collection.
 * To avoid duplicate authentication user records, we reuse `user` as the business users collection.
 * Spec mentions `users` (plural) — we implement it as `user` and alias USERS = "user".
 */

export const COLLECTIONS = {
  // BetterAuth stores in `user` — we reuse it to avoid duplication
  USERS: "user",
  // Business collections
  SERVICES: "services",
  BOOKINGS: "bookings",
  PAYMENTS: "payments",
  // BetterAuth internal collections (for reference only, don't modify directly)
  SESSIONS: "session",
  ACCOUNTS: "account",
  VERIFICATIONS: "verification",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
