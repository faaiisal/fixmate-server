import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { notFoundMiddleware } from "./middlewares/not-found.middleware.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { successResponse } from "./utils/api-response.js";
import { getCollectionsInfo, getDb } from "./config/db.js";
import { authMiddleware, requireAuth } from "./middlewares/auth.middleware.js";
import { roleMiddleware } from "./middlewares/role.middleware.js";
import userRoutes from "./modules/users/user.routes.js";
import serviceRoutes from "./modules/services/service.routes.js";
import bookingRoutes from "./modules/bookings/booking.routes.js";
import paymentRoutes from "./modules/payments/payment.routes.js";
import uploadRoutes from "./modules/upload/upload.routes.js";
import { handleWebhook } from "./modules/payments/payment.controller.js";

const app = express();

// Trust proxy for Vercel / reverse proxy — needed for req.ip but do not trust arbitrary headers blindly
// Set to 1 to trust first proxy (Vercel), our rate limiter validates XFF format
app.set("trust proxy", 1);

// Security headers — manual implementation without helmet dependency (Phase 2)
// If helmet is installed, prefer helmet, but this works without external package
import { securityHeadersMiddleware } from "./middlewares/security-headers.middleware.js";
import {
  generalRateLimiter,
  sensitiveRateLimiter,
  uploadRateLimiter,
} from "./middlewares/rate-limit.middleware.js";

app.use(securityHeadersMiddleware);

// CORS — restricted to explicitly configured trusted frontend origins only
// CLIENT_URL can be a single URL or comma-separated list of trusted origins for production
// Example: CLIENT_URL=https://fixmate-psi.vercel.app,https://fixmate-server-snowy.vercel.app
// For production, only CLIENT_URL is allowed. For development, localhost is also allowed.
const rawClientUrls = env.CLIENT_URL
  ? env.CLIENT_URL.split(",")
      .map((u) => u.trim())
      .filter(Boolean)
  : [];

// Phase 2 Fix: Production allows only explicitly configured origins, development also allows localhost
const allowedOrigins =
  env.NODE_ENV === "production"
    ? [...rawClientUrls]
    : [
        ...rawClientUrls,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
      ].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (no origin) like health checks, Postman, Vercel internal
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // In development, allow any localhost with any port for local testing
      if (env.NODE_ENV === "development" && origin.startsWith("http://localhost:")) {
        return callback(null, true);
      }
      // In production, only allow explicitly trusted origins — no unrestricted https:// allowance
      // Trusted origins must be configured via CLIENT_URL env var (single or comma-separated list)
      // Example: CLIENT_URL=https://fixmate-psi.vercel.app,https://fixmate-server-snowy.vercel.app
      console.warn(`CORS blocked origin: ${origin} - Not in trusted list: ${allowedOrigins.join(", ")}`);
      return callback(new Error(`CORS policy: origin ${origin} not allowed`), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Stripe-Signature"],
  })
);

// Stripe webhook needs raw body — mount BEFORE json parser and BEFORE rate limiting (webhook verified via signature)
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook as any
);

// Body parsers — Phase 2 Fix: Reduce JSON limit from 10mb to 100kb (sufficient for booking/profile/service requests)
// Multipart image upload limit (5MB) is separate via multer memoryStorage and fileFilter, not affected by JSON limit
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(cookieParser());

// Auth middleware — populates req.user if valid BetterAuth session present (does not block public routes)
app.use(authMiddleware);

// Rate limiting — general for all API routes (100 req / 15min)
// Health and root are excluded from general limiter for deployment checks
// Sensitive routes have stricter limits applied in their routers
app.use("/api", (req, res, next) => {
  // Skip rate limiting for health check (deployment)
  if (req.path === "/health" || req.path === "/api/health") {
    return next();
  }
  return generalRateLimiter(req, res, next);
});

// Specific stricter rate limits for sensitive operations
app.use("/api/upload", uploadRateLimiter);
app.use("/api/payments/create-checkout-session", sensitiveRateLimiter);

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

// Health endpoint — required by deployment, public minimal info (no DB name, no collections counts)
app.get("/api/health", async (_req, res) => {
  try {
    const db = getDb();
    const ping = await db.command({ ping: 1 });

    res.json(
      successResponse("Health check passed", {
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
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
        services: {
          api: "up",
          mongodb: "down",
        },
      },
    });
  }
});

// Placeholder for future modules — will be mounted in later phases
app.use("/api/users", userRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/upload", uploadRoutes);

// Detailed status endpoint — protected, admin only (exposes operational diagnostics)
app.get(
  "/api/status",
  requireAuth,
  roleMiddleware("admin"),
  async (_req, res) => {
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
  }
);

// Not found + error middlewares (must be last)
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
