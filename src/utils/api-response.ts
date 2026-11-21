export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
  error?: unknown;
}

export function successResponse<T>(
  message: string,
  data?: T,
  meta?: ApiResponse["meta"]
): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
    meta,
  };
}

export function errorResponse(
  message: string,
  error?: unknown,
  data?: null
): ApiResponse<null> {
  return {
    success: false,
    message,
    error: error instanceof Error ? error.message : error,
    data: data ?? undefined,
  };
}

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
