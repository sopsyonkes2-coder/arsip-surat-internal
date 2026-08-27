"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Archive,
  PlusCircle,
  Files,
  Users,
  Settings,
  LogOut,
  X,
} from "lucide-react";

interface SidebarProps {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
}

type Role = "Admin" | "Tamu";

const menuItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Arsip Surat",
    href: "/arsip",
    icon: Archive,
  },
  {
    label: "Tambah Arsip",
    href: "/arsip/tambah",
    icon: PlusCircle,
  },
  {
    label: "Arsip Massal",
    href: "/arsip/tambah-massal",
    icon: Files,
  },
];

const adminItems = [
  {
    label: "Pengguna",
    href: "/pengguna",
    icon: Users,
  },
  {
    label: "Pengaturan",
    href: "/pengaturan",
    icon: Settings,
  },
];

export default function Sidebar({
  open,
  collapsed,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<Role>("Tamu");

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { data?: { role?: Role } }) => {
        if (result.data?.role) setRole(result.data.role);
      })
      .catch(() => undefined);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }

    return pathname.startsWith(href);
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-50 flex h-screen flex-col
          border-r border-slate-200 bg-white
          transition-transform duration-300
          lg:translate-x-0
          ${collapsed ? "lg:w-20" : "lg:w-72"}
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* LOGO */}
        <div className={`flex h-20 items-center border-b border-slate-200 ${collapsed ? "justify-center px-2" : "justify-between px-5"}`}>
          <Link
            href="/dashboard"
            className="flex items-center gap-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Archive size={23} />
            </div>

            <div className={collapsed ? "hidden" : ""}>
              <h1 className="text-sm font-bold text-slate-900">
                ARSIP SURAT
              </h1>

              <p className="text-[10px] font-medium text-slate-500">
                STAF OPERASI YONKES 2
              </p>
            </div>
          </Link>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* MENU */}
        <nav className="flex-1 overflow-y-auto px-4 py-5">
          <p className={`mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${collapsed ? "hidden" : ""}`}>
            Menu Utama
          </p>

          <div className="space-y-1">
            {menuItems.filter((item) => role === "Admin" || (item.href !== "/arsip/tambah" && item.href !== "/arsip/tambah-massal")).map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`
                    flex items-center rounded-xl px-3 py-3
                    text-sm font-medium transition
                    ${collapsed ? "justify-center" : "gap-3"}
                    ${
                      active
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }
                  `}
                >
                  <Icon
                    size={19}
                    className={
                      active
                        ? "text-blue-600"
                        : "text-slate-400"
                    }
                  />

                  <span className={collapsed ? "sr-only" : ""}>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <p className={`mb-3 mt-8 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${collapsed ? "hidden" : ""}`}>
            Administrasi
          </p>

          <div className="space-y-1">
            {role === "Admin" && adminItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`
                    flex items-center rounded-xl px-3 py-3
                    text-sm font-medium transition
                    ${collapsed ? "justify-center" : "gap-3"}
                    ${
                      active
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }
                  `}
                >
                  <Icon
                    size={19}
                    className={
                      active
                        ? "text-blue-600"
                        : "text-slate-400"
                    }
                  />

                  <span className={collapsed ? "sr-only" : ""}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* USER */}
        <div className="border-t border-slate-200 p-4">
          <div className={`mb-3 flex items-center rounded-xl bg-slate-50 p-3 ${collapsed ? "justify-center" : "gap-3"}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
              {role === "Tamu" ? "T" : "A"}
            </div>

            <div className={`min-w-0 flex-1 ${collapsed ? "hidden" : ""}`}>
              <p className="truncate text-sm font-semibold text-slate-900">
                {role === "Tamu" ? "Tamu" : "Administrator"}
              </p>

              <p className="text-xs text-slate-500">
                {role}
              </p>
            </div>
          </div>

          <button onClick={handleLogout} title={collapsed ? "Keluar" : undefined} className={`flex w-full items-center rounded-xl px-3 py-3 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600 ${collapsed ? "justify-center" : "gap-3"}`}>
            <LogOut size={19} />
            <span className={collapsed ? "sr-only" : ""}>Keluar</span>
          </button>
        </div>
      </aside>
    </>
  );
}