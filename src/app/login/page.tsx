"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronLeft,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Inbox,
  LockKeyhole,
  Mail,
  SearchCheck,
  Send,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ============================================================
  // PANEL LOGIN
  // FALSE = tersembunyi
  // TRUE  = muncul
  // ============================================================

  const [showLogin, setShowLogin] = useState(false);

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
  // ROLE OTOMATIS DARI SISTEM
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
          username: username.trim(),
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

      /*
       * Role tidak dipilih dari halaman login.
       *
       * Admin / Operator ditentukan otomatis
       * berdasarkan data pengguna yang tersimpan
       * pada sistem.
       */

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
    <main className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* ======================================================
          BACKGROUND
      ====================================================== */}

      <div className="pointer-events-none absolute inset-0">
        {/* Grid */}

        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />

        {/* Blue glow */}

        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-600/30 blur-3xl" />

        {/* Cyan glow */}

        <div className="absolute left-[35%] top-[20%] h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

        {/* Green glow */}

        <div className="absolute -bottom-40 -right-32 h-[30rem] w-[30rem] rounded-full bg-emerald-500/20 blur-3xl" />
      </div>

      {/* ======================================================
          MAIN FULL SCREEN
      ====================================================== */}

      <div className="relative min-h-screen w-full overflow-hidden">
        {/* ====================================================
            PANEL UTAMA / ALUR SURAT
        ==================================================== */}

        <section
          className={`
            relative min-h-screen w-full
            overflow-hidden
            bg-gradient-to-br from-blue-800 via-blue-700 to-blue-950
            text-white
            transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
            ${
              showLogin
                ? "lg:pr-[430px] xl:pr-[500px]"
                : ""
            }
          `}
        >
          {/* ==================================================
              DECORATIVE SHAPES
          ================================================== */}

          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[38px] border-white/5" />

          <div className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full border-[42px] border-emerald-400/10" />

          <div className="pointer-events-none absolute right-[25%] top-[45%] h-72 w-72 rounded-full bg-cyan-400/5 blur-3xl" />

          {/* ==================================================
              CONTENT
          ================================================== */}

          <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] items-center px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
            <div className="w-full">
              {/* ==================================================
                  BRAND
              ================================================== */}

              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-lg shadow-blue-950/20">
                  <Archive
                    size={25}
                    className="text-blue-700"
                  />
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-blue-200">
                    Sistem Informasi
                  </p>

                  <p className="text-lg font-bold tracking-tight">
                    Arsip Surat
                  </p>
                </div>
              </div>

              {/* ==================================================
                  HERO
              ================================================== */}

              <div className="mt-8 max-w-3xl lg:mt-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />

                  Sistem Arsip Surat Masuk
                </div>

                <h1 className="mt-4 text-4xl font-black uppercase leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
                  ALUR
                  <br />
                  SURAT MASUK
                </h1>

                <div className="mt-4 inline-flex rounded-full bg-gradient-to-r from-emerald-500 to-green-500 px-5 py-2.5 shadow-lg shadow-emerald-950/20">
                  <span className="text-sm font-black uppercase tracking-[0.22em] text-white sm:text-base">
                    Staf Operasi
                  </span>
                </div>

                <p className="mt-4 text-sm font-bold uppercase tracking-[0.16em] text-blue-100 sm:text-base">
                  Tertib – Cepat – Tepat – Terdokumentasi
                </p>

                <p className="mt-4 max-w-2xl text-sm leading-7 text-blue-100/90">
                  Setiap surat masuk diterima, dibaca,
                  ditindaklanjuti, diverifikasi, dan
                  diarsipkan secara tertib agar mudah
                  ditemukan dan ditelusuri kapan saja.
                </p>
              </div>

              {/* ==================================================
                  FLOW
              ================================================== */}

              <div className="mt-7 grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:mt-8">
                <FlowItem
                  number="01"
                  icon={<Mail size={18} />}
                  title="Surat Datang"
                  description="Surat diterima dari satuan, instansi, atau pihak eksternal."
                />

                <FlowItem
                  number="02"
                  icon={<Inbox size={18} />}
                  title="Diterima"
                  description="Surat dicatat sebagai surat masuk dan diberi tanda terima."
                />

                <FlowItem
                  number="03"
                  icon={<FileText size={18} />}
                  title="Dibaca"
                  description="Isi surat, perintah, atau informasi dipahami."
                />

                <FlowItem
                  number="04"
                  icon={<SearchCheck size={18} />}
                  title="Cek Pelaksanaan"
                  description="Periksa apakah surat atau instruksi sudah dilaksanakan."
                />

                <FlowItem
                  number="05"
                  icon={<Send size={18} />}
                  title="Disampaikan"
                  description="Informasi diteruskan kepada pihak yang berkepentingan."
                />

                <FlowItem
                  number="06"
                  icon={<FileCheck2 size={18} />}
                  title="Diverifikasi"
                  description="Surat dinyatakan selesai setelah pengecekan."
                />
              </div>

              {/* ==================================================
                  ARCHIVE FINAL
              ================================================== */}

              <div className="mt-3 flex max-w-5xl items-center gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-950/20">
                  <Archive size={21} />
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">
                    07 — Arsipkan ke Web
                  </p>

                  <p className="mt-0.5 text-xs leading-5 text-emerald-100">
                    Data dan dokumen tersimpan secara
                    terstruktur dalam sistem arsip online.
                  </p>
                </div>

                <Check
                  size={22}
                  className="ml-auto shrink-0 text-emerald-300"
                />
              </div>

              {/* ==================================================
                  FOOTER
              ================================================== */}

              <div className="mt-6 max-w-5xl border-t border-white/10 pt-4">
                <p className="text-center text-xs font-bold uppercase tracking-[0.12em] text-blue-200 sm:text-left">
                  Arsip hari ini, bukti untuk esok hari
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================
            TOMBOL BUKA LOGIN
        ====================================================== */}

        {!showLogin && (
          <button
            type="button"
            onClick={() => {
              setShowLogin(true);
              setError("");
            }}
            aria-label="Buka halaman login"
            className="
              group
              fixed
              right-0
              top-1/2
              z-40
              flex
              -translate-y-1/2
              items-center
              gap-2
              rounded-l-2xl
              border
              border-white/20
              bg-white
              px-3
              py-4
              text-blue-700
              shadow-2xl
              shadow-black/30
              transition-all
              duration-300
              hover:-translate-x-1
              hover:px-4
              hover:text-blue-900
              focus:outline-none
              focus:ring-4
              focus:ring-blue-400/40
            "
          >
            <div className="flex flex-col items-center">
              <ChevronLeft
                size={24}
                className="
                  animate-pulse
                  transition-transform
                  duration-300
                  group-hover:-translate-x-1
                "
              />

              <span className="mt-1 text-[9px] font-black uppercase tracking-wider">
                Login
              </span>
            </div>
          </button>
        )}

        {/* ======================================================
            PANEL LOGIN
        ====================================================== */}

        <aside
          className={`
            fixed
            right-0
            top-0
            z-30
            h-screen
            w-full
            max-w-[520px]
            bg-white
            shadow-[-20px_0_60px_rgba(0,0,0,0.25)]
            transition-transform
            duration-700
            ease-[cubic-bezier(0.22,1,0.36,1)]
            ${
              showLogin
                ? "translate-x-0"
                : "translate-x-full"
            }
          `}
        >
          {/* ==================================================
              TOP ACCENT
          ================================================== */}

          <div className="absolute left-0 right-0 top-0 h-1.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500" />

          {/* ==================================================
              CLOSE BUTTON
          ================================================== */}

          <button
            type="button"
            onClick={() => {
              setShowLogin(false);
              setError("");
            }}
            aria-label="Tutup halaman login"
            className="
              absolute
              left-0
              top-1/2
              z-50
              flex
              h-14
              w-10
              -translate-x-full
              -translate-y-1/2
              items-center
              justify-center
              rounded-l-xl
              bg-white
              text-slate-500
              shadow-[-8px_0_20px_rgba(0,0,0,0.10)]
              transition-all
              duration-200
              hover:w-12
              hover:text-blue-600
              focus:outline-none
              focus:ring-4
              focus:ring-blue-100
            "
          >
            <ArrowLeft size={20} />
          </button>

          {/* ==================================================
              LOGIN SCROLL AREA
          ================================================== */}

          <div className="h-full overflow-y-auto px-6 py-8 sm:px-10 sm:py-10">
            <div className="mx-auto max-w-md">
              {/* ==================================================
                  HEADER
              ================================================== */}

              <div className="pt-2">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100">
                  <ShieldCheck size={28} />
                </div>

                <p className="mt-7 text-xs font-bold uppercase tracking-[0.22em] text-blue-600">
                  Akses Staf Operasi
                </p>

                <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                  Selamat datang
                </h2>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Masuk untuk mengelola dan mengakses
                  arsip surat sesuai kewenangan Anda.
                </p>
              </div>

              {/* ==================================================
                  LOGIN INFO
              ================================================== */}

              <div className="mt-7 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-4">
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                    <LockKeyhole size={17} />
                  </div>

                  <div>
                    <p className="text-sm font-bold text-blue-950">
                      Login Staf
                    </p>

                    <p className="mt-1 text-xs leading-5 text-blue-700">
                      Masukkan username atau NRP dan
                      password yang telah terdaftar.
                    </p>

                    <p className="mt-1 text-xs font-semibold text-blue-800">
                      Hak akses ditentukan otomatis oleh
                      sistem.
                    </p>
                  </div>
                </div>
              </div>

              {/* ==================================================
                  ERROR
              ================================================== */}

              {error && (
                <div
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* ==================================================
                  FORM
              ================================================== */}

              <form
                onSubmit={handleSubmit}
                className="mt-7 space-y-5"
              >
                {/* Username */}

                <div>
                  <label
                    htmlFor="username"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    Username / NRP
                  </label>

                  <div className="relative mt-2">
                    <div className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-slate-400">
                      <UsersRound size={18} />
                    </div>

                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(event) =>
                        setUsername(event.target.value)
                      }
                      placeholder="Masukkan username atau NRP"
                      autoComplete="username"
                      required
                      disabled={loading}
                      className="
                        h-12
                        w-full
                        rounded-xl
                        border
                        border-slate-200
                        bg-white
                        pl-10
                        pr-3
                        text-sm
                        text-slate-800
                        outline-none
                        transition
                        placeholder:text-slate-400
                        focus:border-blue-500
                        focus:ring-4
                        focus:ring-blue-100
                        disabled:cursor-not-allowed
                        disabled:bg-slate-50
                      "
                    />
                  </div>
                </div>

                {/* Password */}

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    Password
                  </label>

                  <div className="relative mt-2">
                    <div className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-slate-400">
                      <LockKeyhole size={18} />
                    </div>

                    <input
                      id="password"
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
                      className="
                        h-12
                        w-full
                        rounded-xl
                        border
                        border-slate-200
                        bg-white
                        pl-10
                        pr-12
                        text-sm
                        text-slate-800
                        outline-none
                        transition
                        placeholder:text-slate-400
                        focus:border-blue-500
                        focus:ring-4
                        focus:ring-blue-100
                        disabled:cursor-not-allowed
                        disabled:bg-slate-50
                      "
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          (value) => !value
                        )
                      }
                      disabled={loading}
                      className="
                        absolute
                        right-2
                        top-1/2
                        flex
                        -translate-y-1/2
                        items-center
                        justify-center
                        rounded-lg
                        p-2
                        text-slate-400
                        transition
                        hover:bg-slate-100
                        hover:text-slate-600
                        disabled:opacity-50
                      "
                      aria-label={
                        showPassword
                          ? "Sembunyikan password"
                          : "Tampilkan password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Login button */}

                <button
                  type="submit"
                  disabled={loading}
                  className="
                    group
                    flex
                    h-12
                    w-full
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    bg-blue-600
                    px-4
                    text-sm
                    font-bold
                    text-white
                    shadow-lg
                    shadow-blue-600/20
                    transition-all
                    duration-200
                    hover:-translate-y-0.5
                    hover:bg-blue-700
                    hover:shadow-xl
                    hover:shadow-blue-600/25
                    disabled:cursor-not-allowed
                    disabled:translate-y-0
                    disabled:opacity-60
                  "
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />

                      Memverifikasi...
                    </>
                  ) : (
                    <>
                      Masuk ke Sistem

                      <ArrowRight
                        size={18}
                        className="transition-transform duration-200 group-hover:translate-x-1"
                      />
                    </>
                  )}
                </button>
              </form>

              {/* ==================================================
                  DIVIDER
              ================================================== */}

              <div className="my-7 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />

                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  akses lainnya
                </span>

                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {/* ==================================================
                  GUEST
              ================================================== */}

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                    <UsersRound size={20} />
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-bold text-emerald-950">
                      Akses Tamu
                    </p>

                    <p className="mt-1 text-xs leading-5 text-emerald-700">
                      Tidak memiliki akun staf? Anda dapat
                      masuk sebagai tamu untuk melihat
                      informasi yang diperbolehkan.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={loginAsGuest}
                  disabled={loading}
                  className="
                    group
                    mt-4
                    flex
                    h-11
                    w-full
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    border
                    border-emerald-200
                    bg-white
                    px-4
                    text-sm
                    font-bold
                    text-emerald-700
                    transition-all
                    duration-200
                    hover:-translate-y-0.5
                    hover:border-emerald-300
                    hover:bg-emerald-50
                    hover:shadow-md
                    disabled:cursor-not-allowed
                    disabled:translate-y-0
                    disabled:opacity-60
                  "
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
                  SECURITY
              ================================================== */}

              <div className="mt-7 flex items-center justify-center gap-2 border-t border-slate-100 pt-5 text-center text-[11px] text-slate-400">
                <LockKeyhole size={14} />

                <span>
                  Akses terlindungi sesuai kewenangan
                  pengguna
                </span>
              </div>

              {/* ==================================================
                  SMALL FOOTER
              ================================================== */}

              <div className="mt-4 flex items-center justify-center gap-2 pb-5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </div>
            </div>
          </div>
        </aside>

        {/* ======================================================
            MOBILE OVERLAY
        ====================================================== */}

        <div
          className={`
            fixed
            inset-0
            z-20
            bg-slate-950/50
            backdrop-blur-[2px]
            transition-opacity
            duration-500
            ${
              showLogin
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none opacity-0"
            }
            lg:hidden
          `}
          onClick={() => {
            setShowLogin(false);
            setError("");
          }}
        />
      </div>
    </main>
  );
}

/* ================================================================
   FLOW ITEM
================================================================ */

function FlowItem({
  number,
  icon,
  title,
  description,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      className="
        group
        flex
        gap-3
        rounded-2xl
        border
        border-white/10
        bg-white/[0.07]
        p-3.5
        backdrop-blur-sm
        transition-all
        duration-200
        hover:-translate-y-0.5
        hover:border-white/20
        hover:bg-white/10
      "
    >
      <div className="relative flex shrink-0 flex-col items-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-700 shadow-md">
          {icon}
        </div>

        <span className="mt-1 text-[9px] font-black tracking-wider text-blue-200">
          {number}
        </span>
      </div>

      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-bold text-white">
          {title}
        </p>

        <p className="mt-1 text-[11px] leading-5 text-blue-100/75">
          {description}
        </p>
      </div>
    </div>
  );
}