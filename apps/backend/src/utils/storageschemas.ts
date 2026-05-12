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
  bucketName: z
    .string()
    .trim()
    .min(3, "Bucket name must be at least 3 characters.")
    .max(63, "Bucket name must be at most 63 characters.")
    .regex(
      /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/,
      "Bucket name must use lowercase letters, numbers, dots, or hyphens, and start/end with a letter or number.",
    )
    .refine((value) => !value.includes(".."), {
      message: "Bucket name cannot contain consecutive dots.",
    }),
  displayName: optionalTrimmedStringSchema,
  accessKeyId: z.string().trim().min(1, "Access key ID is required."),
  secretAccessKey: z.string().trim().min(1, "Secret access key is required."),
  endpointUrl: optionalUrlSchema,
  region: optionalTrimmedStringSchema,
  projectRef: optionalTrimmedStringSchema,
  accountId: optionalTrimmedStringSchema,
  forcePathStyle: z.boolean().optional(),
  isActive: z.boolean().optional(),
  quotaGb: z.number().positive("Quota must be a positive number.").optional(),
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
  commonConnectionSchema
    .extend({
      provider: z.literal("storj"),
      region: optionalTrimmedStringSchema,
    })
    .superRefine((value, context) => {
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value.bucketName)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Storj bucket names can only contain lowercase letters, numbers, and hyphens.",
          path: ["bucketName"],
        });
      }
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

const createS3ConnectionSchema = () =>
  commonConnectionSchema.extend({
    provider: z.literal("s3"),
    region: z.string().trim().min(1, "S3 connections need a region."),
  });

export const storageConnectionSchemas = {
  s3: createS3ConnectionSchema(),
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
