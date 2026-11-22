/**
 * Phase 2: Backward-compatible mapping for serviceMode and paymentStatus
 * Keeps existing MongoDB values intact, maps assignment terminology to internal canonical values
 */

// Service Mode mapping
// Internal canonical: doorstep, workshop, both
// Assignment: Home Visit, Shop Drop-off
export type InternalServiceMode = "doorstep" | "workshop" | "both";
export type AssignmentServiceMode = "Home Visit" | "Shop Drop-off" | "both" | "doorstep" | "workshop";

const SERVICE_MODE_MAP: Record<string, InternalServiceMode> = {
  "home visit": "doorstep",
  "doorstep": "doorstep",
  "shop drop-off": "workshop",
  "shop dropoff": "workshop",
  "shop_drop-off": "workshop",
  "workshop": "workshop",
  "both": "both",
};

export function normalizeServiceMode(input?: string | null): InternalServiceMode | undefined {
  if (!input) return undefined;
  const key = input.trim().toLowerCase();
  return SERVICE_MODE_MAP[key];
}

export function toAssignmentServiceMode(internal: string): string {
  // For API output, keep internal for backward compat but also support assignment terminology
  // Return internal as is for existing frontend, but document mapping
  switch (internal) {
    case "doorstep":
      return "doorstep"; // assignment: Home Visit
    case "workshop":
      return "workshop"; // assignment: Shop Drop-off
    case "both":
      return "both"; // both modes
    default:
      return internal;
  }
}

// For filtering: when filtering by a mode, include 'both' as well
// e.g., filtering Home Visit (doorstep) should include both doorstep and both
export function buildServiceModeFilter(requestedMode?: string): any {
  const normalized = normalizeServiceMode(requestedMode);
  if (!normalized) return undefined;
  if (normalized === "both") {
    // If explicitly filtering both, only both
    return "both";
  }
  // If filtering doorstep or workshop, include both as well (both means available for both modes)
  return { $in: [normalized, "both"] };
}

// Payment Status mapping
// Internal canonical: pending, paid, failed
// Assignment: unpaid, paid
export type InternalPaymentStatus = "pending" | "paid" | "failed";
export type AssignmentPaymentStatus = "unpaid" | "paid" | "pending" | "failed";

const PAYMENT_STATUS_MAP: Record<string, InternalPaymentStatus> = {
  "unpaid": "pending",
  "pending": "pending",
  "paid": "paid",
  "failed": "failed",
};

export function normalizePaymentStatus(input?: string | null): InternalPaymentStatus | undefined {
  if (!input) return undefined;
  const key = input.trim().toLowerCase();
  return PAYMENT_STATUS_MAP[key];
}

export function toAssignmentPaymentStatus(internal: string): string {
  // For backward compat, return internal, but document that pending = unpaid
  // Frontend can treat pending as unpaid
  if (internal === "pending") return "pending"; // assignment: unpaid
  return internal;
}

// Helper to check if payment status counts as unpaid / pending
export function isUnpaidStatus(status: string): boolean {
  const normalized = normalizePaymentStatus(status);
  return normalized === "pending";
}

export function isPaidStatus(status: string): boolean {
  return normalizePaymentStatus(status) === "paid";
}
