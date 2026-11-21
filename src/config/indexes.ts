import { Db } from "mongodb";
import { COLLECTIONS } from "./collections.js";

/**
 * Ensure indexes for all 4 business collections
 * Preserves existing data — never drops collections.
 * Idempotent — createIndex is safe to call repeatedly (won't recreate if exists with same spec).
 */

export async function ensureIndexes(db: Db): Promise<void> {
  console.log("🔧 Ensuring indexes for FixMate collections...");

  // --- USERS collection (BetterAuth's `user`) ---
  // Already has unique email index (user_email_uidx), but we ensure additional indexes for role filtering, etc.
  const userCollection = db.collection(COLLECTIONS.USERS);

  // Existing index check: we already have {email:1} unique. Add role index for filtering.
  await userCollection.createIndex({ role: 1 }, { name: "user_role_idx", background: true });
  await userCollection.createIndex({ createdAt: -1 }, { name: "user_createdAt_idx", background: true });
  // Optional: phone unique sparse (not all users have phone)
  await userCollection.createIndex({ phone: 1 }, { name: "user_phone_idx", sparse: true, background: true });

  console.log("✅ Users (user) indexes ensured");

  // --- SERVICES ---
  const serviceCollection = db.collection(COLLECTIONS.SERVICES);

  // Technician's own services lookup
  await serviceCollection.createIndex({ technicianId: 1 }, { name: "services_technicianId_idx", background: true });

  // Approval status for admin pending list
  await serviceCollection.createIndex({ approvalStatus: 1 }, { name: "services_approvalStatus_idx", background: true });

  // Public visibility: approved + available + category filter
  await serviceCollection.createIndex(
    { approvalStatus: 1, isAvailable: 1, category: 1 },
    { name: "services_public_visibility_idx", background: true }
  );

  // Category alone for filtering
  await serviceCollection.createIndex({ category: 1 }, { name: "services_category_idx", background: true });

  // CreatedAt for sorting newest first
  await serviceCollection.createIndex({ createdAt: -1 }, { name: "services_createdAt_idx", background: true });

  // Title + category for search (text index)
  // Only create if not exists — MongoDB allows one text index per collection, so we create compound text
  try {
    const existingIndexes = await serviceCollection.listIndexes().toArray();
    const hasText = existingIndexes.some((idx) => {
      const key = idx.key as Record<string, unknown>;
      return Object.values(key).includes("text");
    });
    if (!hasText) {
      await serviceCollection.createIndex(
        { title: "text", description: "text" },
        { name: "services_text_idx", background: true, weights: { title: 10, description: 5 } }
      );
    }
  } catch {
    // If text index creation fails (already exists with different spec), log but continue
    console.warn("⚠️ Could not ensure text index for services — might already exist with different spec");
  }

  // Compound for technician own + status
  await serviceCollection.createIndex(
    { technicianId: 1, approvalStatus: 1, createdAt: -1 },
    { name: "services_technician_status_idx", background: true }
  );

  console.log("✅ Services indexes ensured");

  // --- BOOKINGS ---
  const bookingCollection = db.collection(COLLECTIONS.BOOKINGS);

  // Customer own bookings
  await bookingCollection.createIndex({ customerId: 1 }, { name: "bookings_customerId_idx", background: true });

  // Technician assigned requests
  await bookingCollection.createIndex({ technicianId: 1 }, { name: "bookings_technicianId_idx", background: true });

  // Service lookup
  await bookingCollection.createIndex({ serviceId: 1 }, { name: "bookings_serviceId_idx", background: true });

  // Status filtering
  await bookingCollection.createIndex({ status: 1 }, { name: "bookings_status_idx", background: true });

  // Payment status
  await bookingCollection.createIndex({ paymentStatus: 1 }, { name: "bookings_paymentStatus_idx", background: true });

  // PreferredDate for scheduling
  await bookingCollection.createIndex({ preferredDate: 1 }, { name: "bookings_preferredDate_idx", background: true });

  // CreatedAt for sorting
  await bookingCollection.createIndex({ createdAt: -1 }, { name: "bookings_createdAt_idx", background: true });

  // Customer + status compound
  await bookingCollection.createIndex({ customerId: 1, status: 1 }, { name: "bookings_customer_status_idx", background: true });

  // Technician + status compound
  await bookingCollection.createIndex({ technicianId: 1, status: 1 }, { name: "bookings_technician_status_idx", background: true });

  // Prevent duplicate active bookings: unique partial index on customerId + serviceId where status in active list
  // Note: MongoDB partialFilterExpression for active statuses
  try {
    await bookingCollection.createIndex(
      { customerId: 1, serviceId: 1 },
      {
        name: "bookings_customer_service_active_uidx",
        unique: true,
        partialFilterExpression: { status: { $in: ["requested", "accepted", "in-progress"] } },
        background: true,
      }
    );
  } catch (err) {
    // If duplicates already exist that violate index, log warning but continue
    console.warn("⚠️ Could not create unique active booking index — duplicate active bookings may already exist:", (err as Error).message);
  }

  // Compound for admin filtering
  await bookingCollection.createIndex(
    { status: 1, paymentStatus: 1, createdAt: -1 },
    { name: "bookings_admin_filter_idx", background: true }
  );

  console.log("✅ Bookings indexes ensured");

  // --- PAYMENTS ---
  const paymentCollection = db.collection(COLLECTIONS.PAYMENTS);

  // Prevent duplicate payments per booking — unique
  await paymentCollection.createIndex({ bookingId: 1 }, { name: "payments_bookingId_uidx", unique: true, background: true });

  // Customer payment history
  await paymentCollection.createIndex({ customerId: 1 }, { name: "payments_customerId_idx", background: true });

  // Technician earnings
  await paymentCollection.createIndex({ technicianId: 1 }, { name: "payments_technicianId_idx", background: true });

  // SessionId unique sparse (Stripe checkout session id)
  await paymentCollection.createIndex(
    { sessionId: 1 },
    { name: "payments_sessionId_uidx", unique: true, sparse: true, background: true }
  );

  // TransactionId unique sparse
  await paymentCollection.createIndex(
    { transactionId: 1 },
    { name: "payments_transactionId_uidx", unique: true, sparse: true, background: true }
  );

  // Payment status
  await paymentCollection.createIndex({ paymentStatus: 1 }, { name: "payments_status_idx", background: true });

  // CreatedAt for sorting/history
  await paymentCollection.createIndex({ createdAt: -1 }, { name: "payments_createdAt_idx", background: true });

  // Compound for customer history sorting
  await paymentCollection.createIndex(
    { customerId: 1, createdAt: -1 },
    { name: "payments_customer_createdAt_idx", background: true }
  );

  console.log("✅ Payments indexes ensured");

  console.log("🎉 All indexes ensured successfully");
}

export async function listAllIndexes(db: Db): Promise<void> {
  for (const key of Object.values(COLLECTIONS).filter((c) => ["user", "services", "bookings", "payments"].includes(c))) {
    try {
      const col = db.collection(key);
      const indexes = await col.listIndexes().toArray();
      console.log(`\n📚 Collection ${key} — ${indexes.length} indexes:`);
      for (const idx of indexes) {
        console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} ${idx.unique ? "(unique)" : ""} ${idx.sparse ? "(sparse)" : ""}`);
      }
    } catch (err) {
      console.log(`  Collection ${key} does not exist yet or error: ${(err as Error).message}`);
    }
  }
}
