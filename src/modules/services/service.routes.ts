import { Router } from "express";
import { verifyToken, verifyTechnician, verifyAdmin } from "../../middlewares/verify.middleware.js";
import * as serviceController from "./service.controller.js";

const router = Router();

// Public routes — per Challenge 2: GET /api/services, GET /api/services/:id are public
router.get("/", serviceController.getPublicServices);

// Technician routes — per Challenge 2: verifyToken, verifyTechnician
// POST /api/services, PATCH /api/services/:id, DELETE /api/services/:id
// Note: spec says technician only, not admin, for creation/editing/deletion
// Admin can approve/reject via separate route
router.get("/my-services", verifyToken, verifyTechnician, serviceController.getMyServices);

// Admin routes — pending and all per Challenge 2: verifyToken, verifyAdmin
router.get("/admin/pending", verifyToken, verifyAdmin, serviceController.adminListPending);
router.get("/admin/all", verifyToken, verifyAdmin, serviceController.adminListAll);

// Public details — with conditional owner/admin access for pending
router.get("/:id", serviceController.getServiceById);

// Technician protected — per Challenge 2: verifyToken, verifyTechnician
router.post("/", verifyToken, verifyTechnician, serviceController.createService);
router.put("/:id", verifyToken, verifyTechnician, serviceController.updateService);
router.delete("/:id", verifyToken, verifyTechnician, serviceController.deleteService);
router.patch("/:id/availability", verifyToken, verifyTechnician, serviceController.toggleAvailability);

// Admin protected — approve/reject per Challenge 2: verifyToken, verifyAdmin
router.patch("/:id/approval", verifyToken, verifyAdmin, serviceController.approveOrReject);

export default router;
