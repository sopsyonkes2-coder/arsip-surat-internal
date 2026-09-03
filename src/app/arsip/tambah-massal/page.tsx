"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Camera,
  Copy,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import CameraCapture from "@/components/CameraCapture";

type Row = {
  id: number;
  nomorAgenda: string;
  nomorSurat: string;
  tanggalSurat: string;
  tanggalDiterima: string;
  pengirim: string;
  perihal: string;
  klasifikasi: string;
  file: File | null;
};

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

const emptyRow = (id: number): Row => ({
  id,
  nomorAgenda: "",
  nomorSurat: "",
  tanggalSurat: "",
  tanggalDiterima: "",
  pengirim: "",
  perihal: "",
  klasifikasi: "",
  file: null,
});

const fields = [
  "nomorAgenda",
  "nomorSurat",
  "tanggalSurat",
  "tanggalDiterima",
  "pengirim",
  "perihal",
  "klasifikasi",
] as const;

const fieldLabels: Record<(typeof fields)[number], string> = {
  nomorAgenda: "Nomor Agenda",
  nomorSurat: "Nomor Surat",
  tanggalSurat: "Tgl Surat",
  tanggalDiterima: "Tgl Diterima",
  pengirim: "Pengirim",
  perihal: "Perihal",
  klasifikasi: "Klasifikasi",
};

const inputClass =
  "h-10 w-full min-w-[130px] rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export default function TambahMassalPage() {
  const [rows, setRows] = useState<Row[]>([emptyRow(1)]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState("");
  const [cameraRowId, setCameraRowId] = useState<number | null>(null);

  const updateRow = (
    id: number,
    field: keyof Row,
    value: string | File | null
  ) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const duplicateRow = (row: Row) =>
    setRows((current) => [
      ...current,
      { ...row, id: Date.now(), file: null },
    ]);

  const saveAll = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setResult("");
    let success = 0;
    let failed = 0;

    for (const row of rows) {
      if (
        !row.nomorAgenda ||
        !row.nomorSurat ||
        !row.tanggalSurat ||
        !row.tanggalDiterima ||
        !row.pengirim ||
        !row.perihal ||
        !row.klasifikasi ||
        !row.file
      ) {
        failed += 1;
        continue;
      }

      const formData = new FormData();
      formData.append("nomorAgenda", row.nomorAgenda);
      formData.append("nomorSurat", row.nomorSurat);
      formData.append("tanggalSurat", row.tanggalSurat);
      formData.append("tanggalDiterima", row.tanggalDiterima);
      formData.append("pengirim", row.pengirim);
      formData.append("perihal", row.perihal);
      formData.append("klasifikasi", row.klasifikasi);
      formData.append("file", row.file);

      try {
        const response = await fetch("/api/archives", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as { success?: boolean };
        if (!response.ok || !payload.success) failed += 1;
        else success += 1;
      } catch {
        failed += 1;
      }
    }

    setResult(`Berhasil: ${success} | Gagal: ${failed}`);

    if (success > 0 && failed === 0) {
      setRows([emptyRow(1)]);
    }

    setSaving(false);
  };

  return (
    <div className="-mx-4 min-h-[calc(100vh-4rem)] w-[calc(100%+2rem)] bg-slate-50 sm:-mx-6 sm:w-[calc(100%+3rem)] lg:-mx-8 lg:w-[calc(100%+4rem)]">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/arsip"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft size={16} /> Kembali ke Arsip
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Tambah Arsip Massal
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Setiap baris divalidasi dan dikirim ke backend satu per satu.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRows([...rows, emptyRow(Date.now())])}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus size={17} /> Tambah Baris
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Save size={17} />
              {saving ? "Menyimpan..." : "Simpan Semua"}
            </button>
          </div>
        </div>
        {result && (
          <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            {result}
          </p>
        )}
      </div>

      <form onSubmit={saveAll} className="flex flex-col">
        <div className="w-full overflow-x-auto bg-white">
          <table className="w-full min-w-[1280px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-100/95 px-3 py-3">
                  No
                </th>
                {fields.map((f) => (
                  <th key={f} className="whitespace-nowrap px-3 py-3">
                    {fieldLabels[f]}
                  </th>
                ))}
                <th className="px-3 py-3">File PDF</th>
                <th className="px-3 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 align-top transition hover:bg-slate-50/80"
                >
                  <td className="sticky left-0 z-10 bg-white px-3 py-2.5 font-semibold text-slate-700">
                    {index + 1}
                  </td>
                  {fields.map((field) => (
                    <td key={field} className="px-2 py-2">
                      {field === "klasifikasi" ? (
                        <select
                          value={row.klasifikasi}
                          onChange={(e) =>
                            updateRow(row.id, "klasifikasi", e.target.value)
                          }
                          className={inputClass}
                        >
                          <option value="">Pilih klasifikasi</option>
                          {classifications.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.includes("tanggal") ? "date" : "text"}
                          value={row[field]}
                          onChange={(e) =>
                            updateRow(row.id, field, e.target.value)
                          }
                          placeholder={fieldLabels[field]}
                          className={inputClass}
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <div className="flex min-w-[180px] flex-col gap-1.5">
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) =>
                          updateRow(
                            row.id,
                            "file",
                            e.target.files?.[0] || null
                          )
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-slate-700"
                      />
                      <button
                        type="button"
                        onClick={() => setCameraRowId(row.id)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        <Camera size={14} />
                        Scan Kamera
                      </button>
                      {row.file && (
                        <span className="truncate text-[11px] text-emerald-600">
                          {row.file.name}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => duplicateRow(row)}
                        title="Duplikasi"
                        className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRows(rows.filter((item) => item.id !== row.id))
                        }
                        disabled={rows.length === 1}
                        title="Hapus"
                        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <p className="text-xs text-slate-500">
            {rows.length} baris · isi semua kolom + file PDF
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRows([...rows, emptyRow(Date.now())])}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              <Plus size={17} /> Tambah Baris
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Save size={17} />
              {saving ? "Menyimpan..." : "Simpan Semua"}
            </button>
          </div>
        </div>
      </form>

      <CameraCapture
        open={cameraRowId !== null}
        onClose={() => setCameraRowId(null)}
        onComplete={(scannedFile) => {
          if (cameraRowId !== null) {
            updateRow(cameraRowId, "file", scannedFile);
          }
          setCameraRowId(null);
        }}
      />
    </div>
  );
}