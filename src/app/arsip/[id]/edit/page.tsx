"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  FileText,
  Paperclip,
  Save,
  Trash2,
  Upload,
  Loader2,
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
  jenisSurat: string;
  keterangan: string;
};

export default function EditArsipPage() {
  const params = useParams();
  const router = useRouter();

  const id = Array.isArray(params?.id)
    ? params.id[0]
    : params?.id;

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [cameraOpen, setCameraOpen] =
    useState(false);

  const [existingFile, setExistingFile] =
    useState("");

  const [file, setFile] =
    useState<File | null>(null);

  const [form, setForm] = useState({
    nomor: "",
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

  /*
  |--------------------------------------------------------------------------
  | LOAD DATA
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!id) return;

    const loadArchive =
      async () => {
        try {
          setLoading(true);
          setError("");

          const response =
            await fetch(
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

          const decodedId =
            decodeURIComponent(
              String(id)
            );

          const archives:
            ArchiveData[] =
            result.data || [];

          const found =
            archives.find(
              (item) =>
                String(
                  item.nomor
                ) === decodedId
            );

          if (!found) {
            throw new Error(
              "Arsip tidak ditemukan."
            );
          }

          setForm({
            nomor:
              found.nomor || "",

            agenda:
              found.nomorAgenda ||
              "",

            nomorSurat:
              found.nomorSurat ||
              "",

            tanggalSurat:
              found.tanggalSurat ||
              "",

            tanggalDiterima:
              found.tanggalDiterima ||
              "",

            pengirim:
              found.pengirim ||
              "",

            perihal:
              found.perihal ||
              "",

            klasifikasi:
              found.klasifikasi ||
              "",

            jenisSurat:
              found.jenisSurat ||
              "Masuk",

            keterangan:
              found.keterangan ||
              "",
          });

          setExistingFile(
            found.linkFile || ""
          );
        } catch (err) {
          console.error(
            "EDIT ARCHIVE LOAD ERROR:",
            err
          );

          setError(
            err instanceof Error
              ? err.message
              : "Gagal mengambil data arsip."
          );
        } finally {
          setLoading(false);
        }
      };

    loadArchive();
  }, [id]);

  /*
  |--------------------------------------------------------------------------
  | CHANGE FORM
  |--------------------------------------------------------------------------
  */

  const handleChange = (
    e: ChangeEvent<
      HTMLInputElement |
        HTMLTextAreaElement |
        HTMLSelectElement
    >
  ) => {
    const {
      name,
      value,
    } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /*
  |--------------------------------------------------------------------------
  | FILE
  |--------------------------------------------------------------------------
  */

  const handleFile = (
    selectedFile?: File
  ) => {
    if (!selectedFile) return;

    if (
      selectedFile.type !==
      "application/pdf"
    ) {
      setError(
        "File harus berupa PDF."
      );

      return;
    }

    if (
      selectedFile.size >
      20 * 1024 * 1024
    ) {
      setError(
        "Ukuran file maksimal 20 MB."
      );

      return;
    }

    setError("");
    setFile(selectedFile);
  };

  /*
  |--------------------------------------------------------------------------
  | SUBMIT
  |--------------------------------------------------------------------------
  */

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
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
      setError(
        "Mohon lengkapi seluruh data surat."
      );

      return;
    }

    try {
      setSaving(true);

      const fd =
        new FormData();

      /*
       * NOMOR TIDAK BOLEH BERUBAH.
       */

      fd.append(
        "nomor",
        form.nomor
      );

      fd.append(
        "nomorAgenda",
        form.agenda
      );

      fd.append(
        "nomorSurat",
        form.nomorSurat
      );

      fd.append(
        "tanggalSurat",
        form.tanggalSurat
      );

      fd.append(
        "tanggalDiterima",
        form.tanggalDiterima
      );

      fd.append(
        "pengirim",
        form.pengirim
      );

      fd.append(
        "perihal",
        form.perihal
      );

      fd.append(
        "klasifikasi",
        form.klasifikasi
      );

      fd.append(
        "jenisSurat",
        form.jenisSurat
      );

      fd.append(
        "keterangan",
        form.keterangan
      );

      /*
       * File hanya dikirim jika
       * user memilih file baru.
       */

      if (file) {
        fd.append(
          "file",
          file
        );
      }

      const response =
        await fetch(
          "/api/archives",
          {
            method: "PUT",
            body: fd,
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
            "Gagal memperbarui arsip."
        );
      }

      /*
       * Berhasil → kembali ke detail.
       */

      router.push(
        `/arsip/${encodeURIComponent(
          form.nomor
        )}`
      );

      router.refresh();
    } catch (err) {
      console.error(
        "EDIT ARCHIVE ERROR:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat memperbarui arsip."
      );
    } finally {
      setSaving(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
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
            Memuat data arsip...
          </p>
        </div>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ERROR
  |--------------------------------------------------------------------------
  */

  if (error && !form.nomor) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="font-semibold text-red-800">
            Gagal memuat arsip
          </h1>

          <p className="mt-2 text-sm text-red-600">
            {error}
          </p>

          <Link
            href="/arsip"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200"
          >
            <ArrowLeft size={16} />
            Kembali ke Arsip
          </Link>
        </div>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* HEADER */}

      <section>
        <Link
          href={`/arsip/${encodeURIComponent(
            form.nomor
          )}`}
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-600"
        >
          <ArrowLeft size={16} />
          Kembali ke Detail Arsip
        </Link>

        <p className="text-sm font-medium text-blue-600">
          Arsip Surat
        </p>

        <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">
          Edit Arsip Surat
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Perbarui informasi arsip tanpa
          mengubah nomor arsip.
        </p>
      </section>

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
      >

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
                  Perbarui informasi administrasi surat.
                </p>
              </div>

            </div>

          </div>

          <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">

            {/* NOMOR ARSIP */}

            <FormField
              label="Nomor Arsip"
            >
              <input
                value={form.nomor}
                disabled
                className="input bg-slate-100 text-slate-500"
              />

              <p className="mt-1 text-xs text-slate-400">
                Nomor arsip tidak dapat diubah.
              </p>
            </FormField>

            {/* NOMOR AGENDA */}

            <FormField
              label="Nomor Agenda"
              required
            >
              <input
                name="agenda"
                value={form.agenda}
                onChange={handleChange}
                placeholder="Contoh: 001/OPS/VIII/2026"
                className="input"
              />
            </FormField>

            {/* NOMOR SURAT */}

            <FormField
              label="Nomor Surat"
              required
            >
              <input
                name="nomorSurat"
                value={form.nomorSurat}
                onChange={handleChange}
                placeholder="Contoh: 123/ABC/VIII/2026"
                className="input"
              />
            </FormField>

            {/* JENIS SURAT */}

            <FormField
              label="Jenis Surat"
            >
              <select
                name="jenisSurat"
                value={form.jenisSurat}
                onChange={handleChange}
                className="input"
              >
                <option value="Masuk">
                  Masuk
                </option>

                <option value="Keluar">
                  Keluar
                </option>
              </select>
            </FormField>

            {/* TANGGAL SURAT */}

            <FormField
              label="Tanggal Surat"
              required
            >
              <div className="relative">
                <CalendarDays
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="date"
                  name="tanggalSurat"
                  value={
                    form.tanggalSurat
                  }
                  onChange={handleChange}
                  className="input pl-10"
                />
              </div>
            </FormField>

            {/* TANGGAL DITERIMA */}

            <FormField
              label="Tanggal Diterima"
              required
            >
              <div className="relative">
                <CalendarDays
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="date"
                  name="tanggalDiterima"
                  value={
                    form.tanggalDiterima
                  }
                  onChange={handleChange}
                  className="input pl-10"
                />
              </div>
            </FormField>

            {/* PENGIRIM */}

            <FormField
              label="Pengirim"
              required
              full
            >
              <input
                name="pengirim"
                value={form.pengirim}
                onChange={handleChange}
                placeholder="Nama instansi / satuan / pengirim"
                className="input"
              />
            </FormField>

            {/* PERIHAL */}

            <FormField
              label="Perihal"
              required
              full
            >
              <textarea
                name="perihal"
                value={form.perihal}
                onChange={handleChange}
                rows={4}
                placeholder="Masukkan perihal surat"
                className="input resize-none py-3"
              />
            </FormField>

            {/* KLASIFIKASI */}

            <FormField
              label="Klasifikasi"
              required
            >
              <select
                name="klasifikasi"
                value={
                  form.klasifikasi
                }
                onChange={handleChange}
                className="input"
              >
                <option value="">
                  Pilih klasifikasi
                </option>

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
            </FormField>

            {/* KETERANGAN */}

            <FormField
              label="Keterangan"
              full
            >
              <textarea
                name="keterangan"
                value={
                  form.keterangan
                }
                onChange={handleChange}
                rows={3}
                placeholder="Keterangan tambahan (opsional)"
                className="input resize-none py-3"
              />
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
                  PDF lama tetap digunakan jika tidak mengganti dokumen.
                </p>
              </div>

            </div>

          </div>

          <div className="p-5">

            {/* FILE LAMA */}

            {existingFile && !file && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">

                <div className="flex items-center gap-4">

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50">
                    <FileText
                      size={24}
                      className="text-red-500"
                    />
                  </div>

                  <div className="min-w-0 flex-1">

                    <p className="text-sm font-semibold text-slate-800">
                      PDF saat ini
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Dokumen lama akan tetap dipertahankan.
                    </p>

                  </div>

                  <a
                    href={
                      existingFile
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-blue-600 ring-1 ring-blue-200 hover:bg-blue-50"
                  >
                    Buka PDF
                  </a>

                </div>

              </div>
            )}

            {/* FILE BARU */}

            {file && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">

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
                      {(
                        file.size /
                        1024 /
                        1024
                      ).toFixed(2)}{" "}
                      MB
                    </p>

                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setFile(null)
                    }
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2
                      size={18}
                    />
                  </button>

                </div>

              </div>
            )}

            {/* UPLOAD */}

            <div
              className={`mt-4 rounded-2xl border-2 border-dashed p-8 text-center transition ${
                file
                  ? "border-slate-200 bg-slate-50"
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
                Ganti PDF
              </h3>

              <p className="mt-2 text-sm text-slate-400">
                Pilih PDF baru jika ingin mengganti dokumen lama.
              </p>

              <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">

                <Upload size={17} />

                Pilih File PDF

                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) =>
                    handleFile(
                      e.target.files?.[0]
                    )
                  }
                  className="hidden"
                />

              </label>

              <p className="mt-4 text-xs text-slate-400">
                Maksimal 20 MB
              </p>

            </div>

            {/* CAMERA */}

            <button
              type="button"
              onClick={() =>
                setCameraOpen(true)
              }
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              <Camera size={17} />
              Scan PDF Baru dengan Kamera
            </button>

          </div>

        </section>

        {/* ACTION */}

        <section className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

          <Link
            href={`/arsip/${encodeURIComponent(
              form.nomor
            )}`}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Batal
          </Link>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2
                size={18}
                className="animate-spin"
              />
            ) : (
              <Save size={18} />
            )}

            {saving
              ? "Menyimpan Perubahan..."
              : "Simpan Perubahan"}
          </button>

        </section>

      </form>

      {/* CAMERA */}

      <CameraCapture
        open={cameraOpen}
        onClose={() =>
          setCameraOpen(false)
        }
        onComplete={(
          scannedFile
        ) => {
          setFile(scannedFile);
          setError("");
          setCameraOpen(false);
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

        .input:disabled {
          cursor: not-allowed;
        }
      `}</style>

    </div>
  );
}

/*
|--------------------------------------------------------------------------
| FORM FIELD
|--------------------------------------------------------------------------
*/

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
    <div
      className={
        full
          ? "md:col-span-2"
          : ""
      }
    >
      <label className="mb-2 block text-xs font-semibold text-slate-600">
        {label}

        {required && (
          <span className="ml-1 text-red-500">
            *
          </span>
        )}
      </label>

      {children}
    </div>
  );
}