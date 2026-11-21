import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import * as bookingController from "./booking.controller.js";

const router = Router();

// Customer routes
router.post("/", requireAuth, roleMiddleware("customer"), bookingController.createBooking);
router.get("/my-bookings", requireAuth, roleMiddleware("customer"), bookingController.getMyBookings);
router.patch("/:id/cancel", requireAuth, roleMiddleware("customer"), bookingController.cancelBooking);

// Technician routes
router.get("/assigned", requireAuth, roleMiddleware("technician"), bookingController.getAssignedBookings);
router.patch("/:id/accept", requireAuth, roleMiddleware("technician"), bookingController.acceptBooking);
router.patch("/:id/reject", requireAuth, roleMiddleware("technician"), bookingController.rejectBooking);
router.patch("/:id/start", requireAuth, roleMiddleware("technician"), bookingController.startBooking);
router.patch("/:id/complete", requireAuth, roleMiddleware("technician"), bookingController.completeBooking);

// Admin routes — must be before /:id to avoid collision? Actually /:id is generic, but we have /admin prefix logic in controller listing
// We implement admin list as GET / (admin) and GET /all etc.
// For clarity: admin can list all bookings via GET /admin/all or GET / with admin role.
// We'll define:
router.get("/admin/all", requireAuth, roleMiddleware("admin"), bookingController.adminListBookings);
router.get("/", requireAuth, roleMiddleware("admin"), bookingController.adminListBookings);

// Get single booking — works for customer, technician, admin with ownership checks inside service
router.get("/:id", requireAuth, bookingController.getBookingById);

export default router;
