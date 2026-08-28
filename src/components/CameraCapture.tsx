"use client";

import Image from "next/image";
import {
  PointerEvent as ReactPointerEvent,
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
  Grid3X3,
  Loader2,
  Pencil,
  RotateCcw,
  RotateCw,
  Sun,
  X,
  ZoomIn,
  Aperture,
} from "lucide-react";
import { loadOpenCv } from "@/lib/opencv-loader";

type ScanFilter = "color" | "gray" | "bw";
type Point = { x: number; y: number };
type ScannerPhase = "live" | "edit";

type ScanPage = {
  id: string;
  sourceDataUrl: string;
  corners: [Point, Point, Point, Point];
  rotation: 0 | 90 | 180 | 270;
  filter: ScanFilter;
  brightness: number;
  contrast: number;
  enhance: boolean;
  previewDataUrl: string;
};

type PdfPreviewState = {
  url: string;
  blob: Blob;
  fileName: string;
  pageCount: number;
  sizeBytes: number;
};

const JPEG_Q = 0.78;
const MAX_SIDE = 1400;
const DETECT_W = 240; // lebih kecil = lebih ringan

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

function orderCorners(pts: Point[]): [Point, Point, Point, Point] {
  const bySum = [...pts].sort((p, q) => p.x + p.y - (q.x + q.y));
  const byDiff = [...pts].sort((p, q) => p.y - p.x - (q.y - q.x));
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]];
}

function detectCornersOpenCv(
  cv: any,
  sourceCanvas: HTMLCanvasElement
): [Point, Point, Point, Point] | null {
  const src = cv.imread(sourceCanvas);
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 50, 150);
    const M = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, dilated, M);
    M.delete();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imgArea = sourceCanvas.width * sourceCanvas.height;
    let best: { area: number; pts: Point[] } | null = null;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < imgArea * 0.15 || area > imgArea * 0.95) {
        cnt.delete();
        continue;
      }
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4) {
        const pts: Point[] = [];
        for (let r = 0; r < 4; r++) {
          pts.push({
            x: approx.data32S[r * 2] / sourceCanvas.width,
            y: approx.data32S[r * 2 + 1] / sourceCanvas.height,
          });
        }
        if (!best || area > best.area) best = { area, pts };
      }
      approx.delete();
      cnt.delete();
    }
    if (!best) return null;
    return orderCorners(best.pts);
  } finally {
    src.delete();
    gray.delete();
    blur.delete();
    edges.delete();
    dilated.delete();
    contours.delete();
    hierarchy.delete();
  }
}

function warpPerspective(
  cv: any,
  sourceCanvas: HTMLCanvasElement,
  corners: [Point, Point, Point, Point]
): HTMLCanvasElement {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const [tl, tr, br, bl] = corners;

  const maxW = Math.max(
    Math.round(Math.hypot((br.x - bl.x) * w, (br.y - bl.y) * h)),
    Math.round(Math.hypot((tr.x - tl.x) * w, (tr.y - tl.y) * h)),
    100
  );
  const maxH = Math.max(
    Math.round(Math.hypot((tr.x - br.x) * w, (tr.y - br.y) * h)),
    Math.round(Math.hypot((tl.x - bl.x) * w, (tl.y - bl.y) * h)),
    100
  );

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x * w, tl.y * h, tr.x * w, tr.y * h, br.x * w, br.y * h, bl.x * w, bl.y * h,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, maxW, 0, maxW, maxH, 0, maxH]);

  const src = cv.imread(sourceCanvas);
  const dst = new cv.Mat();
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  cv.warpPerspective(src, dst, M, new cv.Size(maxW, maxH), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));

  const out = document.createElement("canvas");
  out.width = maxW;
  out.height = maxH;
  cv.imshow(out, dst);

  src.delete();
  dst.delete();
  M.delete();
  srcTri.delete();
  dstTri.delete();
  return downscale(out);
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
  contrast: number,
  enhance: boolean
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
    if (enhance) {
      r = (r - 128) * 1.08 + 128;
      g = (g - 128) * 1.08 + 128;
      bl = (bl - 128) * 1.08 + 128;
    }
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

