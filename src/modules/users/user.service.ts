import { ObjectId } from "mongodb";
import { getDb } from "../../config/db.js";
import { COLLECTIONS } from "../../config/collections.js";
import { AppError } from "../../utils/api-response.js";
import { UserDocument, UserRole, UpdateUserInput, AdminUpdateUserRoleInput } from "./user.interface.js";
import { escapeRegExp } from "../../utils/escape-regexp.js";

function toObjectId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new AppError(`Invalid ID format: ${id}`, 400);
  }
  return new ObjectId(id);
}

export async function getUserById(userId: string): Promise<UserDocument> {
  const db = getDb();
  const oid = toObjectId(userId);
  // Try ObjectId lookup first, then string
  let user = await db.collection<UserDocument>(COLLECTIONS.USERS).findOne({ _id: oid as never });
  if (!user) {
    user = await db.collection<UserDocument>(COLLECTIONS.USERS).findOne({ _id: userId as never } as any);
  }
  if (!user) {
    throw new AppError("User not found", 404);
  }
  return user;
}

export async function getUserByEmail(email: string): Promise<UserDocument | null> {
  const db = getDb();
  return db.collection<UserDocument>(COLLECTIONS.USERS).findOne({ email } as any);
}

export async function getCurrentUserProfile(userId: string): Promise<UserDocument> {
  return getUserById(userId);
}

export async function updateOwnProfile(userId: string, input: UpdateUserInput): Promise<UserDocument> {
  const db = getDb();
  const oid = toObjectId(userId);

  // Whitelist allowed fields — never allow role, email change via this endpoint
  const allowed: UpdateUserInput = {};
  if (input.name !== undefined) {
    if (input.name.trim().length < 2) throw new AppError("Name must be at least 2 characters", 400);
    allowed.name = input.name.trim();
  }
  if (input.phone !== undefined) {
    if (input.phone && input.phone.length < 10) throw new AppError("Phone must be at least 10 digits", 400);
    allowed.phone = input.phone;
  }
  if (input.address !== undefined) allowed.address = input.address;
  if (input.bio !== undefined) allowed.bio = input.bio;
  if (input.profileImage !== undefined) allowed.profileImage = input.profileImage;

  if (Object.keys(allowed).length === 0) {
    throw new AppError("No valid fields to update", 400);
  }

  const now = new Date();
  // Also update BetterAuth `image` field if profileImage provided for compat
  const updateDoc: any = { ...allowed, updatedAt: now };
  if (allowed.profileImage) {
    updateDoc.image = allowed.profileImage;
  }

  const result = await db.collection(COLLECTIONS.USERS).findOneAndUpdate(
    { _id: oid as never },
    { $set: updateDoc },
    { returnDocument: "after" }
  );

  if (!result) {
    // Try string id variant
    const result2 = await db.collection(COLLECTIONS.USERS).findOneAndUpdate(
      { _id: userId as never } as any,
      { $set: updateDoc },
      { returnDocument: "after" }
    );
    if (!result2) throw new AppError("User not found for update", 404);
    return result2 as UserDocument;
  }

  return result as UserDocument;
}

export interface ListUsersOptions {
  page?: number;
  limit?: number;
  role?: UserRole;
  search?: string; // name or email
  sortBy?: "createdAt" | "name" | "email";
  sortOrder?: "asc" | "desc";
}

export async function listUsers(options: ListUsersOptions) {
  const db = getDb();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = {};
  if (options.role) {
    if (!["customer", "technician", "admin"].includes(options.role)) {
      throw new AppError(`Invalid role filter: ${options.role}`, 400);
    }
    filter.role = options.role;
  }
  if (options.search) {
    const regex = new RegExp(escapeRegExp(options.search.trim()), "i");
    filter.$or = [{ name: regex }, { email: regex }];
  }

  const sortField = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder === "asc" ? 1 : -1;

  const collection = db.collection<UserDocument>(COLLECTIONS.USERS);

  const [users, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortOrder } as any).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    users,
    meta: { page, limit, total, totalPages },
  };
}

export async function updateUserRoleByAdmin(
  targetUserId: string,
  input: AdminUpdateUserRoleInput,
  adminUserId: string
): Promise<UserDocument> {
  const db = getDb();

  if (!["customer", "technician", "admin"].includes(input.role)) {
    throw new AppError(`Invalid role: ${input.role}`, 400);
  }

  const targetOid = toObjectId(targetUserId);
  const adminOid = toObjectId(adminUserId);

  // Prevent admin from demoting themselves if only admin — optional safety
  if (targetOid.equals(adminOid) && input.role !== "admin") {
    // Allow but warn? For now allow with check that there is at least one other admin
    const adminCount = await db.collection(COLLECTIONS.USERS).countDocuments({ role: "admin" } as any);
    if (adminCount <= 1) {
      throw new AppError("Cannot demote the only admin account", 400);
    }
  }

  // Security: No one can update their own role to admin via this endpoint unless already admin — this is admin-only guarded by role middleware
  // Additionally, prevent creating admin via non-admin flow — this function is only callable by admin role, so fine.

  const now = new Date();
  const result = await db.collection(COLLECTIONS.USERS).findOneAndUpdate(
    { _id: targetOid as never },
    { $set: { role: input.role, updatedAt: now } },
    { returnDocument: "after" }
  );

  if (!result) {
    // Try string id fallback
    const result2 = await db.collection(COLLECTIONS.USERS).findOneAndUpdate(
      { _id: targetUserId as never } as any,
      { $set: { role: input.role, updatedAt: now } },
      { returnDocument: "after" }
    );
    if (!result2) throw new AppError("Target user not found", 404);
    return result2 as UserDocument;
  }

  return result as UserDocument;
}

export async function getUserStats() {
  const db = getDb();
  const collection = db.collection(COLLECTIONS.USERS);

  const [total, customers, technicians, admins] = await Promise.all([
    collection.countDocuments({}),
    collection.countDocuments({ role: "customer" } as any),
    collection.countDocuments({ role: "technician" } as any),
    collection.countDocuments({ role: "admin" } as any),
  ]);

  return { total, customers, technicians, admins };
}
