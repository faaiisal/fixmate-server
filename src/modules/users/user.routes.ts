import { Router } from "express";
import { verifyToken, verifyAdmin } from "../../middlewares/verify.middleware.js";
import * as userController from "./user.controller.js";

const router = Router();

// All routes require auth — per Challenge 2: PATCH /api/users/profile is verifyToken only
// Current user — get own data
router.get("/me", verifyToken, userController.getMe);

// Own profile — per Challenge 2: verifyToken
router.get("/profile", verifyToken, userController.getProfile);
router.put("/profile", verifyToken, userController.updateProfile);
router.patch("/profile", verifyToken, userController.updateProfile);

// Admin routes — per Challenge 2: verifyToken, verifyAdmin
// GET /api/admin/users, PATCH /api/admin/users/:id/role
router.get("/stats", verifyToken, verifyAdmin, userController.getUserStats);
router.get("/", verifyToken, verifyAdmin, userController.listUsers);
router.get("/:id", verifyToken, verifyAdmin, userController.getUserById);
router.patch("/:id/role", verifyToken, verifyAdmin, userController.updateUserRole);

export default router;
