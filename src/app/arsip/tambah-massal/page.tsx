"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Copy, Plus, Save, Trash2 } from "lucide-react";
import { jsPDF } from "jspdf";

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

const emptyRow = (id: number): Row => ({
  id, nomorAgenda: "", nomorSurat: "", tanggalSurat: "", tanggalDiterima: "",
  pengirim: "", perihal: "", klasifikasi: "", file: null,
});

export default function TambahMassalPage() {
  const [rows, setRows] = useState<Row[]>([emptyRow(1)]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState("");
  const [cameraRowId, setCameraRowId] = useState<number | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const updateRow = (id: number, field: keyof Row, value: string | File | null) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  };

  const duplicateRow = (row: Row) => setRows((current) => [...current, { ...row, id: Date.now() }]);

  useEffect(() => {
    if (cameraRowId !== null && cameraVideoRef.current && cameraStreamRef.current) {
      cameraVideoRef.current.srcObject = cameraStreamRef.current;
      void cameraVideoRef.current.play();
    }
  }, [cameraRowId]);

  useEffect(() => () => cameraStreamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const openRowCamera = async (rowId: number) => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Kamera tidak tersedia di perangkat ini.");
      cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      setCameraRowId(rowId);
    } catch (cameraError: unknown) {
      setResult(cameraError instanceof Error ? cameraError.message : "Kamera tidak dapat digunakan.");
    }
  };

  const closeRowCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraRowId(null);
  };

  const captureRowCamera = () => {
    const video = cameraVideoRef.current;
    if (!video?.videoWidth || cameraRowId === null) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const ratio = Math.min(190 / canvas.width, 277 / canvas.height);
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", (210 - canvas.width * ratio) / 2, (297 - canvas.height * ratio) / 2, canvas.width * ratio, canvas.height * ratio);
    updateRow(cameraRowId, "file", new File([pdf.output("arraybuffer")], `scan-${cameraRowId}.pdf`, { type: "application/pdf" }));
    closeRowCamera();
  };

  const saveAll = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setResult("");
    let success = 0;
    let failed = 0;

    for (const row of rows) {
      if (!row.nomorAgenda || !row.nomorSurat || !row.tanggalSurat || !row.tanggalDiterima || !row.pengirim || !row.perihal || !row.klasifikasi || !row.file) {
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
        const response = await fetch("/api/archives", { method: "POST", body: formData });
        const payload = (await response.json()) as { success?: boolean };
        if (!response.ok || !payload.success) failed += 1;
        else success += 1;
      } catch {
        failed += 1;
      }
    }

    setResult(`Berhasil: ${success} | Gagal: ${failed}`);
    setSaving(false);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Link href="/arsip" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600"><ArrowLeft size={16} /> Kembali ke Arsip</Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Tambah Arsip Massal</h1>
        <p className="mt-2 text-sm text-slate-500">Setiap baris divalidasi dan dikirim ke backend satu per satu.</p>
      </div>
      <form onSubmit={saveAll} className="space-y-4">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[1250px] w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr><th className="p-3">No</th><th className="p-3">Nomor Agenda</th><th className="p-3">Nomor Surat</th><th className="p-3">Tanggal Surat</th><th className="p-3">Tanggal Diterima</th><th className="p-3">Pengirim</th><th className="p-3">Perihal</th><th className="p-3">Klasifikasi</th><th className="p-3">File PDF</th><th className="p-3">Aksi</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={row.id} className="align-top hover:bg-slate-50"><td className="p-2 font-semibold">{index + 1}</td>{(["nomorAgenda", "nomorSurat", "tanggalSurat", "tanggalDiterima", "pengirim", "perihal", "klasifikasi"] as const).map((field) => <td key={field} className="p-2"><input type={field.includes("tanggal") ? "date" : "text"} value={row[field]} onChange={(event) => updateRow(row.id, field, event.target.value)} placeholder={field} className="h-10 w-full min-w-[120px] rounded-lg border border-slate-200 px-2 outline-none focus:border-blue-500" /></td>)}<td className="p-2"><div className="flex w-52 flex-col gap-2"><input type="file" accept="application/pdf" onChange={(event) => updateRow(row.id, "file", event.target.files?.[0] || null)} className="w-48 text-xs" /><button type="button" title="Scan dokumen dengan kamera" aria-label="Scan dokumen dengan kamera" onClick={() => void openRowCamera(row.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"><Camera size={16} /></button>{row.file && <span className="truncate text-[11px] text-emerald-600">{row.file.name}</span>}</div></td><td className="p-2"><div className="flex gap-1"><button type="button" onClick={() => duplicateRow(row)} title="Duplikasi baris" className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"><Copy size={16} /></button><button type="button" onClick={() => setRows(rows.filter((item) => item.id !== row.id))} disabled={rows.length === 1} title="Hapus baris" className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 size={16} /></button></div></td></tr>)}</tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setRows([...rows, emptyRow(Date.now())])} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600"><Plus size={17} /> Tambah Baris</button>
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"><Save size={17} /> {saving ? "Menyimpan..." : "Simpan Semua"}</button>
        </div>
        {result && <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">{result}</p>}
      </form>
        {cameraRowId !== null && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"><div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl"><h2 className="font-semibold text-slate-900">Scan kamera untuk baris {rows.findIndex((row) => row.id === cameraRowId) + 1}</h2><video ref={cameraVideoRef} autoPlay playsInline muted className="mt-4 aspect-video w-full rounded-xl bg-slate-900 object-cover" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={closeRowCamera} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">Batal</button><button type="button" onClick={captureRowCamera} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">Ambil Foto jadi PDF</button></div></div></div>}
    </div>
  );
}