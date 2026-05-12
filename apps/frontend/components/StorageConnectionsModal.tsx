"use client";

import { FormEvent, UIEvent, useEffect, useMemo, useState } from "react";
import { Database, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { StorageConnection, StorageConnectionInput, StorageProvider } from "../lib/api";
import {
  useCreateStorageConnection,
  useDeleteStorageConnection,
  useStorageConnections,
  useUpdateStorageConnection,
} from "../lib/queries";

const PROVIDERS: {
  value: StorageProvider;
  label: string;
  description: string;
  endpointHint: string;
}[] = [
  {
    value: "s3",
    label: "Amazon S3 / compatible",
    description: "AWS S3 or any custom S3 endpoint.",
    endpointHint: "https://s3.us-east-1.amazonaws.com",
  },
  {
    value: "cloudflare-r2",
    label: "Cloudflare R2",
    description: "R2 buckets using account-scoped S3 credentials.",
    endpointHint: "https://<account-id>.r2.cloudflarestorage.com",
  },
  {
    value: "backblaze",
    label: "Backblaze B2",
    description: "Use the S3 endpoint shown on your B2 bucket.",
    endpointHint: "https://s3.us-west-004.backblazeb2.com",
  },
  {
    value: "supabase",
    label: "Supabase Storage",
    description: "Supabase S3-compatible storage endpoint.",
    endpointHint: "https://<project-ref>.storage.supabase.co/storage/v1/s3",
  },
  {
    value: "storj",
    label: "Storj",
    description: "Storj-hosted S3-compatible gateway.",
    endpointHint: "https://gateway.storjshare.io",
  },
];

const REGION_OPTIONS: Record<
  StorageProvider,
  { value: string; label: string }[]
> = {
  s3: [
    { value: "us-east-1", label: "US East (N. Virginia)" },
    { value: "us-east-2", label: "US East (Ohio)" },
    { value: "us-west-1", label: "US West (N. California)" },
    { value: "us-west-2", label: "US West (Oregon)" },
    { value: "af-south-1", label: "Africa (Cape Town)" },
    { value: "ap-east-1", label: "Asia Pacific (Hong Kong)" },
    { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
    { value: "ap-south-2", label: "Asia Pacific (Hyderabad)" },
    { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
    { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
    { value: "ap-southeast-3", label: "Asia Pacific (Jakarta)" },
    { value: "ap-southeast-4", label: "Asia Pacific (Melbourne)" },
    { value: "ap-southeast-5", label: "Asia Pacific (Malaysia)" },
    { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
    { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
    { value: "ap-northeast-3", label: "Asia Pacific (Osaka)" },
    { value: "ca-central-1", label: "Canada (Central)" },
    { value: "ca-west-1", label: "Canada West (Calgary)" },
    { value: "eu-central-1", label: "Europe (Frankfurt)" },
    { value: "eu-central-2", label: "Europe (Zurich)" },
    { value: "eu-west-1", label: "Europe (Ireland)" },
    { value: "eu-west-2", label: "Europe (London)" },
    { value: "eu-west-3", label: "Europe (Paris)" },
    { value: "eu-north-1", label: "Europe (Stockholm)" },
    { value: "eu-south-1", label: "Europe (Milan)" },
    { value: "eu-south-2", label: "Europe (Spain)" },
    { value: "il-central-1", label: "Israel (Tel Aviv)" },
    { value: "me-central-1", label: "Middle East (UAE)" },
    { value: "me-south-1", label: "Middle East (Bahrain)" },
    { value: "sa-east-1", label: "South America (Sao Paulo)" },
  ],
  supabase: [
    { value: "us-east-1", label: "East US (North Virginia)" },
    { value: "us-east-2", label: "East US (Ohio)" },
    { value: "us-west-1", label: "West US (North California)" },
    { value: "us-west-2", label: "West US (Oregon)" },
    { value: "ca-central-1", label: "Canada (Central)" },
    { value: "eu-central-1", label: "Central EU (Frankfurt)" },
    { value: "eu-central-2", label: "Central Europe (Zurich)" },
    { value: "eu-west-1", label: "West EU (Ireland)" },
    { value: "eu-west-2", label: "West Europe (London)" },
    { value: "eu-west-3", label: "West EU (Paris)" },
    { value: "eu-north-1", label: "North EU (Stockholm)" },
    { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
    { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
    { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
    { value: "ap-northeast-1", label: "Northeast Asia (Tokyo)" },
    { value: "ap-northeast-2", label: "Northeast Asia (Seoul)" },
    { value: "sa-east-1", label: "South America (Sao Paulo)" },
  ],
  backblaze: [
    { value: "us-west-000", label: "US West" },
    { value: "us-west-001", label: "US West 001" },
    { value: "us-west-002", label: "US West 002" },
    { value: "us-west-004", label: "US West 004" },
    { value: "us-east-005", label: "US East 005" },
    { value: "eu-central-003", label: "EU Central 003" },
  ],
  storj: [
    { value: "us1", label: "US Gateway" },
    { value: "eu1", label: "EU Gateway" },
    { value: "ap1", label: "Asia Pacific Gateway" },
  ],
  "cloudflare-r2": [{ value: "auto", label: "Auto" }],
};

const initialForm: StorageConnectionInput = {
  provider: "s3",
  displayName: "",
  bucketName: "",
  accessKeyId: "",
  secretAccessKey: "",
  endpointUrl: "",
  region: "us-east-1",
  projectRef: "",
  accountId: "",
  forcePathStyle: false,
  isActive: true,
};

type RegionSelectProps = {
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

function RegionSelect({ value, options, onChange }: RegionSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="storage-region-select">
      <button
        type="button"
        className={`storage-region-trigger ${open ? "storage-region-trigger-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <small>{selected.value}</small>
      </button>
      {open && (
        <div className="storage-region-menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`storage-region-option ${
                option.value === selected.value ? "storage-region-option-active" : ""
              }`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              <small>{option.value}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  onClose: () => void;
  initialEditId?: string;
  initialEditConnection?: StorageConnection;
};

export function StorageConnectionsModal({
  onClose,
  initialEditId,
  initialEditConnection,
}: Props) {
  const {
    data: connectionsData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useStorageConnections();
  const createConnection = useCreateStorageConnection();
  const updateConnection = useUpdateStorageConnection();
  const deleteConnection = useDeleteStorageConnection();
  const [form, setForm] = useState<StorageConnectionInput>(initialForm);
  const [editingConnection, setEditingConnection] = useState<StorageConnection | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const connections = useMemo(
    () => connectionsData?.pages.flatMap((page) => page.items) ?? [],
    [connectionsData],
  );

  const providerLabel = useMemo(
    () => PROVIDERS.find((p) => p.value === form.provider)?.label ?? "Storage",
    [form.provider],
  );
  const currentProvider = useMemo(
    () => PROVIDERS.find((provider) => provider.value === form.provider) ?? PROVIDERS[0],
    [form.provider],
  );

  useEffect(() => {
    if (initialEditConnection && !editingConnection) {
      startEdit(initialEditConnection);
      return;
    }
    if (!initialEditId || connections.length === 0 || editingConnection) return;
    const connection = connections.find((item) => item.id === initialEditId);
    if (connection) startEdit(connection);
  }, [connections, editingConnection, initialEditConnection, initialEditId]);

  function update<K extends keyof StorageConnectionInput>(
    key: K,
    value: StorageConnectionInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateProvider(provider: StorageProvider) {
    setForm((prev) => ({
      ...prev,
      provider,
      forcePathStyle: provider !== "s3",
      region:
        provider === "storj"
          ? "us1"
          : provider === "cloudflare-r2"
            ? "auto"
            : prev.region || "us-east-1",
    }));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = {
      ...form,
      displayName: form.displayName?.trim() || undefined,
      endpointUrl: form.endpointUrl?.trim() || undefined,
      region: form.region?.trim() || undefined,
      projectRef: form.projectRef?.trim() || undefined,
      accountId: form.accountId?.trim() || undefined,
    };

    if (editingConnection) {
      await updateConnection.mutateAsync({
        id: editingConnection.id,
        ...payload,
        secretAccessKey: payload.secretAccessKey || undefined,
      });
      setEditingConnection(null);
    } else {
      await createConnection.mutateAsync(payload as StorageConnectionInput);
    }

    setForm({ ...initialForm, provider: form.provider, forcePathStyle: form.provider !== "s3" });
    setShowSaved(true);
  }

  function startEdit(connection: StorageConnection) {
    setEditingConnection(connection);
    setForm({
      provider: connection.providerName,
      displayName: connection.displayName ?? "",
      bucketName: connection.bucketName,
      accessKeyId: connection.config.accessKeyId ?? "",
      secretAccessKey: "",
      endpointUrl: connection.config.endpointUrl ?? "",
      region: connection.config.region ?? "",
      projectRef: connection.config.projectRef ?? "",
      accountId: connection.config.accountId ?? "",
      forcePathStyle: connection.config.forcePathStyle ?? connection.providerName !== "s3",
      isActive: connection.isActive,
      quotaGb: connection.config.quotaGb,
    });
  }

  function cancelEdit() {
    setEditingConnection(null);
    setForm(initialForm);
  }

  function onConnectionListScroll(e: UIEvent<HTMLElement>) {
    const target = e.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceFromBottom < 80 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  return (
    <div className="storage-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="storage-modal w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="storage-modal-header flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="storage-modal-icon">
              <Database size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Storage connections</h2>
              <p className="text-xs text-slate-500">Buckets used for new uploads</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            aria-label="Close storage connections"
          >
            <X size={18} />
          </button>
        </div>

        <div className="storage-modal-body">
          <section className="storage-list" onScroll={onConnectionListScroll}>
            <h3 className="storage-section-title">Connected buckets</h3>
            {isLoading ? (
              <div className="storage-empty">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : connections.length === 0 ? (
              <div className="storage-empty">
                <Database size={22} />
                <span>No storage connected yet</span>
              </div>
            ) : (
              <div className="storage-connection-list">
                {connections.map((connection) => (
                  <div key={connection.id} className="storage-connection-row">
                    <div className="min-w-0">
                      <p className="storage-connection-name">
                        {connection.displayName || connection.bucketName}
                      </p>
                      <p className="storage-connection-meta">
                        {connection.providerName} - {connection.config.region || "auto"} -{" "}
                        {connection.bucketName}
                      </p>
                      <div className="storage-connection-status-line">
                        <span
                          className={`storage-mini-status storage-mini-status-${connection.status}`}
                        >
                          {connection.status}
                        </span>
                        <small>{connection.statusMessage}</small>
                      </div>
                    </div>
                    <button
                      onClick={() => startEdit(connection)}
                      className="storage-edit-button"
                      aria-label={`Edit ${connection.bucketName}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => deleteConnection.mutate(connection.id)}
                      disabled={deleteConnection.isPending}
                      className="storage-delete-button"
                      aria-label={`Remove ${connection.bucketName}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                {isFetchingNextPage && (
                  <div className="storage-list-loading">
                    <Loader2 size={16} className="animate-spin" />
                    Loading more
                  </div>
                )}
              </div>
            )}
          </section>

          <form className="storage-form" onSubmit={submit}>
            <div className="storage-form-heading">
              <h3 className="storage-section-title">
                {editingConnection ? "Edit storage connection" : "Add S3-compatible storage"}
              </h3>
              {editingConnection && (
                <button type="button" onClick={cancelEdit} className="storage-cancel-edit">
                  Cancel edit
                </button>
              )}
            </div>
            <div className="storage-provider-picker">
              <span>Provider</span>
              <div className="storage-provider-grid">
                {PROVIDERS.map((provider) => (
                  <button
                    key={provider.value}
                    type="button"
                    onClick={() => updateProvider(provider.value)}
                    className={`storage-provider-card ${
                      form.provider === provider.value ? "storage-provider-card-active" : ""
                    }`}
                  >
                    <strong>{provider.label}</strong>
                    <small>{provider.description}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="storage-form-grid">
              <label>
                <span>Account name</span>
                <input
                  value={form.displayName}
                  onChange={(e) => update("displayName", e.target.value)}
                  placeholder={`Actual ${providerLabel} account name`}
                />
              </label>
              <label>
                <span>Bucket name</span>
                <input
                  value={form.bucketName}
                  onChange={(e) => update("bucketName", e.target.value)}
                  placeholder="my-storage-bucket"
                  pattern={
                    form.provider === "storj"
                      ? "^[a-z0-9](?:[a-z0-9\-]{1,61})[a-z0-9]$"
                      : "^[a-z0-9](?:[a-z0-9.\-]{1,61})[a-z0-9]$"
                  }
                  title={
                    form.provider === "storj"
                      ? "Use 3-63 lowercase letters, numbers, and hyphens."
                      : "Use 3-63 lowercase letters, numbers, dots, and hyphens."
                  }
                  required
                />
              </label>
              <label>
                <span>Region</span>
                <RegionSelect
                  value={form.region}
                  options={REGION_OPTIONS[form.provider]}
                  onChange={(value) => update("region", value)}
                />
              </label>
              <label>
                <span>Endpoint URL</span>
                <input
                  value={form.endpointUrl}
                  onChange={(e) => update("endpointUrl", e.target.value)}
                  placeholder={currentProvider.endpointHint}
                />
              </label>
              <label>
                <span>Access key ID</span>
                <input
                  value={form.accessKeyId}
                  onChange={(e) => update("accessKeyId", e.target.value)}
                  autoComplete="off"
                  required
                />
              </label>
              <label>
                <span>Secret access key</span>
                <input
                  value={form.secretAccessKey}
                  onChange={(e) => update("secretAccessKey", e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder={editingConnection ? "Leave blank to keep existing secret" : ""}
                  required={!editingConnection}
                />
              </label>
              {form.provider === "cloudflare-r2" && (
                <label>
                  <span>Account ID</span>
                  <input
                    value={form.accountId}
                    onChange={(e) => update("accountId", e.target.value)}
                    placeholder="Cloudflare account ID"
                  />
                </label>
              )}
              {form.provider === "supabase" && (
                <label>
                  <span>Project ref</span>
                  <input
                    value={form.projectRef}
                    onChange={(e) => update("projectRef", e.target.value)}
                    placeholder="abcdefghijklmnopqrst"
                  />
                </label>
              )}
            </div>
              <label>
                <span>Storage quota (GB) <em style={{ fontStyle: "normal", opacity: 0.6 }}>(optional)</em></span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={form.quotaGb ?? ""}
                  onChange={(e) =>
                    update("quotaGb", e.target.value ? parseFloat(e.target.value) : undefined)
                  }
                  placeholder="e.g. 25"
                />
              </label>
            <label className="storage-checkbox">
              <input
                type="checkbox"
                checked={!!form.forcePathStyle}
                disabled={form.provider !== "s3"}
                onChange={(e) => update("forcePathStyle", e.target.checked)}
              />
              <span>Use path-style bucket URLs</span>
            </label>
            <button
              type="submit"
              disabled={createConnection.isPending || updateConnection.isPending}
              className="storage-submit-button"
            >
              {createConnection.isPending || updateConnection.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : editingConnection ? (
                <Pencil size={15} />
              ) : (
                <Plus size={15} />
              )}
              {editingConnection ? "Save changes" : "Connect storage"}
            </button>
          </form>
        </div>
      </div>

      {showSaved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold">Settings saved</h3>
            <p className="mt-2 text-sm text-slate-600">Storage connection saved successfully.</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowSaved(false);
                  onClose();
                }}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
