"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { jsPDF } from "jspdf";
import {
  ArrowLeft,
  Camera,
  Check,
  Crop,
  FileText,
  Flashlight,
  Loader2,
  Pencil,
  RotateCcw,
  RotateCw,
  X,
  Aperture,
  Move,
  Upload,
  Undo2,
  Redo2,
} from "lucide-react";

type ScanFilter = "color" | "gray" | "bw";
type Point = { x: number; y: number }; // 0–1 relatif terhadap gambar
type CropMode = "none" | "rect" | "perspective";

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

function rotateCanvas(
  c: HTMLCanvasElement,
  deg: 0 | 90 | 180 | 270
): HTMLCanvasElement {
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
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const b = brightness * 2.55;
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let bl = d[i + 2];

    r = contrastFactor * (r - 128) + 128 + b;
    g = contrastFactor * (g - 128) + 128 + b;
    bl = contrastFactor * (bl - 128) + 128 + b;

    if (filter === "gray" || filter === "bw") {
      const gray = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = g = bl = gray;
    }
    if (filter === "bw") {
      const v = r > 140 ? 255 : 0;
      r = g = bl = v;
    }

    d[i] = Math.max(0, Math.min(255, r));
    d[i + 1] = Math.max(0, Math.min(255, g));
    d[i + 2] = Math.max(0, Math.min(255, bl));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Crop persegi dari koordinat relatif 0–1 */
function cropRectCanvas(
  src: HTMLCanvasElement,
  tl: Point,
  br: Point
): HTMLCanvasElement {
  const x1 = Math.max(0, Math.min(1, Math.min(tl.x, br.x)));
  const y1 = Math.max(0, Math.min(1, Math.min(tl.y, br.y)));
  const x2 = Math.max(0, Math.min(1, Math.max(tl.x, br.x)));
  const y2 = Math.max(0, Math.min(1, Math.max(tl.y, br.y)));

  const sx = Math.round(x1 * src.width);
  const sy = Math.round(y1 * src.height);
  const sw = Math.max(1, Math.round((x2 - x1) * src.width));
  const sh = Math.max(1, Math.round((y2 - y1) * src.height));

  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

/**
 * Perspective warp manual (tanpa OpenCV).
 * corners: TL, TR, BR, BL dalam koordinat 0–1.
 */
function perspectiveWarp(
  src: HTMLCanvasElement,
  corners: [Point, Point, Point, Point],
  outW?: number,
  outH?: number
): HTMLCanvasElement {
  const toPx = (p: Point) => ({
    x: p.x * src.width,
    y: p.y * src.height,
  });
  const [tl, tr, br, bl] = corners.map(toPx);

  const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const widthBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
  const heightLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const heightRight = Math.hypot(br.x - tr.x, br.y - tr.y);

  const w = Math.max(
    1,
    Math.round(outW ?? Math.max(widthTop, widthBottom))
  );
  const h = Math.max(
    1,
    Math.round(outH ?? Math.max(heightLeft, heightRight))
  );

  // Homography 4 titik → rectangle (bilinear mesh)
  const srcCtx = src.getContext("2d");
  if (!srcCtx) return src;
  const srcData = srcCtx.getImageData(0, 0, src.width, src.height);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");
  if (!outCtx) return src;
  const outImg = outCtx.createImageData(w, h);

  const sample = (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(src.width - 1, x0 + 1);
    const y1 = Math.min(src.height - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;

    const idx = (ix: number, iy: number) => (iy * src.width + ix) * 4;

    const i00 = idx(Math.max(0, x0), Math.max(0, y0));
    const i10 = idx(x1, Math.max(0, y0));
    const i01 = idx(Math.max(0, x0), y1);
    const i11 = idx(x1, y1);

    const r =
      srcData.data[i00] * (1 - fx) * (1 - fy) +
      srcData.data[i10] * fx * (1 - fy) +
      srcData.data[i01] * (1 - fx) * fy +
      srcData.data[i11] * fx * fy;
    const g =
      srcData.data[i00 + 1] * (1 - fx) * (1 - fy) +
      srcData.data[i10 + 1] * fx * (1 - fy) +
      srcData.data[i01 + 1] * (1 - fx) * fy +
      srcData.data[i11 + 1] * fx * fy;
    const b =
      srcData.data[i00 + 2] * (1 - fx) * (1 - fy) +
      srcData.data[i10 + 2] * fx * (1 - fy) +
      srcData.data[i01 + 2] * (1 - fx) * fy +
      srcData.data[i11 + 2] * fx * fy;

    return [r, g, b] as const;
  };

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1 || 1);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1 || 1);

      // Bilinear interpolation of quad corners
      const topX = tl.x + (tr.x - tl.x) * u;
      const topY = tl.y + (tr.y - tl.y) * u;
      const botX = bl.x + (br.x - bl.x) * u;
      const botY = bl.y + (br.y - bl.y) * u;
      const srcX = topX + (botX - topX) * v;
      const srcY = topY + (botY - topY) * v;

      if (
        srcX < 0 ||
        srcY < 0 ||
        srcX >= src.width - 1 ||
        srcY >= src.height - 1
      ) {
        continue;
      }

      const [r, g, b] = sample(srcX, srcY);
      const oi = (y * w + x) * 4;
      outImg.data[oi] = r;
      outImg.data[oi + 1] = g;
      outImg.data[oi + 2] = b;
      outImg.data[oi + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  return out;
}

/**
 * Render preview.
 * applyCrop=false → hanya rotasi + filter (untuk overlay crop tetap akurat).
 * applyCrop=true  → crop/perspective ikut diterapkan (saat simpan halaman).
 */
async function renderPreview(
  sourceDataUrl: string,
  rotation: 0 | 90 | 180 | 270,
  filter: ScanFilter,
  brightness: number,
  contrast: number,
  cropMode: CropMode,
  corners: [Point, Point, Point, Point],
  applyCrop = true
): Promise<string> {
  const img = await loadImage(sourceDataUrl);
  let c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d")?.drawImage(img, 0, 0);
  c = rotateCanvas(c, rotation);

  if (applyCrop) {
    if (cropMode === "rect") {
      c = cropRectCanvas(c, corners[0], corners[2]);
    } else if (cropMode === "perspective") {
      c = perspectiveWarp(c, corners);
    }
  }

  c = applyPixelAdjust(c, filter, brightness, contrast);
  c = downscale(c);
  return canvasJpeg(c);
}

const defaultCorners = (): [Point, Point, Point, Point] => [
  { x: 0.08, y: 0.08 }, // TL
  { x: 0.92, y: 0.08 }, // TR
  { x: 0.92, y: 0.92 }, // BR
  { x: 0.08, y: 0.92 }, // BL
];

type CameraCaptureProps = {
  open: boolean;
  onClose: () => void;
  onComplete: (file: File) => void;
};

export default function CameraCapture({
  open,
  onClose,
  onComplete,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const startingRef = useRef(false);
  const cropBoxRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyIndexRef = useRef(-1);

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
  /** Ukuran natural gambar edit (setelah rotasi) untuk mapping crop akurat */
  const [editNaturalSize, setEditNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);

  type EditSnapshot = {
    sourceDataUrl: string;
    rotation: 0 | 90 | 180 | 270;
    filter: ScanFilter;
    brightness: number;
    contrast: number;
  };
  const [history, setHistory] = useState<EditSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [cropMode, setCropMode] = useState<CropMode>("none");
  const [corners, setCorners] =
    useState<[Point, Point, Point, Point]>(defaultCorners);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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
      } catch {
        /* ignore */
      }
      video.srcObject = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
    }
    setCameraReady(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

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
      setCropMode("none");
      setCorners(defaultCorners());
      setHistory([]);
      setHistoryIndex(-1);
      historyIndexRef.current = -1;
      setEditNaturalSize(null);
    }
  }, [open, stopStream]);

  useEffect(() => {
    return () => {
      stopStream();
      if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.style.overflow = open || pdfPreviewOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, pdfPreviewOpen]);

  useEffect(() => {
    if (!open || phase !== "live") return;

    let cancelled = false;

    const start = async () => {
      if (startingRef.current) return;
      startingRef.current = true;
      setError("");
      setCameraReady(false);

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
          const caps = track.getCapabilities?.() as
            | { torch?: boolean }
            | undefined;
          if (caps?.torch) setTorchSupported(true);
        } catch {
          /* ignore */
        }

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          try {
            await video.play();
          } catch {
            /* autoplay blocked */
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
    };
  }, [open, phase, stopStream]);

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

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  const pushHistory = useCallback(
    (snap: {
      sourceDataUrl: string;
      rotation: 0 | 90 | 180 | 270;
      filter: ScanFilter;
      brightness: number;
      contrast: number;
    }) => {
      const idx = historyIndexRef.current;
      setHistory((prev) => {
        const base = prev.slice(0, Math.max(0, idx + 1));
        const next = [...base, snap];
        const trimmed =
          next.length > 30 ? next.slice(next.length - 30) : next;
        historyIndexRef.current = trimmed.length - 1;
        setHistoryIndex(trimmed.length - 1);
        return trimmed;
      });
    },
    []
  );

  const resetHistory = (snap: {
    sourceDataUrl: string;
    rotation: 0 | 90 | 180 | 270;
    filter: ScanFilter;
    brightness: number;
    contrast: number;
  }) => {
    setHistory([snap]);
    setHistoryIndex(0);
    historyIndexRef.current = 0;
  };

  const undoEdit = () => {
    if (historyIndex <= 0 || cropMode !== "none") return;
    const nextIdx = historyIndex - 1;
    const snap = history[nextIdx];
    if (!snap) return;
    setHistoryIndex(nextIdx);
    historyIndexRef.current = nextIdx;
    setEditSource(snap.sourceDataUrl);
    setEditRotation(snap.rotation);
    setEditFilter(snap.filter);
    setEditBrightness(snap.brightness);
    setEditContrast(snap.contrast);
    setCropMode("none");
    setCorners(defaultCorners());
  };

  const redoEdit = () => {
    if (historyIndex >= history.length - 1 || cropMode !== "none") return;
    const nextIdx = historyIndex + 1;
    const snap = history[nextIdx];
    if (!snap) return;
    setHistoryIndex(nextIdx);
    historyIndexRef.current = nextIdx;
    setEditSource(snap.sourceDataUrl);
    setEditRotation(snap.rotation);
    setEditFilter(snap.filter);
    setEditBrightness(snap.brightness);
    setEditContrast(snap.contrast);
    setCropMode("none");
    setCorners(defaultCorners());
  };

  // Update ukuran natural (setelah rotasi) untuk mapping crop
  useEffect(() => {
    if (!editSource || phase !== "edit") {
      setEditNaturalSize(null);
      return;
    }
    let cancelled = false;
    void loadImage(editSource).then((img) => {
      if (cancelled) return;
      const rot = editRotation;
      if (rot === 90 || rot === 270) {
        setEditNaturalSize({ w: img.naturalHeight, h: img.naturalWidth });
      } else {
        setEditNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [editSource, editRotation, phase]);

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
    setCropMode("none");
    setCorners(defaultCorners());
    resetHistory({
      sourceDataUrl,
      rotation: 0,
      filter: "color",
      brightness: 0,
      contrast: 10,
    });
    setPhase("edit");

    stopStream();

    setEditBusy(true);
    try {
      const preview = await renderPreview(
        sourceDataUrl,
        0,
        "color",
        0,
        10,
        "none",
        defaultCorners()
      );
      setEditPreview(preview);
    } finally {
      setEditBusy(false);
    }
  };

  /** Import gambar dari perangkat → langsung masuk ke mode edit (satu per satu) atau batch */
  const handleImportFiles = async (
    e: { target: HTMLInputElement }
  ) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith("image/")
    );
    e.target.value = "";
    if (!files.length) return;

    setError("");
    setEditBusy(true);

    try {
      // Jika hanya 1 gambar → buka mode edit seperti hasil foto
      if (files.length === 1) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Gagal membaca file"));
          reader.readAsDataURL(files[0]);
        });

        // Downscale agar konsisten dengan capture
        const img = await loadImage(dataUrl);
        let c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d")?.drawImage(img, 0, 0);
        c = downscale(c);
        const sourceDataUrl = canvasJpeg(c, 0.85);

        setEditSource(sourceDataUrl);
        setEditRotation(0);
        setEditFilter("color");
        setEditBrightness(0);
        setEditContrast(10);
        setEditingPageId(null);
        setCropMode("none");
        setCorners(defaultCorners());
        resetHistory({
          sourceDataUrl,
          rotation: 0,
          filter: "color",
          brightness: 0,
          contrast: 10,
        });
        setPhase("edit");
        stopStream();

        const preview = await renderPreview(
          sourceDataUrl,
          0,
          "color",
          0,
          10,
          "none",
          defaultCorners()
        );
        setEditPreview(preview);
        return;
      }

      // Banyak gambar → tambahkan semua sebagai halaman dengan default
      const newPages: ScanPage[] = [];
      for (const file of files) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Gagal membaca file"));
          reader.readAsDataURL(file);
        });

        const img = await loadImage(dataUrl);
        let c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d")?.drawImage(img, 0, 0);
        c = downscale(c);
        const sourceDataUrl = canvasJpeg(c, 0.85);

        const previewDataUrl = await renderPreview(
          sourceDataUrl,
          0,
          "color",
          0,
          10,
          "none",
          defaultCorners()
        );

        newPages.push({
          id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          sourceDataUrl,
          rotation: 0,
          filter: "color",
          brightness: 0,
          contrast: 10,
          previewDataUrl,
        });
      }

      setScanPages((prev) => [...prev, ...newPages]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal mengimpor gambar"
      );
    } finally {
      setEditBusy(false);
    }
  };

  useEffect(() => {
    if (phase !== "edit" || !editSource) return;
    const t = window.setTimeout(() => {
      setEditBusy(true);
      // Saat mode crop aktif: jangan apply crop di preview live
      // supaya 4 titik handle tetap pas di atas gambar utuh.
      // Crop diterapkan lewat tombol Apply Crop / Apply Perspective.
      const liveApplyCrop = cropMode === "none";
      void renderPreview(
        editSource,
        editRotation,
        editFilter,
        editBrightness,
        editContrast,
        cropMode,
        corners,
        liveApplyCrop
      )
        .then(setEditPreview)
        .finally(() => setEditBusy(false));
    }, 140);
    return () => window.clearTimeout(t);
  }, [
    phase,
    editSource,
    editRotation,
    editFilter,
    editBrightness,
    editContrast,
    cropMode,
    corners,
  ]);

  const acceptEditPage = async () => {
    setEditBusy(true);
    try {
      // Jika masih mode crop (belum Apply), otomatis bake dulu
      let source = editSource;
      let rotation: 0 | 90 | 180 | 270 = editRotation;
      let mode: CropMode = cropMode;
      let pts = corners;

      if (mode !== "none") {
        const img = await loadImage(source);
        let c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d")?.drawImage(img, 0, 0);
        c = rotateCanvas(c, rotation);
        if (mode === "rect") {
          c = cropRectCanvas(c, pts[0], pts[2]);
        } else if (mode === "perspective") {
          c = perspectiveWarp(c, pts);
        }
        c = downscale(c);
        source = canvasJpeg(c, 0.9);
        rotation = 0;
        mode = "none";
        pts = defaultCorners();
      }

      const previewDataUrl = await renderPreview(
        source,
        rotation,
        editFilter,
        editBrightness,
        editContrast,
        "none",
        defaultCorners(),
        false
      );

      const page: ScanPage = {
        id: editingPageId ?? `p-${Date.now()}`,
        sourceDataUrl: source,
        rotation,
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
      setCropMode("none");
      setCorners(defaultCorners());
    } finally {
      setEditBusy(false);
    }
  };

  const retake = () => {
    setPhase("live");
    setEditSource("");
    setEditPreview("");
    setEditingPageId(null);
    setCropMode("none");
  };

  const editExistingPage = (page: ScanPage) => {
    setEditingPageId(page.id);
    setEditSource(page.sourceDataUrl);
    setEditRotation(page.rotation);
    setEditFilter(page.filter);
    setEditBrightness(page.brightness);
    setEditContrast(page.contrast);
    setEditPreview(page.previewDataUrl);
    setCropMode("none");
    setCorners(defaultCorners());
    resetHistory({
      sourceDataUrl: page.sourceDataUrl,
      rotation: page.rotation,
      filter: page.filter,
      brightness: page.brightness,
      contrast: page.contrast,
    });
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
    const MARGIN = 8; // mm margin tipis di tepi

    for (let i = 0; i < scanPages.length; i++) {
      const page = scanPages[i];
      if (i > 0) pdf.addPage("a4", "portrait");

      // Muat dimensi aktual gambar agar tidak meregang
      const img = await loadImage(page.previewDataUrl);
      const maxW = A4_WIDTH - MARGIN * 2;
      const maxH = A4_HEIGHT - MARGIN * 2;
      const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
      const w = img.naturalWidth * ratio;
      const h = img.naturalHeight * ratio;
      const x = (A4_WIDTH - w) / 2;
      const y = (A4_HEIGHT - h) / 2;

      pdf.addImage(
        page.previewDataUrl,
        "JPEG",
        x,
        y,
        w,
        h,
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

  /**
   * Hitung area gambar aktual di dalam container (object-contain).
   * Mengembalikan offset & scale relatif 0–1 terhadap container.
   */
  const getContentRect = useCallback(() => {
    const box = cropBoxRef.current;
    if (!box || !editNaturalSize) {
      return { left: 0, top: 0, width: 1, height: 1 };
    }
    const bw = box.clientWidth;
    const bh = box.clientHeight;
    if (bw <= 0 || bh <= 0) return { left: 0, top: 0, width: 1, height: 1 };

    const imgAspect = editNaturalSize.w / editNaturalSize.h;
    const boxAspect = bw / bh;

    let contentW: number;
    let contentH: number;
    if (imgAspect > boxAspect) {
      // gambar lebih lebar → letterbox atas-bawah
      contentW = bw;
      contentH = bw / imgAspect;
    } else {
      // gambar lebih tinggi → letterbox kiri-kanan
      contentH = bh;
      contentW = bh * imgAspect;
    }
    const left = (bw - contentW) / 2 / bw;
    const top = (bh - contentH) / 2 / bh;
    return {
      left,
      top,
      width: contentW / bw,
      height: contentH / bh,
    };
  }, [editNaturalSize]);

  /* ---- Drag crop handles ---- */
  const onHandlePointerDown = (index: number, e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragIndex(index);
  };

  const onCropPointerMove = (e: ReactPointerEvent) => {
    if (dragIndex === null || !cropBoxRef.current) return;
    const rect = cropBoxRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // Posisi pointer relatif ke container (0–1)
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    // Map ke koordinat gambar aktual (object-contain)
    const cr = getContentRect();
    let x = (px - cr.left) / (cr.width || 1);
    let y = (py - cr.top) / (cr.height || 1);
    x = Math.max(0.01, Math.min(0.99, x));
    y = Math.max(0.01, Math.min(0.99, y));

    setCorners((prev) => {
      const next = [...prev] as [Point, Point, Point, Point];
      if (cropMode === "rect") {
        // TL=0, TR=1, BR=2, BL=3 — jaga bentuk persegi
        if (dragIndex === 0) {
          next[0] = { x, y };
          next[1] = { x: next[1].x, y };
          next[3] = { x, y: next[3].y };
        } else if (dragIndex === 1) {
          next[1] = { x, y };
          next[0] = { x: next[0].x, y };
          next[2] = { x, y: next[2].y };
        } else if (dragIndex === 2) {
          next[2] = { x, y };
          next[1] = { x, y: next[1].y };
          next[3] = { x: next[3].x, y };
        } else if (dragIndex === 3) {
          next[3] = { x, y };
          next[0] = { x, y: next[0].y };
          next[2] = { x: next[2].x, y };
        }
      } else {
        next[dragIndex] = { x, y };
      }
      return next;
    });
  };

  const onCropPointerUp = () => setDragIndex(null);

  const enableRectCrop = () => {
    setCorners(defaultCorners());
    setCropMode("rect");
  };

  const enablePerspectiveCrop = () => {
    setCorners(defaultCorners());
    setCropMode("perspective");
  };

  const clearCrop = () => {
    setCropMode("none");
    setCorners(defaultCorners());
  };

  /** Apply crop / perspective ke source saat ini, lalu keluar dari mode crop */
  const applyCropNow = async () => {
    if (cropMode === "none" || !editSource) return;
    setEditBusy(true);
    try {
      const img = await loadImage(editSource);
      let c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")?.drawImage(img, 0, 0);
      c = rotateCanvas(c, editRotation);

      if (cropMode === "rect") {
        c = cropRectCanvas(c, corners[0], corners[2]);
      } else if (cropMode === "perspective") {
        c = perspectiveWarp(c, corners);
      }

      c = downscale(c);
      const baked = canvasJpeg(c, 0.9);

      setEditSource(baked);
      setEditRotation(0);
      setCropMode("none");
      setCorners(defaultCorners());
      pushHistory({
        sourceDataUrl: baked,
        rotation: 0,
        filter: editFilter,
        brightness: editBrightness,
        contrast: editContrast,
      });

      // Preview tanpa crop (sudah di-bake), tetap pakai filter/brightness
      const preview = await renderPreview(
        baked,
        0,
        editFilter,
        editBrightness,
        editContrast,
        "none",
        defaultCorners(),
        false
      );
      setEditPreview(preview);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal menerapkan crop"
      );
    } finally {
      setEditBusy(false);
    }
  };

  if (!open) return null;

  const showCropOverlay = cropMode !== "none" && phase === "edit";

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
                {error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-4 text-center">
                    <p className="text-sm text-red-200">{error}</p>
                    <p className="text-xs text-slate-400">
                      Anda tetap bisa mengimpor gambar dari perangkat.
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white"
                    >
                      <Upload size={16} className="mr-1 inline" /> Import
                      Gambar
                    </button>
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
                  onClick={() => fileInputRef.current?.click()}
                  disabled={editBusy}
                  className="rounded-xl bg-slate-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  <Upload size={16} className="mr-1 inline" /> Import Gambar
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleImportFiles(e)}
                />
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
                  {cropMode === "rect" &&
                    " · Crop — geser 4 titik, lalu tekan Apply Crop"}
                  {cropMode === "perspective" &&
                    " · Perspective — geser 4 sudut dokumen, lalu tekan Apply Perspective"}
                </p>

                <div
                  ref={cropBoxRef}
                  className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-xl bg-white touch-none"
                  onPointerMove={onCropPointerMove}
                  onPointerUp={onCropPointerUp}
                  onPointerLeave={onCropPointerUp}
                >
                  {editPreview ? (
                    <Image
                      src={editPreview}
                      alt="preview"
                      fill
                      unoptimized
                      className="object-contain"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-400">
                      <Loader2 className="animate-spin" />
                    </div>
                  )}

                  {/* Overlay crop — koordinat relatif ke area gambar (object-contain) */}
                  {showCropOverlay &&
                    (() => {
                      const cr = getContentRect();
                      const toBox = (c: Point) => ({
                        x: (cr.left + c.x * cr.width) * 100,
                        y: (cr.top + c.y * cr.height) * 100,
                      });
                      return (
                        <>
                          <svg
                            className="pointer-events-none absolute inset-0 h-full w-full"
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                          >
                            <polygon
                              points={corners
                                .map((c) => {
                                  const p = toBox(c);
                                  return `${p.x},${p.y}`;
                                })
                                .join(" ")}
                              fill="rgba(59,130,246,0.18)"
                              stroke="#3b82f6"
                              strokeWidth="0.7"
                            />
                          </svg>

                          {corners.map((c, i) => {
                            const p = toBox(c);
                            return (
                              <button
                                key={i}
                                type="button"
                                onPointerDown={(e) => onHandlePointerDown(i, e)}
                                className="absolute z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-blue-600 shadow-lg"
                                style={{
                                  left: `${p.x}%`,
                                  top: `${p.y}%`,
                                }}
                                aria-label={`Titik ${i + 1}`}
                              >
                                <Move size={12} className="text-white" />
                              </button>
                            );
                          })}
                        </>
                      );
                    })()}
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-800 px-3 py-2">
                {/* Crop controls */}
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={enableRectCrop}
                    disabled={editBusy}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      cropMode === "rect"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    <Crop size={14} className="mr-1 inline" />
                    Crop
                  </button>
                  <button
                    type="button"
                    onClick={enablePerspectiveCrop}
                    disabled={editBusy}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      cropMode === "perspective"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    <Move size={14} className="mr-1 inline" />
                    Perspective
                  </button>
                  {cropMode === "rect" && (
                    <button
                      type="button"
                      onClick={() => void applyCropNow()}
                      disabled={editBusy}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Check size={14} className="mr-1 inline" />
                      Apply Crop
                    </button>
                  )}
                  {cropMode === "perspective" && (
                    <button
                      type="button"
                      onClick={() => void applyCropNow()}
                      disabled={editBusy}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Check size={14} className="mr-1 inline" />
                      Apply Perspective
                    </button>
                  )}
                  {cropMode !== "none" && (
                    <button
                      type="button"
                      onClick={clearCrop}
                      disabled={editBusy}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300"
                    >
                      Batal
                    </button>
                  )}
                </div>

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
                    onClick={() => {
                      setEditRotation((r) => {
                        const next = ((r + 90) % 360) as 0 | 90 | 180 | 270;
                        pushHistory({
                          sourceDataUrl: editSource,
                          rotation: next,
                          filter: editFilter,
                          brightness: editBrightness,
                          contrast: editContrast,
                        });
                        return next;
                      });
                    }}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
                  >
                    <RotateCw size={14} className="mr-1 inline" /> Rotate
                  </button>
                  <button
                    type="button"
                    onClick={undoEdit}
                    disabled={historyIndex <= 0 || cropMode !== "none"}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40"
                    title="Undo"
                  >
                    <Undo2 size={14} className="mr-1 inline" /> Undo
                  </button>
                  <button
                    type="button"
                    onClick={redoEdit}
                    disabled={
                      historyIndex >= history.length - 1 || cropMode !== "none"
                    }
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40"
                    title="Redo"
                  >
                    <Redo2 size={14} className="mr-1 inline" /> Redo
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