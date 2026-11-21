import { env } from "../../config/env.js";
import { AppError } from "../../utils/api-response.js";

const ALLOWED_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export interface UploadResult {
  url: string;
  displayUrl: string;
  deleteUrl?: string;
  width?: number;
  height?: number;
  size: number;
  mime: string;
}

export async function uploadToImgBB(file: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}): Promise<UploadResult> {
  // Validate
  if (!ALLOWED_MIMES.includes(file.mimetype)) {
    throw new AppError(
      `Invalid image type ${file.mimetype}. Allowed: ${ALLOWED_MIMES.join(", ")}`,
      400
    );
  }

  if (file.size > MAX_SIZE) {
    throw new AppError(`Image too large ${file.size} bytes. Max ${MAX_SIZE} bytes (5MB)`, 400);
  }

  const apiKey = env.IMGBB_API_KEY;
  if (!apiKey || apiKey.includes("placeholder")) {
    throw new AppError(
      "IMGBB_API_KEY not configured. Set real key in backend .env. Placeholder detected.",
      500
    );
  }

  // ImgBB API expects base64 image
  const base64 = file.buffer.toString("base64");

  const formData = new URLSearchParams();
  formData.append("key", apiKey);
  formData.append("image", base64);
  formData.append("name", file.originalname);

  try {
    const response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const data = (await response.json()) as any;

    if (!data.success) {
      throw new AppError(`ImgBB upload failed: ${data.error?.message || "Unknown error"}`, 500);
    }

    const result: UploadResult = {
      url: data.data.url,
      displayUrl: data.data.display_url,
      deleteUrl: data.data.delete_url,
      width: data.data.width,
      height: data.data.height,
      size: data.data.size,
      mime: file.mimetype,
    };

    return result;
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(`ImgBB upload error: ${err.message}`, 500);
  }
}
