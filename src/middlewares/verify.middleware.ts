import { requireAuth } from "./auth.middleware.js";
import { roleMiddleware } from "./role.middleware.js";

/**
 * Phase 6: Challenge 2 — Authentication and role-based middleware with exact names required by assignment
 * 
 * API | Middlewares
 * POST /api/bookings, PATCH /api/bookings/:id/cancel, GET /api/bookings/my, POST /api/payments/create-checkout-session | verifyToken, verifyCustomer
 * POST /api/services, PATCH /api/services/:id, DELETE /api/services/:id, GET /api/bookings/technician, PATCH /api/bookings/:id/status | verifyToken, verifyTechnician
 * GET /api/admin/users, PATCH /api/admin/users/:id/role, PATCH /api/admin/services/:id/approval, GET /api/admin/bookings, GET /api/admin/payments | verifyToken, verifyAdmin
 * PATCH /api/users/profile | verifyToken
 * GET /api/services, GET /api/services/:id | Public
 * 
 * Implementation:
 * - verifyToken checks for valid BetterAuth session (opaque token, not JWT) — 401 if no valid session
 * - verifyCustomer/Technician/Admin check role — 403 if wrong role
 * - Ownership checks (customer can only read own bookings, technician only assigned) are enforced in service layer via customerId/technicianId filters
 * - If assignment explicitly requires JWT, note: BetterAuth stores opaque session token, not JWT, but verification via DB lookup + expiresAt check is equivalent session verification
 * - JWT not issued by BetterAuth by default; if JWT required, would need better-auth JWT plugin, but main spec says BetterAuth Mongo adapter which is what we use
 */

// 401 if no valid token/session
export const verifyToken = requireAuth;

// 403 if not customer
export const verifyCustomer = roleMiddleware("customer");

// 403 if not technician
export const verifyTechnician = roleMiddleware("technician");

// 403 if not admin
export const verifyAdmin = roleMiddleware("admin");

// Combined for convenience per Challenge 2 table
export const verifyTokenCustomer = [verifyToken, verifyCustomer];
export const verifyTokenTechnician = [verifyToken, verifyTechnician];
export const verifyTokenAdmin = [verifyToken, verifyAdmin];
