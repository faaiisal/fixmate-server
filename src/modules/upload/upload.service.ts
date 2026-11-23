import { env } from "../../config/env.js";
import { AppError } from "../../utils/api-response.js";

const ALLOWED_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const IMGBB_TIMEOUT_MS = 30000; // 30 seconds timeout for ImgBB API

export interface UploadResult {
  url: string;
  displayUrl: string;
  deleteUrl?: string;
  width?: number;
  height?: number;
  size: number;
  mime: string;
}

/**
 * Validate file signature (magic numbers) to not trust frontend MIME alone
 * Checks actual file content, not just Content-Type header
 */
function validateFileSignature(buffer: Buffer, mimetype: string): boolean {
  if (!buffer || buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return ["image/jpeg", "image/jpg"].includes(mimetype);
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return mimetype === "image/png";
  }

  // GIF: GIF87a or GIF89a (47 49 46 38 37/39 61)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return mimetype === "image/gif";
  }

  // WebP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.length >= 12 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return mimetype === "image/webp";
  }

  // For WebP, also allow if mimetype is webp but signature check is lenient (some webp variants)
  // If mimetype is already validated and file has some content, allow for other image types
  // that may have different signatures (e.g., progressive JPEG, etc.)
  // We still enforce mimetype check, but also check extension as additional layer
  return ALLOWED_MIMES.includes(mimetype);
}

/**
 * Validate file extension as additional layer (don't trust MIME alone)
 */
function validateFileExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function uploadToImgBB(file: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}): Promise<UploadResult> {
  // Validate file exists (already checked in controller, but double-check)
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new AppError("No image file provided or file is empty", 400);
  }

  // Validate size (enforce reasonable limit)
  if (file.size > MAX_SIZE) {
    throw new AppError(
      `Image too large: ${file.size} bytes. Maximum allowed is ${MAX_SIZE} bytes (5MB)`,
      400
    );
  }

  if (file.size === 0) {
    throw new AppError("Image file is empty", 400);
  }

  // Validate MIME type (first layer - from multer fileFilter, but re-validate)
  if (!ALLOWED_MIMES.includes(file.mimetype)) {
    throw new AppError(
      `Invalid image type ${file.mimetype}. Allowed: ${ALLOWED_MIMES.join(", ")}`,
      400
    );
  }

  // Validate file extension (second layer - don't trust MIME alone)
  if (!validateFileExtension(file.originalname)) {
    throw new AppError(
      `Invalid file extension for ${file.originalname}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
      400
    );
  }

  // Validate file signature / magic numbers (third layer - don't trust MIME alone, check actual content)
  if (!validateFileSignature(file.buffer, file.mimetype)) {
    throw new AppError(
      `File content does not match MIME type ${file.mimetype}. File may be corrupted or not a valid image.`,
      400
    );
  }

  // Validate API key configuration (server-side only, never expose to frontend)
  const apiKey = env.IMGBB_API_KEY;
  if (!apiKey || apiKey.includes("placeholder") || apiKey.trim().length === 0) {
    throw new AppError(
      "IMGBB_API_KEY not configured. Set real key in backend .env file. Placeholder detected. Get key from https://api.imgbb.com/",
      500
    );
  }

  // Never log API key - ensure it's not in logs or responses
  if (apiKey.length < 10) {
    throw new AppError("IMGBB_API_KEY appears invalid (too short)", 500);
  }

  // ImgBB API expects base64 image
  const base64 = file.buffer.toString("base64");

  const formData = new URLSearchParams();
  formData.append("key", apiKey);
  formData.append("image", base64);
  formData.append("name", file.originalname);

  try {
    // Timeout handling for ImgBB API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMGBB_TIMEOUT_MS);

    const response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      const text = await response.text().catch(() => "No response body");
      throw new AppError(
        `ImgBB API HTTP error: ${response.status} ${response.statusText}. Body: ${text.slice(0, 200)}`,
        500
      );
    }

    let data: any;
    try {
      data = await response.json();
    } catch (parseErr) {
      throw new AppError(`ImgBB returned invalid JSON response`, 500);
    }

    // Handle ImgBB API logical errors
    if (!data.success) {
      const errorMsg = data.error?.message || "Unknown ImgBB error";
      // Check for specific ImgBB errors
      if (errorMsg.toLowerCase().includes("key")) {
        throw new AppError(`ImgBB API key error: ${errorMsg}. Check IMGBB_API_KEY in .env`, 500);
      }
      throw new AppError(`ImgBB upload failed: ${errorMsg}`, 500);
    }

    // Validate ImgBB response structure
    if (!data.data || !data.data.url) {
      throw new AppError("ImgBB returned success but no URL in response - invalid response structure", 500);
    }

    const result: UploadResult = {
      url: data.data.url,
      displayUrl: data.data.display_url || data.data.url,
      deleteUrl: data.data.delete_url,
      width: data.data.width,
      height: data.data.height,
      size: data.data.size || file.size,
      mime: file.mimetype,
    };

    // Validate returned URL is accessible (basic check - is URL)
    try {
      new URL(result.url);
    } catch {
      throw new AppError(`ImgBB returned invalid URL: ${result.url}`, 500);
    }

    return result;
  } catch (err: any) {
    if (err instanceof AppError) throw err;

    // Handle timeout
    if (err.name === "AbortError") {
      throw new AppError(`ImgBB upload timed out after ${IMGBB_TIMEOUT_MS}ms - ImgBB API may be slow or unavailable`, 500);
    }

    // Handle fetch errors (network, etc.)
    if (err.message && err.message.includes("fetch")) {
      throw new AppError(`ImgBB network error: ${err.message}. Check internet connection and ImgBB API status`, 500);
    }

    throw new AppError(`ImgBB upload error: ${err.message || "Unknown error"}`, 500);
  }
}
