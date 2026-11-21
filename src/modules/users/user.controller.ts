import { Request, Response } from "express";
import { successResponse, AppError } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";
import * as userService from "./user.service.js";
import { UpdateUserInput, AdminUpdateUserRoleInput, UserRole } from "./user.interface.js";
import { z } from "zod";

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().min(10).max(20).optional().or(z.literal("")),
  address: z.string().min(5).max(500).optional().or(z.literal("")),
  profileImage: z.string().url().optional().or(z.literal("")),
  bio: z.string().max(1000).optional().or(z.literal("")),
});

const updateRoleSchema = z.object({
  role: z.enum(["customer", "technician", "admin"]),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  role: z.enum(["customer", "technician", "admin"]).optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(["createdAt", "name", "email"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const user = await userService.getUserById(req.user.id);
  res.json(successResponse("Current user fetched", user));
});

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const user = await userService.getCurrentUserProfile(req.user.id);
  // Return sanitized — exclude password? BetterAuth password stored in account collection, not user collection, so safe
  res.json(successResponse("Profile fetched", user));
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const input: UpdateUserInput = parsed.data as UpdateUserInput;
  const updated = await userService.updateOwnProfile(req.user.id, input);
  res.json(successResponse("Profile updated successfully", updated));
});

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  // Admin only via middleware
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(`Query validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const { page, limit, role, search, sortBy, sortOrder } = parsed.data;
  const result = await userService.listUsers({ page, limit, role: role as UserRole, search, sortBy, sortOrder });
  res.json(successResponse("Users listed", result.users, result.meta));
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!id) throw new AppError("User ID required", 400);
  const user = await userService.getUserById(id);
  res.json(successResponse("User fetched", user));
});

export const updateUserRole = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const id = req.params.id as string;
  if (!id) throw new AppError("User ID required", 400);
  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const input: AdminUpdateUserRoleInput = parsed.data;
  const updated = await userService.updateUserRoleByAdmin(id, input, req.user.id);
  res.json(successResponse(`User role updated to ${input.role}`, updated));
});

export const getUserStats = asyncHandler(async (req: Request, res: Response) => {
  // Admin only
  const stats = await userService.getUserStats();
  res.json(successResponse("User stats fetched", stats));
});
