"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { jsPDF } from "jspdf";
import {
  ArrowLeft,
  Camera,
  Check,
  FileText,
  Flashlight,
  Loader2,
  Pencil,
  RotateCcw,
  RotateCw,
  X,
  Aperture,
} from "lucide-react";

type ScanFilter = "color" | "gray" | "bw";
type Point = { x: number; y: number };

type ScanPage = {
  id: string;
  sourceDataUrl: string;
  rotation: 0 | 90 | 180 | 270;
  filter: ScanFilter;
  brightness: number;
  contrast: number;
  previewDataUrl: string;
};

type PdfPreviewState = {
  url: string;
  blob: Blob;
  fileName: string;
  pageCount: number;
  sizeBytes: number;
};

const JPEG_Q = 0.82;
const MAX_SIDE = 1400;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal memuat gambar"));
    img.src = src;
  });
}

function canvasJpeg(c: HTMLCanvasElement, q = JPEG_Q) {
  return c.toDataURL("image/jpeg", q);
}

function downscale(c: HTMLCanvasElement, max = MAX_SIDE): HTMLCanvasElement {
  const m = Math.max(c.width, c.height);
  if (m <= max) return c;
  const s = max / m;
  const o = document.createElement("canvas");
  o.width = Math.round(c.width * s);
  o.height = Math.round(c.height * s);
  const ctx = o.getContext("2d");
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, 0, 0, o.width, o.height);
  return o;
}

function rotateCanvas(c: HTMLCanvasElement, deg: 0 | 90 | 180 | 270): HTMLCanvasElement {
  if (deg === 0) return c;
  const out = document.createElement("canvas");
  const rad = (deg * Math.PI) / 180;
  if (deg === 90 || deg === 270) {
    out.width = c.height;
    out.height = c.width;
  } else {
    out.width = c.width;
    out.height = c.height;
  }
  const ctx = out.getContext("2d");
  if (!ctx) return c;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(c, -c.width / 2, -c.height / 2);
  return out;
}

function applyPixelAdjust(
  c: HTMLCanvasElement,
  filter: ScanFilter,
  brightness: number,
  contrast: number
): HTMLCanvasElement {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return c;
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const b = brightness * 2.55;
  const contrastF = (259 * (contrast + 100)) / (100 * (259 - contrast));

  for (let i = 0; i < d.length; i += 4) {
    let r = contrastF * (d[i] - 128) + 128 + b;
    let g = contrastF * (d[i + 1] - 128) + 128 + b;
    let bl = contrastF * (d[i + 2] - 128) + 128 + b;
    d[i] = Math.min(255, Math.max(0, r));
    d[i + 1] = Math.min(255, Math.max(0, g));
    d[i + 2] = Math.min(255, Math.max(0, bl));
  }

  if (filter === "gray" || filter === "bw") {
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = g;
    }
  }
  if (filter === "bw") {
    let sum = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) sum += d[i];
    const th = Math.min(175, Math.max(95, (sum / n) * 0.88));
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] < th ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }

  const out = document.createElement("canvas");
  out.width = c.width;
  out.height = c.height;
  out.getContext("2d")?.putImageData(id, 0, 0);
  return out;
}

async function renderPreview(
  sourceDataUrl: string,
  rotation: 0 | 90 | 180 | 270,
  filter: ScanFilter,
  brightness: number,
  contrast: number
): Promise<string> {
  const img = await loadImage(sourceDataUrl);
  const src = document.createElement("canvas");
  src.width = img.width;
  src.height = img.height;
  src.getContext("2d")?.drawImage(img, 0, 0);

  let out = rotateCanvas(src, rotation);
  out = applyPixelAdjust(out, filter, brightness, contrast);
  return canvasJpeg(out);
}

type CameraCaptureProps = {
  open: boolean;
  onClose: () => void;
  onComplete: (file: File) => void;
};

