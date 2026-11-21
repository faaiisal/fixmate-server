import { Request, Response } from "express";
import { errorResponse } from "../utils/api-response.js";

export const notFoundMiddleware = (req: Request, res: Response) => {
  res.status(404).json(
    errorResponse(`Route not found: ${req.method} ${req.originalUrl}`)
  );
};
