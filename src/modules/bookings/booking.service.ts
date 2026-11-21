import { ObjectId } from "mongodb";
import { getDb } from "../../config/db.js";
import { COLLECTIONS } from "../../config/collections.js";
import { AppError } from "../../utils/api-response.js";
import {
  BookingDocument,
  CreateBookingInput,
  BookingStatus,
  ALLOWED_TRANSITIONS,
  ACTIVE_STATUSES,
} from "./booking.interface.js";
import { ServiceDocument } from "../services/service.interface.js";
import { UserDocument } from "../users/user.interface.js";

function toObjectId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new AppError(`Invalid ID format: ${id}`, 400);
  }
  return new ObjectId(id);
}

export interface ListBookingsOptions {
  page?: number;
  limit?: number;
  status?: BookingStatus;
  paymentStatus?: "pending" | "paid" | "failed";
  serviceId?: string;
  customerId?: string;
  technicianId?: string;
  search?: string; // customerName, problemDescription
  sortBy?: "createdAt" | "preferredDate";
  sortOrder?: "asc" | "desc";
  fromDate?: string;
  toDate?: string;
}

export async function createBooking(
  customerId: string,
  input: CreateBookingInput
): Promise<BookingDocument> {
  const db = getDb();
  const customerOid = toObjectId(customerId);
  const serviceOid = toObjectId(input.serviceId);

  // 1. Only customers can create bookings — check user role
  const customerUser = await db
    .collection<UserDocument>(COLLECTIONS.USERS)
    .findOne({ _id: customerOid as never } as any);
  if (!customerUser) throw new AppError("Customer user not found", 404);
  if ((customerUser as any).role !== "customer") {
    throw new AppError("Only customers can create bookings", 403);
  }

  // 2. Only approved and available services can be booked
  const service = await db
    .collection<ServiceDocument>(COLLECTIONS.SERVICES)
    .findOne({ _id: serviceOid } as any);
  if (!service) throw new AppError("Service not found", 404);
  if (service.approvalStatus !== "approved" || !service.isAvailable) {
    throw new AppError("Service is not available for booking (must be approved and available)", 400);
  }

  // 3. Customer cannot book own service
  if (service.technicianId.toString() === customerOid.toString()) {
    throw new AppError("You cannot book your own service", 400);
  }

  // 4. Prevent duplicate active bookings for same customer and service
  // Check active statuses: requested, accepted, in-progress
  const existingActive = await db
    .collection<BookingDocument>(COLLECTIONS.BOOKINGS)
    .findOne({
      customerId: customerOid,
      serviceId: serviceOid,
      status: { $in: ACTIVE_STATUSES },
    } as any);
  if (existingActive) {
    throw new AppError(
      `You already have an active booking for this service (status: ${existingActive.status}). Cannot create duplicate active booking.`,
      409
    );
  }

  // Prepare booking doc
  const now = new Date();
  let preferredDate: Date;
  try {
    preferredDate = new Date(input.preferredDate);
    if (isNaN(preferredDate.getTime())) throw new Error("Invalid date");
  } catch {
    throw new AppError("Invalid preferredDate format", 400);
  }

  if (!input.phone || input.phone.trim().length < 10) {
    throw new AppError("Phone must be at least 10 digits", 400);
  }
  if (!input.address || input.address.trim().length < 5) {
    throw new AppError("Address must be at least 5 characters", 400);
  }
  if (!input.problemDescription || input.problemDescription.trim().length < 10) {
    throw new AppError("Problem description must be at least 10 characters", 400);
  }

  const booking: Omit<BookingDocument, "_id"> = {
    customerId: customerOid,
    technicianId: service.technicianId,
    serviceId: serviceOid,
    customerName: (customerUser as any).name,
    customerEmail: (customerUser as any).email,
    phone: input.phone.trim(),
    address: input.address.trim(),
    preferredDate,
    problemDescription: input.problemDescription.trim(),
    status: "requested",
    basePrice: service.basePrice,
    finalAmount: undefined,
    paymentStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };

  try {
    const result = await db.collection(COLLECTIONS.BOOKINGS).insertOne(booking as any);
    const created = { _id: result.insertedId, ...booking } as BookingDocument;
    return created;
  } catch (err: any) {
    // Handle unique index violation for duplicate active bookings (from partial unique index)
    if (err.code === 11000) {
      throw new AppError(
        "Duplicate active booking detected: you already have an active booking for this service",
        409
      );
    }
    throw err;
  }
}

