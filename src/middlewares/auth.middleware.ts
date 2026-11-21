import { Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../config/db.js";
import { AppError } from "../utils/api-response.js";

/**
 * Placeholder auth middleware for Phase 3
 * Full BetterAuth session verification will be implemented in Phase 5.
 *
 * For now, it checks for presence of x-user-id / x-user-role headers
 * ONLY for health testing? Actually we keep it unimplemented and return error
 * if protected route uses it without implementation.
 *
 * Phase 5 will implement:
 * - Verify session token from Authorization Bearer or Cookie
 * - Lookup session collection or call BetterAuth getSession
 * - Populate req.user
 */

export interface AuthUser {
  _id: ObjectId;
  id: string; // string version of ObjectId for convenience
  name: string;
  email: string;
  role: "customer" | "technician" | "admin";
  phone?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    // Phase 5 TODO: real session verification
    // For Phase 3 health check, we allow unauthenticated.

    // Temporary development helper: allow Bearer token = userId for manual testing
    // This will be replaced securely in Phase 5.
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      // If token looks like ObjectId, try to fetch user (DEV ONLY)
      if (ObjectId.isValid(token)) {
        const db = getDb();
        const userDoc = await db.collection("user").findOne({ _id: new ObjectId(token) as never });
        if (userDoc) {
          // BetterAuth stores _id as string? Actually we saw ObjectId-like string ids.
          // Handle both cases: string id or ObjectId
          const docId = userDoc._id as unknown as string | ObjectId;
          const objectId = typeof docId === "string" ? new ObjectId(docId) : docId as ObjectId;
          req.user = {
            _id: objectId,
            id: typeof docId === "string" ? docId : (docId as ObjectId).toHexString(),
            name: (userDoc as never as { name: string }).name,
            email: (userDoc as never as { email: string }).email,
            role: (userDoc as never as { role: AuthUser["role"] }).role,
            phone: (userDoc as never as { phone?: string }).phone,
          };
          return next();
        }
      }
    }

    // If no auth header and route requires auth, error will be thrown by protected routes
    // For now, just continue without user — protected middleware will check.
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
    throw new AppError("Unauthorized: Authentication required", 401);
  }
  next();
};
