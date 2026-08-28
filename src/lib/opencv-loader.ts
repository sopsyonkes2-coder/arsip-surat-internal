/* src/lib/opencv-loader.ts */
let loading: Promise<typeof window.cv> | null = null;

declare global {
  interface Window {
    cv: any;
  }
}

export function loadOpenCv(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV hanya di browser"));
  }
  if (window.cv && window.cv.Mat) {
    return Promise.resolve(window.cv);
  }
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const existing = document.getElementById("opencv-js");
    if (existing) {
      const check = () => {
        if (window.cv && window.cv.Mat) resolve(window.cv);
        else setTimeout(check, 50);
      };
      check();
      return;
    }

    const script = document.createElement("script");
    script.id = "opencv-js";
    script.async = true;
    script.src = "https://docs.opencv.org/4.x/opencv.js";
    script.onload = () => {
      const waitReady = () => {
        if (window.cv && window.cv.Mat) {
          // beberapa build butuh onRuntimeInitialized
          if (typeof window.cv.onRuntimeInitialized === "function") {
            const prev = window.cv.onRuntimeInitialized;
            window.cv.onRuntimeInitialized = () => {
              prev?.();
              resolve(window.cv);
            };
          } else {
            resolve(window.cv);
          }
        } else {
          setTimeout(waitReady, 30);
        }
      };
      waitReady();
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("Gagal memuat OpenCV.js"));
    };
    document.body.appendChild(script);
  });

  return loading;
}