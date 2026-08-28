"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  FileText,
  Paperclip,
  Save,
  Camera,
  Trash2,
  Upload,
  X,
} from "lucide-react";

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

export default function TambahArsipPage() {
  const [form, setForm] = useState({
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
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanPages, setScanPages] = useState<string[]>([]);

  const handleChange = (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleFile = (selectedFile: File | undefined) => {
    if (!selectedFile) return;

    if (selectedFile.type !== "application/pdf") {
      setError("File harus berupa PDF.");
      return;
    }

    setError("");
    setFile(selectedFile);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  const removeFile = () => {
    setFile(null);
  };

  // Cleanup stream saat unmount
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  // Attach stream ke video element saat modal dibuka
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play();
    }
  }, [cameraOpen]);

  // Cegah scroll body saat modal terbuka
  useEffect(() => {
    if (cameraOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [cameraOpen]);

  const openCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Kamera tidak tersedia di perangkat ini.");
      }
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      setScanPages([]);
      setCameraOpen(true);
      setError("");
    } catch (cameraError: unknown) {
      setError(
        cameraError instanceof Error
          ? cameraError.message
          : "Kamera tidak dapat digunakan."
      );
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
    // Jangan hapus scanPages agar user bisa lihat hasil sebelumnya jika perlu,
    // tapi biasanya di-reset saat buka ulang. Di sini kita biarkan sampai PDF dibuat.
  };

  const captureCameraPage = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setScanPages((current) => [
      ...current,
      canvas.toDataURL("image/jpeg", 0.9),
    ]);
  };

  const removeScanPage = (index: number) => {
    setScanPages((current) =>
      current.filter((_, pageIndex) => pageIndex !== index)
    );
  };

  const makeScanPdf = async () => {
    if (!scanPages.length) return;
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    for (const [index, dataUrl] of scanPages.entries()) {
      const image = document.createElement("img");
      image.src = dataUrl;
      await new Promise<void>((resolve) => {
        image.onload = () => resolve();
      });
      const ratio = Math.min(190 / image.width, 277 / image.height);
      if (index) pdf.addPage();
      pdf.addImage(
        dataUrl,
        "JPEG",
        (210 - image.width * ratio) / 2,
        (297 - image.height * ratio) / 2,
        image.width * ratio,
        image.height * ratio
      );
    }
    setFile(
      new File([pdf.output("arraybuffer")], `scan-${Date.now()}.pdf`, {
        type: "application/pdf",
      })
    );
    setScanPages([]);
    closeCamera();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (
      !form.agenda ||
      !form.nomorSurat ||
      !form.tanggalSurat ||
      !form.tanggalDiterima ||
      !form.pengirim ||
      !form.perihal ||
      !form.klasifikasi ||
      !file
    ) {
      setError("Mohon lengkapi seluruh data dan pilih file PDF.");
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();

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
        throw new Error(result.message || "Gagal menyimpan arsip.");
      }

      router.push("/arsip");
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menyimpan arsip."
      );
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 size={32} className="text-emerald-600" />
          </div>

          <h1 className="mt-5 text-xl font-bold text-slate-900">
            Arsip Berhasil Disimpan
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Data surat dan dokumen telah disimpan ke Google Sheets dan Google
            Drive.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/arsip"
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Kembali ke Arsip
            </Link>

            <button
              onClick={() => setSaved(false)}
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Tambah Lagi
            </button>
          </div>
        </div>
      </div>
    );
  }

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

        <p className="text-sm font-medium text-blue-600">Arsip Surat</p>

        <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">
          Tambah Arsip Surat
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Masukkan informasi surat masuk dan dokumen PDF.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
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
                <FileText size={20} className="text-blue-600" />
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

        {/* UPLOAD */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                <Paperclip size={20} className="text-indigo-600" />
              </div>

              <div>
                <h2 className="font-semibold text-slate-900">Dokumen Surat</h2>
                <p className="text-xs text-slate-400">
                  Upload dokumen surat dalam format PDF.
                </p>
              </div>
            </div>
          </div>

          <div className="p-5">
            {!file ? (
              <div
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                }}
                onDrop={handleDrop}
                className={`
                  rounded-2xl border-2 border-dashed p-8 text-center transition md:p-12
                  ${
                    dragActive
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50"
                  }
                `}
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <Upload size={25} className="text-blue-600" />
                </div>

                <h3 className="mt-4 font-semibold text-slate-800">
                  Upload dokumen PDF
                </h3>

                <p className="mt-2 text-sm text-slate-400">
                  Drag & drop file ke sini atau pilih dari perangkat.
                </p>

                <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700">
                  <Upload size={17} />
                  Pilih File
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
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
                    <FileText size={24} className="text-red-500" />
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
                    onClick={removeFile}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    title="Hapus file"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* Tombol Scan tetap di bagian Dokumen Surat */}
            <button
              type="button"
              onClick={openCamera}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              <Camera size={17} />
              Scan dengan Kamera
            </button>
          </div>
        </section>

        {/* ACTION */}
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
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={18} />
            {saving ? "Menyimpan..." : "Simpan Arsip"}
          </button>
        </section>
      </form>

      {/* ========== MODAL KAMERA ========== */}
      {cameraOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-6"
          onClick={(e) => {
            // Klik area gelap di luar modal → tutup
            if (e.target === e.currentTarget) {
              closeCamera();
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Scan dokumen dengan kamera"
        >
          <div
            className="relative flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header modal */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <Camera size={20} className="text-blue-400" />
                <h3 className="text-sm font-semibold text-white sm:text-base">
                  Scan Dokumen
                </h3>
                {scanPages.length > 0 && (
                  <span className="rounded-full bg-blue-600/30 px-2.5 py-0.5 text-xs font-medium text-blue-300">
                    {scanPages.length} halaman
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={closeCamera}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                aria-label="Tutup kamera"
              >
                <X size={22} />
              </button>
            </div>

            {/* Area kamera + preview */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {/* Video preview */}
              <div className="relative aspect-[4/3] w-full bg-black sm:aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
                {/* Overlay hint */}
                <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-4">
                  <p className="rounded-full bg-black/50 px-3 py-1 text-xs text-white/80 backdrop-blur-sm">
                    Arahkan kamera ke dokumen
                  </p>
                </div>
              </div>

              {/* Thumbnail halaman yang sudah difoto */}
              {scanPages.length > 0 && (
                <div className="border-t border-slate-700 bg-slate-800/50 px-3 py-3 sm:px-4">
                  <p className="mb-2 text-xs font-medium text-slate-400">
                    Halaman yang diambil
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {scanPages.map((page, index) => (
                      <div
                        key={`${page.slice(0, 40)}-${index}`}
                        className="relative shrink-0"
                      >
                        <Image
                          src={page}
                          alt={`Halaman ${index + 1}`}
                          width={72}
                          height={96}
                          unoptimized
                          className="h-24 w-18 rounded-lg border border-slate-600 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeScanPage(index)}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow hover:bg-red-500"
                          aria-label={`Hapus halaman ${index + 1}`}
                        >
                          ×
                        </button>
                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {index + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer tombol aksi */}
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-slate-700 bg-slate-900 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
              <button
                type="button"
                onClick={captureCameraPage}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98]"
              >
                <Camera size={16} />
                Ambil Halaman
              </button>

              <button
                type="button"
                onClick={makeScanPdf}
                disabled={!scanPages.length}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
              >
                <FileText size={16} />
                Buat PDF ({scanPages.length})
              </button>

              <button
                type="button"
                onClick={closeCamera}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 active:scale-[0.98]"
              >
                Tutup Kamera
              </button>
            </div>
          </div>
        </div>
      )}

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
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}