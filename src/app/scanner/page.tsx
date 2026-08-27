"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Download, FileImage, Loader2, RotateCcw, RotateCw, Trash2, Upload } from "lucide-react";
import { jsPDF } from "jspdf";

type ScanPage = { id: number; dataUrl: string };
type FilterMode = "original" | "grayscale" | "blackwhite";

export default function ScannerPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [filter, setFilter] = useState<FilterMode>("original");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [working, setWorking] = useState(false);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [cropPercent, setCropPercent] = useState(0);
  const [tilt, setTilt] = useState(0);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const openCamera = async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Kamera tidak tersedia. Silakan pilih file dari perangkat.");
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (videoRef.current) videoRef.current.srcObject = streamRef.current;
      setCameraOpen(true);
    } catch {
      setCameraError("Izin kamera ditolak atau kamera tidak tersedia. Silakan pilih file dari perangkat.");
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const processCanvas = (canvas: HTMLCanvasElement) => {
    if (filter === "original") return canvas.toDataURL("image/jpeg", 0.9);
    const context = canvas.getContext("2d");
    if (!context) return canvas.toDataURL("image/jpeg", 0.9);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < image.data.length; index += 4) {
      const gray = Math.round(image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114);
      const value = filter === "blackwhite" ? (gray > 165 ? 255 : 0) : gray;
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9);
  };

  const transformPage = (dataUrl: string, crop: number, angle: number) => new Promise<string>((resolve) => {
    const image = document.createElement("img");
    image.src = dataUrl;
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) { resolve(dataUrl); return; }
      const radians = (angle * Math.PI) / 180;
      const sourceCrop = Math.min(Math.max(crop, 0), 0.35);
      const sourceWidth = image.naturalWidth * (1 - sourceCrop * 2);
      const sourceHeight = image.naturalHeight * (1 - sourceCrop * 2);
      canvas.width = Math.ceil(Math.abs(sourceWidth * Math.cos(radians)) + Math.abs(sourceHeight * Math.sin(radians)));
      canvas.height = Math.ceil(Math.abs(sourceWidth * Math.sin(radians)) + Math.abs(sourceHeight * Math.cos(radians)));
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(radians);
      context.drawImage(image, image.naturalWidth * sourceCrop, image.naturalHeight * sourceCrop, sourceWidth, sourceHeight, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
      resolve(processCanvas(canvas));
    };
  });

  const applyTransform = async (angle: number, crop = cropPercent) => {
    if (selectedPage === null) return;
    const page = pages.find((item) => item.id === selectedPage);
    if (!page) return;
    const dataUrl = await transformPage(page.dataUrl, crop, angle);
    setPages((current) => current.map((item) => item.id === selectedPage ? { ...item, dataUrl } : item));
  };

  const autoCrop = () => {
    if (selectedPage === null) return;
    const page = pages.find((item) => item.id === selectedPage);
    if (!page) return;
    const image = document.createElement("img");
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width; let top = canvas.height; let right = 0; let bottom = 0;
      for (let y = 0; y < canvas.height; y += 4) for (let x = 0; x < canvas.width; x += 4) {
        const index = (y * canvas.width + x) * 4;
        const gray = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
        if (gray < 242) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
      }
      if (right <= left || bottom <= top) return;
      const padding = 0.02;
      const crop = Math.min(left / canvas.width, top / canvas.height, (canvas.width - right) / canvas.width, (canvas.height - bottom) / canvas.height);
      const safeCrop = Math.max(0, Math.min(crop - padding, 0.35));
      setCropPercent(safeCrop);
      applyTransform(0, safeCrop);
    };
    image.src = page.dataUrl;
  };

  const addImage = (image: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    setPages((current) => [...current, { id: Date.now() + current.length, dataUrl: processCanvas(canvas) }]);
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    selectedFiles.forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const image = document.createElement("img");
      image.onload = () => addImage(image);
      image.src = URL.createObjectURL(file);
    });
    event.target.value = "";
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setPages((current) => [...current, { id: Date.now(), dataUrl: processCanvas(canvas) }]);
  };

  const generatePdf = async () => {
    if (!pages.length) return;
    setWorking(true);
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    for (let index = 0; index < pages.length; index += 1) {
      if (index) pdf.addPage();
      const image = document.createElement("img");
      image.src = pages[index].dataUrl;
      await new Promise<void>((resolve) => { image.onload = () => resolve(); });
      const ratio = Math.min(190 / image.width, 277 / image.height);
      const width = image.width * ratio;
      const height = image.height * ratio;
      pdf.addImage(pages[index].dataUrl, "JPEG", (210 - width) / 2, (297 - height) / 2, width, height);
    }
    pdf.save(`arsip-scan-${new Date().toISOString().slice(0, 10)}.pdf`);
    setWorking(false);
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <div><p className="text-sm font-medium text-blue-600">Dokumen</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Scanner Dokumen</h1><p className="mt-2 text-sm text-slate-500">Ambil foto atau pilih beberapa gambar untuk membuat PDF.</p></div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={openCamera} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"><Camera size={17} /> Gunakan Kamera</button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"><Upload size={17} /> Pilih dari Perangkat<input type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" /></label>
          <select value={filter} onChange={(event) => setFilter(event.target.value as FilterMode)} className="rounded-xl border border-slate-200 px-3 text-sm text-slate-600"><option value="original">Original</option><option value="grayscale">Grayscale</option><option value="blackwhite">Black &amp; White</option></select>
        </div>
        {cameraError && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{cameraError}</p>}
        {cameraOpen && <div className="mt-5 max-w-xl space-y-3"><video ref={videoRef} autoPlay playsInline className="aspect-video w-full rounded-xl bg-slate-900 object-cover" /><div className="flex gap-2"><button type="button" onClick={capture} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">Ambil Foto</button><button type="button" onClick={closeCamera} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">Tutup Kamera</button></div></div>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-slate-900">Halaman ({pages.length})</h2>{pages.length > 0 && <button type="button" onClick={() => setPages([])} className="inline-flex items-center gap-2 text-sm text-red-600"><RotateCcw size={16} /> Bersihkan</button>}</div>
        {pages.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center text-center text-slate-400"><FileImage size={34} /><p className="mt-3 text-sm">Belum ada halaman scan.</p></div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{pages.map((page, index) => <div key={page.id} onClick={() => setSelectedPage(page.id)} className={`relative cursor-pointer rounded-xl border p-2 ${selectedPage === page.id ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"}`}><Image src={page.dataUrl} alt={`Halaman ${index + 1}`} width={300} height={400} unoptimized className="aspect-[3/4] w-full rounded-lg object-contain bg-slate-50" /><div className="mt-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Halaman {index + 1}</span><button type="button" onClick={(event) => { event.stopPropagation(); setPages((current) => current.filter((item) => item.id !== page.id)); if (selectedPage === page.id) setSelectedPage(null); }} title="Hapus halaman" className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></div></div>)}</div>}
        {selectedPage !== null && <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3"><span className="mr-2 text-sm font-semibold text-blue-900">Edit halaman:</span><button type="button" onClick={() => applyTransform(-90)} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700"><RotateCcw size={15} /> Putar kiri</button><button type="button" onClick={() => applyTransform(90)} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700"><RotateCw size={15} /> Putar kanan</button><button type="button" onClick={autoCrop} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700">Crop otomatis</button><label className="flex items-center gap-2 text-xs text-slate-700">Crop manual <input type="range" min="0" max="35" value={cropPercent * 100} onChange={(event) => { const value = Number(event.target.value) / 100; setCropPercent(value); void applyTransform(0, value); }} /></label><label className="flex items-center gap-2 text-xs text-slate-700">Luruskan <input type="range" min="-10" max="10" step="0.5" value={tilt} onChange={(event) => { const value = Number(event.target.value); setTilt(value); void applyTransform(value); }} /> <span>{tilt}°</span></label><button type="button" onClick={() => { setCropPercent(0); setTilt(0); void applyTransform(0, 0); }} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700">Reset edit</button></div>}
        <button type="button" onClick={generatePdf} disabled={!pages.length || working} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{working ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />} {working ? "Membuat PDF..." : "Simpan PDF"}</button>
      </section>
    </main>
  );
}