import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PageImage } from "../types/grading";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const MAX_DIMENSION = 1550;
const JPEG_QUALITY = 0.85;

function createPageId(): string {
  return `pg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function canvasToOptimizedPage(
  canvas: HTMLCanvasElement,
  pageNumber: number
): PageImage {
  const { width, height } = canvas;
  let targetWidth = width;
  let targetHeight = height;

  if (Math.max(width, height) > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    targetWidth = Math.round(width * scale);
    targetHeight = Math.round(height * scale);
  }

  let outputCanvas = canvas;
  if (targetWidth !== width || targetHeight !== height) {
    outputCanvas = document.createElement("canvas");
    outputCanvas.width = targetWidth;
    outputCanvas.height = targetHeight;
    const ctx = outputCanvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
    }
  }

  const dataUrl = outputCanvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return {
    id: createPageId(),
    pageNumber,
    dataUrl,
    width: targetWidth,
    height: targetHeight,
    mimeType: "image/jpeg",
  };
}

export async function processImageFile(
  file: File,
  pageNumber = 1
): Promise<PageImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not decode image: ${file.name}`));
      el.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Browser 2D Canvas context is unavailable.");
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    return canvasToOptimizedPage(canvas, pageNumber);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function processPdfFile(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<PageImage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const pages: PageImage[] = [];
  const total = pdf.numPages;

  for (let i = 1; i <= total; i++) {
    onProgress?.(i, total);
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const longestSide = Math.max(baseViewport.width, baseViewport.height);
    const renderScale = Math.min(2.2, Math.max(1.2, MAX_DIMENSION / longestSide));
    const viewport = page.getViewport({ scale: renderScale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to render PDF page onto Canvas.");
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;

    pages.push(canvasToOptimizedPage(canvas, i));
  }

  return pages;
}

export async function processUploadedFiles(
  files: File[],
  onProgress?: (message: string) => void
): Promise<PageImage[]> {
  const allPages: PageImage[] = [];
  let pageCounter = 1;

  for (const file of files) {
    const ext = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || ext.endsWith(".pdf");
    const isImage =
      file.type.startsWith("image/") ||
      ext.endsWith(".png") ||
      ext.endsWith(".jpg") ||
      ext.endsWith(".jpeg") ||
      ext.endsWith(".webp");

    if (!isPdf && !isImage) {
      throw new Error(
        `Unsupported file "${file.name}". Please upload PDF, PNG, JPG, or JPEG files.`
      );
    }

    if (isPdf) {
      const pdfPages = await processPdfFile(file, (curr, total) => {
        onProgress?.(`Rendering ${file.name}: page ${curr} of ${total}`);
      });
      for (const p of pdfPages) {
        allPages.push({ ...p, pageNumber: pageCounter++ });
      }
    } else {
      onProgress?.(`Optimizing ${file.name}`);
      const page = await processImageFile(file, pageCounter++);
      allPages.push(page);
    }
  }

  return allPages;
}

export async function processPdfFromUrl(
  url: string,
  filename: string,
  onProgress?: (current: number, total: number) => void
): Promise<PageImage[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load PDF from ${url}`);
  }
  const blob = await response.blob();
  const file = new File([blob], filename, { type: "application/pdf" });
  return processPdfFile(file, onProgress);
}

export async function downscaleDataUrlForUpload(
  dataUrl: string,
  maxDim = 1440
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode image for optimization."));
    el.src = dataUrl;
  });

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (Math.max(w, h) <= maxDim) {
    return dataUrl;
  }

  const scale = maxDim / Math.max(w, h);
  const targetW = Math.round(w * scale);
  const targetH = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetW, targetH);

  return canvas.toDataURL("image/jpeg", 0.84);
}
