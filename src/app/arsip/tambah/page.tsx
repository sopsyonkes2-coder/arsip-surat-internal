"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  DragEvent,
  PointerEvent as ReactPointerEvent,
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
  Flashlight,
  Grid3X3,
  RotateCw,
  Sun,
  ZoomIn,
  Pencil,
  Aperture,
} from "lucide-react";
import { loadOpenCv } from "@/lib/opencv-loader";

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
const MAX_SIDE = 1600;
const DETECT_W = 320;

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
  return [
    bySum[0],
    byDiff[0],
    bySum[3],
    byDiff[3],
  ];
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
    cv.findContours(
      dilated,
      contours,
      hierarchy,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE
    );

    const imgArea = sourceCanvas.width * sourceCanvas.height;
    let best: { area: number; pts: Point[] } | null = null;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < imgArea * 0.12 || area > imgArea * 0.98) {
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
  const tl = corners[0];
  const tr = corners[1];
  const br = corners[2];
  const bl = corners[3];

  const widthA = Math.hypot((br.x - bl.x) * w, (br.y - bl.y) * h);
  const widthB = Math.hypot((tr.x - tl.x) * w, (tr.y - tl.y) * h);
  const maxW = Math.max(Math.round(widthA), Math.round(widthB), 100);

  const heightA = Math.hypot((tr.x - br.x) * w, (tr.y - br.y) * h);
  const heightB = Math.hypot((tl.x - bl.x) * w, (tl.y - bl.y) * h);
  const maxH = Math.max(Math.round(heightA), Math.round(heightB), 100);

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x * w,
    tl.y * h,
    tr.x * w,
    tr.y * h,
    br.x * w,
    br.y * h,
    bl.x * w,
    bl.y * h,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    maxW,
    0,
    maxW,
    maxH,
    0,
    maxH,
  ]);

  const src = cv.imread(sourceCanvas);
  const dst = new cv.Mat();
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  cv.warpPerspective(
    src,
    dst,
    M,
    new cv.Size(maxW, maxH),
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar(255, 255, 255, 255)
  );

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
    let r = d[i];
    let g = d[i + 1];
    let bl = d[i + 2];
    r = contrastF * (r - 128) + 128 + b;
    g = contrastF * (g - 128) + 128 + b;
    bl = contrastF * (bl - 128) + 128 + b;
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
    const mean = sum / n;
    const th = Math.min(175, Math.max(95, mean * 0.88));
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
    c.getContext("2d")?.drawImage(
      src,
      x0,
      y0,
      c.width,
      c.height,
      0,
      0,
      c.width,
      c.height
    );
    warped = downscale(c);
  }

  warped = rotateCanvas(warped, page.rotation);
  warped = applyPixelAdjust(
    warped,
    page.filter,
    page.brightness,
    page.contrast,
    page.enhance
  );
  return canvasJpeg(warped);
}