export default function CameraCapture({ open, onClose, onComplete }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const startingRef = useRef(false);

  const [phase, setPhase] = useState<"live" | "edit">("live");
  const [scanPages, setScanPages] = useState<ScanPage[]>([]);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const [editSource, setEditSource] = useState("");
  const [editRotation, setEditRotation] = useState<0 | 90 | 180 | 270>(0);
  const [editFilter, setEditFilter] = useState<ScanFilter>("color");
  const [editBrightness, setEditBrightness] = useState(0);
  const [editContrast, setEditContrast] = useState(10);
  const [editPreview, setEditPreview] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);

  const [buildingPdf, setBuildingPdf] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [error, setError] = useState("");

  const stopStream = useCallback(() => {
    startingRef.current = false;
    const stream = streamRef.current;
    streamRef.current = null;
    trackRef.current = null;

    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {}
      video.srcObject = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
    }
    setCameraReady(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  // Cleanup saat close / unmount
  useEffect(() => {
    if (!open) {
      stopStream();
      setPhase("live");
      setScanPages([]);
      setPdfPreviewOpen(false);
      setError("");
      setEditSource("");
      setEditPreview("");
      setEditingPageId(null);
    }
  }, [open, stopStream]);

  useEffect(() => {
    return () => {
      stopStream();
      if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = open || pdfPreviewOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, pdfPreviewOpen]);

  // Start camera — satu effect yang bersih
  useEffect(() => {
    if (!open || phase !== "live") return;

    let cancelled = false;

    const start = async () => {
      if (startingRef.current) return;
      startingRef.current = true;
      setError("");
      setCameraReady(false);

      // pastikan stream lama benar-benar mati
      stopStream();
      await new Promise((r) => setTimeout(r, 120));

      if (cancelled) {
        startingRef.current = false;
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          startingRef.current = false;
          return;
        }

        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;

        try {
          const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
          if (caps?.torch) setTorchSupported(true);
        } catch {}

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          try {
            await video.play();
          } catch {
            // autoplay kadang digagalkan browser; user tinggal tap layar
          }
        }

        setCameraReady(true);
      } catch (err: unknown) {
        if (cancelled) return;
        stopStream();
        const msg =
          err instanceof Error
            ? err.name === "NotAllowedError"
              ? "Izin kamera ditolak."
              : err.name === "NotReadableError" || err.name === "AbortError"
                ? "Kamera sedang dipakai aplikasi lain."
                : err.message
            : "Kamera tidak dapat digunakan.";
        setError(msg);
      } finally {
        startingRef.current = false;
      }
    };

    void start();

    return () => {
      cancelled = true;
      // jangan stop di sini kalau phase masih live & open — biar diganti di effect open=false
    };
  }, [open, phase, stopStream]);

  // Attach stream ke video setiap kali videoRef siap
  useEffect(() => {
    if (!open || phase !== "live") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.muted = true;
    video.playsInline = true;
    void video.play().catch(() => {});
  }, [open, phase, cameraReady]);

  const toggleTorch = async () => {
    try {
      const next = !torchOn;
      await trackRef.current?.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const doCapture = async () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;

    const full = document.createElement("canvas");
    full.width = v.videoWidth;
    full.height = v.videoHeight;
    full.getContext("2d")?.drawImage(v, 0, 0);
    const sourceDataUrl = canvasJpeg(downscale(full), 0.85);

    setEditSource(sourceDataUrl);
    setEditRotation(0);
    setEditFilter("color");
    setEditBrightness(0);
    setEditContrast(10);
    setEditingPageId(null);
    setPhase("edit");

    // stop stream sementara edit (hemat baterai + hindari lock)
    stopStream();

    setEditBusy(true);
    try {
      const preview = await renderPreview(sourceDataUrl, 0, "color", 0, 10);
      setEditPreview(preview);
    } finally {
      setEditBusy(false);
    }
  };

  // refresh preview saat setting berubah
  useEffect(() => {
    if (phase !== "edit" || !editSource) return;
    const t = window.setTimeout(() => {
      setEditBusy(true);
      void renderPreview(editSource, editRotation, editFilter, editBrightness, editContrast)
        .then(setEditPreview)
        .finally(() => setEditBusy(false));
    }, 120);
    return () => window.clearTimeout(t);
  }, [phase, editSource, editRotation, editFilter, editBrightness, editContrast]);

  const acceptEditPage = async () => {
    setEditBusy(true);
    try {
      const previewDataUrl = await renderPreview(
        editSource,
        editRotation,
        editFilter,
        editBrightness,
        editContrast
      );
      const page: ScanPage = {
        id: editingPageId ?? `p-${Date.now()}`,
        sourceDataUrl: editSource,
        rotation: editRotation,
        filter: editFilter,
        brightness: editBrightness,
        contrast: editContrast,
        previewDataUrl,
      };
      setScanPages((prev) =>
        editingPageId
          ? prev.map((p) => (p.id === editingPageId ? page : p))
          : [...prev, page]
      );
      setPhase("live");
      setEditSource("");
      setEditPreview("");
      setEditingPageId(null);
    } finally {
      setEditBusy(false);
    }
  };

  const retake = () => {
    setPhase("live");
    setEditSource("");
    setEditPreview("");
    setEditingPageId(null);
  };

  const editExistingPage = (page: ScanPage) => {
    setEditingPageId(page.id);
    setEditSource(page.sourceDataUrl);
    setEditRotation(page.rotation);
    setEditFilter(page.filter);
    setEditBrightness(page.brightness);
    setEditContrast(page.contrast);
    setEditPreview(page.previewDataUrl);
    setPhase("edit");
    stopStream();
  };

  const removePage = (id: string) =>
    setScanPages((p) => p.filter((x) => x.id !== id));

  const revokePdf = useCallback(() => {
    setPdfPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const buildPdf = async () => {
  if (!scanPages.length) throw new Error("Belum ada halaman");

  const pdf = new jsPDF({
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const A4_WIDTH = 210;
  const A4_HEIGHT = 297;

  for (let i = 0; i < scanPages.length; i++) {
    const page = scanPages[i];

    if (i > 0) {
      pdf.addPage("a4", "portrait");
    }

    // Gambar memenuhi seluruh halaman A4
    pdf.addImage(
      page.previewDataUrl,
      "JPEG",
      0,
      0,
      A4_WIDTH,
      A4_HEIGHT,
      undefined,
      "FAST"
    );
  }

  const blob = new Blob([pdf.output("arraybuffer")], {
    type: "application/pdf",
  });

  return {
    blob,
    fileName: `scan-${Date.now()}.pdf`,
    pageCount: scanPages.length,
  };
};

  const makeScanPdf = async () => {
    if (!scanPages.length || buildingPdf) return;
    setBuildingPdf(true);
    try {
      const { blob, fileName, pageCount } = await buildPdf();
      revokePdf();
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
      setError(err instanceof Error ? err.message : "Gagal membuat PDF");
    } finally {
      setBuildingPdf(false);
    }
  };

  const confirmUsePdf = () => {
    if (!pdfPreview) return;
    const file = new File([pdfPreview.blob], pdfPreview.fileName, {
      type: "application/pdf",
    });
    onComplete(file);
    setPdfPreviewOpen(false);
    revokePdf();
    setScanPages([]);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-0 sm:p-3">
        <div className="relative flex h-[100dvh] max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-slate-950 sm:h-auto sm:max-h-[96vh] sm:rounded-2xl">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-3 py-2.5">
            <div className="flex items-center gap-2 text-white">
              <Aperture size={18} className="text-blue-400" />
              <span className="text-sm font-semibold">Scanner Dokumen</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X size={22} />
            </button>
          </div>

          {error && (
            <div className="bg-red-900/50 px-4 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {/* LIVE */}
          {phase === "live" && (
            <>
              <div className="relative min-h-0 flex-1 bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full max-h-[55vh] w-full object-cover sm:max-h-[58vh]"
                />
                {!cameraReady && !error && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-slate-300">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Membuka kamera…
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-800 bg-slate-900 px-3 py-2">
                {torchSupported && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                      torchOn
                        ? "bg-amber-500 text-black"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    <Flashlight size={14} className="mr-1 inline" /> Flash
                  </button>
                )}
              </div>

              {scanPages.length > 0 && (
                <div className="flex gap-2 overflow-x-auto border-t border-slate-800 bg-slate-900/80 px-3 py-2">
                  {scanPages.map((p, i) => (
                    <div key={p.id} className="relative w-16 shrink-0">
                      <Image
                        src={p.previewDataUrl}
                        alt=""
                        width={64}
                        height={80}
                        unoptimized
                        className="aspect-[3/4] w-full rounded object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePage(p.id)}
                        className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-red-600 text-[10px] text-white"
                      >
                        ×
                      </button>
                      <button
                        type="button"
                        onClick={() => editExistingPage(p)}
                        className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-white"
                      >
                        <Pencil size={10} className="inline" /> {i + 1}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap justify-center gap-2 border-t border-slate-800 bg-slate-950 px-3 py-3">
                <button
                  type="button"
                  onClick={() => void doCapture()}
                  disabled={!cameraReady}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  <Camera size={16} className="mr-1 inline" /> Ambil Halaman
                </button>
                <button
                  type="button"
                  onClick={() => void makeScanPdf()}
                  disabled={!scanPages.length || buildingPdf}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {buildingPdf ? (
                    <Loader2 size={16} className="mr-1 inline animate-spin" />
                  ) : (
                    <FileText size={16} className="mr-1 inline" />
                  )}
                  Buat PDF ({scanPages.length})
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200"
                >
                  Tutup
                </button>
              </div>
            </>
          )}

          {/* EDIT */}
          {phase === "edit" && (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="p-3">
                <p className="mb-1 text-xs text-slate-400">
                  Hasil {editBusy && "(memproses…)"}
                </p>
                <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-xl bg-white">
                  {editPreview ? (
                    <Image
                      src={editPreview}
                      alt="preview"
                      fill
                      unoptimized
                      className="object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-400">
                      <Loader2 className="animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-800 px-3 py-2">
                <div className="flex flex-wrap justify-center gap-2">
                  {(["color", "gray", "bw"] as ScanFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setEditFilter(f)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase ${
                        editFilter === f
                          ? "bg-blue-600 text-white"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {f === "color" ? "Color" : f === "gray" ? "Gray" : "B&W"}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setEditRotation(
                        (r) => ((r + 90) % 360) as 0 | 90 | 180 | 270
                      )
                    }
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
                  >
                    <RotateCw size={14} className="mr-1 inline" /> Rotate
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Brightness
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    value={editBrightness}
                    onChange={(e) =>
                      setEditBrightness(Number(e.target.value))
                    }
                    className="flex-1"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Contrast
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    value={editContrast}
                    onChange={(e) =>
                      setEditContrast(Number(e.target.value))
                    }
                    className="flex-1"
                  />
                </label>
              </div>

              <div className="flex flex-wrap justify-center gap-2 border-t border-slate-800 px-3 py-3">
                <button
                  type="button"
                  onClick={retake}
                  className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200"
                >
                  Ambil Ulang
                </button>
                <button
                  type="button"
                  onClick={() => void acceptEditPage()}
                  disabled={editBusy || !editPreview}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Check size={16} className="mr-1 inline" /> Gunakan Halaman
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PDF Preview */}
      {pdfPreviewOpen && pdfPreview && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-2 sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Preview PDF
                </h3>
                <p className="text-xs text-slate-400">
                  {pdfPreview.fileName} · {pdfPreview.pageCount} hlm ·{" "}
                  {(pdfPreview.sizeBytes / 1024).toFixed(0)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPdfPreviewOpen(false)}
                className="p-2 text-slate-400 hover:text-white"
              >
                <X size={22} />
              </button>
            </div>
            <iframe
              src={pdfPreview.url}
              title="Preview PDF"
              className="h-[60vh] w-full border-0 bg-white"
            />
            <div className="flex flex-wrap justify-center gap-2 border-t border-slate-700 px-3 py-3">
              <button
                type="button"
                onClick={() => setPdfPreviewOpen(false)}
                className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200"
              >
                <ArrowLeft size={16} className="mr-1 inline" /> Kembali Edit
              </button>
              <button
                type="button"
                onClick={() => void makeScanPdf()}
                className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200"
              >
                <RotateCcw size={16} className="mr-1 inline" /> Buat Ulang
              </button>
              <button
                type="button"
                onClick={confirmUsePdf}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Check size={16} className="mr-1 inline" /> Gunakan PDF Ini
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}