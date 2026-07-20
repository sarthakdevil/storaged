// ─── Storage types ────────────────────────────────────────────────────────────

export type StorageProvider =
  | "s3"
  | "supabase"
  | "backblaze"
  | "storj"
  | "cloudflare-r2"
  | "idrive-e2"
  | "filebase"
  | "oracle-oci";

export type StorageConnectionConfig = {
  accessKeyId?: string;
  endpointUrl?: string;
  region?: string;
  projectRef?: string;
  accountId?: string;
  forcePathStyle?: boolean;
  quotaGb?: number;
};

export type StorageConnection = {
  id: string;
  providerName: StorageProvider;
  /** Human-readable label derived from providerName */
  providerLabel?: string;
  displayName: string | null;
  bucketName: string;
  config: StorageConnectionConfig;
  isActive: boolean;
  status: "connected" | "limited" | "error" | "inactive";
  statusMessage: string;
  usedBytes: string;
  totalBytes: string | null;
  quotaBytes: string | null;
  availableBytes: string | null;
  activeObjects: number;
  totalObjects: number;
  sizeEstimateSource: string;
  lastCheckedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type StorageConnectionInput = {
  provider: StorageProvider;
  displayName?: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey?: string;
  endpointUrl?: string;
  region?: string;
  projectRef?: string;
  accountId?: string;
  forcePathStyle?: boolean;
  isActive?: boolean;
  quotaGb?: number;
};

export type StorageConnectionsPage = {
  items: StorageConnection[];
  nextCursor: string | null;
};

export type StorageDashboard = {
  totalStorages: number;
  activeStorages: number;
  connectedStorages: number;
  erroredStorages: number;
  usedBytes: string;
  totalBytes: string | null;
  quotaBytes: string | null;
  availableBytes: string | null;
  totalObjects: number;
  activeObjects: number;
  totalConnections: number;
  nextCursor: string | null;
  storages: StorageConnection[];
};
