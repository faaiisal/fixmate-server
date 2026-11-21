import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import * as paymentController from "./payment.controller.js";

const router = Router();

// Customer routes
router.post(
  "/create-checkout-session",
  requireAuth,
  roleMiddleware("customer"),
  paymentController.createCheckoutSession
);

router.get(
  "/verify",
  requireAuth,
  roleMiddleware("customer", "admin"),
  paymentController.verifyPayment
);

router.get(
  "/my-history",
  requireAuth,
  roleMiddleware("customer"),
  paymentController.getMyPaymentHistory
);

router.get(
  "/booking/:bookingId",
  requireAuth,
  roleMiddleware("customer", "technician", "admin"),
  paymentController.getPaymentByBookingId
);

// Admin routes
router.get(
  "/admin/transactions",
  requireAuth,
  roleMiddleware("admin"),
  paymentController.adminTransactions
);

// Note: Webhook is mounted separately in app.ts with raw body parser before json middleware
// POST /api/payments/webhook handled directly in app.ts

export default router;
