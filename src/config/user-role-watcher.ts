import { getDb } from "./db.js";
import { COLLECTIONS } from "./collections.js";
import { ObjectId } from "mongodb";

/**
 * Critical Security Fix: Prevent Public Admin Registration
 * 
 * Requirements:
 * - Public sign-up must allow only Customer and Technician
 * - Force default role to Customer when no permitted role selected
 * - Never trust Admin role submitted by frontend
 * - Admin role changes must remain restricted to authorised Admin operations (already enforced via roleMiddleware)
 * 
 * Since BetterAuth sign-up bypasses our backend API and writes directly to DB,
 * we implement a MongoDB Change Stream watcher that monitors user collection inserts
 * and downgrades any public admin registration attempts to customer role.
 */

const PERMITTED_PUBLIC_ROLES = ["customer", "technician"];
const DEFAULT_ROLE = "customer";
const ADMIN_ROLE = "admin";

/**
 * Sanitize role for public sign-up
 * - Only allow customer and technician for public registration
 * - Force admin to customer (never trust frontend admin role)
 * - Default to customer when no permitted role selected or invalid
 */
export function sanitizePublicRole(role?: string | null): string {
  if (!role || typeof role !== "string") {
    return DEFAULT_ROLE;
  }

  const trimmedRole = role.trim().toLowerCase();

  // Never trust admin role from frontend public sign-up
  if (trimmedRole === ADMIN_ROLE) {
    console.warn(
      `⚠️ SECURITY: Public admin registration attempt blocked - role '${role}' forced to '${DEFAULT_ROLE}'. Frontend should not send admin role.`
    );
    return DEFAULT_ROLE;
  }

  // Allow only customer and technician for public sign-up
  if (PERMITTED_PUBLIC_ROLES.includes(trimmedRole)) {
    return trimmedRole;
  }

  // Invalid role - force to default customer
  console.warn(
    `⚠️ SECURITY: Invalid public role '${role}' - forcing to '${DEFAULT_ROLE}'. Permitted: ${PERMITTED_PUBLIC_ROLES.join(", ")}`
  );
  return DEFAULT_ROLE;
}

/**
 * Check if role is permitted for public registration
 */
export function isPermittedPublicRole(role?: string | null): boolean {
  if (!role) return false;
  return PERMITTED_PUBLIC_ROLES.includes(role.trim().toLowerCase());
}

/**
 * Validate admin role change - only admin can set admin role, and must be via authorised admin operations
 * This is already enforced via roleMiddleware("admin") on PATCH /:id/role route
 * This helper provides additional validation
 */
export function validateAdminRoleChange(
  requesterRole: string,
  targetRole: string,
  isAdminRoute: boolean = false
): { allowed: boolean; reason?: string } {
  // Only admin can set admin role
  if (targetRole === ADMIN_ROLE) {
    if (requesterRole !== ADMIN_ROLE) {
      return {
        allowed: false,
        reason: "Only admins can set admin role - public admin registration blocked",
      };
    }
    if (!isAdminRoute) {
      return {
        allowed: false,
        reason: "Admin role can only be set via authorised admin operations (PATCH /users/:id/role)",
      };
    }
  }

  return { allowed: true };
}

/**
 * Start MongoDB Change Stream watcher for user collection
 * Monitors for public admin registration attempts and downgrades to customer
 * This is a safety net - primary prevention should be in BetterAuth config and frontend,
 * but this watcher acts as backend enforcement
 */
