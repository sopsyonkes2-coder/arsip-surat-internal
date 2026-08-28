"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
  RotateCcw,
  Check,
  Loader2,
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

type ScanFilter = "color" | "gray" | "bw";

type ScanPage = {
  id: string;
  originalDataUrl: string;
  filter: ScanFilter;
  previewDataUrl: string;
};

type DetectedBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PdfPreviewState = {
  url: string;
  blob: Blob;
  fileName: string;
  pageCount: number;
  sizeBytes: number;
};

const JPEG_QUALITY = 0.72;
const MAX_IMAGE_SIDE = 1400;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal memuat gambar."));
    img.src = src;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): string {
  return canvas.toDataURL("image/jpeg", quality);
}

/** Resize canvas jika lebih besar dari MAX_IMAGE_SIDE */
function downscaleCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const maxSide = Math.max(source.width, source.height);
  if (maxSide <= MAX_IMAGE_SIDE) return source;

  const scale = MAX_IMAGE_SIDE / maxSide;
  const w = Math.round(source.width * scale);
  const h = Math.round(source.height * scale);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return out;
}

function detectDocumentBounds(
  imageData: ImageData,
  width: number,
  height: number
): DetectedBounds {
  const data = imageData.data;
  const step = 6;
  let sum = 0;
  let samples = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      samples++;
    }
  }
  const avg = samples ? sum / samples : 128;
  const threshold = 42;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (Math.abs(lum - avg) > threshold) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found || maxX - minX < width * 0.2 || maxY - minY < height * 0.2) {
    return { x: 0, y: 0, width, height };
  }

  const padX = Math.round(width * 0.015);
  const padY = Math.round(height * 0.015);
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(width - 1, maxX + padX);
  maxY = Math.min(height - 1, maxY + padY);

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function applyFilterPixels(
  imageData: ImageData,
  filter: ScanFilter
): ImageData {
  const src = imageData.data;
  const out = new ImageData(
    new Uint8ClampedArray(src),
    imageData.width,
    imageData.height
  );
  const d = out.data;

  if (filter === "color") {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, (d[i] - 128) * 1.1 + 128));
      d[i + 1] = Math.min(255, Math.max(0, (d[i + 1] - 128) * 1.1 + 128));
      d[i + 2] = Math.min(255, Math.max(0, (d[i + 2] - 128) * 1.1 + 128));
    }
  } else if (filter === "gray") {
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = Math.min(255, Math.max(0, (g - 128) * 1.12 + 128));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  } else {
    let sum = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    const mean = sum / n;
    const threshold = Math.min(180, Math.max(100, mean * 0.9));
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = g < threshold ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
  return out;
}

function applyFilterToCanvas(
  source: HTMLCanvasElement,
  filter: ScanFilter
): HTMLCanvasElement {
  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;
  const filtered = applyFilterPixels(
    ctx.getImageData(0, 0, source.width, source.height),
    filter
  );
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  out.getContext("2d")?.putImageData(filtered, 0, 0);
  return out;
}

/**
 * Ambil frame dari video → auto crop (jika berhasil) → resize → simpan original
 * Lalu terapkan filter untuk preview.
 * Jika apa pun gagal, fallback: full frame tanpa crop.
 */
function processCaptureFrame(
  video: HTMLVideoElement,
  filter: ScanFilter
): { originalDataUrl: string; previewDataUrl: string } {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    throw new Error("Kamera belum siap. Tunggu sebentar lalu coba lagi.");
  }

  const src = document.createElement("canvas");
  src.width = vw;
  src.height = vh;
  const srcCtx = src.getContext("2d", { willReadFrequently: true });
  if (!srcCtx) throw new Error("Canvas tidak didukung di browser ini.");
  srcCtx.drawImage(video, 0, 0);

  let working: HTMLCanvasElement = src;

  try {
    const id = srcCtx.getImageData(0, 0, vw, vh);
    const bounds = detectDocumentBounds(id, vw, vh);
    const isFull =
      bounds.x === 0 &&
      bounds.y === 0 &&
      bounds.width === vw &&
      bounds.height === vh;

    if (!isFull) {
      const crop = document.createElement("canvas");
      crop.width = bounds.width;
      crop.height = bounds.height;
      const cctx = crop.getContext("2d");
      if (cctx) {
        cctx.drawImage(
          src,
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height,
          0,
          0,
          bounds.width,
          bounds.height
        );
        working = crop;
      }
    }
  } catch {
    working = src;
  }

  working = downscaleCanvas(working);
  const originalDataUrl = canvasToJpeg(working, JPEG_QUALITY);
  const filtered = applyFilterToCanvas(working, filter);
  const previewDataUrl = canvasToJpeg(filtered, JPEG_QUALITY);

  return { originalDataUrl, previewDataUrl };
}

