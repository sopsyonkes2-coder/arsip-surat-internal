"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  FileText,
  Paperclip,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import CameraCapture from "@/components/CameraCapture";

const classifications = [
  "B",
  "SE",
  "SP",
  "ST",
  "STR",
  "R",
  "Brafax",
  "Lainnya",
];

type FormData = {
  agenda: string;
  nomorSurat: string;
  tanggalSurat: string;
  tanggalDiterima: string;
  pengirim: string;
  perihal: string;
  klasifikasi: string;
  jenisSurat: string;
  keterangan: string;
};

export default function TambahArsipPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormData>({
    agenda: "",
    nomorSurat: "",
    tanggalSurat: "",
    tanggalDiterima: "",
    pengirim: "",
    perihal: "",
    klasifikasi: "",
    jenisSurat: "Masuk",
    keterangan: "",
  });

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  const handleChange = (
    e: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFile = (selectedFile?: File) => {
    if (!selectedFile) return;

    if (selectedFile.type !== "application/pdf") {
      setError("File harus berupa PDF.");
      return;
    }

    setError("");
    setFile(selectedFile);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (
      !form.agenda ||
      !form.nomorSurat ||
      !form.tanggalSurat ||
      !form.tanggalDiterima ||
      !form.pengirim ||
      !form.perihal ||
      !form.klasifikasi
    ) {
      setError("Mohon lengkapi seluruh data.");
      return;
    }

    if (!file) {
      setError("File PDF wajib diunggah.");
      return;
    }

    try {
      setSaving(true);

      const formData = new globalThis.FormData();

      formData.append("nomorAgenda", form.agenda);
      formData.append("nomorSurat", form.nomorSurat);
      formData.append("tanggalSurat", form.tanggalSurat);
      formData.append("tanggalDiterima", form.tanggalDiterima);
      formData.append("pengirim", form.pengirim);
      formData.append("perihal", form.perihal);
      formData.append("klasifikasi", form.klasifikasi);
      formData.append("jenisSurat", form.jenisSurat);
      formData.append("keterangan", form.keterangan);
      formData.append("file", file);

      const response = await fetch("/api/archives", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Gagal menyimpan arsip."
        );
      }

      router.push("/arsip");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menyimpan."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* HEADER */}
      <section>
        <Link
          href="/arsip"
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft size={16} />
          Kembali ke Arsip
        </Link>

        <p className="text-sm font-medium text-blue-600">
          Arsip Surat
        </p>

        <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">
          Tambah Arsip Surat
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Masukkan informasi surat masuk dan dokumen PDF.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ERROR */}
        {error && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* INFORMASI SURAT */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
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

                <p className="text-xs text-slate-400">
                  Lengkapi informasi administrasi surat.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
            <FormField label="Nomor Agenda" required>
              <input
                name="agenda"
                value={form.agenda}
                onChange={handleChange}
                placeholder="Contoh: 001/OPS/VIII/2026"
                className="input"
              />
            </FormField>

            <FormField label="Keterangan" full>
              <textarea
                name="keterangan"
                value={form.keterangan}
                onChange={handleChange}
                rows={3}
                placeholder="Keterangan tambahan (opsional)"
                className="input resize-none py-3"
              />
            </FormField>

            <FormField label="Nomor Surat" required>
              <input
                name="nomorSurat"
                value={form.nomorSurat}
                onChange={handleChange}
                placeholder="Contoh: 123/ABC/VIII/2026"
                className="input"
              />
            </FormField>

            <FormField label="Tanggal Surat" required>
              <div className="relative">
                <CalendarDays
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="date"
                  name="tanggalSurat"
                  value={form.tanggalSurat}
                  onChange={handleChange}
                  className="input pl-10"
                />
              </div>
            </FormField>

            <FormField label="Tanggal Diterima" required>
              <div className="relative">
                <CalendarDays
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="date"
                  name="tanggalDiterima"
                  value={form.tanggalDiterima}
                  onChange={handleChange}
                  className="input pl-10"
                />
              </div>
            </FormField>

            <FormField label="Pengirim" required full>
              <input
                name="pengirim"
                value={form.pengirim}
                onChange={handleChange}
                placeholder="Nama instansi / satuan / pengirim"
                className="input"
              />
            </FormField>

            <FormField label="Perihal" required full>
              <textarea
                name="perihal"
                value={form.perihal}
                onChange={handleChange}
                rows={4}
                placeholder="Masukkan perihal surat"
                className="input resize-none py-3"
              />
            </FormField>

            <FormField label="Klasifikasi" required>
              <select
                name="klasifikasi"
                value={form.klasifikasi}
                onChange={handleChange}
                className="input"
              >
                <option value="">Pilih klasifikasi</option>

                {classifications.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </section>

        {/* DOKUMEN */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                <Paperclip
                  size={20}
                  className="text-indigo-600"
                />
              </div>

              <div>
                <h2 className="font-semibold text-slate-900">
                  Dokumen Surat
                </h2>

                <p className="text-xs text-slate-400">
                  Upload dokumen surat dalam format PDF atau
                  scan dengan kamera.
                </p>
              </div>
            </div>
          </div>

          <div className="p-5">
            {!file ? (
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className={`rounded-2xl border-2 border-dashed p-8 text-center transition md:p-12 ${
                  dragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <Upload
                    size={25}
                    className="text-blue-600"
                  />
                </div>

                <h3 className="mt-4 font-semibold text-slate-800">
                  Upload dokumen PDF
                </h3>

                <p className="mt-2 text-sm text-slate-400">
                  Drag & drop file ke sini atau pilih dari
                  perangkat.
                </p>

                <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
                  <Upload size={17} />
                  Pilih File

                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => {
                      handleFile(e.target.files?.[0]);
                    }}
                    className="hidden"
                  />
                </label>

                <p className="mt-4 text-xs text-slate-400">
                  Format yang didukung: PDF
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50">
                    <FileText
                      size={24}
                      className="text-red-500"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {file.name}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              <Camera size={17} />
              Scan dengan Kamera
            </button>
          </div>
        </section>

        {/* BUTTON */}
        <section className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/arsip"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Batal
          </Link>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Save size={18} />

            {saving ? "Menyimpan..." : "Simpan Arsip"}
          </button>
        </section>
      </form>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onComplete={(scannedFile: File) => {
          setFile(scannedFile);
          setError("");
        }}
      />

      <style jsx>{`
        .input {
          width: 100%;
          height: 44px;
          border-radius: 0.75rem;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 0 0.875rem;
          font-size: 0.875rem;
          color: rgb(51 65 85);
          outline: none;
        }

        .input:focus {
          border-color: rgb(59 130 246);
          box-shadow: 0 0 0 3px rgb(219 234 254);
        }

        textarea.input {
          height: auto;
        }
      `}</style>
    </div>
  );
}

function FormField({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="mb-2 block text-xs font-semibold text-slate-600">
        {label}

        {required && (
          <span className="ml-1 text-red-500">*</span>
        )}
      </label>

      {children}
    </div>
  );
}