export async function getBookingById(
  bookingId: string,
  requester: { id: string; role: string }
): Promise<BookingDocument> {
  const db = getDb();
  const oid = toObjectId(bookingId);

  const booking = await db
    .collection<BookingDocument>(COLLECTIONS.BOOKINGS)
    .findOne({ _id: oid } as any);
  if (!booking) throw new AppError("Booking not found", 404);

  // Ownership checks per rules 11,12,13
  if (requester.role === "customer") {
    if (booking.customerId.toString() !== requester.id) {
      throw new AppError("Forbidden: Customers can access only their own bookings", 403);
    }
  } else if (requester.role === "technician") {
    if (booking.technicianId.toString() !== requester.id) {
      throw new AppError("Forbidden: Technicians can access only their assigned bookings", 403);
    }
  } else if (requester.role === "admin") {
    // admin can access all
  } else {
    throw new AppError("Invalid role", 403);
  }

  return booking;
}

export async function getCustomerBookings(
  customerId: string,
  options: ListBookingsOptions
) {
  const db = getDb();
  const customerOid = toObjectId(customerId);
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = { customerId: customerOid };
  if (options.status) filter.status = options.status;
  if (options.paymentStatus) filter.paymentStatus = options.paymentStatus;
  if (options.serviceId) filter.serviceId = toObjectId(options.serviceId);
  if (options.search) {
    const regex = new RegExp(options.search.trim(), "i");
    filter.$or = [{ problemDescription: regex }, { customerName: regex }];
  }

  const sortField = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder === "asc" ? 1 : -1;

  const collection = db.collection<BookingDocument>(COLLECTIONS.BOOKINGS);

  const [bookings, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortOrder } as any).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    bookings,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getTechnicianBookings(
  technicianId: string,
  options: ListBookingsOptions
) {
  const db = getDb();
  const techOid = toObjectId(technicianId);
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = { technicianId: techOid };
  if (options.status) filter.status = options.status;
  if (options.paymentStatus) filter.paymentStatus = options.paymentStatus;
  if (options.search) {
    const regex = new RegExp(options.search.trim(), "i");
    filter.$or = [{ problemDescription: regex }, { customerName: regex }];
  }

  const sortField = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder === "asc" ? 1 : -1;

  const collection = db.collection<BookingDocument>(COLLECTIONS.BOOKINGS);

  const [bookings, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortOrder } as any).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    bookings,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function adminListBookings(options: ListBookingsOptions) {
  const db = getDb();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = {};
  if (options.status) filter.status = options.status;
  if (options.paymentStatus) filter.paymentStatus = options.paymentStatus;
  if (options.serviceId) filter.serviceId = toObjectId(options.serviceId);
  if (options.customerId) filter.customerId = toObjectId(options.customerId);
  if (options.technicianId) filter.technicianId = toObjectId(options.technicianId);
  if (options.search) {
    const regex = new RegExp(options.search.trim(), "i");
    filter.$or = [
      { customerName: regex },
      { customerEmail: regex },
      { problemDescription: regex },
    ];
  }
  if (options.fromDate || options.toDate) {
    filter.preferredDate = {};
    if (options.fromDate) filter.preferredDate.$gte = new Date(options.fromDate);
    if (options.toDate) filter.preferredDate.$lte = new Date(options.toDate);
  }

  const sortField = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder === "asc" ? 1 : -1;

  const collection = db.collection<BookingDocument>(COLLECTIONS.BOOKINGS);

  const [bookings, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortOrder } as any).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    bookings,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// Customer cancel only requested bookings (rule 9)
export async function customerCancelBooking(
  customerId: string,
  bookingId: string
): Promise<BookingDocument> {
  const db = getDb();
  const customerOid = toObjectId(customerId);
  const bookingOid = toObjectId(bookingId);

  // Safe operation: only if status=requested and customerId matches
  const result = await db.collection<BookingDocument>(COLLECTIONS.BOOKINGS).findOneAndUpdate(
    {
      _id: bookingOid,
      customerId: customerOid,
      status: "requested",
    } as any,
    {
      $set: { status: "cancelled" as BookingStatus, updatedAt: new Date() },
    },
    { returnDocument: "after" }
  );

  if (!result) {
    // Check why failed — to give better error
    const existing = await db.collection<BookingDocument>(COLLECTIONS.BOOKINGS).findOne({ _id: bookingOid } as any);
    if (!existing) throw new AppError("Booking not found", 404);
    if (existing.customerId.toString() !== customerOid.toString()) {
      throw new AppError("Forbidden: You can only cancel your own bookings", 403);
    }
    if (existing.status !== "requested") {
      throw new AppError(`Cannot cancel booking with status ${existing.status}. Only requested bookings can be cancelled.`, 400);
    }
    throw new AppError("Failed to cancel booking (concurrent modification?)", 409);
  }

  return result as BookingDocument;
}

