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
  sessionId?: string; // Stripe checkout session id
  paymentStatus: PaymentStatus;
  paidAt?: Date;
  createdAt: Date;
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
