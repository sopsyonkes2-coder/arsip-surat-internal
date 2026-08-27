"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowRight, Eye, EyeOff, ShieldCheck, UserRound, UsersRound } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginRole, setLoginRole] = useState<"Admin" | "Tamu">("Admin");

  const loginAsGuest = async () => {
    setUsername("tamu");
    setPassword("");
    setLoading(true);
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "tamu" }) });
    const result = (await response.json()) as { success?: boolean; message?: string };
    if (!response.ok || !result.success) setError(result.message || "Login tamu gagal.");
    else router.push("/dashboard");
    setLoading(false);
  };

  const chooseRole = (role: "Admin" | "Tamu") => {
    setLoginRole(role);
    setError("");
    if (role === "Tamu") void loginAsGuest();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const result = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !result.success) throw new Error(result.message || "Username atau password salah.");
      router.push("/dashboard");
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Gagal masuk ke aplikasi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(rgba(125,211,252,.13) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,.13) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <div className="pointer-events-none absolute -left-24 top-12 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-blue-600/30 blur-3xl" />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/15 bg-white shadow-2xl shadow-blue-950/40 lg:grid-cols-[1.05fr_.95fr]">
        <div className="hidden flex-col justify-between bg-gradient-to-br from-blue-700 via-blue-800 to-slate-950 p-10 text-white lg:flex">
          <div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"><Archive size={28} /></div>
            <p className="mt-12 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Ruang kerja internal</p>
            <h2 className="mt-4 max-w-md text-4xl font-bold leading-tight">Semua surat, tertata dan mudah ditemukan.</h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-blue-100">Kelola arsip surat masuk dengan pencarian cepat, penyimpanan aman, dan akses sesuai peran.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-blue-200"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Sistem siap digunakan</div>
        </div>

        <div className="bg-white p-6 sm:p-10">
        <div className="flex items-center gap-3 lg:hidden">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/25"><Archive size={24} /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Sistem Informasi</p>
            <h1 className="text-xl font-bold text-slate-900">Arsip Surat</h1>
          </div>
        </div>

        <div className="mt-2 lg:mt-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Selamat datang</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Masuk ke arsip surat</h1>
          <p className="mt-2 text-sm text-slate-500">Pilih jenis akses untuk melanjutkan.</p>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex gap-3">
            <ShieldCheck size={20} className="mt-0.5 shrink-0 text-blue-600" />
            <p className="text-sm leading-6 text-blue-900">
              Admin menggunakan password. Tamu dapat masuk tanpa password.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => chooseRole("Admin")} className={`rounded-2xl border p-4 text-left transition ${loginRole === "Admin" ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 hover:border-blue-200 hover:bg-slate-50"}`}><UserRound size={20} className="text-blue-600" /><span className="mt-2 block text-sm font-semibold text-slate-800">Admin</span><span className="mt-1 block text-xs text-slate-500">Dengan password</span></button>
          <button type="button" onClick={() => chooseRole("Tamu")} disabled={loading} className={`rounded-2xl border p-4 text-left transition ${loginRole === "Tamu" ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-slate-200 hover:border-emerald-200 hover:bg-slate-50"}`}><UsersRound size={20} className="text-emerald-600" /><span className="mt-2 block text-sm font-semibold text-slate-800">Tamu</span><span className="mt-1 block text-xs text-slate-500">Tanpa password</span></button>
        </div>
        {loginRole === "Admin" && <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">Username / NRP<input value={username} onChange={(event) => setUsername(event.target.value)} required className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500" /></label>
          <label className="block text-sm font-medium text-slate-700">Password<div className="relative mt-2"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required className="h-11 w-full rounded-xl border border-slate-200 px-3 pr-11 outline-none focus:border-blue-500" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          <button type="submit" disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{loading ? "Masuk..." : "Masuk"} {!loading && <ArrowRight size={17} />}</button>
        </form>
        }
        {loginRole === "Tamu" && loading && <p className="mt-6 text-center text-sm text-slate-500">Menyiapkan akses tamu...</p>}
        {loginRole === "Tamu" && error && <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <p className="mt-8 text-center text-xs text-slate-400">Akses terlindungi untuk staf internal.</p>
        </div>
      </section>
    </main>
  );
}