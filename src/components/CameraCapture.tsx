"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";

type CameraCaptureProps = {
  /** Apakah modal kamera terbuka */
  open: boolean;
  /** Tutup modal */
  onClose: () => void;
  /**
   * Dipanggil setelah foto berhasil diubah jadi PDF.
   * Parent tinggal set file ke state masing-masing.
   */
  onCapture: (file: File) => void;
  /** Judul di header (opsional) */
  title?: string;
  /** Subtitle, mis. "Baris 2" (opsional) */
  subtitle?: string;
  /** Nama file PDF (opsional) */
  fileNamePrefix?: string;
};

export default function CameraCapture({
  open,
  onClose,
  onCapture,
  title = "Scan Kamera",
  subtitle,
  fileNamePrefix = "scan",
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  /** Lepas kamera sepenuhnya + jeda agar hardware free */
  const stopStream = useCallback(async () => {
    const stream = streamRef.current;
    streamRef.current = null;
    setReady(false);

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
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
    }

    // penting: browser (terutama mobile) butuh waktu melepaskan kamera
    await new Promise((r) => setTimeout(r, 200));
  }, []);

  /** Buka stream kamera */
  const startStream = useCallback(async () => {
    setError("");
    setCapturing(false);
    setReady(false);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Kamera tidak tersedia di perangkat ini.");
      }

      // selalu lepas dulu sebelum request baru
      await stopStream();

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

      if (!stream.getVideoTracks().length) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("Tidak ada video track dari kamera.");
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        const play = () => {
          void video.play().catch(() => {});
          setReady(true);
        };
        if (video.readyState >= 1) play();
        else video.onloadedmetadata = play;
      }
    } catch (err: unknown) {
      await stopStream();
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
  }, [stopStream]);

  // buka/tutup stream mengikuti prop `open`
  useEffect(() => {
    if (open) {
      void startStream();
    } else {
      void stopStream();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // lock scroll saat modal terbuka
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      htmlOverflow: html.style.overflow,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      html.style.overflow = prev.htmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  // cleanup unmount
  useEffect(() => {
    return () => {
      void stopStream();
    };
  }, [stopStream]);

  const handleClose = () => {
    void stopStream();
    setError("");
    setCapturing(false);
    onClose();
  };

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !ready) {
      setError("Kamera belum siap. Tunggu sebentar lalu coba lagi.");
      return;
    }
    if (capturing) return;

    setCapturing(true);
    setError("");

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);

      // downscale jika terlalu besar
      let exportCanvas = canvas;
      const maxSide = 1600;
      const maxDim = Math.max(canvas.width, canvas.height);
      if (maxDim > maxSide) {
        const scale = maxSide / maxDim;
        const scaled = document.createElement("canvas");
        scaled.width = Math.round(canvas.width * scale);
        scaled.height = Math.round(canvas.height * scale);
        const sctx = scaled.getContext("2d");
        if (sctx) {
          sctx.imageSmoothingEnabled = true;
          sctx.imageSmoothingQuality = "high";
          sctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
          exportCanvas = scaled;
        }
      }

      const dataUrl = exportCanvas.toDataURL("image/jpeg", 0.78);
      const ratio = Math.min(
        194 / exportCanvas.width,
        281 / exportCanvas.height
      );
      const drawW = exportCanvas.width * ratio;
      const drawH = exportCanvas.height * ratio;

      const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
      pdf.addImage(
        dataUrl,
        "JPEG",
        (210 - drawW) / 2,
        (297 - drawH) / 2,
        drawW,
        drawH,
        undefined,
        "FAST"
      );

      const file = new File(
        [pdf.output("arraybuffer")],
        `${fileNamePrefix}-${Date.now()}.pdf`,
        { type: "application/pdf" }
      );

      onCapture(file);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengambil foto.");
      setCapturing(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden bg-black"
      style={{
        width: "100vw",
        height: "100dvh",
        maxHeight: "100dvh",
        overscrollBehavior: "none",
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex h-full w-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div>
            <p className="text-sm font-semibold text-white">{title}</p>
            {subtitle && (
              <p className="text-xs text-white/60">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X size={22} />
          </button>
        </div>

        {/* Preview */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* guide frame */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="h-[65%] w-[78%] max-w-md rounded-2xl border-2 border-dashed border-white/30" />
          </div>
          {error && (
            <div className="absolute bottom-4 left-1/2 w-[90%] max-w-sm -translate-x-1/2 rounded-xl bg-red-600/90 px-4 py-2 text-center text-sm text-white">
              {error}
            </div>
          )}
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 size={36} className="animate-spin text-white" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="shrink-0 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <div className="mx-auto flex max-w-md items-center justify-center gap-8">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleCapture()}
              disabled={capturing || !ready}
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/15 disabled:opacity-60"
            >
              {capturing ? (
                <Loader2 size={28} className="animate-spin text-white" />
              ) : (
                <span className="h-12 w-12 rounded-full bg-white" />
              )}
            </button>
            <div className="w-[72px]" />
          </div>
          <p className="mt-2 text-center text-xs text-white/70">
            {capturing ? "Memproses PDF…" : "Ambil Foto jadi PDF"}
          </p>
        </div>
      </div>
    </div>
  );
}