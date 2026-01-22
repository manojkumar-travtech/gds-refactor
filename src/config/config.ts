import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().transform(Number).default(3000),

  // Database
  DB_HOST: z.string(),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_PORT: z.string().transform(Number).default(5432),

  // Sabre
  SABRE_ENDPOINT: z.string().default("https://webservices.sabre.com/websvc"),
  SABRE_PCC: z.string().optional(),
  SABRE_ORGANIZATION: z.string().optional(),
  SABRE_DOMAIN: z.string().optional(),
  SABRE_USERNAME: z.string().optional(),
  SABRE_PASSWORD: z.string().optional(),
  SABRE_CLIENT_ID: z.string().optional(),
  SABRE_CLIENT_SECRET: z.string().optional(),
  SABRE_CLIENT_CODE: z.string().default("TN"),
  SABRE_CLIENT_CONTEXT: z.string().default("TMP"),

  // Security
  JWT_SECRET: z.string().min(32).optional(),
  API_KEY: z.string().min(32).optional(),

  // Logging
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.issues
        .map((issue) => issue.path.join("."))
        .join(", ");

      throw new Error(`Missing or invalid environment variables: ${missing}`);
    }
    throw error;
  }
};

export const config = parseEnv();