const defaultCorners = (): [Point, Point, Point, Point] => [
  { x: 0.08, y: 0.08 },
  { x: 0.92, y: 0.08 },
  { x: 0.92, y: 0.92 },
  { x: 0.08, y: 0.92 },
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
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const loopRef = useRef<number | null>(null);
  const cvRef = useRef<any>(null);
  const lastCornersRef = useRef<[Point, Point, Point, Point] | null>(null);
  const stableCountRef = useRef(0);
  const autoCountdownRef = useRef<number | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [phase, setPhase] = useState<ScannerPhase>("live");
  const [cvReady, setCvReady] = useState(false);
  const [scanPages, setScanPages] = useState<ScanPage[]>([]);
  const [docStatus, setDocStatus] = useState<
    "searching" | "detected" | "stable"
  >("searching");
  const [liveCorners, setLiveCorners] = useState<
    [Point, Point, Point, Point] | null
  >(null);

  const [autoCapture, setAutoCapture] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [gridOn, setGridOn] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1 });
  const [zoom, setZoom] = useState(1);
  const [exposureSupported, setExposureSupported] = useState(false);
  const [exposureRange, setExposureRange] = useState({ min: 0, max: 0 });
  const [exposure, setExposure] = useState(0);
  const [focusIndicator, setFocusIndicator] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [editSource, setEditSource] = useState<string>("");
  const [editCorners, setEditCorners] = useState<[Point, Point, Point, Point]>(
    defaultCorners()
  );
  const [editRotation, setEditRotation] = useState<0 | 90 | 180 | 270>(0);
  const [editFilter, setEditFilter] = useState<ScanFilter>("color");
  const [editBrightness, setEditBrightness] = useState(0);
  const [editContrast, setEditContrast] = useState(0);
  const [editEnhance, setEditEnhance] = useState(true);
  const [editPreview, setEditPreview] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const dragCornerRef = useRef<number | null>(null);
  const editBoxRef = useRef<HTMLDivElement>(null);

  const [buildingPdf, setBuildingPdf] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleFile = (f?: File) => {
    if (!f) return;
    if (f.type !== "application/pdf") {
      setError("File harus berupa PDF.");
      return;
    }
    setError("");
    setFile(f);
  };

  const stopLoop = useCallback(() => {
    if (loopRef.current != null) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
    if (autoCountdownRef.current != null) {
      window.clearInterval(autoCountdownRef.current);
      autoCountdownRef.current = null;
    }
  }, []);

  /** Lepas kamera sepenuhnya + jeda agar hardware free sebelum getUserMedia lagi */
  const stopStream = useCallback(async () => {
    stopLoop();
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
      try {
        video.load();
      } catch {
        /* ignore */
      }
    }

    if (stream) {
      for (const t of stream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
    }

    // penting: browser (terutama mobile) butuh waktu melepaskan kamera
    await new Promise((r) => setTimeout(r, 200));
  }, [stopLoop]);

  useEffect(() => {
    return () => {
      void stopStream();
      if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.style.overflow =
      cameraOpen || pdfPreviewOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [cameraOpen, pdfPreviewOpen]);

  const inspectCapabilities = (track: MediaStreamTrack) => {
    try {
      const caps = track.getCapabilities?.() as any;
      if (!caps) return;
      if (caps.torch) setTorchSupported(true);
      if (caps.zoom) {
        setZoomSupported(true);
        setZoomRange({ min: caps.zoom.min ?? 1, max: caps.zoom.max ?? 1 });
        setZoom(track.getSettings?.().zoom ?? 1);
      }
      if (caps.exposureCompensation) {
        setExposureSupported(true);
        setExposureRange({
          min: caps.exposureCompensation.min ?? -2,
          max: caps.exposureCompensation.max ?? 2,
        });
      }
    } catch {
      /* ignore */
    }
  };

  const openCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Kamera tidak tersedia.");
      }
      setError("");

      // SELALU lepas stream lama dulu
      await stopStream();

      loadOpenCv()
        .then((cv) => {
          cvRef.current = cv;
          setCvReady(true);
        })
        .catch(() => {
          setCvReady(false);
        });

      // reset state
      setTorchOn(false);
      setTorchSupported(false);
      setZoomSupported(false);
      setExposureSupported(false);
      setZoom(1);
      setExposure(0);
      setLiveCorners(null);
      setDocStatus("searching");
      stableCountRef.current = 0;
      lastCornersRef.current = null;
      setCountdown(null);
      setFocusIndicator(null);
      setPhase("live");

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (!track) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("Tidak ada video track dari kamera.");
      }
      trackRef.current = track;
      inspectCapabilities(track);

      setCameraOpen(true);
    } catch (err: unknown) {
      await stopStream();
      setCameraOpen(false);
      const msg =
        err instanceof Error
          ? err.name === "NotAllowedError"
            ? "Izin kamera ditolak. Izinkan akses kamera di browser."
            : err.name === "NotReadableError" || err.name === "AbortError"
              ? "Kamera sedang dipakai aplikasi lain atau belum dilepas. Tutup aplikasi lain lalu coba lagi."
              : err.message
          : "Kamera tidak dapat digunakan.";
      setError(msg);
    }
  };

  const closeCamera = () => {
    void stopStream();
    setCameraOpen(false);
    setPhase("live");
    setCountdown(null);
    setTorchOn(false);
    setFocusIndicator(null);
    setLiveCorners(null);
    setDocStatus("searching");
    stableCountRef.current = 0;
    lastCornersRef.current = null;
  };

  // attach video + detection loop
  useEffect(() => {
    if (!cameraOpen || phase !== "live" || !streamRef.current) return;

    const video = videoRef.current;
    if (video) {
      video.srcObject = streamRef.current;
      const play = () => {
        void video.play().catch(() => {});
      };
      if (video.readyState >= 1) {
        play();
      } else {
        video.onloadedmetadata = play;
      }
    }

    let lastTs = 0;

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

      if (ts - lastTs > 90) {
        lastTs = ts;
        try {
          const sample = document.createElement("canvas");
          const sw = DETECT_W;
          const sh = Math.round((sw / v.videoWidth) * v.videoHeight);
          sample.width = sw;
          sample.height = sh;
          sample.getContext("2d")?.drawImage(v, 0, 0, sw, sh);

          let corners: [Point, Point, Point, Point] | null = null;
          if (cvRef.current) {
            corners = detectCornersOpenCv(cvRef.current, sample);
          }

          const ctx = ov.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, ov.width, ov.height);
            if (gridOn) {
              ctx.strokeStyle = "rgba(255,255,255,0.25)";
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
              const pts = corners.map((p) => ({
                x: p.x * ov.width,
                y: p.y * ov.height,
              }));
              ctx.fillStyle = "rgba(0,0,0,0.28)";
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
                ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                ctx.fill();
              });

              const prev = lastCornersRef.current;
              if (prev) {
                let dist = 0;
                for (let i = 0; i < 4; i++) {
                  dist += Math.hypot(
                    corners[i].x - prev[i].x,
                    corners[i].y - prev[i].y
                  );
                }
                if (dist < 0.04) stableCountRef.current += 1;
                else stableCountRef.current = 0;
              }
              lastCornersRef.current = corners;
              if (stableCountRef.current > 6) setDocStatus("stable");
              else setDocStatus("detected");
            } else {
              setLiveCorners(null);
              setDocStatus("searching");
              stableCountRef.current = 0;
              lastCornersRef.current = null;
            }
          }
        } catch {
          /* ignore frame errors */
        }
      }
      loopRef.current = requestAnimationFrame(tick);
    };

    loopRef.current = requestAnimationFrame(tick);
    return () => {
      stopLoop();
      if (video) {
        video.onloadedmetadata = null;
      }
    };
  }, [cameraOpen, phase, gridOn, stopLoop]);

  // auto capture countdown
  useEffect(() => {
    if (
      !autoCapture ||
      phase !== "live" ||
      docStatus !== "stable" ||
      countdown !== null
    )
      return;
    let n = 3;
    setCountdown(n);
    autoCountdownRef.current = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (autoCountdownRef.current)
          window.clearInterval(autoCountdownRef.current);
        autoCountdownRef.current = null;
        setCountdown(null);
        void doCapture();
      } else setCountdown(n);
    }, 700);
    return () => {
      if (autoCountdownRef.current)
        window.clearInterval(autoCountdownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCapture, docStatus, phase]);

  const applyZoom = async (z: number) => {
    setZoom(z);
    try {
      await trackRef.current?.applyConstraints({
        advanced: [{ zoom: z } as any],
      });
    } catch {
      /* unsupported */
    }
  };

  const applyExposure = async (v: number) => {
    setExposure(v);
    try {
      await trackRef.current?.applyConstraints({
        advanced: [{ exposureCompensation: v } as any],
      });
    } catch {
      /* */
    }
  };

  const toggleTorch = async () => {
    try {
      const next = !torchOn;
      await trackRef.current?.applyConstraints({
        advanced: [{ torch: next } as any],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const onTapFocus = async (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setFocusIndicator({ x, y });
    setTimeout(() => setFocusIndicator(null), 900);

    try {
      const track = trackRef.current;
      const caps = track?.getCapabilities?.() as any;
      if (
        caps?.focusMode?.includes?.("manual") ||
        caps?.focusMode?.includes?.("single-shot")
      ) {
        await track?.applyConstraints({
          advanced: [{ focusMode: "single-shot" } as any],
        });
      } else if (caps?.pointsOfInterest) {
        await track?.applyConstraints({
          advanced: [
            {
              pointsOfInterest: [{ x: x / rect.width, y: y / rect.height }],
            } as any,
          ],
        });
      }
    } catch {
      /* visual only */
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
    const sourceDataUrl = canvasJpeg(downscale(full), 0.85);

    let corners = liveCorners ?? defaultCorners();
    if (cvRef.current) {
      try {
        const detected = detectCornersOpenCv(cvRef.current, full);
        if (detected) corners = detected;
      } catch {
        /* keep live */
      }
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
    setCountdown(null);

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
  }, [
    editSource,
    editCorners,
    editRotation,
    editFilter,
    editBrightness,
    editContrast,
    editEnhance,
  ]);

  useEffect(() => {
    if (phase !== "edit" || !editSource) return;
    const t = window.setTimeout(() => {
      void refreshEditPreview();
    }, 120);
    return () => window.clearTimeout(t);
  }, [
    phase,
    editSource,
    editCorners,
    editRotation,
    editFilter,
    editBrightness,
    editContrast,
    editEnhance,
    refreshEditPreview,
  ]);

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

  const onEditPointerUp = () => {
    dragCornerRef.current = null;
  };

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
      setScanPages((prev) => {
        if (editingPageId) {
          return prev.map((p) => (p.id === editingPageId ? page : p));
        }
        return [...prev, page];
      });
      setPhase("live");
      setEditSource("");
      setEditPreview("");
      // video akan di-attach ulang oleh useEffect karena phase berubah
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
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    for (let i = 0; i < scanPages.length; i++) {
      const img = await loadImage(scanPages[i].previewDataUrl);
      const maxW = 194;
      const maxH = 281;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const dw = img.width * ratio;
      const dh = img.height * ratio;
      if (i) pdf.addPage();
      pdf.addImage(
        scanPages[i].previewDataUrl,
        "JPEG",
        (210 - dw) / 2,
        (297 - dh) / 2,
        dw,
        dh,
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
      setError(err instanceof Error ? err.message : "Gagal PDF");
    } finally {
      setBuildingPdf(false);
    }
  };

  const confirmUsePdf = () => {
    if (!pdfPreview) return;
    setFile(
      new File([pdfPreview.blob], pdfPreview.fileName, {
        type: "application/pdf",
      })
    );
    setPdfPreviewOpen(false);
    revokePdf();
    setScanPages([]);
    closeCamera();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const fd = new FormData();
      fd.append("nomorAgenda", form.agenda);
      fd.append("nomorSurat", form.nomorSurat);
      fd.append("tanggalSurat", form.tanggalSurat);
      fd.append("tanggalDiterima", form.tanggalDiterima);
      fd.append("pengirim", form.pengirim);
      fd.append("perihal", form.perihal);
      fd.append("klasifikasi", form.klasifikasi);
      fd.append("jenisSurat", form.jenisSurat);
      fd.append("keterangan", form.keterangan);
      fd.append("file", file);
      const res = await fetch("/api/archives", { method: "POST", body: fd });
      const result = await res.json();
      if (!res.ok || !result.success)
        throw new Error(result.message || "Gagal menyimpan arsip.");
      router.push("/arsip");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan."
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
          <p className="mt-2 text-sm text-slate-500">
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

  const statusLabel =
    docStatus === "stable"
      ? "Menstabilkan dokumen…"
      : docStatus === "detected"
        ? "✓ Dokumen terdeteksi"
        : "Mencari dokumen…";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section>
        <Link
          href="/arsip"
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft size={16} /> Kembali ke Arsip
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
                <h2 className="font-semibold text-slate-900">Informasi Surat</h2>
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
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
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
                <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
                  <Upload size={17} /> Pilih File
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => handleFile(e.target.files?.[0])}
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
                    onClick={() => setFile(null)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => void openCamera()}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              <Camera size={17} /> Scan dengan Kamera
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
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Save size={18} />
            {saving ? "Menyimpan..." : "Simpan Arsip"}
          </button>
        </section>
      </form>

      {/* ========== SCANNER MODAL ========== */}
      {cameraOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-0 sm:p-3">
          <div className="relative flex h-[100dvh] max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-slate-950 sm:h-auto sm:max-h-[96vh] sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-3 py-2.5">
              <div>
                <div className="flex items-center gap-2 text-white">
                  <Aperture size={18} className="text-blue-400" />
                  <span className="text-sm font-semibold">Scanner Dokumen</span>
                  {!cvReady && (
                    <span className="text-[10px] text-amber-400">
                      CV loading…
                    </span>
                  )}
                  {cvReady && (
                    <span className="text-[10px] text-emerald-400">OpenCV</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={closeCamera}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X size={22} />
              </button>
            </div>

            {phase === "live" && (
              <>
                <div
                  className="relative min-h-0 flex-1 bg-black"
                  onPointerDown={onTapFocus}
                >
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full max-h-[55vh] w-full object-cover sm:max-h-[58vh]"
                  />
                  <canvas
                    ref={overlayRef}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                  />
                  {focusIndicator && (
                    <div
                      className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-yellow-300 animate-ping opacity-80"
                      style={{
                        left: focusIndicator.x,
                        top: focusIndicator.y,
                      }}
                    />
                  )}
                  {countdown !== null && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="text-7xl font-bold text-white drop-shadow-lg">
                        {countdown}
                      </span>
                    </div>
                  )}
                  <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
                    {statusLabel}
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-800 bg-slate-900 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setGridOn((g) => !g)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${gridOn ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"}`}
                    >
                      <Grid3X3 size={14} className="mr-1 inline" />
                      Grid
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoCapture((a) => !a)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${autoCapture ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}
                    >
                      Auto Capture {autoCapture ? "ON" : "OFF"}
                    </button>
                    {torchSupported && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${torchOn ? "bg-amber-500 text-black" : "bg-slate-800 text-slate-300"}`}
                      >
                        <Flashlight size={14} className="mr-1 inline" />
                        Flash
                      </button>
                    )}
                  </div>
                  {zoomSupported && zoomRange.max > zoomRange.min && (
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                      <ZoomIn size={14} />
                      <input
                        type="range"
                        min={zoomRange.min}
                        max={zoomRange.max}
                        step={0.1}
                        value={zoom}
                        onChange={(e) => applyZoom(Number(e.target.value))}
                        className="flex-1"
                      />
                    </label>
                  )}
                  {exposureSupported && (
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                      <Sun size={14} />
                      <input
                        type="range"
                        min={exposureRange.min}
                        max={exposureRange.max}
                        step={0.1}
                        value={exposure}
                        onChange={(e) =>
                          applyExposure(Number(e.target.value))
                        }
                        className="flex-1"
                      />
                    </label>
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
                    className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    <Camera size={16} className="mr-1 inline" />
                    Ambil Halaman
                  </button>
                  <button
                    type="button"
                    onClick={makeScanPdf}
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
                    onClick={closeCamera}
                    className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200"
                  >
                    Tutup
                  </button>
                </div>
              </>
            )}

            {phase === "edit" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <div className="grid gap-3 p-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs text-slate-400">
                      Geser 4 sudut · Perspective correction
                    </p>
                    <div
                      ref={editBoxRef}
                      className="relative aspect-[3/4] w-full touch-none overflow-hidden rounded-xl bg-black"
                      onPointerMove={onEditPointerMove}
                      onPointerUp={onEditPointerUp}
                      onPointerLeave={onEditPointerUp}
                    >
                      {editSource && (
                        <Image
                          src={editSource}
                          alt="source"
                          fill
                          unoptimized
                          className="object-contain"
                        />
                      )}
                      <svg className="pointer-events-none absolute inset-0 h-full w-full">
                        <polygon
                          points={editCorners
                            .map((p) => `${p.x * 100}%,${p.y * 100}%`)
                            .join(" ")
                            .replace(/%/g, "")}
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
                          style={{
                            left: `${p.x * 100}%`,
                            top: `${p.y * 100}%`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-slate-400">
                      Hasil scan {editBusy && "(memproses…)"}
                    </p>
                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-white">
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
                        setEditRotation((r) =>
                          ((r + 90) % 360) as 0 | 90 | 180 | 270
                        )
                      }
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
                    >
                      <RotateCw size={14} className="mr-1 inline" />
                      Rotate
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditEnhance((x) => !x)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        editEnhance
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      Enhance
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
                      onChange={(e) => setEditContrast(Number(e.target.value))}
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
                    <Check size={16} className="mr-1 inline" />
                    Gunakan Halaman
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {pdfPreviewOpen && pdfPreview && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-2 sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Preview PDF</h3>
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
                <ArrowLeft size={16} className="mr-1 inline" />
                Kembali Edit
              </button>
              <button
                type="button"
                onClick={() => void makeScanPdf()}
                className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200"
              >
                <RotateCcw size={16} className="mr-1 inline" />
                Buat Ulang
              </button>
              <button
                type="button"
                onClick={confirmUsePdf}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Check size={16} className="mr-1 inline" />
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