"use client";

import { ReactNode } from "react";
import { Providers as SharedProviders } from "@repo/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787/api";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SharedProviders apiUrl={API_URL}>
      {children}
    </SharedProviders>
  );
}
