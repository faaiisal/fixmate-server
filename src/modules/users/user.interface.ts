import { ObjectId } from "mongodb";

export type UserRole = "customer" | "technician" | "admin";

export interface UserDocument {
  _id: ObjectId;
  name: string;
  email: string;
  role: UserRole;
  // BetterAuth fields
  emailVerified?: boolean;
  image?: string; // BetterAuth uses `image` field
  // FixMate extended fields (per assignment)
  phone?: string;
  address?: string;
  profileImage?: string; // assignment says profileImage, but BetterAuth uses image — support both
  bio?: string;
  // Timestamps — BetterAuth stores as Date or ISO string; we standardize to Date for new code but accept string for compat
  createdAt: Date;
  updatedAt: Date;
}

// For creation — _id auto-generated, timestamps auto-set
export interface CreateUserInput {
  name: string;
  email: string;
  role?: UserRole; // default customer, never admin via self-registration
  phone?: string;
  address?: string;
  profileImage?: string;
  bio?: string;
}

// For updates — only allowed fields that user can self-update
export interface UpdateUserInput {
  name?: string;
  phone?: string;
  address?: string;
  profileImage?: string;
  bio?: string;
}

// Admin can update role (but never allow customer to set admin self)
export interface AdminUpdateUserRoleInput {
  role: UserRole;
}
