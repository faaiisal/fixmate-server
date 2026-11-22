import { Router } from "express";
import multer from "multer";
import { verifyToken } from "../../middlewares/verify.middleware.js";
import * as uploadController from "./upload.controller.js";

const router = Router();

// Multer memory storage for handling file uploads without disk
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type ${file.mimetype}. Allowed: ${allowed.join(", ")}`));
    }
  },
});

// POST /api/upload/image — authenticated users (customer, technician, admin) can upload profile/service images
// Per Phase 2 security: stricter rate limit applied in app.ts uploadRateLimiter
router.post(
  "/image",
  verifyToken,
  upload.single("image"),
  uploadController.uploadImage
);

export default router;
