import "express";

declare module "express-serve-static-core" {
  interface Request {
    validatedQuery?: unknown;
    id: string;
  }
}
export {};