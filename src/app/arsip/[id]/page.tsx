"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Archive,
  CalendarDays,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  User,
  AlertCircle,
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

function formatDateTime(value: string) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getClassificationStyle(
  classification: string
) {
  switch (classification) {
    case "B":
      return "bg-blue-50 text-blue-700 border-blue-200";

    case "SE":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";

    case "SP":
      return "bg-cyan-50 text-cyan-700 border-cyan-200";

    case "ST":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";

    case "STR":
      return "bg-amber-50 text-amber-700 border-amber-200";

    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function getMonthName(value: string) {
  if (!value) return "-";

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return months[date.getMonth()];
  }

  return "-";
}

function getYear(value: string) {
  if (!value) return "-";

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return String(date.getFullYear());
  }

  const match = value.match(/\d{4}/);

  return match?.[0] || "-";
}

export default function ArchiveDetailPage() {
  const params = useParams();

  const id = Array.isArray(params?.id)
    ? params.id[0]
    : params?.id;

  const [archive, setArchive] =
    useState<ArchiveData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (!id) return;

    const loadArchive = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          "/api/archives",
          {
            cache: "no-store",
          }
        );

        const result =
          await response.json();

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.message ||
              "Gagal mengambil data arsip."
          );
        }

        const archives: ArchiveData[] =
          result.data || [];

        const decodedId =
          decodeURIComponent(String(id));

        const foundArchive =
          archives.find(
            (item) =>
              String(item.nomor) ===
              decodedId
          );

        if (!foundArchive) {
          throw new Error(
            "Arsip tidak ditemukan."
          );
        }

        setArchive(foundArchive);
      } catch (err: unknown) {
        console.error(
          "ARCHIVE DETAIL ERROR:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Gagal mengambil detail arsip."
        );
      } finally {
        setLoading(false);
      }
    };

    loadArchive();
  }, [id]);

  /*
   * =========================
   * LOADING
   * =========================
   */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2
            size={34}
            className="animate-spin text-blue-600"
          />

          <p className="text-sm text-slate-500">
            Memuat detail arsip...
          </p>
        </div>
      </div>
    );
  }

  /*
   * =========================
   * ERROR
   * =========================
   */

  if (error || !archive) {
    return (
      <div className="mx-auto max-w-4xl">

        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">

          <div className="flex items-start gap-3">

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
              <AlertCircle
                size={21}
                className="text-red-600"
              />
            </div>

            <div>
              <h1 className="font-semibold text-red-800">
                Arsip tidak ditemukan
              </h1>

              <p className="mt-1 text-sm text-red-600">
                {error ||
                  "Data arsip yang diminta tidak tersedia."}
              </p>
            </div>

          </div>

          <Link
            href="/arsip"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Kembali ke Arsip
          </Link>

        </div>

      </div>
    );
  }

  const classificationStyle =
    getClassificationStyle(
      archive.klasifikasi
    );

  const hasFile =
    Boolean(archive.linkFile);

  return (
    <div className="mx-auto max-w-7xl space-y-6">

      {/* =========================
          BREADCRUMB / BACK
      ========================= */}

      <section>

        <Link
          href="/arsip"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-600"
        >
          <ArrowLeft size={17} />
          Kembali ke Arsip
        </Link>

      </section>

      {/* =========================
          HEADER
      ========================= */}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">

        <div className="p-5 sm:p-6">

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">

            <div className="min-w-0">

              <div className="flex flex-wrap items-center gap-2">

                <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  <Archive size={13} />
                  Arsip #{archive.nomor}
                </span>

                <span
                  className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-semibold ${classificationStyle}`}
                >
                  {archive.klasifikasi ||
                    "Lainnya"}
                </span>

              </div>

              <h1 className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                {archive.nomorSurat ||
                  "Nomor surat tidak tersedia"}
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                Detail arsip surat masuk
              </p>

            </div>

            {/* ACTION */}

            <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">

              {hasFile && (
                <>
                  <a
                    href={archive.linkFile}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    <FileText size={17} />
                    Buka PDF
                  </a>

                  <a
                    href={archive.linkFile}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ExternalLink size={17} />
                    Google Drive
                  </a>
                </>
              )}

            </div>

          </div>

        </div>

      </section>

      {/* =========================
          CONTENT
      ========================= */}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">

        {/* =========================
            DATA SURAT
        ========================= */}

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2">

          <div className="border-b border-slate-200 p-5 sm:p-6">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                <FileText
                  size={20}
                  className="text-blue-600"
                />
              </div>

              <div>
                <h2 className="font-semibold text-slate-900">
                  Informasi Surat
                </h2>

                <p className="mt-0.5 text-xs text-slate-400">
                  Data surat yang tersimpan dalam arsip
                </p>
              </div>

            </div>

          </div>

          <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">

            {/* NOMOR ARSIP */}

            <div className="p-5 sm:p-6">

              <p className="text-xs font-medium text-slate-400">
                Nomor Arsip
              </p>

              <p className="mt-2 font-semibold text-slate-800">
                {archive.nomor || "-"}
              </p>

            </div>

            {/* NOMOR AGENDA */}

            <div className="p-5 sm:p-6">

              <p className="text-xs font-medium text-slate-400">
                Nomor Agenda
              </p>

              <p className="mt-2 break-words font-semibold text-slate-800">
                {archive.nomorAgenda ||
                  "-"}
              </p>

            </div>

          </div>

          <div className="grid grid-cols-1 divide-y divide-slate-100 border-t border-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">

            {/* NOMOR SURAT */}

            <div className="p-5 sm:p-6">

              <p className="text-xs font-medium text-slate-400">
                Nomor Surat
              </p>

              <p className="mt-2 break-words font-semibold text-slate-800">
                {archive.nomorSurat ||
                  "-"}
              </p>

            </div>

            {/* KLASIFIKASI */}

            <div className="p-5 sm:p-6">

              <p className="text-xs font-medium text-slate-400">
                Klasifikasi
              </p>

              <div className="mt-2">

                <span
                  className={`inline-flex rounded-lg border px-3 py-1.5 text-xs font-bold ${classificationStyle}`}
                >
                  {archive.klasifikasi ||
                    "Lainnya"}
                </span>

              </div>

            </div>

          </div>

          <div className="grid grid-cols-1 divide-y divide-slate-100 border-t border-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">

            {/* TANGGAL SURAT */}

            <div className="p-5 sm:p-6">

              <div className="flex items-start gap-3">

                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <CalendarDays
                    size={17}
                    className="text-slate-500"
                  />
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Tanggal Surat
                  </p>

                  <p className="mt-1 font-semibold text-slate-800">
                    {formatDate(
                      archive.tanggalSurat
                    )}
                  </p>

                  <p className="mt-0.5 text-xs text-slate-400">
                    {getMonthName(
                      archive.tanggalSurat
                    )}{" "}
                    {getYear(
                      archive.tanggalSurat
                    )}
                  </p>
                </div>

              </div>

            </div>

            {/* TANGGAL DITERIMA */}

            <div className="p-5 sm:p-6">

              <div className="flex items-start gap-3">

                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                  <InboxIcon />
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Tanggal Diterima
                  </p>

                  <p className="mt-1 font-semibold text-slate-800">
                    {formatDate(
                      archive.tanggalDiterima
                    )}
                  </p>
                </div>

              </div>

            </div>

          </div>

          {/* PENGIRIM */}

          <div className="border-t border-slate-100 p-5 sm:p-6">

            <div className="flex items-start gap-3">

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <User
                  size={17}
                  className="text-slate-500"
                />
              </div>

              <div className="min-w-0">

                <p className="text-xs font-medium text-slate-400">
                  Pengirim
                </p>

                <p className="mt-1 break-words font-semibold text-slate-800">
                  {archive.pengirim ||
                    "-"}
                </p>

              </div>

            </div>

          </div>

          {/* PERIHAL */}

          <div className="border-t border-slate-100 p-5 sm:p-6">

            <div className="flex items-start gap-3">

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <Mail
                  size={17}
                  className="text-slate-500"
                />
              </div>

              <div className="min-w-0">

                <p className="text-xs font-medium text-slate-400">
                  Perihal
                </p>

                <p className="mt-1 break-words font-semibold leading-relaxed text-slate-800">
                  {archive.perihal ||
                    "-"}
                </p>

              </div>

            </div>

          </div>

        </div>

        {/* =========================
            SIDEBAR
        ========================= */}

        <div className="space-y-6">

          {/* FILE PDF */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                <FileText
                  size={20}
                  className="text-red-500"
                />
              </div>

              <div>
                <h2 className="font-semibold text-slate-900">
                  Dokumen PDF
                </h2>

                <p className="text-xs text-slate-400">
                  File surat tersimpan di Google Drive
                </p>
              </div>

            </div>

            {hasFile ? (
              <div className="mt-5 space-y-2">

                <a
                  href={archive.linkFile}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  <FileText size={17} />
                  Buka Dokumen PDF
                </a>

                <a
                  href={archive.linkFile}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Download size={17} />
                  Buka / Unduh dari Drive
                </a>

              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">

                <FileText
                  size={26}
                  className="mx-auto text-slate-300"
                />

                <p className="mt-2 text-sm font-medium text-slate-600">
                  File PDF tidak tersedia
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Belum ada link dokumen pada arsip ini.
                </p>

              </div>
            )}

          </div>

          {/* INFORMASI ARSIP */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                <ClipboardList
                  size={20}
                  className="text-indigo-600"
                />
              </div>

              <div>
                <h2 className="font-semibold text-slate-900">
                  Informasi Arsip
                </h2>

                <p className="text-xs text-slate-400">
                  Informasi pencatatan
                </p>
              </div>

            </div>

            <div className="mt-5 space-y-4">

              <div>

                <p className="text-xs text-slate-400">
                  Nomor Arsip
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-700">
                  #{archive.nomor}
                </p>

              </div>

              <div>

                <p className="text-xs text-slate-400">
                  Tahun
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {getYear(
                    archive.tanggalDiterima
                  )}
                </p>

              </div>

              <div>

                <p className="text-xs text-slate-400">
                  Bulan
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {getMonthName(
                    archive.tanggalDiterima
                  )}
                </p>

              </div>

              <div>

                <p className="text-xs text-slate-400">
                  Tanggal Input
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {formatDateTime(
                    archive.tanggalInput
                  )}
                </p>

              </div>

            </div>

          </div>

        </div>

      </section>

      {/* =========================
          FOOTER ACTION
      ========================= */}

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

        <Link
          href="/arsip"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
        >
          <ArrowLeft size={17} />
          Kembali ke Daftar Arsip
        </Link>

        {hasFile && (
          <a
            href={archive.linkFile}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <FileText size={17} />
            Buka PDF Surat
          </a>
        )}

      </section>

    </div>
  );
}

/*
 * Icon kecil untuk tanggal diterima.
 * Dibuat terpisah supaya bagian utama tetap rapi.
 */

function InboxIcon() {
  return (
    <Archive
      size={17}
      className="text-blue-600"
    />
  );
}