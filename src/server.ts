import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB, closeDB, getDb } from "./config/db.js";
import { ensureIndexes } from "./config/indexes.js";

async function startServer() {
  try {
    console.log("🚀 Starting FixMate Backend...");
    console.log(`📋 Env: NODE_ENV=${env.NODE_ENV}, PORT=${env.PORT}`);
    console.log(`📋 DB_NAME=${env.DB_NAME}, CLIENT_URL=${env.CLIENT_URL}`);
    console.log(`📋 MONGODB_URI=${env.MONGODB_URI.replace(/:([^@]+)@/, ":****@")}`);

    // Connect to MongoDB once
    const { db } = await connectDB();

    // Ensure indexes for 4 business collections (preserve data, idempotent)
    try {
      await ensureIndexes(db);
    } catch (idxErr) {
      console.warn("⚠️ Index creation warning (non-fatal):", (idxErr as Error).message);
    }

    const server = app.listen(env.PORT, () => {
      console.log(`✅ Server listening on http://localhost:${env.PORT}`);
      console.log(`✅ Health: http://localhost:${env.PORT}/api/health`);
      console.log(`✅ Root: http://localhost:${env.PORT}/`);
      console.log(`✅ CORS allowed: ${env.CLIENT_URL}`);
    });

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      console.log(`\n⚠️ Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        console.log("🔌 HTTP server closed");
        await closeDB();
        console.log("👋 Goodbye");
        process.exit(0);
      });

      // Force shutdown after 10s
      setTimeout(() => {
        console.error("❌ Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("unhandledRejection", (reason) => {
      console.error("Unhandled Rejection:", reason);
    });
    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err);
      shutdown("uncaughtException").catch(() => process.exit(1));
    });

    return server;
  } catch (err) {
    console.error("❌ Failed to start server:", (err as Error).message);
    console.error((err as Error).stack);
    await closeDB().catch(() => {});
    process.exit(1);
  }
}

startServer();