async function renderScanPreview(
  cv: any | null,
  page: Omit<ScanPage, "previewDataUrl" | "id"> & { sourceDataUrl: string }
): Promise<string> {
  const img = await loadImage(page.sourceDataUrl);
  const src = document.createElement("canvas");
  src.width = img.width;
  src.height = img.height;
  src.getContext("2d")?.drawImage(img, 0, 0);

  let warped: HTMLCanvasElement;
  if (cv) {
    try {
      warped = warpPerspective(cv, src, page.corners);
    } catch {
      warped = src;
    }
  } else {
    const xs = page.corners.map((p) => p.x);
    const ys = page.corners.map((p) => p.y);
    const x0 = Math.max(0, Math.min(...xs) * src.width);
    const y0 = Math.max(0, Math.min(...ys) * src.height);
    const x1 = Math.min(src.width, Math.max(...xs) * src.width);
    const y1 = Math.min(src.height, Math.max(...ys) * src.height);
    const c = document.createElement("canvas");
    c.width = Math.max(1, x1 - x0);
    c.height = Math.max(1, y1 - y0);
    c.getContext("2d")?.drawImage(src, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    warped = downscale(c);
  }

  warped = rotateCanvas(warped, page.rotation);
  warped = applyPixelAdjust(warped, page.filter, page.brightness, page.contrast, page.enhance);
  return canvasJpeg(warped);
}

const defaultCorners = (): [Point, Point, Point, Point] => [
  { x: 0.08, y: 0.08 },
  { x: 0.92, y: 0.08 },
  { x: 0.92, y: 0.92 },
  { x: 0.08, y: 0.92 },
];

type CameraCaptureProps = {
  open: boolean;
  onClose: () => void;
  onComplete: (file: File) => void;
};

export default function CameraCapture({ open, onClose, onComplete }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const loopRef = useRef<number | null>(null);
  const cvRef = useRef<any>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastDetectTs = useRef(0);
  const lastCornersRef = useRef<[Point, Point, Point, Point] | null>(null);
  const stableCountRef = useRef(0);
  const dragCornerRef = useRef<number | null>(null);
  const editBoxRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<ScannerPhase>("live");
  const [cvReady, setCvReady] = useState(false);
  const [scanPages, setScanPages] = useState<ScanPage[]>([]);
  const [docStatus, setDocStatus] = useState<"searching" | "detected" | "stable">("searching");
  const [liveCorners, setLiveCorners] = useState<[Point, Point, Point, Point] | null>(null);
  const [gridOn, setGridOn] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const [editSource, setEditSource] = useState("");
  const [editCorners, setEditCorners] = useState<[Point, Point, Point, Point]>(defaultCorners());
  const [editRotation, setEditRotation] = useState<0 | 90 | 180 | 270>(0);
  const [editFilter, setEditFilter] = useState<ScanFilter>("color");
  const [editBrightness, setEditBrightness] = useState(0);
  const [editContrast, setEditContrast] = useState(10);
  const [editEnhance, setEditEnhance] = useState(true);
  const [editPreview, setEditPreview] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);

  const [buildingPdf, setBuildingPdf] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [error, setError] = useState("");

  const stopLoop = useCallback(() => {
    if (loopRef.current != null) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
  }, []);

  const stopStream = useCallback(async () => {
    stopLoop();
    const stream = streamRef.current;
    streamRef.current = null;
    trackRef.current = null;

    const video = videoRef.current;
    if (video) {
      try { video.pause(); } catch {}
      video.srcObject = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
    }
    await new Promise((r) => setTimeout(r, 150));
  }, [stopLoop]);

  // Cleanup saat close / unmount
  useEffect(() => {
    if (!open) {
      void stopStream();
      setPhase("live");
      setScanPages([]);
      setPdfPreviewOpen(false);
      setLiveCorners(null);
      setDocStatus("searching");
      setError("");
      lastCornersRef.current = null;
      stableCountRef.current = 0;
    }
  }, [open, stopStream]);

  useEffect(() => {
    return () => {
      void stopStream();
      if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = open || pdfPreviewOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open, pdfPreviewOpen]);

  // Start camera
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const start = async () => {
      try {
        setError("");
        await stopStream();

        loadOpenCv()
          .then((cv) => {
            if (!cancelled) {
              cvRef.current = cv;
              setCvReady(true);
            }
          })
          .catch(() => {
            if (!cancelled) setCvReady(false);
          });

        setTorchOn(false);
        setTorchSupported(false);
        setPhase("live");
        setLiveCorners(null);
        setDocStatus("searching");

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;

        try {
          const caps = track.getCapabilities?.() as any;
          if (caps?.torch) setTorchSupported(true);
        } catch {}
      } catch (err: unknown) {
        if (cancelled) return;
        await stopStream();
        const msg =
          err instanceof Error
            ? err.name === "NotAllowedError"
              ? "Izin kamera ditolak."
              : err.name === "NotReadableError" || err.name === "AbortError"
                ? "Kamera sedang dipakai aplikasi lain."
                : err.message
            : "Kamera tidak dapat digunakan.";
        setError(msg);
      }
    };

    void start();
    return () => { cancelled = true; };
  }, [open]);

  // Video + light detection loop (jarang)
  useEffect(() => {
    if (!open || phase !== "live" || !streamRef.current) return;

    const video = videoRef.current;
    if (video) {
      video.srcObject = streamRef.current;
      const play = () => void video.play().catch(() => {});
      if (video.readyState >= 1) play();
      else video.onloadedmetadata = play;
    }

    // reuse canvas
    if (!sampleCanvasRef.current) {
      sampleCanvasRef.current = document.createElement("canvas");
    }

    const tick = (ts: number) => {
      const v = videoRef.current;
      const ov = overlayRef.current;
      if (!v || !ov || !v.videoWidth) {
        loopRef.current = requestAnimationFrame(tick);
        return;
      }

      if (ov.width !== v.clientWidth || ov.height !== v.clientHeight) {
        ov.width = v.clientWidth || 1;
        ov.height = v.clientHeight || 1;
      }

      // deteksi hanya setiap ~280ms
      if (ts - lastDetectTs.current > 280 && cvRef.current) {
        lastDetectTs.current = ts;
        try {
          const sample = sampleCanvasRef.current!;
          const sw = DETECT_W;
          const sh = Math.round((sw / v.videoWidth) * v.videoHeight);
          if (sample.width !== sw || sample.height !== sh) {
            sample.width = sw;
            sample.height = sh;
          }
          sample.getContext("2d")?.drawImage(v, 0, 0, sw, sh);

          const corners = detectCornersOpenCv(cvRef.current, sample);
          const ctx = ov.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, ov.width, ov.height);

            if (gridOn) {
              ctx.strokeStyle = "rgba(255,255,255,0.2)";
              ctx.lineWidth = 1;
              for (let i = 1; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo((ov.width * i) / 3, 0);
                ctx.lineTo((ov.width * i) / 3, ov.height);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, (ov.height * i) / 3);
                ctx.lineTo(ov.width, (ov.height * i) / 3);
                ctx.stroke();
              }
            }

            if (corners) {
              setLiveCorners(corners);
              const pts = corners.map((p) => ({ x: p.x * ov.width, y: p.y * ov.height }));

              ctx.fillStyle = "rgba(0,0,0,0.25)";
              ctx.fillRect(0, 0, ov.width, ov.height);
              ctx.save();
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
              ctx.closePath();
              ctx.clip();
              ctx.clearRect(0, 0, ov.width, ov.height);
              ctx.restore();

              ctx.strokeStyle = "#22c55e";
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
              ctx.closePath();
              ctx.stroke();
              pts.forEach((p) => {
                ctx.fillStyle = "#22c55e";
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                ctx.fill();
              });

              const prev = lastCornersRef.current;
              if (prev) {
                let dist = 0;
                for (let i = 0; i < 4; i++) {
                  dist += Math.hypot(corners[i].x - prev[i].x, corners[i].y - prev[i].y);
                }
                stableCountRef.current = dist < 0.05 ? stableCountRef.current + 1 : 0;
              }
              lastCornersRef.current = corners;
              setDocStatus(stableCountRef.current > 4 ? "stable" : "detected");
            } else {
              setLiveCorners(null);
              setDocStatus("searching");
              stableCountRef.current = 0;
              lastCornersRef.current = null;
            }
          }
        } catch {
          // ignore frame error
        }
      }

      loopRef.current = requestAnimationFrame(tick);
    };

    loopRef.current = requestAnimationFrame(tick);
    return () => {
      stopLoop();
      if (video) video.onloadedmetadata = null;
    };
  }, [open, phase, gridOn, stopLoop]);

  const toggleTorch = async () => {
    try {
      const next = !torchOn;
      await trackRef.current?.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const doCapture = async () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    stopLoop();

    const full = document.createElement("canvas");
    full.width = v.videoWidth;
    full.height = v.videoHeight;
    full.getContext("2d")?.drawImage(v, 0, 0);
    const sourceDataUrl = canvasJpeg(downscale(full), 0.82);

    let corners = liveCorners ?? defaultCorners();
    if (cvRef.current) {
      try {
        const detected = detectCornersOpenCv(cvRef.current, full);
        if (detected) corners = detected;
      } catch {}
    }

    setEditSource(sourceDataUrl);
    setEditCorners(corners);
    setEditRotation(0);
    setEditFilter("color");
    setEditBrightness(0);
    setEditContrast(10);
    setEditEnhance(true);
    setEditingPageId(null);
    setPhase("edit");

    setEditBusy(true);
    try {
      const preview = await renderScanPreview(cvRef.current, {
        sourceDataUrl,
        corners,
        rotation: 0,
        filter: "color",
        brightness: 0,
        contrast: 10,
        enhance: true,
      });
      setEditPreview(preview);
    } finally {
      setEditBusy(false);
    }
  };

  const refreshEditPreview = useCallback(async () => {
    if (!editSource) return;
    setEditBusy(true);
    try {
      const preview = await renderScanPreview(cvRef.current, {
        sourceDataUrl: editSource,
        corners: editCorners,
        rotation: editRotation,
        filter: editFilter,
        brightness: editBrightness,
        contrast: editContrast,
        enhance: editEnhance,
      });
      setEditPreview(preview);
    } finally {
      setEditBusy(false);
    }
  }, [editSource, editCorners, editRotation, editFilter, editBrightness, editContrast, editEnhance]);

  useEffect(() => {
    if (phase !== "edit" || !editSource) return;
    const t = window.setTimeout(() => void refreshEditPreview(), 150);
    return () => window.clearTimeout(t);
  }, [phase, editSource, editCorners, editRotation, editFilter, editBrightness, editContrast, editEnhance, refreshEditPreview]);

  const onCornerPointerDown = (idx: number) => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCornerRef.current = idx;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onEditPointerMove = (e: ReactPointerEvent) => {
    if (dragCornerRef.current == null || !editBoxRef.current) return;
    const rect = editBoxRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const i = dragCornerRef.current;
    setEditCorners((prev) => {
      const next = [...prev] as [Point, Point, Point, Point];
      next[i] = { x, y };
      return next;
    });
  };

  const onEditPointerUp = () => { dragCornerRef.current = null; };

  const acceptEditPage = async () => {
    setEditBusy(true);
    try {
      const previewDataUrl = await renderScanPreview(cvRef.current, {
        sourceDataUrl: editSource,
        corners: editCorners,
        rotation: editRotation,
        filter: editFilter,
        brightness: editBrightness,
        contrast: editContrast,
        enhance: editEnhance,
      });
      const page: ScanPage = {
        id: editingPageId ?? `p-${Date.now()}`,
        sourceDataUrl: editSource,
        corners: editCorners,
        rotation: editRotation,
        filter: editFilter,
        brightness: editBrightness,
        contrast: editContrast,
        enhance: editEnhance,
        previewDataUrl,
      };
      setScanPages((prev) =>
        editingPageId ? prev.map((p) => (p.id === editingPageId ? page : p)) : [...prev, page]
      );
      setPhase("live");
      setEditSource("");
      setEditPreview("");
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
    setEditCorners(page.corners);
    setEditRotation(page.rotation);
    setEditFilter(page.filter);
    setEditBrightness(page.brightness);
    setEditContrast(page.contrast);
    setEditEnhance(page.enhance);
    setEditPreview(page.previewDataUrl);
    setPhase("edit");
  };

  const removePage = (id: string) => setScanPages((p) => p.filter((x) => x.id !== id));

  const revokePdf = useCallback(() => {
    setPdfPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const buildPdf = async () => {
    if (!scanPages.length) throw new Error("Belum ada halaman");
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    for (let i = 0; i < scanPages.length; i++) {
      const img = await loadImage(scanPages[i].previewDataUrl);
      const ratio = Math.min(194 / img.width, 281 / img.height);
      const dw = img.width * ratio;
      const dh = img.height * ratio;
      if (i) pdf.addPage();
      pdf.addImage(scanPages[i].previewDataUrl, "JPEG", (210 - dw) / 2, (297 - dh) / 2, dw, dh, undefined, "FAST");
    }
    const blob = new Blob([pdf.output("arraybuffer")], { type: "application/pdf" });
    return { blob, fileName: `scan-${Date.now()}.pdf`, pageCount: scanPages.length };
  };

  const makeScanPdf = async () => {
    if (!scanPages.length || buildingPdf) return;
    setBuildingPdf(true);
    try {
      const { blob, fileName, pageCount } = await buildPdf();
      revokePdf();
      const url = URL.createObjectURL(blob);
      setPdfPreview({ url, blob, fileName, pageCount, sizeBytes: blob.size });
      setPdfPreviewOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat PDF");
    } finally {
      setBuildingPdf(false);
    }
  };

  const confirmUsePdf = () => {
    if (!pdfPreview) return;
    const file = new File([pdfPreview.blob], pdfPreview.fileName, { type: "application/pdf" });
    onComplete(file);
    setPdfPreviewOpen(false);
    revokePdf();
    setScanPages([]);
    onClose();
  };

  if (!open) return null;

  const statusLabel =
    docStatus === "stable"
      ? "Dokumen stabil"
      : docStatus === "detected"
        ? "✓ Dokumen terdeteksi"
        : "Mencari dokumen…";

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-0 sm:p-3">
        <div className="relative flex h-[100dvh] max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-slate-950 sm:h-auto sm:max-h-[96vh] sm:rounded-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-3 py-2.5">
            <div className="flex items-center gap-2 text-white">
              <Aperture size={18} className="text-blue-400" />
              <span className="text-sm font-semibold">Scanner Dokumen</span>
              {cvReady ? (
                <span className="text-[10px] text-emerald-400">OpenCV</span>
              ) : (
                <span className="text-[10px] text-amber-400">CV loading…</span>
              )}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
              <X size={22} />
            </button>
          </div>

          {error && <div className="bg-red-900/50 px-4 py-2 text-sm text-red-200">{error}</div>}

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
                <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
                <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
                  {statusLabel}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-800 bg-slate-900 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setGridOn((g) => !g)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${gridOn ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"}`}
                >
                  <Grid3X3 size={14} className="mr-1 inline" /> Grid
                </button>
                {torchSupported && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${torchOn ? "bg-amber-500 text-black" : "bg-slate-800 text-slate-300"}`}
                  >
                    <Flashlight size={14} className="mr-1 inline" /> Flash
                  </button>
                )}
              </div>

              {scanPages.length > 0 && (
                <div className="flex gap-2 overflow-x-auto border-t border-slate-800 bg-slate-900/80 px-3 py-2">
                  {scanPages.map((p, i) => (
                    <div key={p.id} className="relative w-16 shrink-0">
                      <Image src={p.previewDataUrl} alt="" width={64} height={80} unoptimized className="aspect-[3/4] w-full rounded object-cover" />
                      <button type="button" onClick={() => removePage(p.id)} className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-red-600 text-[10px] text-white">×</button>
                      <button type="button" onClick={() => editExistingPage(p)} className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-white">
                        <Pencil size={10} className="inline" /> {i + 1}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap justify-center gap-2 border-t border-slate-800 bg-slate-950 px-3 py-3">
                <button type="button" onClick={() => void doCapture()} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white">
                  <Camera size={16} className="mr-1 inline" /> Ambil Halaman
                </button>
                <button
                  type="button"
                  onClick={makeScanPdf}
                  disabled={!scanPages.length || buildingPdf}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {buildingPdf ? <Loader2 size={16} className="mr-1 inline animate-spin" /> : <FileText size={16} className="mr-1 inline" />}
                  Buat PDF ({scanPages.length})
                </button>
                <button type="button" onClick={onClose} className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200">
                  Tutup
                </button>
              </div>
            </>
          )}

          {phase === "edit" && (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="grid gap-3 p-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs text-slate-400">Geser 4 sudut</p>
                  <div
                    ref={editBoxRef}
                    className="relative aspect-[3/4] w-full touch-none overflow-hidden rounded-xl bg-black"
                    onPointerMove={onEditPointerMove}
                    onPointerUp={onEditPointerUp}
                    onPointerLeave={onEditPointerUp}
                  >
                    {editSource && <Image src={editSource} alt="source" fill unoptimized className="object-contain" />}
                    <svg className="pointer-events-none absolute inset-0 h-full w-full">
                      <polygon
                        points={editCorners.map((p) => `${p.x * 100}%,${p.y * 100}%`).join(" ").replace(/%/g, "")}
                        fill="rgba(34,197,94,0.15)"
                        stroke="#22c55e"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                    {editCorners.map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        onPointerDown={onCornerPointerDown(i)}
                        className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500 shadow"
                        style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs text-slate-400">Hasil {editBusy && "(memproses…)"}</p>
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-white">
                    {editPreview ? (
                      <Image src={editPreview} alt="preview" fill unoptimized className="object-contain" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400">
                        <Loader2 className="animate-spin" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-800 px-3 py-2">
                <div className="flex flex-wrap justify-center gap-2">
                  {(["color", "gray", "bw"] as ScanFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setEditFilter(f)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase ${editFilter === f ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"}`}
                    >
                      {f === "color" ? "Color" : f === "gray" ? "Gray" : "B&W"}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEditRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
                  >
                    <RotateCw size={14} className="mr-1 inline" /> Rotate
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditEnhance((x) => !x)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${editEnhance ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}
                  >
                    Enhance
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Brightness
                  <input type="range" min={-40} max={40} value={editBrightness} onChange={(e) => setEditBrightness(Number(e.target.value))} className="flex-1" />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Contrast
                  <input type="range" min={-40} max={40} value={editContrast} onChange={(e) => setEditContrast(Number(e.target.value))} className="flex-1" />
                </label>
              </div>

              <div className="flex flex-wrap justify-center gap-2 border-t border-slate-800 px-3 py-3">
                <button type="button" onClick={retake} className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200">
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

      {pdfPreviewOpen && pdfPreview && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-2 sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Preview PDF</h3>
                <p className="text-xs text-slate-400">
                  {pdfPreview.fileName} · {pdfPreview.pageCount} hlm · {(pdfPreview.sizeBytes / 1024).toFixed(0)} KB
                </p>
              </div>
              <button type="button" onClick={() => setPdfPreviewOpen(false)} className="p-2 text-slate-400 hover:text-white">
                <X size={22} />
              </button>
            </div>
            <iframe src={pdfPreview.url} title="Preview PDF" className="h-[60vh] w-full border-0 bg-white" />
            <div className="flex flex-wrap justify-center gap-2 border-t border-slate-700 px-3 py-3">
              <button type="button" onClick={() => setPdfPreviewOpen(false)} className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200">
                <ArrowLeft size={16} className="mr-1 inline" /> Kembali Edit
              </button>
              <button type="button" onClick={() => void makeScanPdf()} className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200">
                <RotateCcw size={16} className="mr-1 inline" /> Buat Ulang
              </button>
              <button type="button" onClick={confirmUsePdf} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">
                <Check size={16} className="mr-1 inline" /> Gunakan PDF Ini
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}