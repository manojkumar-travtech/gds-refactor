import { z } from "zod";

export const queueProcessSchema = z.object({
  queueNumbers: z.array(z.string()).optional(),
  pcc: z.string().min(1, "PCC is required"),
  organization: z.string().optional(),
  domain: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  targetOrgId: z.string().uuid("Invalid organization ID"),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});

export const syncRequestSchema = z.object({
  targetOrgId: z.string().uuid("Invalid organization ID"),
  syncDirection: z
    .enum(["to_profiles", "to_gds", "both", "merge_profiles"])
    .default("to_profiles"),
  profileIds: z.array(z.string().uuid()).optional(),
  mergeConfig: z
    .object({
      defaultStrategy: z.string(),
    })
    .optional(),
  pcc: z.string().optional(),
  organization: z.string().optional(),
  domain: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  profileType: z.string().optional(),
});

export const deleteRequestSchema = z.object({
  pcc: z.string().min(1, "PCC is required"),
  organization: z.string().optional(),
  domain: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  uniqueId: z.string().min(1, "Unique ID is required"),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  clientCode: z.string().default("TN"),
  clientContext: z.string().default("TMP"),
});

export const profileQuerySchema = z.object({
  organizationId: z.string().uuid("Invalid organization ID"),
  email: z.string().email("Invalid email address"),
});
