"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Menu,
  Search,
  UserCircle,
} from "lucide-react";

interface HeaderProps {
  onMenuClick: () => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}

export default function Header({
  onMenuClick,
  onToggleSidebar,
  sidebarCollapsed,
}: HeaderProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [identity, setIdentity] = useState({ username: "", role: "" });

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { data?: { username?: string; role?: string } }) => {
        if (result.data) setIdentity({ username: result.data.username || "", role: result.data.role || "" });
      })
      .catch(() => undefined);
  }, []);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = search.trim();
    router.push(value ? `/arsip?search=${encodeURIComponent(value)}` : "/arsip");
  };

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-6 lg:px-8">
      
      {/* Kiri */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-xl p-2.5 text-slate-600 transition hover:bg-slate-100 lg:hidden"
          aria-label="Buka menu"
        >
          <Menu size={22} />
        </button>
        <button type="button" onClick={onToggleSidebar} className="hidden rounded-xl p-2.5 text-slate-600 transition hover:bg-slate-100 lg:block" aria-label={sidebarCollapsed ? "Buka sidebar" : "Tutup sidebar"} title={sidebarCollapsed ? "Buka sidebar" : "Tutup sidebar"}>
          <Menu size={22} />
        </button>

        <div className="hidden md:block">
          <p className="text-xs font-medium text-slate-400">
            SISTEM INFORMASI
          </p>

          <h2 className="text-sm font-semibold text-slate-800">
            Arsip Surat Masuk
          </h2>
        </div>
      </div>

      {/* Kanan */}
      <div className="flex items-center gap-2 md:gap-4">
        
        {/* Search */}
        <form onSubmit={submitSearch} className="relative hidden sm:block">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari arsip..." aria-label="Cari arsip" className="h-10 w-44 rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-500 md:w-56" />
        </form>

        {/* Notifikasi */}
        <button
          type="button"
          onClick={() => setNotificationsOpen((open) => !open)}
          className="relative rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100"
          aria-label="Notifikasi"
        >
          <Bell size={20} />

          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
        </button>

        {notificationsOpen && <div className="absolute right-20 top-16 z-50 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-lg"><p className="text-sm font-semibold text-slate-900">Notifikasi</p><p className="mt-3 text-sm text-slate-500">Belum ada notifikasi baru.</p></div>}

        <div className="hidden h-8 w-px bg-slate-200 sm:block" />

        {/* User */}
        <div className="relative">
        <button type="button" onClick={() => setProfileOpen((open) => !open)} className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-slate-50" aria-label="Buka menu profil">
          <UserCircle
            size={31}
            className="text-blue-600"
          />

          <div className="hidden text-left md:block">
            <p className="text-xs font-semibold text-slate-800">
              {identity.username || "Pengguna"}
            </p>

            <p className="text-[11px] text-slate-500">
              {identity.role || ""}
            </p>
          </div>
        </button>
        {profileOpen && <div className="absolute right-0 top-12 z-50 w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"><button type="button" onClick={() => router.push("/pengaturan")} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">Pengaturan</button><button type="button" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">Keluar</button></div>}
        </div>
      </div>
    </header>
  );
}