import { Request, Response } from "express";
import { successResponse, AppError } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";
import * as paymentService from "./payment.service.js";
import { z } from "zod";

const createCheckoutSchema = z.object({
  bookingId: z.string().min(1),
});

const verifyQuerySchema = z.object({
  session_id: z.string().min(1),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  paymentStatus: z.enum(["pending", "paid", "failed", "refunded"]).optional(),
  search: z.string().max(100).optional(),
});

// POST /api/payments/create-checkout-session
export const createCheckoutSession = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const parsed = createCheckoutSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`, 400);
  }
  const result = await paymentService.createCheckoutSession(req.user.id, parsed.data.bookingId);

  // If mock, warn that Stripe not configured
  if (result.isMock) {
    res.json(
      successResponse("Checkout session created (MOCK - Stripe not configured)", {
        url: result.url,
        sessionId: result.sessionId,
        paymentId: result.paymentId,
        amount: result.amount,
        currency: result.currency,
        isMock: true,
        note: "Stripe keys are placeholder. This is a mock checkout. Verify via /api/payments/verify endpoint — success page alone does NOT mark paid.",
      })
    );
  } else {
    res.json(
      successResponse("Checkout session created", {
        url: result.url,
        sessionId: result.sessionId,
        paymentId: result.paymentId,
        amount: result.amount,
        currency: result.currency,
        isMock: false,
      })
    );
  }
});

// GET /api/payments/verify?session_id=xxx
export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const parsed = verifyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(`Validation error: session_id required. ${parsed.error.issues.map((i) => i.message).join(", ")}`, 400);
  }
  const result = await paymentService.verifyPayment(req.user.id, parsed.data.session_id);

  if (result.verified) {
    res.json(successResponse(`Payment verified: ${result.status}`, result));
  } else {
    res.status(400).json(successResponse(`Payment not verified: ${result.status}`, result));
  }
});

// POST /api/payments/webhook — Stripe webhook
export const handleWebhook = asyncHandler(async (req: Request, res: Response) => {
  // Stripe webhook needs raw body — we will handle raw in app.ts for this route
  const signature = req.headers["stripe-signature"] as string;
  if (!signature) {
    throw new AppError("Missing stripe-signature header", 400);
  }

  // req.body is raw Buffer if we configured express.raw for this route
  const payload = (req as any).rawBody || req.body;

  const result = await paymentService.handleWebhook(
    Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload)),
    signature
  );

  res.json(successResponse("Webhook received", result));
});

// GET /api/payments/my-history
export const getMyPaymentHistory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(`Query validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`, 400);
  }
  const result = await paymentService.getCustomerPaymentHistory(req.user.id, {
    page: parsed.data.page,
    limit: parsed.data.limit,
  });
  res.json(successResponse("Payment history fetched", result.payments, result.meta));
});

// GET /api/payments/admin/transactions
export const adminTransactions = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(`Query validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`, 400);
  }
  const result = await paymentService.getAllTransactions({
    page: parsed.data.page,
    limit: parsed.data.limit,
    paymentStatus: parsed.data.paymentStatus,
    search: parsed.data.search,
  });
  res.json(successResponse("All transactions fetched", { payments: result.payments, stats: result.stats }, result.meta as any));
});

// GET /api/payments/booking/:bookingId
export const getPaymentByBookingId = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const bookingId = req.params.bookingId as string;
  if (!bookingId) throw new AppError("Booking ID required", 400);
  const payment = await paymentService.getPaymentByBookingId(bookingId, {
    id: req.user.id,
    role: req.user.role,
  });
  if (!payment) {
    res.json(successResponse("No payment found for booking", null));
    return;
  }
  res.json(successResponse("Payment fetched", payment));
});
