import { Router } from "express";
import { verifyToken, verifyCustomer, verifyAdmin } from "../../middlewares/verify.middleware.js";
import * as paymentController from "./payment.controller.js";

const router = Router();

// Customer routes — per Challenge 2: POST /api/payments/create-checkout-session is verifyToken, verifyCustomer
router.post(
  "/create-checkout-session",
  verifyToken,
  verifyCustomer,
  paymentController.createCheckoutSession
);

router.get(
  "/verify",
  verifyToken,
  verifyCustomer,
  paymentController.verifyPayment
);

router.get(
  "/my-history",
  verifyToken,
  verifyCustomer,
  paymentController.getMyPaymentHistory
);

router.get(
  "/booking/:bookingId",
  verifyToken,
  paymentController.getPaymentByBookingId // ownership checks inside service for customer, technician, admin
);

// Admin routes — per Challenge 2: GET /api/admin/payments is verifyToken, verifyAdmin
router.get(
  "/admin/transactions",
  verifyToken,
  verifyAdmin,
  paymentController.adminTransactions
);

// Note: Webhook is mounted separately in app.ts with raw body parser before json middleware
// POST /api/payments/webhook handled directly in app.ts

export default router;