export async function startUserRoleWatcher() {
  try {
    const db = getDb();
    const collection = db.collection(COLLECTIONS.USERS);

    // Watch for insert operations (new user sign-ups)
    const changeStream = collection.watch(
      [
        {
          $match: {
            operationType: { $in: ["insert", "update"] },
          },
        },
      ],
      {
        fullDocument: "updateLookup",
      }
    );

    changeStream.on("change", async (change: any) => {
      try {
        if (change.operationType === "insert") {
          const newUser = change.fullDocument as any;
          if (!newUser) return;

          // Check for public admin registration on insert
          if (newUser.role === ADMIN_ROLE) {
            // For new users, if role is admin, downgrade to customer
            // This prevents public admin registration via BetterAuth direct DB writes
            console.warn(
              `🚨 SECURITY ALERT: Public admin registration detected! User ${newUser.email} (${newUser._id}) attempted to register as admin - FORCING to ${DEFAULT_ROLE}`
            );

            try {
              await collection.updateOne(
                { _id: newUser._id },
                {
                  $set: {
                    role: DEFAULT_ROLE,
                    updatedAt: new Date(),
                  },
                }
              );
              console.log(
                `✅ SECURITY FIX: Downgraded admin role to ${DEFAULT_ROLE} for user ${newUser.email} (${newUser._id})`
              );
            } catch (updateErr) {
              console.error(
                `❌ SECURITY FIX FAILED: Could not downgrade admin role for user ${newUser._id}:`,
                updateErr
              );
            }
          } else if (newUser.role && !PERMITTED_PUBLIC_ROLES.includes(newUser.role) && newUser.role !== ADMIN_ROLE) {
            // Invalid role on insert - force to default
            console.warn(
              `⚠️ Invalid role '${newUser.role}' for new user ${newUser.email} - forcing to ${DEFAULT_ROLE}`
            );
            try {
              await collection.updateOne(
                { _id: newUser._id },
                {
                  $set: {
                    role: DEFAULT_ROLE,
                    updatedAt: new Date(),
                  },
                }
              );
            } catch (updateErr) {
              console.error(`❌ Failed to sanitize role for user ${newUser._id}:`, updateErr);
            }
          }
        } else if (change.operationType === "update") {
          // For updates, check if role is being changed to admin via non-admin route
          // We allow admin role changes only via PATCH /users/:id/role which is admin-only
          // Direct DB updates to admin role should be monitored
          const updatedFields = change.updateDescription?.updatedFields;
          if (updatedFields && updatedFields.role === ADMIN_ROLE) {
            // This could be a direct DB update to admin - log it for audit
            // We allow it if it's via admin route (which uses findOneAndUpdate with role check)
            // But for safety, we log all admin role assignments
            const userId = change.documentKey._id;
            console.log(
              `🔍 AUDIT: Role changed to admin for user ${userId} - Operation: ${change.operationType}, Updated fields:`,
              updatedFields
            );
            // Note: We don't auto-downgrade on update because admin role changes via PATCH /:id/role are legitimate
            // Only new inserts with admin role are downgraded
          }
        }
      } catch (err) {
        console.error("❌ Error in user role watcher change handler:", err);
      }
    });

    changeStream.on("error", (err: any) => {
      console.error("❌ User role watcher error:", err);
      // Attempt to restart watcher after 5 seconds if it's a resumable error
      if (err.code !== 40573) { // 40573 = change stream is closed
        setTimeout(() => {
          console.log("🔄 Restarting user role watcher after error...");
          startUserRoleWatcher().catch(console.error);
        }, 5000);
      }
    });

    changeStream.on("close", () => {
      console.log("🔒 User role watcher closed");
    });

    console.log("👁️  User role watcher started - monitoring for public admin registration attempts");
    console.log(`   Permitted public roles: ${PERMITTED_PUBLIC_ROLES.join(", ")}, Default: ${DEFAULT_ROLE}, Blocked: ${ADMIN_ROLE}`);

    return changeStream;
  } catch (err) {
    console.error("❌ Failed to start user role watcher:", err);
    console.error("   Security feature: Public admin registration prevention via change stream failed to start");
    console.error("   Fallback: Role validation will still occur in application logic");
    // Don't throw - this is a security enhancement but not critical for server startup
    return null;
  }
}

/**
 * Stop the user role watcher (for graceful shutdown)
 */
export function stopUserRoleWatcher(changeStream: any) {
  if (changeStream) {
    try {
      changeStream.close();
      console.log("🛑 User role watcher stopped");
    } catch (err) {
      console.error("❌ Error stopping user role watcher:", err);
    }
  }
}

/**
 * One-time cleanup: Force all existing users with invalid roles to default, and audit admin users
 * This can be run manually if needed, but cautious - don't downgrade legitimate admin accounts
 * For safety, this function only logs and does NOT auto-downgrade existing admins, only new inserts
 */
export async function auditExistingUsers() {
  try {
    const db = getDb();
    const collection = db.collection(COLLECTIONS.USERS);

    // Count users by role
    const roleCounts = await collection
      .aggregate([
        {
          $group: {
            _id: "$role",
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    console.log("📊 Existing users audit:");
    roleCounts.forEach((item: any) => {
      console.log(`   Role ${item._id || "undefined"}: ${item.count} users`);
    });

    // Find users with invalid roles (not in permitted + admin)
    const invalidRoles = await collection
      .find({
        role: {
          $nin: [...PERMITTED_PUBLIC_ROLES, ADMIN_ROLE],
        },
      })
      .toArray();

    if (invalidRoles.length > 0) {
      console.warn(`⚠️ Found ${invalidRoles.length} users with invalid roles:`, invalidRoles.map((u: any) => ({ email: u.email, role: u.role })));
    }

    return { roleCounts, invalidCount: invalidRoles.length };
  } catch (err) {
    console.error("❌ Failed to audit existing users:", err);
    return null;
  }
}
