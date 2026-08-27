"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  CalendarDays,
  Eye,
  FileText,
  Filter,
  Plus,
  RotateCcw,
  Search,
  Loader2,
  ExternalLink,
  Trash2,
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

const classifications = [
  "Semua Klasifikasi",
  "B",
  "SE",
  "SP",
  "ST",
  "STR",
  "Lainnya",
];

const months = [
  "Semua Bulan",
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

function formatDate(value: string) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getYear(value: string) {
  if (!value) return "";

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return String(date.getFullYear());
  }

  const match = value.match(/\d{4}/);

  return match?.[0] || "";
}

function getMonth(value: string) {
  if (!value) return "";

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return months[date.getMonth() + 1];
  }

  return "";
}

export default function ArsipPage() {
  const [archives, setArchives] = useState<ArchiveData[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("search") || "";
  });
  const [year, setYear] = useState("Semua Tahun");
  const [month, setMonth] = useState("Semua Bulan");
  const [classification, setClassification] =
    useState("Semua Klasifikasi");

  const [error, setError] = useState("");

  /* =========================
     LOAD DATA
  ========================= */

  const loadArchives = async () => {
    try {
      setLoading(true);
      setError("");

      const response =
        await fetch("/api/archives", {
          cache: "no-store",
        });

      const result =
        await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            "Gagal mengambil data arsip."
        );
      }

      setArchives(result.data || []);
    } catch (error: unknown) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Gagal mengambil data arsip."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(loadArchives);
  }, []);

  /* =========================
     YEARS
  ========================= */

  const years = useMemo(() => {
    const uniqueYears = Array.from(
      new Set(
        archives
          .map((archive) =>
            getYear(
              archive.tanggalDiterima
            )
          )
          .filter(Boolean)
      )
    ).sort((a, b) =>
      Number(b) - Number(a)
    );

    return [
      "Semua Tahun",
      ...uniqueYears,
    ];
  }, [archives]);

  /* =========================
     FILTER
  ========================= */

  const filteredArchives = useMemo(() => {
    const searchValue =
      search.trim().toLowerCase();

    return archives.filter((archive) => {
      const matchesSearch =
        !searchValue ||
        archive.nomor
          .toLowerCase()
          .includes(searchValue) ||
        archive.nomorSurat
          .toLowerCase()
          .includes(searchValue) ||
        archive.nomorAgenda
          .toLowerCase()
          .includes(searchValue) ||
        archive.pengirim
          .toLowerCase()
          .includes(searchValue) ||
        archive.perihal
          .toLowerCase()
          .includes(searchValue);

      const matchesYear =
        year === "Semua Tahun" ||
        getYear(
          archive.tanggalDiterima
        ) === year;

      const matchesMonth =
        month === "Semua Bulan" ||
        getMonth(
          archive.tanggalDiterima
        ) === month;

      const matchesClassification =
        classification ===
          "Semua Klasifikasi" ||
        archive.klasifikasi ===
          classification;

      return (
        matchesSearch &&
        matchesYear &&
        matchesMonth &&
        matchesClassification
      );
    });
  }, [
    archives,
    search,
    year,
    month,
    classification,
  ]);

  /* =========================
     RESET
  ========================= */

  const resetFilters = () => {
    setSearch("");
    setYear("Semua Tahun");
    setMonth("Semua Bulan");
    setClassification(
      "Semua Klasifikasi"
    );
  };

  const deleteArchive = async (archive: ArchiveData) => {
    if (!window.confirm(`Hapus arsip nomor ${archive.nomor}? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      const response = await fetch(`/api/archives?id=${encodeURIComponent(archive.nomor)}`, { method: "DELETE" });
      const result = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !result.success) throw new Error(result.message || "Gagal menghapus arsip.");
      await loadArchives();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Gagal menghapus arsip.");
    }
  };

  /* =========================
     RENDER
  ========================= */

  return (
    <div className="mx-auto max-w-7xl space-y-6">

      {/* HEADER */}

      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

        <div>
          <p className="text-sm font-medium text-blue-600">
            Arsip
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Arsip Surat Masuk
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Cari dan lihat seluruh arsip surat masuk.
          </p>
        </div>

        <Link
          href="/arsip/tambah"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Plus size={18} />
          Tambah Arsip
        </Link>

      </section>

      {/* ERROR */}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* FILTER */}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

        <div className="mb-4 flex items-center gap-2">

          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
            <Filter
              size={18}
              className="text-blue-600"
            />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Filter Arsip
            </h2>

            <p className="text-xs text-slate-400">
              Gunakan filter untuk menemukan surat.
            </p>
          </div>

        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">

          {/* SEARCH */}

          <div className="relative xl:col-span-2">

            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Cari nomor, pengirim, perihal..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

          </div>

          {/* YEAR */}

          <select
            value={year}
            onChange={(event) =>
              setYear(event.target.value)
            }
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            {years.map((item) => (
              <option
                key={item}
                value={item}
              >
                {item}
              </option>
            ))}
          </select>

          {/* MONTH */}

          <select
            value={month}
            onChange={(event) =>
              setMonth(event.target.value)
            }
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            {months.map((item) => (
              <option
                key={item}
                value={item}
              >
                {item}
              </option>
            ))}
          </select>

          {/* CLASSIFICATION */}

          <select
            value={classification}
            onChange={(event) =>
              setClassification(
                event.target.value
              )
            }
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            {classifications.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              )
            )}
          </select>

        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <p className="text-xs text-slate-400">
            Menampilkan{" "}
            <span className="font-semibold text-slate-600">
              {filteredArchives.length}
            </span>{" "}
            arsip
          </p>

          <button
            onClick={resetFilters}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <RotateCcw size={14} />
            Reset Filter
          </button>

        </div>

      </section>

      {/* LOADING */}

      {loading ? (
        <section className="flex min-h-[300px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="flex flex-col items-center gap-3">

            <Loader2
              size={30}
              className="animate-spin text-blue-600"
            />

            <p className="text-sm text-slate-500">
              Memuat arsip surat...
            </p>

          </div>

        </section>
      ) : (

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          {/* DESKTOP */}

          <div className="hidden overflow-x-auto lg:block">

            <table className="w-full text-left text-sm">

              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">

                <tr>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    No
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nomor Surat
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tanggal
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Pengirim
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Perihal
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Klasifikasi
                  </th>

                  <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Aksi
                  </th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100">

                {filteredArchives.map(
                  (archive) => (

                    <tr
                      key={`${archive.nomor}-${archive.nomorSurat}`}
                      className="transition hover:bg-slate-50"
                    >

                      <td className="px-5 py-4 font-semibold text-slate-700">
                        {archive.nomor}
                      </td>

                      <td className="px-5 py-4">

                        <p className="font-medium text-slate-800">
                          {archive.nomorSurat}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Agenda:{" "}
                          {archive.nomorAgenda}
                        </p>

                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatDate(
                          archive.tanggalSurat
                        )}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {archive.pengirim}
                      </td>

                      <td className="max-w-xs px-5 py-4 text-slate-600">
                        {archive.perihal}
                      </td>

                      <td className="px-5 py-4">

                        <span className="inline-flex rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {archive.klasifikasi}
                        </span>

                      </td>

                      <td className="px-5 py-4">

                        <div className="flex justify-end gap-2">

                          <Link
                            href={`/arsip/${archive.nomor}`}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-600"
                            title="Lihat detail"
                          >
                            <Eye size={17} />
                          </Link>

                          {archive.linkFile && (
                            <a
                              href={
                                archive.linkFile
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-600"
                              title="Lihat PDF"
                            >
                              <FileText
                                size={17}
                              />
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => deleteArchive(archive)}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                            title="Hapus arsip"
                          >
                            <Trash2 size={17} />
                          </button>

                        </div>

                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>

          {/* MOBILE / TABLET */}

          <div className="divide-y divide-slate-100 lg:hidden">

            {filteredArchives.map(
              (archive) => (

                <div
                  key={`${archive.nomor}-${archive.nomorSurat}`}
                  className="p-5"
                >

                  <div className="flex items-start justify-between gap-3">

                    <div className="min-w-0">

                      <p className="text-xs font-semibold text-blue-600">
                        #{archive.nomor}
                      </p>

                      <h3 className="mt-1 break-words font-semibold text-slate-900">
                        {archive.nomorSurat}
                      </h3>

                      <p className="mt-1 text-xs text-slate-400">
                        Agenda:{" "}
                        {archive.nomorAgenda}
                      </p>

                    </div>

                    <span className="shrink-0 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {archive.klasifikasi}
                    </span>

                  </div>

                  <div className="mt-4 space-y-2">

                    <div className="flex items-start gap-2 text-sm">

                      <CalendarDays
                        size={15}
                        className="mt-0.5 shrink-0 text-slate-400"
                      />

                      <span className="text-slate-600">
                        {formatDate(
                          archive.tanggalSurat
                        )}
                      </span>

                    </div>

                    <div className="flex items-start gap-2 text-sm">

                      <Archive
                        size={15}
                        className="mt-0.5 shrink-0 text-slate-400"
                      />

                      <span className="text-slate-600">
                        {archive.pengirim}
                      </span>

                    </div>

                    <div className="flex items-start gap-2 text-sm">

                      <FileText
                        size={15}
                        className="mt-0.5 shrink-0 text-slate-400"
                      />

                      <span className="text-slate-600">
                        {archive.perihal}
                      </span>

                    </div>

                  </div>

                  <div className="mt-4 flex gap-2">

                    <Link
                      href={`/arsip/${archive.nomor}`}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-700"
                    >
                      <Eye size={15} />
                      Lihat Detail
                    </Link>

                    {archive.linkFile && (
                      <a
                        href={
                          archive.linkFile
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-600"
                      >
                        <ExternalLink
                          size={16}
                        />
                        PDF
                      </a>
                    )}

                    <button type="button" onClick={() => deleteArchive(archive)} className="flex items-center justify-center rounded-xl bg-red-50 px-4 py-2.5 text-red-600" title="Hapus arsip">
                      <Trash2 size={16} />
                    </button>

                  </div>

                </div>

              )
            )}

          </div>

          {/* EMPTY */}

          {filteredArchives.length ===
            0 && (
            <div className="px-5 py-16 text-center">

              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">

                <Archive
                  size={24}
                  className="text-slate-400"
                />

              </div>

              <h3 className="mt-4 font-semibold text-slate-800">
                Arsip tidak ditemukan
              </h3>

              <p className="mt-1 text-sm text-slate-400">
                Coba ubah kata pencarian
                atau filter.
              </p>

            </div>
          )}

        </section>
      )}

    </div>
  );
}