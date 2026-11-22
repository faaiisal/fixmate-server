import { Request, Response, NextFunction } from "express";

/**
 * Security headers middleware — manual implementation without helmet dependency
 * Phase 2: Adds appropriate HTTP security headers
 * If helmet is installed, prefer helmet, but this works without external package
 */
export const securityHeadersMiddleware = (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // XSS protection (legacy but still useful)
  res.setHeader("X-XSS-Protection", "0"); // Disable old XSS filter, rely on CSP

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // HSTS — only in production with HTTPS
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  // Content Security Policy — basic, allow self and trusted
  // Note: Adjust as needed, for API we can be restrictive
  // For API, we don't need to allow much
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none';"
  );

  // Permissions Policy
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  // Remove X-Powered-By
  res.removeHeader("X-Powered-By");

  next();
};
