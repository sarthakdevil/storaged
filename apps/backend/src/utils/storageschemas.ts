import { z } from "zod";

const optionalTrimmedStringSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : undefined;
  },
  z.string().trim().min(1).optional(),
);

const optionalUrlSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : undefined;
  },
  z.string().trim().url("Provide a valid endpoint URL.").optional(),
);

const commonConnectionSchema = z.object({
  bucketName: z.string().trim().min(1, "Bucket name is required."),
  displayName: optionalTrimmedStringSchema,
  accessKeyId: z.string().trim().min(1, "Access key ID is required."),
  secretAccessKey: z.string().trim().min(1, "Secret access key is required."),
  endpointUrl: optionalUrlSchema,
  region: optionalTrimmedStringSchema,
  projectRef: optionalTrimmedStringSchema,
  accountId: optionalTrimmedStringSchema,
  forcePathStyle: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const createSupabaseConnectionSchema = () =>
  commonConnectionSchema
    .extend({
      provider: z.literal("supabase"),
      region: z.string().trim().min(1, "Supabase connections need a region."),
      projectRef: optionalTrimmedStringSchema,
    })
    .superRefine((value, context) => {
      if (!value.projectRef && !value.endpointUrl) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Supabase connections need a project ref or a custom endpoint URL.",
          path: ["projectRef"],
        });
      }
    });

const createBackblazeConnectionSchema = () =>
  commonConnectionSchema.extend({
    provider: z.literal("backblaze"),
    region: z.string().trim().min(1, "Backblaze connections need a region."),
  });

const createStorjConnectionSchema = () =>
  commonConnectionSchema.extend({
    provider: z.literal("storj"),
    region: optionalTrimmedStringSchema,
  });

const createCloudflareR2ConnectionSchema = () =>
  commonConnectionSchema
    .extend({
      provider: z.literal("cloudflare-r2"),
      region: optionalTrimmedStringSchema,
      accountId: optionalTrimmedStringSchema,
    })
    .superRefine((value, context) => {
      if (!value.accountId && !value.endpointUrl) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Cloudflare R2 connections need an account ID or a custom endpoint URL.",
          path: ["accountId"],
        });
      }
    });

export const storageConnectionSchemas = {
  supabase: createSupabaseConnectionSchema(),
  backblaze: createBackblazeConnectionSchema(),
  storj: createStorjConnectionSchema(),
  "cloudflare-r2": createCloudflareR2ConnectionSchema(),
} as const;

export type StorageProvider = keyof typeof storageConnectionSchemas;

export type StorageConnectionInput = z.output<
  (typeof storageConnectionSchemas)[StorageProvider]
>;

export type StorageConnectionUpdateInput = {
  id: string;
  input: unknown;
};

export const getStorageConnectionSchema = (provider: StorageProvider) => {
  return storageConnectionSchemas[provider];
};

export const formatStorageSchemaError = (error: z.ZodError) => {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
};