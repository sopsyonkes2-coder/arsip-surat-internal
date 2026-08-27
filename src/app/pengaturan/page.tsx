"use client";

import { ChangeEvent, useEffect, useState } from "react";
import Image from "next/image";
import { ImagePlus, Save, Settings } from "lucide-react";

const defaults = { description: "Aplikasi internal untuk pengelolaan arsip surat.", theme: "light", color: "#2563eb", logo: "" };

export default function PengaturanPage() {
  const [settings, setSettings] = useState(() => {
    if (typeof window === "undefined") return defaults;
    const stored = window.localStorage.getItem("arsip-settings");
    if (!stored) return defaults;
    try {
      return { ...defaults, ...(JSON.parse(stored) as Partial<typeof defaults>) };
    } catch {
      return defaults;
    }
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty("--primary", settings.color);
  }, [settings]);

  const updateLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSettings((current) => ({ ...current, logo: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const save = () => {
    window.localStorage.setItem("arsip-settings", JSON.stringify(settings));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><p className="text-sm font-medium text-blue-600">Administrasi</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Pengaturan</h1></div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3"><Settings className="text-blue-600" size={22} /><h2 className="font-semibold text-slate-900">Tampilan Aplikasi</h2></div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 md:col-span-2">Deskripsi aplikasi<textarea value={settings.description} onChange={(event) => setSettings({ ...settings, description: event.target.value })} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-blue-500" /></label>
          <label className="text-sm font-medium text-slate-700">Mode warna<select value={settings.theme} onChange={(event) => setSettings({ ...settings, theme: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none"><option value="light">Terang</option><option value="dark">Gelap</option></select></label>
          <label className="text-sm font-medium text-slate-700">Warna tema<div className="mt-2 flex h-11 items-center gap-3 rounded-xl border border-slate-200 px-3"><input type="color" value={settings.color} onChange={(event) => setSettings({ ...settings, color: event.target.value })} className="h-7 w-10 cursor-pointer" /><span className="font-normal text-slate-500">{settings.color}</span></div></label>
          <div className="md:col-span-2"><p className="text-sm font-medium text-slate-700">Logo aplikasi</p><label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"><ImagePlus size={17} /> Pilih Logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={updateLogo} className="hidden" /></label>{settings.logo && <Image src={settings.logo} alt="Preview logo aplikasi" width={64} height={64} unoptimized className="mt-3 h-16 w-16 rounded-xl border border-slate-200 object-contain" />}</div>
        </div>
        <button type="button" onClick={save} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"><Save size={17} /> {saved ? "Tersimpan" : "Simpan Tampilan"}</button>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-semibold text-slate-900">Status Integrasi</h2><p className="mt-3 text-sm text-slate-500">Status Google Drive dan Google Sheets diperiksa oleh server saat operasi arsip dilakukan.</p></section>
    </div>
  );
}
