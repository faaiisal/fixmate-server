import { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncFunction = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

/**
 * Wrapper for async route handlers to forward errors to error middleware
 * Avoids try-catch repetition in every controller
 */
export const asyncHandler = (fn: AsyncFunction): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
