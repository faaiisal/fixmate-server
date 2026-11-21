import { Request, Response } from "express";
import { successResponse, AppError } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";
import * as serviceService from "./service.service.js";
import { CreateServiceInput, UpdateServiceInput, ApprovalStatus, ServiceCategory } from "./service.interface.js";
import { z } from "zod";

const createServiceSchema = z.object({
  title: z.string().min(3).max(100),
  category: z.string().min(2).max(50),
  description: z.string().min(10).max(2000),
  basePrice: z.coerce.number().positive(),
  estimatedDuration: z.string().min(1).max(100).optional(),
  serviceMode: z.enum(["doorstep", "workshop", "both"]).optional(),
  serviceArea: z.string().min(2).max(200).optional(),
  image: z.string().url(),
  images: z.array(z.string().url()).optional(),
});

const updateServiceSchema = z.object({
  title: z.string().min(3).max(100).optional(),
  category: z.string().min(2).max(50).optional(),
  description: z.string().min(10).max(2000).optional(),
  basePrice: z.coerce.number().positive().optional(),
  estimatedDuration: z.string().min(1).max(100).optional(),
  serviceMode: z.enum(["doorstep", "workshop", "both"]).optional(),
  serviceArea: z.string().min(2).max(200).optional(),
  image: z.string().url().optional(),
  images: z.array(z.string().url()).optional(),
  isAvailable: z.boolean().optional(),
});

const approvalSchema = z.object({
  approvalStatus: z.enum(["approved", "rejected"]),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  category: z.string().optional(),
  search: z.string().max(100).optional(),
  serviceArea: z.string().max(200).optional(),
  serviceMode: z.enum(["doorstep", "workshop", "both"]).optional(),
  sortBy: z.enum(["createdAt", "basePrice", "title"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
  technicianId: z.string().optional(),
  isAvailable: z.coerce.boolean().optional(),
});

// POST /api/services — technician creates service
export const createService = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const parsed = createServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const input = parsed.data as CreateServiceInput;
  // Cast category as ServiceCategory for service layer to validate
  const service = await serviceService.createService(req.user.id, input);
  res.status(201).json(successResponse("Service created with pending approval", service));
});

// GET /api/services — public approved services
export const getPublicServices = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(`Query validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const result = await serviceService.getPublicServices(parsed.data as any);
  res.json(successResponse("Public services fetched", result.services, result.meta));
});

// GET /api/services/my-services — technician own
export const getMyServices = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(`Query validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const result = await serviceService.getMyServices(req.user.id, parsed.data as any);
  res.json(successResponse("My services fetched", result.services, result.meta));
});

// GET /api/services/admin/pending — admin list pending
export const adminListPending = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(`Query validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const result = await serviceService.adminListPending(parsed.data as any);
  res.json(successResponse("Pending services fetched", result.services, result.meta));
});

// GET /api/services/admin/all — admin list all with filters
export const adminListAll = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(`Query validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const result = await serviceService.adminListAll(parsed.data as any);
  res.json(successResponse("All services fetched (admin)", result.services, result.meta));
});

// GET /api/services/:id — service details (public if approved, otherwise owner/admin)
export const getServiceById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!id) throw new AppError("Service ID required", 400);
  const service = await serviceService.getServiceById(id, req.user ? { id: req.user.id, role: req.user.role } : undefined);
  res.json(successResponse("Service details fetched", service));
});

// PUT /api/services/:id — technician update own
export const updateService = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const id = req.params.id as string;
  const parsed = updateServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const input = parsed.data as UpdateServiceInput;
  // Type cast category if present
  const service = await serviceService.updateOwnService(req.user.id, id, input as UpdateServiceInput);
  res.json(successResponse("Service updated, returned to pending approval", service));
});

// DELETE /api/services/:id — technician delete own
export const deleteService = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const id = req.params.id as string;
  await serviceService.deleteOwnService(req.user.id, id);
  res.json(successResponse("Service deleted successfully"));
});

// PATCH /api/services/:id/availability — technician toggle
export const toggleAvailability = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const id = req.params.id as string;
  const service = await serviceService.toggleAvailability(req.user.id, id);
  res.json(successResponse(`Service availability toggled to ${service.isAvailable ? "available" : "unavailable"}`, service));
});

// PATCH /api/services/:id/approval — admin approve/reject
export const approveOrReject = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const parsed = approvalSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const { approvalStatus } = parsed.data as { approvalStatus: ApprovalStatus };
  const service = await serviceService.adminApproveOrReject(id, approvalStatus);
  res.json(successResponse(`Service ${approvalStatus}`, service));
});
