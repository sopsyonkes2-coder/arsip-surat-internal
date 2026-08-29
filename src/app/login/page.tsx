"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  UsersRound,
  LockKeyhole,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ============================================================
  // LOGIN TAMU
  // ============================================================

  const loginAsGuest = async () => {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "tamu",
          password: "",
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Login tamu gagal."
        );
      }

      router.push("/dashboard");
      router.refresh();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal masuk sebagai tamu."
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // LOGIN USERNAME + PASSWORD
  // ROLE OTOMATIS DARI GOOGLE SHEET
  // ============================================================

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        data?: {
          role?: string;
          name?: string;
        };
      };

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            "Username atau password salah."
        );
      }

      // Role tidak dipilih dari halaman login.
      // Role otomatis mengikuti data Google Sheet.

      router.push("/dashboard");
      router.refresh();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal masuk ke aplikasi."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-8 sm:px-6">
      {/* ======================================================
          BACKGROUND GRID
      ====================================================== */}

      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(125,211,252,.13) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,.13) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="pointer-events-none absolute -left-24 top-12 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />

      <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-blue-600/30 blur-3xl" />

      {/* ======================================================
          MAIN CARD
      ====================================================== */}

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/15 bg-white shadow-2xl shadow-blue-950/40 lg:grid-cols-[1.05fr_.95fr]">

        {/* ====================================================
            LEFT SIDE
        ==================================================== */}

        <div className="hidden flex-col justify-between bg-gradient-to-br from-blue-700 via-blue-800 to-slate-950 p-10 text-white lg:flex">
          <div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <Archive size={28} />
            </div>

            <p className="mt-12 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
              Ruang kerja internal
            </p>

            <h2 className="mt-4 max-w-md text-4xl font-bold leading-tight">
              Semua surat, tertata dan mudah ditemukan.
            </h2>

            <p className="mt-5 max-w-md text-sm leading-7 text-blue-100">
              Kelola arsip surat masuk dengan pencarian
              cepat, penyimpanan aman, dan akses sesuai
              peran.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-blue-200">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Sistem siap digunakan
          </div>
        </div>

        {/* ====================================================
            RIGHT SIDE
        ==================================================== */}

        <div className="bg-white p-6 sm:p-10">

          {/* Mobile Logo */}

          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
              <Archive size={24} />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                Sistem Informasi
              </p>

              <h1 className="text-xl font-bold text-slate-900">
                Arsip Surat
              </h1>
            </div>
          </div>

          {/* ==================================================
              HEADER
          ================================================== */}

          <div className="mt-7 lg:mt-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
              Selamat datang
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Masuk ke arsip surat
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Gunakan akun Anda untuk mengakses sistem.
            </p>
          </div>

          {/* ==================================================
              INFO LOGIN STAF
          ================================================== */}

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <ShieldCheck
              size={20}
              className="mt-0.5 shrink-0 text-blue-600"
            />

            <div>
              <p className="text-sm font-semibold text-blue-900">
                Login Staf
              </p>

              <p className="mt-1 text-xs leading-5 text-blue-700">
                Masukkan username dan password yang telah
                terdaftar. Hak akses Admin atau Operator
                ditentukan otomatis oleh sistem.
              </p>
            </div>
          </div>

          {/* ==================================================
              ERROR
          ================================================== */}

          {error && (
            <div
              className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* ==================================================
              LOGIN FORM
          ================================================== */}

          <form
            onSubmit={handleSubmit}
            className="mt-6 space-y-4"
          >
            {/* Username */}

            <label className="block text-sm font-medium text-slate-700">
              Username / NRP

              <input
                type="text"
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value)
                }
                placeholder="Masukkan username atau NRP"
                autoComplete="username"
                required
                disabled={loading}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
            </label>

            {/* Password */}

            <label className="block text-sm font-medium text-slate-700">
              Password

              <div className="relative mt-2">
                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pr-11 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (value) => !value
                    )
                  }
                  disabled={loading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                  aria-label={
                    showPassword
                      ? "Sembunyikan password"
                      : "Tampilkan password"
                  }
                >
                  {showPassword ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </div>
            </label>

            {/* Login */}

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition-all duration-200 hover:bg-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Memverifikasi...
                </>
              ) : (
                <>
                  Masuk

                  <ArrowRight
                    size={17}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </>
              )}
            </button>
          </form>

          {/* ==================================================
              PEMISAH
          ================================================== */}

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />

            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              atau
            </span>

            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* ==================================================
              TAMU
          ================================================== */}

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <UsersRound size={20} />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-900">
                  Tidak memiliki akun staf?
                </p>

                <p className="mt-1 text-xs leading-5 text-emerald-700">
                  Masuk sebagai tamu tanpa username dan
                  password.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={loginAsGuest}
              disabled={loading}
              className="group mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 transition-all duration-200 hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                  Menyiapkan akses...
                </>
              ) : (
                <>
                  <UsersRound size={17} />

                  Masuk sebagai Tamu

                  <ArrowRight
                    size={16}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </>
              )}
            </button>
          </div>

          {/* ==================================================
              FOOTER
          ================================================== */}

          <div className="mt-7 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
              <LockKeyhole size={14} />

              <span>
                Akses terlindungi sesuai kewenangan pengguna
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}