async function reapplyFilter(
  originalDataUrl: string,
  filter: ScanFilter
): Promise<string> {
  const img = await loadImage(originalDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return originalDataUrl;
  ctx.drawImage(img, 0, 0);
  const filtered = applyFilterToCanvas(canvas, filter);
  return canvasToJpeg(filtered, JPEG_QUALITY);
}

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
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectLoopRef = useRef<number | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanPages, setScanPages] = useState<ScanPage[]>([]);
  const [activeFilter, setActiveFilter] = useState<ScanFilter>("color");
  const [capturing, setCapturing] = useState(false);
  const [docDetected, setDocDetected] = useState(false);
  const [buildingPdf, setBuildingPdf] = useState(false);
  const [captureMessage, setCaptureMessage] = useState("");

  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

  const handleChange = (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
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

  const removeFile = () => setFile(null);

  const stopDetectLoop = useCallback(() => {
    if (detectLoopRef.current !== null) {
      cancelAnimationFrame(detectLoopRef.current);
      detectLoopRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    stopDetectLoop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stopDetectLoop]);

  useEffect(() => {
    return () => {
      stopStream();
      if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Video + outline deteksi
  useEffect(() => {
    if (!cameraOpen || !streamRef.current) return;

    const video = videoRef.current;
    if (video) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => {});
    }

    let lastDetect = 0;

    const tick = (ts: number) => {
      const v = videoRef.current;
      const overlay = overlayRef.current;
      if (!v || !overlay || !v.videoWidth) {
        detectLoopRef.current = requestAnimationFrame(tick);
        return;
      }

      if (overlay.width !== v.clientWidth || overlay.height !== v.clientHeight) {
        overlay.width = v.clientWidth || 1;
        overlay.height = v.clientHeight || 1;
      }

      // Deteksi tiap ~200ms agar tidak berat
      if (ts - lastDetect > 200) {
        lastDetect = ts;
        try {
          const sample = document.createElement("canvas");
          const sw = Math.min(240, v.videoWidth);
          const sh = Math.round((sw / v.videoWidth) * v.videoHeight);
          sample.width = sw;
          sample.height = sh;
          const sctx = sample.getContext("2d", { willReadFrequently: true });
          if (sctx) {
            sctx.drawImage(v, 0, 0, sw, sh);
            const id = sctx.getImageData(0, 0, sw, sh);
            const bounds = detectDocumentBounds(id, sw, sh);
            const isFull =
              bounds.x === 0 &&
              bounds.y === 0 &&
              bounds.width === sw &&
              bounds.height === sh;
            setDocDetected(!isFull);

            const ctx = overlay.getContext("2d");
            if (ctx) {
              const scaleX = overlay.width / sw;
              const scaleY = overlay.height / sh;
              ctx.clearRect(0, 0, overlay.width, overlay.height);

              if (!isFull) {
                ctx.fillStyle = "rgba(0,0,0,0.3)";
                ctx.fillRect(0, 0, overlay.width, overlay.height);
                ctx.clearRect(
                  bounds.x * scaleX,
                  bounds.y * scaleY,
                  bounds.width * scaleX,
                  bounds.height * scaleY
                );
              }

              ctx.strokeStyle = isFull ? "rgba(148,163,184,0.5)" : "#22c55e";
              ctx.lineWidth = 2.5;
              ctx.setLineDash(isFull ? [6, 4] : []);
              ctx.strokeRect(
                bounds.x * scaleX + 1,
                bounds.y * scaleY + 1,
                bounds.width * scaleX - 2,
                bounds.height * scaleY - 2
              );
            }
          }
        } catch {
          // ignore detection errors
        }
      }

      detectLoopRef.current = requestAnimationFrame(tick);
    };

    detectLoopRef.current = requestAnimationFrame(tick);
    return () => stopDetectLoop();
  }, [cameraOpen, stopDetectLoop]);

  useEffect(() => {
    const anyModal = cameraOpen || pdfPreviewOpen;
    document.body.style.overflow = anyModal ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [cameraOpen, pdfPreviewOpen]);

  const openCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Kamera tidak tersedia di perangkat ini.");
      }
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      setCameraOpen(true);
      setError("");
      setCaptureMessage("");
    } catch (cameraError: unknown) {
      setError(
        cameraError instanceof Error
          ? cameraError.message
          : "Kamera tidak dapat digunakan."
      );
    }
  };

  const closeCamera = () => {
    stopStream();
    setCameraOpen(false);
    setDocDetected(false);
    setCaptureMessage("");
  };

  const captureCameraPage = () => {
    const video = videoRef.current;
    if (!video) {
      setCaptureMessage("Video kamera belum siap.");
      return;
    }
    if (!video.videoWidth) {
      setCaptureMessage("Tunggu kamera aktif, lalu coba lagi.");
      return;
    }
    if (capturing) return;

    setCapturing(true);
    setCaptureMessage("");

    // defer agar UI sempat update (spinner)
    requestAnimationFrame(() => {
      try {
        const { originalDataUrl, previewDataUrl } = processCaptureFrame(
          video,
          activeFilter
        );
        const page: ScanPage = {
          id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          originalDataUrl,
          filter: activeFilter,
          previewDataUrl,
        };
        setScanPages((prev) => [...prev, page]);
        setCaptureMessage(`Halaman ${scanPages.length + 1} berhasil diambil`);
        setTimeout(() => setCaptureMessage(""), 2000);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Gagal mengambil halaman.";
        setCaptureMessage(msg);
        setError(msg);
      } finally {
        setCapturing(false);
      }
    });
  };

  const removeScanPage = (id: string) => {
    setScanPages((prev) => prev.filter((p) => p.id !== id));
  };

  const changePageFilter = (id: string, filter: ScanFilter) => {
    setScanPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, filter } : p))
    );

    const page = scanPages.find((p) => p.id === id);
    const original = page?.originalDataUrl;
    if (!original) return;

    void reapplyFilter(original, filter).then((previewDataUrl) => {
      setScanPages((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, filter, previewDataUrl } : p
        )
      );
    });
  };

  const revokePdfPreview = useCallback(() => {
    setPdfPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const buildPdfBlob = async (): Promise<{
    blob: Blob;
    fileName: string;
    pageCount: number;
  }> => {
    if (!scanPages.length) throw new Error("Belum ada halaman scan.");

    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const pageW = 210;
    const pageH = 297;
    const margin = 8;

    for (let index = 0; index < scanPages.length; index++) {
      const page = scanPages[index];
      const img = await loadImage(page.previewDataUrl);
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const drawW = img.width * ratio;
      const drawH = img.height * ratio;
      const x = (pageW - drawW) / 2;
      const y = (pageH - drawH) / 2;
      if (index > 0) pdf.addPage();
      // 'FAST' = kompresi internal jsPDF
      pdf.addImage(
        page.previewDataUrl,
        "JPEG",
        x,
        y,
        drawW,
        drawH,
        undefined,
        "FAST"
      );
    }

    const arrayBuffer = pdf.output("arraybuffer");
    const blob = new Blob([arrayBuffer], { type: "application/pdf" });
    return {
      blob,
      fileName: `scan-${Date.now()}.pdf`,
      pageCount: scanPages.length,
    };
  };

  const makeScanPdf = async () => {
    if (!scanPages.length || buildingPdf) return;
    setBuildingPdf(true);
    setCaptureMessage("");
    try {
      const { blob, fileName, pageCount } = await buildPdfBlob();
      revokePdfPreview();
      const url = URL.createObjectURL(blob);
      setPdfPreview({
        url,
        blob,
        fileName,
        pageCount,
        sizeBytes: blob.size,
      });
      setPdfPreviewOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat PDF.");
    } finally {
      setBuildingPdf(false);
    }
  };

  const rebuildPdf = async () => {
    if (!scanPages.length || buildingPdf) return;
    setBuildingPdf(true);
    try {
      const { blob, fileName, pageCount } = await buildPdfBlob();
      revokePdfPreview();
      const url = URL.createObjectURL(blob);
      setPdfPreview({
        url,
        blob,
        fileName,
        pageCount,
        sizeBytes: blob.size,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal membuat ulang PDF."
      );
    } finally {
      setBuildingPdf(false);
    }
  };

  const confirmUsePdf = () => {
    if (!pdfPreview) return;
    const finalFile = new File([pdfPreview.blob], pdfPreview.fileName, {
      type: "application/pdf",
    });
    setFile(finalFile);
    setError("");
    setPdfPreviewOpen(false);
    revokePdfPreview();
    setScanPages([]);
    closeCamera();
  };

  const backToEditScanner = () => {
    setPdfPreviewOpen(false);
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
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
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

  const filterChip = (f: ScanFilter, current: ScanFilter, onClick: () => void) => (
    <button
      key={f}
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
        current === f
          ? "bg-blue-600 text-white shadow"
          : "bg-slate-700 text-slate-300 hover:bg-slate-600"
      }`}
    >
      {f === "color" ? "Color" : f === "gray" ? "Gray" : "B&W"}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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
                onDrop={handleDrop}
                className={`rounded-2xl border-2 border-dashed p-8 text-center transition md:p-12 ${
                  dragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50"
                }`}
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

      {/* MODAL SCANNER */}
      {cameraOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-2 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pdfPreviewOpen) closeCamera();
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Camera size={20} className="shrink-0 text-blue-400" />
                  <h3 className="text-sm font-semibold text-white sm:text-base">
                    Scan Dokumen
                  </h3>
                  {scanPages.length > 0 && (
                    <span className="rounded-full bg-blue-600/30 px-2.5 py-0.5 text-xs font-medium text-blue-300">
                      {scanPages.length} halaman
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Arahkan kamera ke kertas · auto crop
                </p>
              </div>
              <button
                type="button"
                onClick={closeCamera}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Tutup"
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="relative aspect-[3/4] w-full bg-black sm:aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
                <canvas
                  ref={overlayRef}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
                <div className="pointer-events-none absolute left-3 top-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur-sm ${
                      docDetected
                        ? "bg-emerald-600/80 text-white"
                        : "bg-black/50 text-slate-300"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        docDetected ? "bg-white" : "bg-slate-400"
                      }`}
                    />
                    {docDetected ? "Dokumen terdeteksi" : "Cari dokumen…"}
                  </span>
                </div>
                {captureMessage && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white">
                    {captureMessage}
                  </div>
                )}
              </div>

              {/* FILTER — selalu terlihat */}
              <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-700 bg-slate-800 px-3 py-3">
                <span className="w-full text-center text-xs font-medium text-slate-400 sm:w-auto sm:text-left">
                  Filter halaman baru:
                </span>
                {(["color", "gray", "bw"] as ScanFilter[]).map((f) =>
                  filterChip(f, activeFilter, () => setActiveFilter(f))
                )}
              </div>

              {/* THUMBNAIL + filter per halaman */}
              {scanPages.length > 0 && (
                <div className="border-t border-slate-700 bg-slate-800/60 px-3 py-3">
                  <p className="mb-2 text-xs font-medium text-slate-400">
                    Preview halaman ({scanPages.length})
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {scanPages.map((page, index) => (
                      <div
                        key={page.id}
                        className="w-[100px] shrink-0 sm:w-[110px]"
                      >
                        <div className="relative overflow-hidden rounded-lg border border-slate-600 bg-black">
                          <Image
                            src={page.previewDataUrl}
                            alt={`Halaman ${index + 1}`}
                            width={110}
                            height={140}
                            unoptimized
                            className="aspect-[3/4] w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeScanPage(page.id)}
                            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white"
                            aria-label={`Hapus ${index + 1}`}
                          >
                            ×
                          </button>
                          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {index + 1}
                          </span>
                        </div>
                        <div className="mt-1.5 flex justify-center gap-1">
                          {(["color", "gray", "bw"] as ScanFilter[]).map(
                            (f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => changePageFilter(page.id, f)}
                                className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                  page.filter === f
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-700 text-slate-400"
                                }`}
                              >
                                {f === "color"
                                  ? "C"
                                  : f === "gray"
                                    ? "G"
                                    : "BW"}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-slate-700 bg-slate-900 px-3 py-3 sm:gap-3">
              <button
                type="button"
                onClick={captureCameraPage}
                disabled={capturing}
                className="inline-flex min-w-[140px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {capturing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Camera size={16} />
                )}
                {capturing ? "Memproses…" : "Ambil Halaman"}
              </button>

              <button
                type="button"
                onClick={makeScanPdf}
                disabled={!scanPages.length || buildingPdf}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {buildingPdf ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FileText size={16} />
                )}
                Buat PDF ({scanPages.length})
              </button>

              <button
                type="button"
                onClick={closeCamera}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700"
              >
                Tutup Kamera
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PREVIEW PDF */}
      {pdfPreviewOpen && pdfPreview && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-900 shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white sm:text-base">
                  Preview PDF
                </h3>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {pdfPreview.fileName} · {pdfPreview.pageCount} halaman ·{" "}
                  {(pdfPreview.sizeBytes / 1024).toFixed(0)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={backToEditScanner}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X size={22} />
              </button>
            </div>

            <div className="min-h-0 flex-1 bg-slate-950">
              <iframe
                src={`${pdfPreview.url}#view=FitH`}
                title="Preview PDF"
                className="h-[55vh] w-full border-0 sm:h-[62vh]"
              />
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-slate-700 bg-slate-900 px-3 py-3 sm:gap-3">
              <button
                type="button"
                onClick={backToEditScanner}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700"
              >
                <ArrowLeft size={16} />
                Kembali Edit
              </button>
              <button
                type="button"
                onClick={rebuildPdf}
                disabled={buildingPdf}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                {buildingPdf ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RotateCcw size={16} />
                )}
                Buat Ulang
              </button>
              <button
                type="button"
                onClick={confirmUsePdf}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                <Check size={16} />
                Gunakan PDF Ini
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