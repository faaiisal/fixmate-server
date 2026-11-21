import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import * as serviceController from "./service.controller.js";

const router = Router();

// Public route — list approved & available services
router.get("/", serviceController.getPublicServices);

// Technician routes — must be before /:id to avoid collision
router.get("/my-services", requireAuth, roleMiddleware("technician", "admin"), serviceController.getMyServices);

// Admin routes — pending and all
router.get("/admin/pending", requireAuth, roleMiddleware("admin"), serviceController.adminListPending);
router.get("/admin/all", requireAuth, roleMiddleware("admin"), serviceController.adminListAll);

// Public details — with conditional owner/admin access for pending
router.get("/:id", serviceController.getServiceById);

// Technician protected
router.post("/", requireAuth, roleMiddleware("technician", "admin"), serviceController.createService);
router.put("/:id", requireAuth, roleMiddleware("technician", "admin"), serviceController.updateService);
router.delete("/:id", requireAuth, roleMiddleware("technician", "admin"), serviceController.deleteService);
router.patch("/:id/availability", requireAuth, roleMiddleware("technician", "admin"), serviceController.toggleAvailability);

// Admin protected — approve/reject
router.patch("/:id/approval", requireAuth, roleMiddleware("admin"), serviceController.approveOrReject);

export default router;
