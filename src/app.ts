import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { notFoundMiddleware } from "./middlewares/not-found.middleware.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { successResponse } from "./utils/api-response.js";
import { getCollectionsInfo, getDb } from "./config/db.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import userRoutes from "./modules/users/user.routes.js";

const app = express();

// CORS — restricted to actual frontend origin
const allowedOrigins = [
  env.CLIENT_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (no origin) like health checks, Postman
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // In development, allow any localhost
      if (env.NODE_ENV === "development" && origin.startsWith("http://localhost:")) {
        return callback(null, true);
      }
      console.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error(`CORS policy: origin ${origin} not allowed`), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Auth middleware — populates req.user if valid BetterAuth session present (does not block public routes)
app.use(authMiddleware);

// Root
app.get("/", (_req, res) => {
  res.json(
    successResponse("FixMate API is running", {
      name: "FixMate Backend",
      version: "1.0.0",
      env: env.NODE_ENV,
      frontend: env.CLIENT_URL,
      timestamp: new Date().toISOString(),
    })
  );
});

// Health endpoint — required by Phase 3
app.get("/api/health", async (_req, res) => {
  try {
    const db = getDb();
    const ping = await db.command({ ping: 1 });
    const collections = await getCollectionsInfo();

    res.json(
      successResponse("Health check passed", {
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: {
          name: env.DB_NAME,
          ping: ping.ok === 1 ? "ok" : "failed",
          collections,
        },
        services: {
          api: "up",
          mongodb: ping.ok === 1 ? "up" : "down",
        },
      })
    );
  } catch (err) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      message: "Health check failed",
      error: error.message,
      data: {
        status: "error",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: {
          name: env.DB_NAME,
          ping: "failed",
          error: error.message,
        },
      },
    });
  }
});

// Placeholder for future modules — will be mounted in later phases
app.use("/api/users", userRoutes);
// app.use("/api/services", serviceRoutes);
// app.use("/api/bookings", bookingRoutes);
// app.use("/api/payments", paymentRoutes);

// Simple status endpoint for DB info (development only)
app.get("/api/status", async (_req, res) => {
  try {
    const collections = await getCollectionsInfo();
    res.json(
      successResponse("System status", {
        env: env.NODE_ENV,
        db: env.DB_NAME,
        collections,
        time: new Date().toISOString(),
      })
    );
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to get status",
      error: (err as Error).message,
    });
  }
});

// Not found + error middlewares (must be last)
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
