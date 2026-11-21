import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/api-response.js";

export type UserRole = "customer" | "technician" | "admin";

/**
 * Role-based authorization middleware
 * Must be used after authMiddleware + requireAuth that populates req.user
 */
export const roleMiddleware = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError("Unauthorized: No user in request", 401);
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      throw new AppError(
        `Forbidden: Requires one of roles [${allowedRoles.join(", ")}], but you have ${req.user.role}`,
        403
      );
    }

    next();
  };
};
