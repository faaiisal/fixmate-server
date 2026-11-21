import dotenv from "dotenv";
import path from "path";

// Load .env from project root. dotenv by default looks in cwd.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function getEnv(key: string, required = true, fallback?: string): string {
  // Support both MONGODB_URI and BETTER_AUTH_DB_URL alias for MongoDB
  if (key === "MONGODB_URI") {
    const value = process.env.MONGODB_URI || process.env.BETTER_AUTH_DB_URL;
    if (!value && required) {
      throw new Error(`Missing required env var: ${key} (or BETTER_AUTH_DB_URL)`);
    }
    return value || fallback || "";
  }

  const value = process.env[key] || fallback;
  if (required && !value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value as string;
}

function getNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (isNaN(parsed)) {
    throw new Error(`Env var ${key} must be a number, got: ${raw}`);
  }
  return parsed;
}

export interface Env {
  PORT: number;
  NODE_ENV: "development" | "production" | "test";
  MONGODB_URI: string;
  DB_NAME: string;
  CLIENT_URL: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_CURRENCY: string;
  IMGBB_API_KEY?: string;
  NEXT_PUBLIC_API_URL?: string;
}

function loadEnv(): Env {
  const env: Env = {
    PORT: getNumber("PORT", 8000),
    NODE_ENV: (getEnv("NODE_ENV", false, "development") as Env["NODE_ENV"]) || "development",
    MONGODB_URI: getEnv("MONGODB_URI", true),
    DB_NAME: getEnv("DB_NAME", false, "fixmatedb") || "fixmatedb",
    CLIENT_URL: getEnv("CLIENT_URL", false, "http://localhost:3000") || "http://localhost:3000",
    BETTER_AUTH_SECRET: getEnv("BETTER_AUTH_SECRET", false, undefined),
    BETTER_AUTH_URL: getEnv("BETTER_AUTH_URL", false, "http://localhost:3000") || "http://localhost:3000",
    STRIPE_SECRET_KEY: getEnv("STRIPE_SECRET_KEY", false, undefined),
    STRIPE_WEBHOOK_SECRET: getEnv("STRIPE_WEBHOOK_SECRET", false, undefined),
    STRIPE_CURRENCY: getEnv("STRIPE_CURRENCY", false, "usd") || "usd",
    IMGBB_API_KEY: getEnv("IMGBB_API_KEY", false, undefined),
    NEXT_PUBLIC_API_URL: getEnv("NEXT_PUBLIC_API_URL", false, undefined),
  };

  // Validate critical formats loosely
  if (env.PORT < 1 || env.PORT > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }

  if (!env.MONGODB_URI.startsWith("mongodb://") && !env.MONGODB_URI.startsWith("mongodb+srv://")) {
    throw new Error("MONGODB_URI must start with mongodb:// or mongodb+srv://");
  }

  return env;
}

export const env: Env = loadEnv();
