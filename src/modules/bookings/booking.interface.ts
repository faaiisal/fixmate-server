import { ObjectId } from "mongodb";

export type BookingStatus =
  | "requested"
  | "accepted"
  | "in-progress"
  | "completed"
  | "rejected"
  | "cancelled";

export type PaymentStatus = "pending" | "paid" | "failed";

export interface BookingDocument {
  _id: ObjectId;
  customerId: ObjectId;
  technicianId: ObjectId;
  serviceId: ObjectId;
  customerName: string;
  customerEmail: string;
  phone: string;
  customerPhone?: string; // alias for phone per spec
  address: string;
  preferredDate: Date; // when customer wants service
  problemDescription: string;
  status: BookingStatus;
  basePrice: number;
  finalAmount?: number; // set by technician when completing, default basePrice per spec
  paymentStatus: PaymentStatus;
  // Denormalized snapshots per spec — additive for backward compatibility
  serviceTitle?: string;
  serviceImage?: string;
  category?: string;
  technicianName?: string;
  technicianEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBookingInput {
  serviceId: string; // ObjectId as string from frontend
  phone: string;
  address: string;
  preferredDate: string | Date;
  problemDescription: string;
}

export interface UpdateBookingStatusInput {
  status: BookingStatus;
  finalAmount?: number; // required when status=completed
  rejectionReason?: string;
}

// Allowed transitions map per assignment
export const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ["accepted", "rejected", "cancelled"],
  accepted: ["in-progress", "rejected", "cancelled"],
  "in-progress": ["completed", "cancelled"],
  completed: [],
  rejected: [],
  cancelled: [],
};

export const ACTIVE_STATUSES: BookingStatus[] = ["requested", "accepted", "in-progress"];
export const TERMINAL_STATUSES: BookingStatus[] = ["completed", "rejected", "cancelled"];
