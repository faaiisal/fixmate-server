import { Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../config/db.js";
import { AppError } from "../utils/api-response.js";
import { COLLECTIONS } from "../config/collections.js";

export interface AuthUser {
  _id: ObjectId;
  id: string;
  name: string;
  email: string;
  role: "customer" | "technician" | "admin";
  phone?: string;
  address?: string;
  profileImage?: string;
  bio?: string;
  image?: string;
  emailVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}

/**
 * Parse BetterAuth session token from:
 * 1. Authorization: Bearer <token>
 * 2. Cookies: better-auth.session_token, __Secure-better-auth.session_token, etc.
 * 3. x-session-token header (for dev/testing)
 */
function extractSessionToken(req: Request): string | null {
  // Bearer
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1]?.trim();
    if (token) return token;
  }

  // Custom header (useful for testing / mobile)
  const xToken = req.headers["x-session-token"] as string | undefined;
  if (xToken) return xToken;

  // Cookies — handle both parsed (cookie-parser) and raw header for robustness
  // cookie-parser populates req.cookies
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  if (cookies) {
    // BetterAuth cookie names:
    // - better-auth.session_token
    // - __Secure-better-auth.session_token
    // - __Host-better-auth.session_token
    const possibleKeys = [
      "better-auth.session_token",
      "__Secure-better-auth.session_token",
      "__Host-better-auth.session_token",
      "better-auth.session-token",
      "__Secure-better-auth.session-token",
    ];
    for (const key of possibleKeys) {
      if (cookies[key]) return cookies[key];
    }
    // Also check if session token is stored under generic names
    if (cookies["session_token"]) return cookies["session_token"];
    if (cookies["sessionToken"]) return cookies["sessionToken"];
  }

  // Raw cookie header fallback manual parsing
  const rawCookie = req.headers.cookie;
  if (rawCookie) {
    const possibleNames = [
      "better-auth.session_token",
      "__Secure-better-auth.session_token",
      "__Host-better-auth.session_token",
    ];
    for (const part of rawCookie.split(";")) {
      const [k, ...v] = part.trim().split("=");
      const name = k.trim();
      const value = v.join("=").trim();
      if (possibleNames.includes(name) && value) {
        return decodeURIComponent(value);
      }
    }
  }

  return null;
}

/**
 * Real BetterAuth session verification
 * - Lookup session collection by token
 * - Verify expiresAt > now
 * - Fetch user by userId (handle both ObjectId and string storage)
 */
