import app from "../src/app.js";
import { connectDB } from "../src/config/db.js";
import { ensureIndexes } from "../src/config/indexes.js";

// Cached connection flag for serverless - Vercel reuses function instances
let isConnected = false;
let isIndexEnsured = false;

export default async function handler(req: any, res: any) {
  try {
    // Connect to MongoDB once per cold start, reuse on warm starts
    if (!isConnected) {
      console.log("🔌 Vercel serverless: connecting to MongoDB...");
      const { db } = await connectDB();
      isConnected = true;
      console.log("✅ MongoDB connected for serverless");

      // Ensure indexes (only once per deployment, non-blocking)
      if (!isIndexEnsured) {
        try {
          await ensureIndexes(db);
          isIndexEnsured = true;
          console.log("✅ Indexes ensured for serverless");
        } catch (idxErr: any) {
          console.warn("⚠️ Index creation warning (non-fatal):", idxErr.message);
        }
      }
    }

    // Forward request to Express app
    return app(req, res);
  } catch (err: any) {
    console.error("❌ Vercel handler error:", err.message);
    console.error(err.stack);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Serverless function failed to connect to database",
        error: err.message,
      });
    }
  }
}
