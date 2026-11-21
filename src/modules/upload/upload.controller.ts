import { Request, Response } from "express";
import { successResponse, AppError } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { uploadToImgBB } from "./upload.service.js";

export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Unauthorized", 401);

  const file = (req as any).file as
    | { buffer: Buffer; mimetype: string; originalname: string; size: number }
    | undefined;

  if (!file) {
    throw new AppError("No image file provided. Use field name 'image'", 400);
  }

  const result = await uploadToImgBB(file);

  res.json(successResponse("Image uploaded to ImgBB", result));
});
