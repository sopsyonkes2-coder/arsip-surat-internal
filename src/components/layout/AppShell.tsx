"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar open={sidebarOpen} collapsed={sidebarCollapsed} onClose={() => setSidebarOpen(false)} />
      <div className={sidebarCollapsed ? "lg:pl-20" : "lg:pl-72"}>
        <Header onMenuClick={() => setSidebarOpen(true)} onToggleSidebar={() => setSidebarCollapsed((value) => !value)} sidebarCollapsed={sidebarCollapsed} />
        <main className="min-h-[calc(100vh-5rem)] p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}