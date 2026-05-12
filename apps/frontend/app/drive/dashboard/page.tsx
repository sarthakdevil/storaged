"use client";

import {
  AlertCircle,
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  Pencil,
  Server,
  Trash2,
} from "lucide-react";
import { UIEvent, useMemo, useState } from "react";
import { formatSize } from "../../../components/FileCard";
import { StorageConnectionsModal } from "../../../components/StorageConnectionsModal";
import { StorageConnection } from "../../../lib/api";
import { useDeleteStorageConnection, useStorageDashboard } from "../../../lib/queries";

function unknownSize() {
  return "Not reported";
}

export default function StorageDashboardPage() {
  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useStorageDashboard();
  const deleteConnection = useDeleteStorageConnection();
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [editConnectionId, setEditConnectionId] = useState<string | undefined>();
  const [editConnection, setEditConnection] = useState<StorageConnection | undefined>();
  const summary = data?.pages[0];
  const storages = useMemo(
    () => data?.pages.flatMap((page) => page.storages) ?? [],
    [data],
  );

  function onStorageTableScroll(e: UIEvent<HTMLElement>) {
    const target = e.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceFromBottom < 120 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  return (
    <div className="drive-view flex flex-col h-full">
      <header className="flex items-center gap-3 px-8 py-4 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
          <HardDrive size={18} className="text-indigo-500" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-slate-900">Storage dashboard</h1>
          <p className="text-xs text-slate-500">Connected buckets, usage, and health</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="drive-action-button drive-action-secondary ml-auto"
        >
          {isFetching ? <Loader2 size={15} className="animate-spin" /> : <Server size={15} />}
          Refresh
        </button>
      </header>

      <main className="dashboard-content">
        {isLoading ? (
          <div className="dashboard-state">
            <Loader2 size={28} className="animate-spin text-indigo-500" />
          </div>
        ) : isError || !summary ? (
          <div className="dashboard-state">
            <AlertCircle size={28} className="text-red-500" />
            <p>Could not load storage dashboard.</p>
            <button onClick={() => refetch()} className="text-sm text-indigo-600">
              Try again
            </button>
          </div>
        ) : (
          <>
            <section className="dashboard-stats">
              <div className="dashboard-stat">
                <span>Connected storage</span>
                <strong>{summary.totalStorages}</strong>
                <small>{summary.connectedStorages} reachable on this page</small>
              </div>
              <div className="dashboard-stat">
                <span>Tracked usage</span>
                <strong>{formatSize(summary.usedBytes)}</strong>
                <small>{summary.activeObjects} active objects</small>
              </div>
              <div className="dashboard-stat">
                <span>Total capacity</span>
                <strong>{summary.totalBytes ? formatSize(summary.totalBytes) : unknownSize()}</strong>
                <small>S3 APIs do not expose quota</small>
              </div>
              <div className="dashboard-stat">
                <span>Available space</span>
                <strong>
                  {summary.availableBytes ? formatSize(summary.availableBytes) : unknownSize()}
                </strong>
                <small>Provider managed</small>
              </div>
            </section>

            <section className="dashboard-panel">
              <div className="dashboard-panel-header">
                <h2>All storages</h2>
                <span>{summary.totalObjects} total objects tracked</span>
              </div>

              {storages.length === 0 ? (
                <div className="dashboard-state dashboard-empty">
                  <Database size={28} className="text-slate-400" />
                  <p>No storage buckets connected yet.</p>
                </div>
              ) : (
                <div className="dashboard-storage-table" onScroll={onStorageTableScroll}>
                  <div className="dashboard-storage-head">
                    <span>Storage</span>
                    <span>Status</span>
                    <span>Used</span>
                    <span>Available</span>
                    <span>Objects</span>
                    <span>Actions</span>
                  </div>
                  {storages.map((storage) => (
                    <div key={storage.id} className="dashboard-storage-row">
                      <div className="min-w-0">
                        <p className="dashboard-storage-name">
                          {storage.displayName || storage.bucketName}
                        </p>
                        <p className="dashboard-storage-meta">
                          {storage.providerName} - {storage.config.region || "auto"} -{" "}
                          {storage.bucketName}
                        </p>
                      </div>
                      <div>
                        <span className={`dashboard-status dashboard-status-${storage.status}`}>
                          {storage.status === "connected" || storage.status === "limited" ? (
                            <CheckCircle2 size={14} />
                          ) : (
                            <AlertCircle size={14} />
                          )}
                          {storage.status}
                        </span>
                        <p className="dashboard-status-message">{storage.statusMessage}</p>
                      </div>
                      <div className="dashboard-table-value">{formatSize(storage.usedBytes)}</div>
                      <div className="dashboard-table-value">
                        {storage.availableBytes ? formatSize(storage.availableBytes) : "Unknown"}
                      </div>
                      <div className="dashboard-table-value">{storage.activeObjects}</div>
                      <div className="dashboard-actions">
                        <button
                          onClick={() => {
                            setEditConnectionId(storage.id);
                            setEditConnection(storage);
                            setShowStorageModal(true);
                          }}
                          className="dashboard-icon-button dashboard-edit"
                          aria-label={`Edit ${storage.bucketName}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => deleteConnection.mutate(storage.id)}
                          disabled={deleteConnection.isPending}
                          className="dashboard-icon-button dashboard-delete"
                          aria-label={`Delete ${storage.bucketName}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {isFetchingNextPage && (
                    <div className="dashboard-storage-loading">
                      <Loader2 size={16} className="animate-spin" />
                      Loading more storages
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      {showStorageModal && (
        <StorageConnectionsModal
          initialEditId={editConnectionId}
          initialEditConnection={editConnection}
          onClose={() => {
            setShowStorageModal(false);
            setEditConnectionId(undefined);
            setEditConnection(undefined);
          }}
        />
      )}
    </div>
  );
}
