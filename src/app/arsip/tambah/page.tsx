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

/* ========== IMAGE PROCESSING (Canvas API) ========== */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Deteksi bounding box dokumen berdasarkan konten (threshold luminance). Fallback: full frame. */
function detectDocumentBounds(
  imageData: ImageData,
  width: number,
  height: number
): DetectedBounds {
  const data = imageData.data;
  const threshold = 38; // selisih dari background rata-rata
  let sum = 0;
  const step = 8;
  let samples = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      samples++;
    }
  }
  const avg = sum / samples;

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

  if (!found || maxX - minX < width * 0.25 || maxY - minY < height * 0.25) {
    return { x: 0, y: 0, width, height };
  }

  // padding kecil agar tepi tidak terpotong
  const padX = Math.round(width * 0.02);
  const padY = Math.round(height * 0.02);
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(width - 1, maxX + padX);
  maxY = Math.min(height - 1, maxY + padY);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** Estimasi sudut kemiringan sederhana via proyeksi horizontal (deskew ringan). */
function estimateSkewAngle(
  imageData: ImageData,
  width: number,
  height: number
): number {
  const data = imageData.data;
  const angles = [-8, -6, -4, -2, 0, 2, 4, 6, 8];
  let bestAngle = 0;
  let bestScore = -1;

  for (const angle of angles) {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const projection = new Float32Array(height);
    let count = 0;

    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const i = (y * width + x) * 4;
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum < 140) {
          const ny = Math.round(x * sin + y * cos);
          if (ny >= 0 && ny < height) {
            projection[ny]++;
            count++;
          }
        }
      }
    }

    if (count < 50) continue;

    // skor: variansi proyeksi (baris teks lurus → puncak tajam)
    let mean = 0;
    for (let i = 0; i < height; i++) mean += projection[i];
    mean /= height;
    let variance = 0;
    for (let i = 0; i < height; i++) {
      const d = projection[i] - mean;
      variance += d * d;
    }
    if (variance > bestScore) {
      bestScore = variance;
      bestAngle = angle;
    }
  }

  return bestAngle;
}