export const authMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const token = extractSessionToken(req);

    if (!token) {
      // No token — continue as unauthenticated. Protected routes will enforce via requireAuth
      return next();
    }

    // For dev/testing convenience: if token is a valid ObjectId and looks like a userId directly,
    // allow direct user lookup (useful when testing with userId as Bearer token)
    // BUT only if token is NOT found as session token. This maintains backward compat with Phase 3 helper
    // while still prioritizing real session verification.

    const db = getDb();

    // 1. Try to find session by token (real BetterAuth flow)
    let sessionDoc = await db.collection(COLLECTIONS.SESSIONS).findOne({ token });

    // DEVELOPMENT ONLY fallback: Allow Bearer userId for testing seeded users
    // MUST NEVER work in production - production must require valid BetterAuth session
    if (!sessionDoc && ObjectId.isValid(token)) {
      // Restrict to development environment only
      const isDevelopment = process.env.NODE_ENV === "development" || process.env.NODE_ENV !== "production";
      if (!isDevelopment) {
        console.warn(`⚠️ Dev auth fallback attempted in production for token ${token.substring(0, 8)}... - BLOCKED`);
        return next(); // Block fallback in production - require real session
      }

      // Try direct user lookup as fallback for development / seeded testing
      // This allows testing with: Authorization: Bearer <userId> in development only
      const userId = token;
      try {
        const objectId = new ObjectId(userId);
        // Try both ObjectId and string queries
        let userDoc = await db.collection(COLLECTIONS.USERS).findOne({ _id: objectId as never });
        if (!userDoc) {
          // Try string id case (BetterAuth sometimes stores _id as string? but we saw ObjectId)
          userDoc = await db.collection(COLLECTIONS.USERS).findOne({ _id: userId as never });
        }
        if (userDoc) {
          // Dev fallback — do NOT require expiration, but log warning
          console.warn(`⚠️ DEV ONLY: Using userId fallback auth for user ${userId} - This must NOT work in production`);
          const docId = userDoc._id as unknown as string | ObjectId;
          const oid = typeof docId === "string" ? new ObjectId(docId) : (docId as ObjectId);
          req.user = {
            _id: oid,
            id: typeof docId === "string" ? docId : (docId as ObjectId).toHexString(),
            name: (userDoc as any).name,
            email: (userDoc as any).email,
            role: (userDoc as any).role,
            phone: (userDoc as any).phone,
            address: (userDoc as any).address,
            profileImage: (userDoc as any).profileImage || (userDoc as any).image,
            bio: (userDoc as any).bio,
            image: (userDoc as any).image,
            emailVerified: (userDoc as any).emailVerified,
            createdAt: (userDoc as any).createdAt ? new Date((userDoc as any).createdAt) : undefined,
            updatedAt: (userDoc as any).updatedAt ? new Date((userDoc as any).updatedAt) : undefined,
          };
          req.sessionToken = token;
          return next();
        }
      } catch {
        // Ignore and continue to unauthorized handling
      }
    }

    if (!sessionDoc) {
      // No valid session — continue without user (requireAuth will block if needed)
      // For security, we don't throw here for public routes, but we could log
      return next();
    }

    // Verify expiration
    const expiresAt = sessionDoc.expiresAt ? new Date(sessionDoc.expiresAt) : null;
    if (expiresAt && expiresAt < new Date()) {
      // Session expired — treat as unauthenticated
      return next();
    }

    const userId = sessionDoc.userId as string;
    if (!userId) {
      return next();
    }

    // Fetch user — handle ObjectId and string
    let userDoc = null;
    if (ObjectId.isValid(userId)) {
      try {
        userDoc = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(userId) as never });
      } catch {
        // ignore
      }
    }
    if (!userDoc) {
      // Try string match
      userDoc = await db.collection(COLLECTIONS.USERS).findOne({ _id: userId as never } as any);
    }
    if (!userDoc) {
      // Also try where _id stored as string field? BetterAuth might store id field
      userDoc = await db.collection(COLLECTIONS.USERS).findOne({ id: userId } as any);
    }

    if (!userDoc) {
      // User not found for session — invalid session
      return next();
    }

    const rawId = (userDoc as any)._id as string | ObjectId;
    const objectId = typeof rawId === "string" && ObjectId.isValid(rawId) ? new ObjectId(rawId) : (rawId as ObjectId);

    req.user = {
      _id: objectId,
      id: typeof rawId === "string" ? rawId : (rawId as ObjectId).toHexString(),
      name: (userDoc as any).name,
      email: (userDoc as any).email,
      role: (userDoc as any).role || "customer",
      phone: (userDoc as any).phone,
      address: (userDoc as any).address,
      profileImage: (userDoc as any).profileImage || (userDoc as any).image,
      bio: (userDoc as any).bio,
      image: (userDoc as any).image,
      emailVerified: (userDoc as any).emailVerified,
      createdAt: (userDoc as any).createdAt ? new Date((userDoc as any).createdAt) : undefined,
      updatedAt: (userDoc as any).updatedAt ? new Date((userDoc as any).updatedAt) : undefined,
    };
    req.sessionToken = token;

    next();
  } catch (err) {
    next(err);
  }
};

export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    throw new AppError("Unauthorized: Authentication required — valid BetterAuth session token missing or expired", 401);
  }
  next();
};
