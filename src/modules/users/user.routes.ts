import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import * as userController from "./user.controller.js";

const router = Router();

// All routes require auth (since users module is protected) — except we will allow optional for me? But require auth for all
// Apply requireAuth globally for this router

// Current user — get own data
router.get("/me", requireAuth, userController.getMe);

// Own profile
router.get("/profile", requireAuth, userController.getProfile);
router.put("/profile", requireAuth, userController.updateProfile);
router.patch("/profile", requireAuth, userController.updateProfile);

// Admin routes
router.get("/stats", requireAuth, roleMiddleware("admin"), userController.getUserStats);
router.get("/", requireAuth, roleMiddleware("admin"), userController.listUsers);
router.get("/:id", requireAuth, roleMiddleware("admin"), userController.getUserById);
router.patch("/:id/role", requireAuth, roleMiddleware("admin"), userController.updateUserRole);

export default router;