function applyFilterToImageData(
  imageData: ImageData,
  filter: ScanFilter
): ImageData {
  const data = imageData.data;
  const out = new ImageData(
    new Uint8ClampedArray(data),
    imageData.width,
    imageData.height
  );
  const d = out.data;

  if (filter === "color") {
    // sedikit peningkatan ketajaman / kontras
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, (d[i] - 128) * 1.12 + 128));
      d[i + 1] = Math.min(255, Math.max(0, (d[i + 1] - 128) * 1.12 + 128));
      d[i + 2] = Math.min(255, Math.max(0, (d[i + 2] - 128) * 1.12 + 128));
    }
  } else if (filter === "gray") {
    for (let i = 0; i < d.length; i += 4) {
      const g =
        0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // kontras ringan agar tulisan tetap tajam
      const v = Math.min(255, Math.max(0, (g - 128) * 1.15 + 128));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  } else {
    // B&W threshold adaptif + sedikit noise reduction
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    const mean = sum / (d.length / 4);
    const threshold = Math.min(185, Math.max(110, mean * 0.92));

    for (let i = 0; i < d.length; i += 4) {
      const g =
        0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = g < threshold ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }

  return out;
}

async function processCaptureFrame(
  video: HTMLVideoElement,
  filter: ScanFilter
): Promise<{ originalDataUrl: string; previewDataUrl: string }> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    throw new Error("Kamera belum siap.");
  }

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = vw;
  srcCanvas.height = vh;
  const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
  if (!srcCtx) throw new Error("Canvas tidak didukung.");
  srcCtx.drawImage(video, 0, 0);

  let imageData = srcCtx.getImageData(0, 0, vw, vh);
  const bounds = detectDocumentBounds(imageData, vw, vh);

  // Crop
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = bounds.width;
  cropCanvas.height = bounds.height;
  const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });
  if (!cropCtx) throw new Error("Canvas tidak didukung.");
  cropCtx.drawImage(
    srcCanvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height
  );

  // Deskew ringan
  imageData = cropCtx.getImageData(0, 0, bounds.width, bounds.height);
  const skew = estimateSkewAngle(imageData, bounds.width, bounds.height);

  let workingCanvas = cropCanvas;
  if (Math.abs(skew) >= 1.5) {
    const rad = (-skew * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const nw = Math.ceil(bounds.width * cos + bounds.height * sin);
    const nh = Math.ceil(bounds.width * sin + bounds.height * cos);
    const rotCanvas = document.createElement("canvas");
    rotCanvas.width = nw;
    rotCanvas.height = nh;
    const rotCtx = rotCanvas.getContext("2d");
    if (rotCtx) {
      rotCtx.fillStyle = "#ffffff";
      rotCtx.fillRect(0, 0, nw, nh);
      rotCtx.translate(nw / 2, nh / 2);
      rotCtx.rotate(rad);
      rotCtx.drawImage(cropCanvas, -bounds.width / 2, -bounds.height / 2);
      workingCanvas = rotCanvas;
    }
  }

  // Simpan original (crop + deskew) sebagai JPEG
  const originalDataUrl = workingCanvas.toDataURL("image/jpeg", 0.92);

  // Apply filter untuk preview
  const wCtx = workingCanvas.getContext("2d", { willReadFrequently: true });
  if (!wCtx) throw new Error("Canvas tidak didukung.");
  const filtered = applyFilterToImageData(
    wCtx.getImageData(0, 0, workingCanvas.width, workingCanvas.height),
    filter
  );
  const filterCanvas = document.createElement("canvas");
  filterCanvas.width = workingCanvas.width;
  filterCanvas.height = workingCanvas.height;
  filterCanvas.getContext("2d")?.putImageData(filtered, 0, 0);
  const previewDataUrl = filterCanvas.toDataURL("image/jpeg", 0.92);

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
  const filtered = applyFilterToImageData(
    ctx.getImageData(0, 0, img.width, img.height),
    filter
  );
  ctx.putImageData(filtered, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/* ========== PAGE COMPONENT ========== */

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

  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

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

  const stopDetectLoop = useCallback(() => {
    if (detectLoopRef.current !== null) {
      cancelAnimationFrame(detectLoopRef.current);
      detectLoopRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    stopDetectLoop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stopDetectLoop]);

  // Cleanup unmount
  useEffect(() => {
    return () => {
      stopStream();
      if (pdfPreview?.url) {
        URL.revokeObjectURL(pdfPreview.url);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach stream + detection loop
  useEffect(() => {
    if (!cameraOpen || !streamRef.current) return;

    const video = videoRef.current;
    if (video) {
      video.srcObject = streamRef.current;
      void video.play();
    }

    const runDetect = () => {
      const v = videoRef.current;
      const overlay = overlayRef.current;
      if (!v || !overlay || !v.videoWidth) {
        detectLoopRef.current = requestAnimationFrame(runDetect);
        return;
      }

      const ow = overlay.width;
      const oh = overlay.height;
      if (ow !== v.clientWidth || oh !== v.clientHeight) {
        overlay.width = v.clientWidth;
        overlay.height = v.clientHeight;
      }

      const ctx = overlay.getContext("2d");
      if (!ctx) {
        detectLoopRef.current = requestAnimationFrame(runDetect);
        return;
      }

      // sample kecil untuk performa
      const sample = document.createElement("canvas");
      const sw = Math.min(320, v.videoWidth);
      const sh = Math.round((sw / v.videoWidth) * v.videoHeight);
      sample.width = sw;
      sample.height = sh;
      const sctx = sample.getContext("2d", { willReadFrequently: true });
      if (!sctx) {
        detectLoopRef.current = requestAnimationFrame(runDetect);
        return;
      }
      sctx.drawImage(v, 0, 0, sw, sh);
      const id = sctx.getImageData(0, 0, sw, sh);
      const bounds = detectDocumentBounds(id, sw, sh);

      const isFull =
        bounds.x === 0 &&
        bounds.y === 0 &&
        bounds.width === sw &&
        bounds.height === sh;
      setDocDetected(!isFull);

      const scaleX = overlay.width / sw;
      const scaleY = overlay.height / sh;

      ctx.clearRect(0, 0, overlay.width, overlay.height);

      // dim outside document
      if (!isFull) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, overlay.width, overlay.height);
        ctx.clearRect(
          bounds.x * scaleX,
          bounds.y * scaleY,
          bounds.width * scaleX,
          bounds.height * scaleY
        );
      }

      // outline
      ctx.strokeStyle = isFull ? "rgba(148,163,184,0.6)" : "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.setLineDash(isFull ? [6, 4] : []);
      ctx.strokeRect(
        bounds.x * scaleX + 1,
        bounds.y * scaleY + 1,
        bounds.width * scaleX - 2,
        bounds.height * scaleY - 2
      );

      // corner markers
      if (!isFull) {
        const cx = bounds.x * scaleX;
        const cy = bounds.y * scaleY;
        const cw = bounds.width * scaleX;
        const ch = bounds.height * scaleY;
        const len = 18;
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        // TL
        ctx.beginPath();
        ctx.moveTo(cx, cy + len);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + len, cy);
        ctx.stroke();
        // TR
        ctx.beginPath();
        ctx.moveTo(cx + cw - len, cy);
        ctx.lineTo(cx + cw, cy);
        ctx.lineTo(cx + cw, cy + len);
        ctx.stroke();
        // BL
        ctx.beginPath();
        ctx.moveTo(cx, cy + ch - len);
        ctx.lineTo(cx, cy + ch);
        ctx.lineTo(cx + len, cy + ch);
        ctx.stroke();
        // BR
        ctx.beginPath();
        ctx.moveTo(cx + cw - len, cy + ch);
        ctx.lineTo(cx + cw, cy + ch);
        ctx.lineTo(cx + cw, cy + ch - len);
        ctx.stroke();
      }

      detectLoopRef.current = requestAnimationFrame(runDetect);
    };

    detectLoopRef.current = requestAnimationFrame(runDetect);

    return () => stopDetectLoop();
  }, [cameraOpen, stopDetectLoop]);

  // Body scroll lock
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
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
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
    stopStream();
    setCameraOpen(false);
    setDocDetected(false);
  };

  const captureCameraPage = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || capturing) return;
    setCapturing(true);
    try {
      const { originalDataUrl, previewDataUrl } = await processCaptureFrame(
        video,
        activeFilter
      );
      const page: ScanPage = {
        id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        originalDataUrl,
        filter: activeFilter,
        previewDataUrl,
      };
      setScanPages((prev) => [...prev, page]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal mengambil halaman."
      );
    } finally {
      setCapturing(false);
    }
  };

  const removeScanPage = (id: string) => {
    setScanPages((prev) => prev.filter((p) => p.id !== id));
  };

  const changePageFilter = async (id: string, filter: ScanFilter) => {
    setScanPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, filter } : p))
    );
    const page = scanPages.find((p) => p.id === id);
    if (!page) return;
    try {
      const previewDataUrl = await reapplyFilter(page.originalDataUrl, filter);
      setScanPages((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, filter, previewDataUrl } : p
        )
      );
    } catch {
      // keep previous preview
    }
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
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const margin = 8;

    for (const [index, page] of scanPages.entries()) {
      const img = await loadImage(page.previewDataUrl);
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const drawW = img.width * ratio;
      const drawH = img.height * ratio;
      const x = (pageW - drawW) / 2;
      const y = (pageH - drawH) / 2;
      if (index > 0) pdf.addPage();
      pdf.addImage(page.previewDataUrl, "JPEG", x, y, drawW, drawH);
    }

    const arrayBuffer = pdf.output("arraybuffer");
    const blob = new Blob([arrayBuffer], { type: "application/pdf" });
    const fileName = `scan-${Date.now()}.pdf`;
    return { blob, fileName, pageCount: scanPages.length };
  };

  const makeScanPdf = async () => {
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
      setPdfPreviewOpen(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal membuat PDF."
      );
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
    // kamera tetap terbuka, halaman scan tetap ada
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

  const filterBtnClass = (f: ScanFilter, current: ScanFilter) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
      current === f
        ? "bg-blue-600 text-white"
        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
    }`;

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

      {/* ========== MODAL SCANNER ========== */}
      {cameraOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-2 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pdfPreviewOpen) {
              closeCamera();
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Scan dokumen dengan kamera"
        >
          <div
            className="relative flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Camera size={20} className="shrink-0 text-blue-400" />
                  <h3 className="truncate text-sm font-semibold text-white sm:text-base">
                    Scan Dokumen
                  </h3>
                  {scanPages.length > 0 && (
                    <span className="rounded-full bg-blue-600/30 px-2.5 py-0.5 text-xs font-medium text-blue-300">
                      {scanPages.length} halaman
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Arahkan kamera ke kertas · auto crop & filter
                </p>
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

            {/* Camera area */}
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
              </div>

              {/* Filter default untuk capture berikutnya */}
              <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-700 bg-slate-800/80 px-3 py-2">
                <span className="text-xs text-slate-400">Filter baru:</span>
                {(["color", "gray", "bw"] as ScanFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActiveFilter(f)}
                    className={filterBtnClass(f, activeFilter)}
                  >
                    {f === "color" ? "COLOR" : f === "gray" ? "GRAY" : "B&W"}
                  </button>
                ))}
              </div>

              {/* Thumbnails multi-page */}
              {scanPages.length > 0 && (
                <div className="border-t border-slate-700 bg-slate-800/50 px-3 py-3">
                  <p className="mb-2 text-xs font-medium text-slate-400">
                    Halaman hasil scan
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {scanPages.map((page, index) => (
                      <div
                        key={page.id}
                        className="relative w-[88px] shrink-0 sm:w-[100px]"
                      >
                        <div className="relative overflow-hidden rounded-lg border border-slate-600 bg-slate-950">
                          <Image
                            src={page.previewDataUrl}
                            alt={`Halaman ${index + 1}`}
                            width={100}
                            height={130}
                            unoptimized
                            className="aspect-[3/4] w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeScanPage(page.id)}
                            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow hover:bg-red-500"
                            aria-label={`Hapus halaman ${index + 1}`}
                          >
                            ×
                          </button>
                          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {index + 1}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap justify-center gap-0.5">
                          {(["color", "gray", "bw"] as ScanFilter[]).map(
                            (f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => changePageFilter(page.id, f)}
                                className={`rounded px-1 py-0.5 text-[9px] font-bold ${
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

            {/* Footer controls */}
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-slate-700 bg-slate-900 px-3 py-3 sm:gap-3 sm:px-5">
              <button
                type="button"
                onClick={captureCameraPage}
                disabled={capturing}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50 active:scale-[0.98]"
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
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
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
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 active:scale-[0.98]"
              >
                Tutup Kamera
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL PREVIEW PDF ========== */}
      {pdfPreviewOpen && pdfPreview && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Preview PDF hasil scan"
        >
          <div className="relative flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-900 shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-white sm:text-base">
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
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                aria-label="Tutup preview"
              >
                <X size={22} />
              </button>
            </div>

            <div className="min-h-0 flex-1 bg-slate-950">
              <iframe
                src={pdfPreview.url}
                title="Preview PDF scan"
                className="h-[55vh] w-full border-0 sm:h-[60vh]"
              />
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-slate-700 bg-slate-900 px-3 py-3 sm:gap-3 sm:px-5">
              <button
                type="button"
                onClick={backToEditScanner}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                <ArrowLeft size={16} />
                Kembali Edit
              </button>

              <button
                type="button"
                onClick={rebuildPdf}
                disabled={buildingPdf}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
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
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
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