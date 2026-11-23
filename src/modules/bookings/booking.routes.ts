import { Router } from "express";
import { verifyToken, verifyCustomer, verifyTechnician, verifyAdmin } from "../../middlewares/verify.middleware.js";
import * as bookingController from "./booking.controller.js";

const router = Router();

// Customer routes — per Challenge 2: verifyToken, verifyCustomer
// POST /api/bookings, PATCH /api/bookings/:id/cancel, GET /api/bookings/my
router.post("/", verifyToken, verifyCustomer, bookingController.createBooking);
router.get("/my-bookings", verifyToken, verifyCustomer, bookingController.getMyBookings);
router.patch("/:id/cancel", verifyToken, verifyCustomer, bookingController.cancelBooking);

// Technician routes — per Challenge 2: verifyToken, verifyTechnician
// GET /api/bookings/technician, PATCH /api/bookings/:id/status (accept/reject/start/complete)
router.get("/assigned", verifyToken, verifyTechnician, bookingController.getAssignedBookings);
router.patch("/:id/accept", verifyToken, verifyTechnician, bookingController.acceptBooking);
router.patch("/:id/reject", verifyToken, verifyTechnician, bookingController.rejectBooking);
router.patch("/:id/start", verifyToken, verifyTechnician, bookingController.startBooking);
router.patch("/:id/complete", verifyToken, verifyTechnician, bookingController.completeBooking);

// Admin routes — per Challenge 2: verifyToken, verifyAdmin
// GET /api/admin/bookings
router.get("/admin/all", verifyToken, verifyAdmin, bookingController.adminListBookings);
router.get("/", verifyToken, verifyAdmin, bookingController.adminListBookings);

// Get single booking — requires auth, ownership checks inside service (customer own, technician assigned, admin all)
router.get("/:id", verifyToken, bookingController.getBookingById);

export default router;
