import { Request, Response } from "express";
import { successResponse, AppError } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";
import * as bookingService from "./booking.service.js";
import { z } from "zod";
import { BookingStatus } from "./booking.interface.js";

const createBookingSchema = z.object({
  serviceId: z.string().min(1),
  phone: z.string().min(10).max(20),
  address: z.string().min(5).max(500),
  preferredDate: z.string().or(z.date()),
  problemDescription: z.string().min(10).max(2000),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["requested", "accepted", "in-progress", "completed", "rejected", "cancelled"]).optional(),
  paymentStatus: z.enum(["pending", "paid", "failed"]).optional(),
  serviceId: z.string().optional(),
  customerId: z.string().optional(),
  technicianId: z.string().optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(["createdAt", "preferredDate"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

const completeSchema = z.object({
  finalAmount: z.coerce.number().positive(),
});

// POST /api/bookings — customer creates
export const createBooking = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const booking = await bookingService.createBooking(req.user.id, parsed.data as any);
  res.status(201).json(successResponse("Booking created (requested)", booking));
});

// GET /api/bookings/:id — get single with ownership
export const getBookingById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const id = req.params.id as string;
  const booking = await bookingService.getBookingById(id, { id: req.user.id, role: req.user.role });
  res.json(successResponse("Booking fetched", booking));
});

// GET /api/bookings/my-bookings — customer own
export const getMyBookings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(`Query validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const result = await bookingService.getCustomerBookings(req.user.id, parsed.data);
  res.json(successResponse("My bookings fetched", result.bookings, result.meta));
});

// GET /api/bookings/assigned — technician assigned
export const getAssignedBookings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(`Query validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const result = await bookingService.getTechnicianBookings(req.user.id, parsed.data);
  res.json(successResponse("Assigned bookings fetched", result.bookings, result.meta));
});

// GET /api/bookings — admin all with filters
export const adminListBookings = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(`Query validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const result = await bookingService.adminListBookings(parsed.data);
  res.json(successResponse("All bookings fetched (admin)", result.bookings, result.meta));
});

// PATCH /api/bookings/:id/cancel — customer cancel only requested
export const cancelBooking = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const id = req.params.id as string;
  const booking = await bookingService.customerCancelBooking(req.user.id, id);
  res.json(successResponse("Booking cancelled", booking));
});

// PATCH /api/bookings/:id/accept — technician accept
export const acceptBooking = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const id = req.params.id as string;
  const booking = await bookingService.technicianAccept(req.user.id, id);
  res.json(successResponse("Booking accepted", booking));
});

// PATCH /api/bookings/:id/reject — technician reject
export const rejectBooking = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const id = req.params.id as string;
  const booking = await bookingService.technicianReject(req.user.id, id);
  res.json(successResponse("Booking rejected", booking));
});

// PATCH /api/bookings/:id/start — technician start in-progress
export const startBooking = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const id = req.params.id as string;
  const booking = await bookingService.technicianStart(req.user.id, id);
  res.json(successResponse("Repair started (in-progress)", booking));
});

// PATCH /api/bookings/:id/complete — technician complete with finalAmount
export const completeBooking = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const id = req.params.id as string;
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Validation error: finalAmount required and positive. ${parsed.error.issues.map((i) => i.message).join(", ")}`, 400);
  }
  const booking = await bookingService.technicianComplete(req.user.id, id, parsed.data.finalAmount);
  res.json(successResponse("Repair completed, final amount submitted", booking));
});
