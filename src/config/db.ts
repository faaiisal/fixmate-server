import { MongoClient, Db } from "mongodb";
import { env } from "./env.js";

let client: MongoClient | null = null;
let db: Db | null = null;
let connectPromise: Promise<{ client: MongoClient; db: Db }> | null = null;

/**
 * Single reusable MongoClient connection.
 * - Connects once, reuses client
 * - Verifies with ping
 * - Exposes Db instance to modules
 * - Handles graceful shutdown
 */
export async function connectDB(): Promise<{ client: MongoClient; db: Db }> {
  if (db && client) {
    return { client, db };
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    const mongoClient = new MongoClient(env.MONGODB_URI, {
      // Timeout tuning for better failure detection
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    await mongoClient.connect();

    // Verify with ping
    const adminDb = mongoClient.db().admin();
    const pingResult = await adminDb.command({ ping: 1 });
    if (pingResult.ok !== 1) {
      throw new Error("MongoDB ping failed");
    }

    const database = mongoClient.db(env.DB_NAME);

    // Verify database access by listing collections (lightweight check)
    await database.listCollections({}, { nameOnly: true }).toArray();

    client = mongoClient;
    db = database;

    console.log(`✅ MongoDB connected: DB=${env.DB_NAME}, ping ok`);

    return { client: mongoClient, db: database };
  })();

  try {
    const result = await connectPromise;
    return result;
  } catch (err) {
    // Reset promise so retry is possible
    connectPromise = null;
    client = null;
    db = null;
    console.error("❌ MongoDB connection failed:", (err as Error).message);
    throw err;
  }
}

export function getDb(): Db {
  if (!db) {
    throw new Error("Database not initialized. Call connectDB() first.");
  }
  return db;
}

export function getClient(): MongoClient {
  if (!client) {
    throw new Error("MongoClient not initialized. Call connectDB() first.");
  }
  return client;
}

export async function closeDB(): Promise<void> {
  if (client) {
    try {
      await client.close();
      console.log("✅ MongoDB connection closed gracefully");
    } catch (err) {
      console.error("⚠️ Error closing MongoDB:", (err as Error).message);
    } finally {
      client = null;
      db = null;
      connectPromise = null;
    }
  }
}

export async function getCollectionsInfo(): Promise<{ name: string; count?: number }[]> {
  const database = getDb();
  const cols = await database.listCollections().toArray();
  const info: { name: string; count?: number }[] = [];
  for (const col of cols) {
    try {
      const count = await database.collection(col.name).countDocuments();
      info.push({ name: col.name, count });
    } catch {
      info.push({ name: col.name });
    }
  }
  return info;
}
