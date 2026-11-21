import { Request, Response, NextFunction } from "express";
import { AppError, errorResponse } from "../utils/api-response.js";
import { env } from "../config/env.js";

export interface CustomError extends Error {
  statusCode?: number;
  code?: string;
  keyValue?: Record<string, unknown>;
}

export const errorMiddleware = (
  err: CustomError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("🛑 Error:", {
    message: err.message,
    stack: env.NODE_ENV === "development" ? err.stack : undefined,
    code: err.code,
  });

  // Default status 500
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // MongoDB duplicate key error (11000)
  if (err.code === "11000" && err.keyValue) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `Duplicate field: ${field}`;
  }

  // AppError instance
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Mongoose-like validation but we use native driver — generic handling
  if (err.name === "ValidationError") {
    statusCode = 400;
  }

  // ObjectId invalid format handling (common cause: BSONError)
  if (err.name === "BSONError" || message.toLowerCase().includes("objectid")) {
    statusCode = 400;
    message = "Invalid ID format";
  }

  res.status(statusCode).json(
    errorResponse(
      message,
      env.NODE_ENV === "development" ? err.stack || err.message : undefined
    )
  );
};
