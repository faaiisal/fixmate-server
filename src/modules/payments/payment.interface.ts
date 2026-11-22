import { ObjectId } from "mongodb";

export type PaymentProvider = "stripe" | "escrow";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface PaymentDocument {
  _id: ObjectId;
  bookingId: ObjectId;
  customerId: ObjectId;
  technicianId: ObjectId;
  amount: number;
  currency: string; // e.g. "usd"
  paymentProvider: PaymentProvider;
  transactionId?: string; // Stripe payment_intent or charge id
  sessionId?: string; // Stripe checkout session id (existing)
  stripeSessionId?: string; // Alias for sessionId per spec assignment, must be unique
  paymentStatus: PaymentStatus;
  paidAt?: Date;
  createdAt: Date;
  // Denormalized snapshots per spec — additive for backward compatibility
  serviceTitle?: string;
  customerName?: string;
  customerEmail?: string;
  technicianName?: string;
  technicianEmail?: string;
}

export interface CreateCheckoutSessionInput {
  bookingId: string; // ObjectId string
}

export interface CreatePaymentRecordInput {
  bookingId: ObjectId;
  customerId: ObjectId;
  technicianId: ObjectId;
  amount: number;
  currency: string;
  paymentProvider: PaymentProvider;
  sessionId: string;
  transactionId?: string;
  paymentStatus?: PaymentStatus;
}
