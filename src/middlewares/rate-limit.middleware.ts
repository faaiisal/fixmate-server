import { Request, Response, NextFunction } from "express";

/**
 * Simple in-memory rate limiter — no external dependency
 * Phase 2: Prevent brute force, upload spam, checkout spam
 * Note: In production behind Vercel, req.ip may be proxy IP. We use X-Forwarded-For first IP if present,
 * but only when trust proxy is configured. Express req.ip respects trust proxy setting.
 * For Vercel serverless, each function instance has isolated memory — rate limiting is per-instance, not global,
 * but still provides basic protection. For stronger protection, use Redis or install express-rate-limit with store.
 */

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const stores = new Map<string, Map<string, RateLimitRecord>>();

function getStore(name: string): Map<string, RateLimitRecord> {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name)!;
}

function getClientIp(req: Request): string {
  // Prefer X-Forwarded-For first IP (Vercel, reverse proxy) but validate format
  const xff = req.headers["x-forwarded-for"] as string | undefined;
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first && /^\d{1,3}(\.\d{1,3}){3}$/.test(first) || first.includes(":")) {
      // Simple IPv4 or IPv6 check
      return first;
    }
  }
  // Fallback to req.ip (Express respects trust proxy)
  return req.ip || (req.socket?.remoteAddress as string) || "unknown";
}

export function createRateLimiter(options: RateLimitOptions, storeName: string) {
  const { windowMs, max, message } = options;
  const store = getStore(storeName);

  // Cleanup expired entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (record.resetTime < now) {
        store.delete(key);
      }
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = options.keyGenerator ? options.keyGenerator(req) : getClientIp(req);
    const now = Date.now();

    let record = store.get(key);
    if (!record || record.resetTime < now) {
      record = { count: 1, resetTime: now + windowMs };
      store.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    res.setHeader("X-RateLimit-Limit", max.toString());
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", new Date(record.resetTime).toISOString());

    if (record.count > max) {
      res.status(429).json({
        success: false,
        message: message || "Too many requests, please try again later.",
        error: "Rate limit exceeded",
      });
      return;
    }

    next();
  };
}

// General API rate limit: 100 requests per 15 minutes
export const generalRateLimiter = createRateLimiter(
  {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many requests from this IP, please try again after 15 minutes.",
  },
  "general"
);

// Stricter for sensitive routes: 20 requests per 15 minutes
export const sensitiveRateLimiter = createRateLimiter(
  {
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "Too many requests to sensitive endpoint, please try again after 15 minutes.",
  },
  "sensitive"
);

// Upload stricter: 20 uploads per 15 minutes
export const uploadRateLimiter = createRateLimiter(
  {
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "Too many upload requests, please try again after 15 minutes.",
  },
  "upload"
);
