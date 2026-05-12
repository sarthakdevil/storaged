import { ReactNode } from "react";
import { Sidebar } from "../../components/Sidebar";

export default function DriveLayout({ children }: { children: ReactNode }) {
  return (
    <div className="drive-shell flex h-screen overflow-hidden bg-[#f8fafc]">
      <Sidebar />
      <main className="drive-main flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
