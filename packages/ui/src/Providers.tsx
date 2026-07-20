"use client";

import { ReactNode } from "react";
import { QueryProvider } from "./QueryProvider";
import { AuthProvider } from "./AuthContext";
import { ToastProvider } from "./Toast";

type ProvidersProps = {
  /** Base API URL forwarded to AuthProvider, e.g. process.env.NEXT_PUBLIC_API_URL */
  apiUrl: string;
  children: ReactNode;
};

export function Providers({ apiUrl, children }: ProvidersProps) {
  return (
    <QueryProvider>
      <AuthProvider apiUrl={apiUrl}>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
