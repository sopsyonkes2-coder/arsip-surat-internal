"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  CalendarDays,
  FileText,
  Inbox,
  TrendingUp,
  Loader2,
  AlertCircle,
  Eye,
} from "lucide-react";

type ArchiveData = {
  nomor: string;
  tanggalInput: string;
  nomorAgenda: string;
  nomorSurat: string;
  tanggalSurat: string;
  tanggalDiterima: string;
  pengirim: string;
  perihal: string;
  klasifikasi: string;
  linkFile: string;
};

type ClassificationKey = "B" | "SE" | "SP" | "ST" | "STR" | "R" | "Brafax" | "Lainnya";

type ClassificationStyle = {
  bar: string;
  bg: string;
  text: string;
};

type DateParts = {
  year: number;
  month: number; // 1-12
  day: number;
};

const ALL_YEARS_LABEL = "Semua Tahun";
const ALL_MONTHS_LABEL = "Semua Bulan";
const ALL_CLASSIFICATIONS_LABEL = "Semua Klasifikasi";

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000; // WIB = UTC+7

const months = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const classificationColors: Record<ClassificationKey, ClassificationStyle> = {
  B: {
    bar: "bg-blue-500",
    bg: "bg-blue-50",
    text: "text-blue-700",
  },
  SE: {
    bar: "bg-indigo-500",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
  },
  SP: {
    bar: "bg-cyan-500",
    bg: "bg-cyan-50",
    text: "text-cyan-700",
  },
  ST: {
    bar: "bg-emerald-500",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
  },
  STR: {
    bar: "bg-amber-500",
    bg: "bg-amber-50",
    text: "text-amber-700",
  },
  R: {
    bar: "bg-rose-500",
    bg: "bg-rose-50",
    text: "text-rose-700",
  },
  Brafax: {
    bar: "bg-violet-500",
    bg: "bg-violet-50",
    text: "text-violet-700",
  },
  Lainnya: {
    bar: "bg-slate-400",
    bg: "bg-slate-100",
    text: "text-slate-600",
  },
};

function getClassificationStyle(classification: string): ClassificationStyle {
  return (
    classificationColors[classification as ClassificationKey] ||
    classificationColors.Lainnya
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year > 0 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31
  );
}

/**
 * Satu-satunya sumber kebenaran untuk membaca tanggal dari data Google Sheets.
 * Mendukung: "YYYY-MM-DD", "YYYY/MM/DD", "DD/MM/YYYY", "DD-MM-YYYY",
 * tanggal ISO dengan waktu ("...T10:00:00Z" / "...T10:00:00+07:00"),
 * dan tanggal dengan spasi + waktu ("YYYY-MM-DD HH:mm:ss").
 * Tidak pernah melempar error - mengembalikan null jika tidak bisa dibaca.
 */
function parseDateParts(value: string | null | undefined): DateParts | null {
  if (!value) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  // Buang bagian waktu jika ada ("T..." atau spasi diikuti jam)
  const datePart = trimmed.split(/[T ]/)[0];

  // Format YYYY-MM-DD atau YYYY/MM/DD
  let match = datePart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (isValidDateParts(year, month, day)) {
      return { year, month, day };
    }
  }

  // Format DD-MM-YYYY atau DD/MM/YYYY
  match = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (isValidDateParts(year, month, day)) {
      return { year, month, day };
    }
  }

  // Fallback terakhir: biarkan Date yang mem-parse (mis. ISO penuh),
  // lalu baca komponen UTC-nya agar tidak bergeser karena timezone lokal server.
  const parsedDate = new Date(trimmed);
  if (!Number.isNaN(parsedDate.getTime())) {
    return {
      year: parsedDate.getUTCFullYear(),
      month: parsedDate.getUTCMonth() + 1,
      day: parsedDate.getUTCDate(),
    };
  }

  return null;
}

function getYear(dateValue: string): string {
  const parts = parseDateParts(dateValue);
  return parts ? String(parts.year) : "";
}

