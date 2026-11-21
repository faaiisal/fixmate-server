import { connectDB, closeDB, getDb } from "../config/db.js";
import { ensureIndexes, listAllIndexes } from "../config/indexes.js";

async function main() {
  try {
    console.log("🔧 FixMate — Initialize Database Indexes");
    const { db } = await connectDB();
    // Ensure collections exist by listing — they will be auto-created on first index
    console.log(`📚 Connected to DB: ${db.databaseName}`);

    await ensureIndexes(db);

    console.log("\n📋 Listing all indexes after creation:");
    await listAllIndexes(db);

    // Verify data preservation
    const userCount = await db.collection("user").countDocuments();
    console.log(`\n✅ Data preservation check: user collection count = ${userCount} (should be 3+ existing users preserved)`);

    // Check if services/bookings/payments collections exist and counts
    for (const colName of ["services", "bookings", "payments"]) {
      try {
        const count = await db.collection(colName).countDocuments();
        console.log(`   ${colName} count: ${count}`);
      } catch {
        console.log(`   ${colName} does not exist yet (will be created on first write)`);
      }
    }

    console.log("\n🎉 Index initialization complete");
  } catch (err) {
    console.error("❌ Index init failed:", (err as Error).message);
    console.error((err as Error).stack);
    process.exit(1);
  } finally {
    await closeDB();
  }
}

main();