// Technician accept — only assigned technician, only requested -> accepted
export async function technicianAccept(
  technicianId: string,
  bookingId: string
): Promise<BookingDocument> {
  const db = getDb();
  const techOid = toObjectId(technicianId);
  const bookingOid = toObjectId(bookingId);

  const result = await db.collection<BookingDocument>(COLLECTIONS.BOOKINGS).findOneAndUpdate(
    {
      _id: bookingOid,
      technicianId: techOid,
      status: "requested",
    } as any,
    {
      $set: { status: "accepted" as BookingStatus, updatedAt: new Date() },
    },
    { returnDocument: "after" }
  );

  if (!result) {
    const existing = await db.collection<BookingDocument>(COLLECTIONS.BOOKINGS).findOne({ _id: bookingOid } as any);
    if (!existing) throw new AppError("Booking not found", 404);
    if (existing.technicianId.toString() !== techOid.toString()) {
      throw new AppError("Forbidden: Only assigned technician can accept this booking", 403);
    }
    if (!ALLOWED_TRANSITIONS[existing.status]?.includes("accepted")) {
      throw new AppError(`Invalid transition from ${existing.status} to accepted. Allowed: ${ALLOWED_TRANSITIONS[existing.status].join(", ") || "none"}`, 400);
    }
    throw new AppError("Failed to accept booking (concurrent modification?)", 409);
  }

  return result as BookingDocument;
}

export async function technicianReject(
  technicianId: string,
  bookingId: string
): Promise<BookingDocument> {
  const db = getDb();
  const techOid = toObjectId(technicianId);
  const bookingOid = toObjectId(bookingId);

  const result = await db.collection<BookingDocument>(COLLECTIONS.BOOKINGS).findOneAndUpdate(
    {
      _id: bookingOid,
      technicianId: techOid,
      status: { $in: ["requested", "accepted"] },
    } as any,
    {
      $set: { status: "rejected" as BookingStatus, updatedAt: new Date() },
    },
    { returnDocument: "after" }
  );

  if (!result) {
    const existing = await db.collection<BookingDocument>(COLLECTIONS.BOOKINGS).findOne({ _id: bookingOid } as any);
    if (!existing) throw new AppError("Booking not found", 404);
    if (existing.technicianId.toString() !== techOid.toString()) {
      throw new AppError("Forbidden: Only assigned technician can reject", 403);
    }
    if (!ALLOWED_TRANSITIONS[existing.status]?.includes("rejected")) {
      throw new AppError(`Invalid transition from ${existing.status} to rejected`, 400);
    }
    throw new AppError("Failed to reject booking", 409);
  }

  return result as BookingDocument;
}

export async function technicianStart(
  technicianId: string,
  bookingId: string
): Promise<BookingDocument> {
  const db = getDb();
  const techOid = toObjectId(technicianId);
  const bookingOid = toObjectId(bookingId);

  const result = await db.collection<BookingDocument>(COLLECTIONS.BOOKINGS).findOneAndUpdate(
    {
      _id: bookingOid,
      technicianId: techOid,
      status: "accepted",
    } as any,
    {
      $set: { status: "in-progress" as BookingStatus, updatedAt: new Date() },
    },
    { returnDocument: "after" }
  );

  if (!result) {
    const existing = await db.collection<BookingDocument>(COLLECTIONS.BOOKINGS).findOne({ _id: bookingOid } as any);
    if (!existing) throw new AppError("Booking not found", 404);
    if (existing.technicianId.toString() !== techOid.toString()) {
      throw new AppError("Forbidden: Only assigned technician can start repair", 403);
    }
    if (existing.status !== "accepted") {
      throw new AppError(`Only accepted bookings can become in-progress. Current status: ${existing.status}`, 400);
    }
    throw new AppError("Failed to start repair", 409);
  }

  return result as BookingDocument;
}

export async function technicianComplete(
  technicianId: string,
  bookingId: string,
  finalAmount: number
): Promise<BookingDocument> {
  if (finalAmount === undefined || finalAmount === null) {
    throw new AppError("Final amount is required when completing repair", 400);
  }
  if (finalAmount <= 0) {
    throw new AppError("Final amount must be positive", 400);
  }

  const db = getDb();
  const techOid = toObjectId(technicianId);
  const bookingOid = toObjectId(bookingId);

  const result = await db.collection<BookingDocument>(COLLECTIONS.BOOKINGS).findOneAndUpdate(
    {
      _id: bookingOid,
      technicianId: techOid,
      status: "in-progress",
    } as any,
    {
      $set: {
        status: "completed" as BookingStatus,
        finalAmount,
        updatedAt: new Date(),
        // paymentStatus remains pending until payment
      },
    },
    { returnDocument: "after" }
  );

  if (!result) {
    const existing = await db.collection<BookingDocument>(COLLECTIONS.BOOKINGS).findOne({ _id: bookingOid } as any);
    if (!existing) throw new AppError("Booking not found", 404);
    if (existing.technicianId.toString() !== techOid.toString()) {
      throw new AppError("Forbidden: Only assigned technician can complete", 403);
    }
    if (existing.status !== "in-progress") {
      throw new AppError(`Only in-progress bookings can become completed. Current: ${existing.status}`, 400);
    }
    throw new AppError("Failed to complete repair", 409);
  }

  return result as BookingDocument;
}