function getMonthIndex(dateValue: string): number | null {
  const parts = parseDateParts(dateValue);
  return parts ? parts.month - 1 : null;
}

function getMonthName(dateValue: string): string {
  const index = getMonthIndex(dateValue);
  return index === null ? "" : months[index];
}

function getDateKey(dateValue: string): string {
  const parts = parseDateParts(dateValue);
  if (!parts) return "";
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/** Tanggal "hari ini" berdasarkan kalender lokal Indonesia (WIB), bukan timezone server. */
function getJakartaToday(): DateParts {
  const nowUtcMs = Date.now();
  const jakartaMs = nowUtcMs + JAKARTA_OFFSET_MS;
  const jakarta = new Date(jakartaMs);
  return {
    year: jakarta.getUTCFullYear(),
    month: jakarta.getUTCMonth() + 1,
    day: jakarta.getUTCDate(),
  };
}

function formatDate(value: string): string {
  const parts = parseDateParts(value);
  if (!parts) return value || "-";

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Predikat filter gabungan (tahun + bulan + klasifikasi) - dipakai untuk semua statistik & grafik. */
function matchesFilters(
  archive: ArchiveData,
  selectedYear: string,
  selectedMonth: string,
  selectedClassification: string
): boolean {
  const yearMatches =
    selectedYear === ALL_YEARS_LABEL ||
    getYear(archive.tanggalDiterima) === selectedYear;

  const monthMatches =
    selectedMonth === ALL_MONTHS_LABEL ||
    getMonthName(archive.tanggalDiterima) === selectedMonth;

  const classificationMatches =
    selectedClassification === ALL_CLASSIFICATIONS_LABEL ||
    archive.klasifikasi === selectedClassification;

  return yearMatches && monthMatches && classificationMatches;
}

export default function DashboardPage() {
  const [archives, setArchives] = useState<ArchiveData[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");
  const [username, setUsername] = useState("");

  const [selectedYear, setSelectedYear] = useState<string>(ALL_YEARS_LABEL);
  const [selectedMonth, setSelectedMonth] = useState(ALL_MONTHS_LABEL);
  const [selectedClassification, setSelectedClassification] = useState(
    ALL_CLASSIFICATIONS_LABEL
  );

  /*
   * ============================
   * LOAD DATA GOOGLE SHEETS
   * ============================
   */

  useEffect(() => {
    const loadArchives = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/archives", {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || "Gagal mengambil data arsip."
          );
        }

        setArchives(result.data || []);
      } catch (err: unknown) {
        console.error("DASHBOARD ERROR:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Gagal mengambil data arsip."
        );
      } finally {
        setLoading(false);
      }
    };

    void Promise.resolve().then(loadArchives);

    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { data?: { username?: string } }) => setUsername(result.data?.username || ""))
      .catch(() => undefined);
  }, []);

  /*
   * ============================
   * TANGGAL SEKARANG (kalender lokal Indonesia / WIB)
   * ============================
   */

  const jakartaToday = getJakartaToday();

  const currentYear = String(jakartaToday.year);

  const currentMonth = months[jakartaToday.month - 1];

  const currentDateKey = `${jakartaToday.year}-${pad2(jakartaToday.month)}-${pad2(jakartaToday.day)}`;

  /*
   * ============================
   * TOTAL ARSIP
   * ============================
   */

  const totalArchives = archives.length;

  /*
   * ============================
   * ARSIP SESUAI FILTER AKTIF (TAHUN / BULAN / KLASIFIKASI)
   * Dipakai bersama oleh: grafik bulanan, grafik klasifikasi, dan total filter.
   * ============================
   */

  const filteredArchives = useMemo(() => {
    return archives.filter((archive) =>
      matchesFilters(
        archive,
        selectedYear,
        selectedMonth,
        selectedClassification
      )
    );
  }, [archives, selectedYear, selectedMonth, selectedClassification]);

  const availableClassifications = useMemo(() => {
    return Array.from(new Set(archives.map((archive) => archive.klasifikasi).filter(Boolean)));
  }, [archives]);

  /*
   * ============================
   * STATISTIK TAHUN INI
   * ============================
   */

  const thisYearCount = archives.filter(
    (archive) => getYear(archive.tanggalDiterima) === currentYear
  ).length;

  /*
   * ============================
   * STATISTIK BULAN INI
   * ============================
   */

  const thisMonthCount = archives.filter((archive) => {
    return (
      getYear(archive.tanggalDiterima) === currentYear &&
      getMonthName(archive.tanggalDiterima) === currentMonth
    );
  }).length;

  /*
   * ============================
   * STATISTIK HARI INI
   * (dibandingkan sebagai tanggal kalender WIB, bukan string mentah)
   * ============================
   */

  const todayCount = archives.filter((archive) => {
    const key = getDateKey(archive.tanggalDiterima);
    return key !== "" && key === currentDateKey;
  }).length;

  /*
   * ============================
   * STATISTIC CARDS
   * ============================
   */

  const stats = [
    {
      title: "Total Surat",
      value: totalArchives,
      description: "Seluruh arsip surat",
      icon: Archive,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      accent: "from-blue-500 to-cyan-400",
    },
    {
      title: "Tahun Ini",
      value: thisYearCount,
      description: `Surat masuk tahun ${currentYear}`,
      icon: FileText,
      iconBg: "bg-indigo-100",
      iconColor: "text-indigo-600",
      accent: "from-indigo-500 to-violet-400",
    },
    {
      title: "Bulan Ini",
      value: thisMonthCount,
      description: `Surat masuk bulan ${currentMonth}`,
      icon: CalendarDays,
      iconBg: "bg-cyan-100",
      iconColor: "text-cyan-600",
      accent: "from-cyan-500 to-teal-400",
    },
    {
      title: "Hari Ini",
      value: todayCount,
      description: "Surat diterima hari ini",
      icon: Inbox,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      accent: "from-emerald-500 to-lime-400",
    },
  ];

  /*
   * ============================
   * DAFTAR TAHUN (TERMASUK "SEMUA TAHUN")
   * ============================
   */

  const availableYears = useMemo(() => {
    const years = new Set<string>();

    archives.forEach((archive) => {
      const year = getYear(archive.tanggalDiterima);

      if (year) {
        years.add(year);
      }
    });

    years.add(currentYear);

    const sortedYears = Array.from(years).sort(
      (a, b) => Number(b) - Number(a)
    );

    return [ALL_YEARS_LABEL, ...sortedYears];
  }, [archives, currentYear]);

  /*
   * ============================
   * DATA GRAFIK BULANAN
   * (mengikuti filter aktif: tahun / semua tahun, bulan, klasifikasi)
   * ============================
   */

  const monthlyData = months.map((month) => {
    const count = filteredArchives.filter(
      (archive) => getMonthName(archive.tanggalDiterima) === month
    ).length;

    return {
      month,
      short: month.substring(0, 3),
      count,
    };
  });

  const maxMonthlyCount = Math.max(
    ...monthlyData.map((item) => item.count),
    1
  );

  /*
   * ============================
   * DATA KLASIFIKASI
   * (mengikuti filter aktif - dataset SAMA dengan grafik bulanan)
   * ============================
   */

  const classificationData = (
    ["B", "SE", "SP", "ST", "STR", "R", "Brafax", "Lainnya"] as ClassificationKey[]
  ).map((classification) => {
    const count = filteredArchives.filter(
      (archive) => archive.klasifikasi === classification
    ).length;

    return {
      classification,
      count,
    };
  });

  const maxClassification = Math.max(
    ...classificationData.map((item) => item.count),
    1
  );

  const classificationTotal = classificationData.reduce(
    (total, item) => total + item.count,
    0
  );

  const classificationGradient = classificationTotal
    ? `conic-gradient(${classificationData.reduce<{ stops: string[]; position: number }>((result, item) => {
        const nextPosition = result.position + (item.count / classificationTotal) * 100;
        const color =
          item.classification === "B"
            ? "#3b82f6"
            : item.classification === "SE"
              ? "#6366f1"
              : item.classification === "SP"
                ? "#06b6d4"
                : item.classification === "ST"
                  ? "#10b981"
                  : item.classification === "STR"
                    ? "#f59e0b"
                    : item.classification === "R"
                      ? "#f43f5e"
                      : item.classification === "Brafax"
                        ? "#8b5cf6"
                        : "#94a3b8";
        result.stops.push(`${color} ${result.position}% ${nextPosition}%`);
        result.position = nextPosition;
        return result;
      }, { stops: [], position: 0 }).stops.join(", ")})`
    : "conic-gradient(#e2e8f0 0 100%)";

  /*
   * ============================
   * SURAT TERBARU
   * (10 baris PALING BAWAH dari data /api/archives,
   *  ditampilkan dari yang paling baru [baris terakhir] ke yang lebih lama)
   * ============================
   */

  const recentArchives = archives.slice(-10).reverse();

  /*
   * ============================
   * LOADING
   * ============================
   */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2
            size={32}
            className="animate-spin text-blue-600"
          />

          <p className="text-sm text-slate-500">
            Memuat dashboard...
          </p>
        </div>
      </div>
    );
  }

  /*
   * ============================
   * DASHBOARD
   * ============================
   */

  return (
    <div className="mx-auto max-w-7xl space-y-6">

      {/* =========================
          HEADER
      ========================== */}

      <section>
        <p className="text-sm font-medium text-blue-600">
          Dashboard
        </p>

        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
          Selamat Datang, {username || "Pengguna"}
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Kelola dan pantau arsip surat masuk
          Staf Operasi Yonkes 2.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Filter Dashboard</h2>
            <p className="mt-1 text-xs text-slate-500">Sesuaikan ringkasan dan grafik berdasarkan periode arsip.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 outline-none focus:border-blue-500">
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 outline-none focus:border-blue-500">
              <option>{ALL_MONTHS_LABEL}</option>
              {months.map((month) => <option key={month} value={month}>{month}</option>)}
            </select>
            <select value={selectedClassification} onChange={(event) => setSelectedClassification(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 outline-none focus:border-blue-500">
              <option>{ALL_CLASSIFICATIONS_LABEL}</option>
              {availableClassifications.map((classification) => <option key={classification} value={classification}>{classification}</option>)}
            </select>
            <button type="button" onClick={() => { setSelectedYear(ALL_YEARS_LABEL); setSelectedMonth(ALL_MONTHS_LABEL); setSelectedClassification(ALL_CLASSIFICATIONS_LABEL); }} className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-500 hover:bg-slate-50">Reset</button>
          </div>
        </div>
      </section>

      {/* =========================
          ERROR
      ========================== */}

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">

          <AlertCircle
            size={20}
            className="mt-0.5 shrink-0 text-red-600"
          />

          <div>
            <p className="font-semibold text-red-800">
              Gagal memuat data
            </p>

            <p className="mt-1 text-sm text-red-600">
              {error}
            </p>
          </div>

        </div>
      )}

      {/* =========================
          STATISTIC CARD
      ========================== */}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <div
              key={stat.title}
              className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${stat.accent}`} />

              <div className="flex items-start justify-between">

                <div>
                  <p className="text-sm font-medium text-slate-500">
                    {stat.title}
                  </p>

                  <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                    {stat.value.toLocaleString(
                      "id-ID"
                    )}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    {stat.description}
                  </p>
                </div>

                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.iconBg}`}
                >
                  <Icon
                    size={23}
                    className={stat.iconColor}
                  />
                </div>

              </div>

              <div className="mt-4 flex items-center gap-1 text-xs font-medium text-emerald-600">
                <TrendingUp size={14} />
                Data Terupdate
              </div>

            </div>
          );
        })}

      </section>

      {/* =========================
          GRAFIK
      ========================== */}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">

        {/* GRAFIK BULANAN */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <h2 className="font-semibold text-slate-900">
                Surat Masuk
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                Statistik surat masuk berdasarkan bulan
              </p>
            </div>

            <select
              value={selectedYear}
              onChange={(event) =>
                setSelectedYear(
                  event.target.value
                )
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-auto"
            >
              {availableYears.map(
                (year) => (
                  <option
                    key={year}
                    value={year}
                  >
                    {year}
                  </option>
                )
              )}
            </select>

          </div>

          <div className="mt-8 flex h-64 items-end gap-1.5 rounded-xl bg-slate-50 px-3 pt-4 sm:gap-3" style={{ backgroundImage: "linear-gradient(to bottom, rgba(148,163,184,.16) 1px, transparent 1px)", backgroundSize: "100% 25%" }}>

            {monthlyData.map(
              (item) => {

                const height =
                  item.count === 0
                    ? 2
                    : Math.max(
                        (item.count /
                          maxMonthlyCount) *
                          100,
                        6
                      );

                return (
                  <div
                    key={item.month}
                    className="group flex h-full flex-1 flex-col justify-end"
                  >

                    <div className="relative flex h-full items-end">

                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-blue-600 via-cyan-500 to-teal-300 transition-all duration-500 group-hover:from-indigo-600 group-hover:to-cyan-300"
                        style={{
                          height: `${height}%`,
                        }}
                      />

                      {item.count > 0 && (
                        <span className="absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 rounded-md bg-slate-800 px-2 py-1 text-[10px] font-medium text-white group-hover:block">
                          {item.count}
                        </span>
                      )}

                    </div>

                    <span className="mt-2 text-center text-[9px] text-slate-400 sm:text-[10px]">
                      {item.short}
                    </span>

                  </div>
                );
              }
            )}

          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">

            <p className="text-xs text-slate-400">
              Total {selectedYear === ALL_YEARS_LABEL ? "semua tahun" : `tahun ${selectedYear}`}
            </p>

            <p className="font-semibold text-blue-600">
              {filteredArchives.length.toLocaleString(
                "id-ID"
              )}{" "}
              surat
            </p>

          </div>

        </div>

        {/* =========================
            KLASIFIKASI
        ========================== */}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

          <h2 className="font-semibold text-slate-900">
            Klasifikasi Surat
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Distribusi {selectedYear === ALL_YEARS_LABEL ? "semua tahun" : `tahun ${selectedYear}`}
          </p>

          <div className="mt-5 flex justify-center">
            <div className="relative h-36 w-36 rounded-full" style={{ background: classificationGradient }}>
              <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white"><span className="text-2xl font-bold text-slate-900">{classificationTotal}</span><span className="text-[10px] uppercase tracking-wide text-slate-400">surat</span></div>
            </div>
          </div>

          <div className="mt-7 space-y-5">

            {classificationData.map(
              (item) => {

                const colors = getClassificationStyle(item.classification);

                const width =
                  item.count === 0
                    ? 0
                    : Math.max(
                        (item.count /
                          maxClassification) *
                          100,
                        5
                      );

                return (
                  <div
                    key={
                      item.classification
                    }
                  >

                    <div className="mb-2 flex items-center justify-between">

                      <div className="flex items-center gap-2">

                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold ${colors.bg} ${colors.text}`}
                        >
                          {
                            item.classification
                          }
                        </span>

                        <span className="text-xs text-slate-500">
                          {item.count} surat
                        </span>

                      </div>

                      <span className="text-xs font-semibold text-slate-500">
                        {filteredArchives.length
                          ? Math.round(
                              (item.count /
                                filteredArchives.length) *
                                100
                            )
                          : 0}
                        %
                      </span>

                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">

                      <div
                        className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                        style={{
                          width: `${width}%`,
                        }}
                      />

                    </div>

                  </div>
                );
              }
            )}

          </div>

        </div>

      </section>

      {/* =========================
          SURAT TERBARU
      ========================== */}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <h2 className="font-semibold text-slate-900">
              Surat Masuk Terbaru
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Arsip surat yang terakhir ditambahkan
            </p>
          </div>

          <Link
            href="/arsip"
            className="text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            Lihat Semua →
          </Link>

        </div>

        {/* =========================
            DESKTOP
        ========================== */}

        <div className="hidden overflow-x-auto md:block">

          <table className="w-full text-left text-sm">

            <thead className="bg-slate-50 text-xs uppercase text-slate-500">

              <tr>

                <th className="px-5 py-4">
                  No
                </th>

                <th className="px-5 py-4">
                  Nomor Surat
                </th>

                <th className="px-5 py-4">
                  Pengirim
                </th>

                <th className="px-5 py-4">
                  Perihal
                </th>

                <th className="px-5 py-4">
                  Klasifikasi
                </th>

                <th className="px-5 py-4">
                  Tanggal
                </th>

                <th className="px-5 py-4 text-right">
                  Aksi
                </th>

              </tr>

            </thead>

            <tbody className="divide-y divide-slate-100">

              {recentArchives.map(
                (archive, index) => {

                  const colors = getClassificationStyle(archive.klasifikasi);

                  return (
                    <tr
                      key={`${archive.nomor}-${index}`}
                      className="transition hover:bg-slate-50"
                    >

                      <td className="px-5 py-4 font-semibold text-slate-700">
                        {archive.nomor}
                      </td>

                      <td className="px-5 py-4 font-medium text-slate-800">
                        {archive.nomorSurat}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {archive.pengirim}
                      </td>

                      <td className="max-w-xs px-5 py-4 text-slate-600">
                        {archive.perihal}
                      </td>

                      <td className="px-5 py-4">

                        <span
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${colors.bg} ${colors.text}`}
                        >
                          {
                            archive.klasifikasi
                          }
                        </span>

                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                        {formatDate(
                          archive.tanggalDiterima
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">

                        <Link
                          href={`/arsip/${encodeURIComponent(
                            archive.nomor
                          )}`}
                          className="inline-flex rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-600"
                          title="Lihat detail"
                        >
                          <Eye size={17} />
                        </Link>

                      </td>

                    </tr>
                  );
                }
              )}

            </tbody>

          </table>

        </div>

        {/* =========================
            MOBILE
        ========================== */}

        <div className="divide-y divide-slate-100 md:hidden">

          {recentArchives.map(
            (archive, index) => {

              const colors = getClassificationStyle(archive.klasifikasi);

              return (
                <div
                  key={`${archive.nomor}-${index}`}
                  className="p-5"
                >

                  <div className="flex items-start justify-between gap-3">

                    <div className="min-w-0">

                      <p className="text-xs font-semibold text-blue-600">
                        #{archive.nomor}
                      </p>

                      <p className="mt-1 break-words font-semibold text-slate-900">
                        {
                          archive.nomorSurat
                        }
                      </p>

                    </div>

                    <span
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${colors.bg} ${colors.text}`}
                    >
                      {
                        archive.klasifikasi
                      }
                    </span>

                  </div>

                  <p className="mt-3 text-sm text-slate-600">
                    {archive.perihal}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">

                    <span>
                      {archive.pengirim}
                    </span>

                    <span>
                      {formatDate(
                        archive.tanggalDiterima
                      )}
                    </span>

                  </div>

                  <Link
                    href={`/arsip/${encodeURIComponent(
                      archive.nomor
                    )}`}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-700"
                  >
                    <Eye size={15} />
                    Lihat Detail
                  </Link>

                </div>
              );
            }
          )}

        </div>

        {/* =========================
            EMPTY
        ========================== */}

        {recentArchives.length === 0 && (
          <div className="px-5 py-16 text-center">

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <Archive
                size={24}
                className="text-slate-400"
              />
            </div>

            <h3 className="mt-4 font-semibold text-slate-800">
              Belum ada arsip
            </h3>

            <p className="mt-1 text-sm text-slate-400">
              Surat yang ditambahkan akan muncul di sini.
            </p>

          </div>
        )}

      </section>

    </div>
  );
}