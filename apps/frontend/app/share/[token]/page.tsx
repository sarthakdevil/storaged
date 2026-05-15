"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { Download, FileText, Loader2, AlertCircle, Eye } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

type ShareData = {
  url: string;
  name: string;
  mimeType: string | null;
  sizeBytes: string;
};

function formatSize(bytes: string): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/share/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { message?: string }).message ?? "Link not found");
        }
        return res.json() as Promise<ShareData>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 sm:p-12 font-sans">
      <div className="w-full max-w-2xl flex flex-col items-center">
        
        {/* Brand */}
        <div className="flex items-center gap-4 mb-12">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Download size={28} className="text-white" />
          </div>
          <span className="font-extrabold text-3xl text-slate-800 tracking-tight">Storaged</span>
        </div>

        {/* Card */}
        <div className="w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          {loading && (
            <div className="flex flex-col items-center justify-center py-32 gap-6">
              <Loader2 size={40} className="animate-spin text-indigo-500" />
              <p className="text-lg font-medium text-slate-500">Retrieving file details…</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-32 gap-6 px-8 text-center bg-red-50/50">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle size={40} className="text-red-500" />
              </div>
              <div className="max-w-md">
                <p className="font-bold text-slate-900 text-2xl mb-3">Link unavailable</p>
                <p className="text-slate-600 text-base">{error}</p>
              </div>
            </div>
          )}

          {data && (
            <div className="flex flex-col">
              {/* Top Section: File Info */}
              <div className="p-12 flex flex-col items-center text-center border-b border-slate-100">
                <div className="w-24 h-24 bg-indigo-50 rounded-3xl flex items-center justify-center mb-8 shadow-sm">
                  <FileText size={48} className="text-indigo-600" />
                </div>
                
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-6 break-all leading-tight">
                  {data.name}
                </h1>
                
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <span className="bg-slate-100 text-slate-600 px-5 py-2 rounded-xl text-sm font-semibold tracking-wide">
                    {data.mimeType ?? "Unknown type"}
                  </span>
                  <span className="bg-indigo-50 text-indigo-700 px-5 py-2 rounded-xl text-sm font-bold tracking-wide">
                    {formatSize(data.sizeBytes)}
                  </span>
                </div>
              </div>

              {/* Bottom Section: Actions */}
              <div className="p-12 bg-slate-50/50 flex flex-col items-center">
                <div className="w-full max-w-lg flex flex-col sm:flex-row gap-4">
                  <a
                    href={data.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-3 py-4 bg-white border-2 border-indigo-600 text-indigo-700 font-bold text-lg rounded-2xl transition-all shadow-sm hover:bg-indigo-50 hover:-translate-y-1"
                  >
                    <Eye size={24} />
                    View File
                  </a>
                  <a
                    href={data.url}
                    download={data.name}
                    className="flex-1 flex items-center justify-center gap-3 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg rounded-2xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
                  >
                    <Download size={24} />
                    Download File
                  </a>
                </div>
                
                <div className="mt-8 max-w-md w-full bg-white p-5 rounded-2xl border border-slate-200 text-center shadow-sm">
                  <p className="text-sm text-slate-500 leading-relaxed">
                    This file was shared securely via Storaged. <br />
                    The download link will expire in <span className="font-bold text-slate-800">1 hour</span>.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
