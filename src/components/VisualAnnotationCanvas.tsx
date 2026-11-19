import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  AnnotationCategory,
  PageImage,
  VisualAnnotation,
} from "../types/grading";

interface VisualAnnotationCanvasProps {
  pages: PageImage[];
  annotations: VisualAnnotation[];
  selectedAnnotationId: string | null;
  onSelectAnnotation: (annotation: VisualAnnotation | null) => void;
}

const CATEGORY_COLORS: Record<
  AnnotationCategory,
  { stroke: string; fill: string; label: string }
> = {
  incorrect: {
    stroke: "#DC2626",
    fill: "rgba(220, 38, 38, 0.14)",
    label: "Incorrect",
  },
  incomplete: {
    stroke: "#D97706",
    fill: "rgba(217, 119, 6, 0.14)",
    label: "Incomplete",
  },
  uncertain: {
    stroke: "#0284C7",
    fill: "rgba(2, 132, 199, 0.14)",
    label: "Uncertain",
  },
  missing: {
    stroke: "#B91C1C",
    fill: "rgba(185, 28, 28, 0.12)",
    label: "Missing",
  },
  correct: {
    stroke: "#059669",
    fill: "rgba(5, 150, 105, 0.10)",
    label: "Correct",
  },
};

export function VisualAnnotationCanvas({
  pages,
  annotations,
  selectedAnnotationId,
  onSelectAnnotation,
}: VisualAnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showCorrectBoxes, setShowCorrectBoxes] = useState(false);
  const [imageReady, setImageReady] = useState(false);

  const safePageIdx = Math.min(currentPageIdx, Math.max(0, pages.length - 1));
  const currentPage = pages[safePageIdx];

  const visibleAnnotations = useMemo(() => {
    return annotations.filter((ann) => {
      if (ann.pageIndex !== safePageIdx) return false;
      if (!showCorrectBoxes && ann.category === "correct") return false;
      return true;
    });
  }, [annotations, safePageIdx, showCorrectBoxes]);

  const issueAnnotations = useMemo(
    () => annotations.filter((ann) => ann.category !== "correct"),
    [annotations]
  );

  // Sync page when teacher clicks an annotation on another page
  useEffect(() => {
    if (!selectedAnnotationId) return;
    const found = annotations.find((a) => a.id === selectedAnnotationId);
    if (found) {
      if (found.pageIndex !== safePageIdx) {
        setCurrentPageIdx(found.pageIndex);
      }
      if (found.category === "correct") {
        setShowCorrectBoxes(true);
      }
    }
  }, [selectedAnnotationId, annotations, safePageIdx]);

  // Load page image
  useEffect(() => {
    if (!currentPage) return;
    setImageReady(false);
    const img = new Image();
    img.onload = () => {
      loadedImageRef.current = img;
      setImageReady(true);
    };
    img.src = currentPage.dataUrl;
  }, [currentPage]);

  // Draw image + annotation boxes onto HTML Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img || !imageReady || !currentPage) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = img.naturalWidth || currentPage.width;
    const h = img.naturalHeight || currentPage.height;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    if (!showAnnotations) return;

    visibleAnnotations.forEach((ann, index) => {
      const [ymin, xmin, ymax, xmax] = ann.box_2d;
      const rx = (xmin / 1000) * w;
      const ry = (ymin / 1000) * h;
      const rw = ((xmax - xmin) / 1000) * w;
      const rh = ((ymax - ymin) / 1000) * h;

      const style = CATEGORY_COLORS[ann.category];
      const isSelected = ann.id === selectedAnnotationId;

      ctx.save();
      ctx.fillStyle = style.fill;
      ctx.fillRect(rx, ry, rw, rh);

      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = isSelected ? 4.5 : 2.5;
      if (ann.category === "uncertain") {
        ctx.setLineDash([8, 5]);
      }
      ctx.strokeRect(rx, ry, rw, rh);

      if (isSelected) {
        ctx.strokeStyle = "#0F172A";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(rx - 4, ry - 4, rw + 8, rh + 8);
      }

      // Draw compact numbered tag at top-left of box
      const tagText = `${index + 1}. ${style.label}`;
      ctx.setLineDash([]);
      ctx.font = "600 13px 'DM Sans', sans-serif";
      const textWidth = ctx.measureText(tagText).width;
      const tagW = textWidth + 14;
      const tagH = 22;
      const tagY = ry >= tagH + 2 ? ry - tagH - 2 : ry + 2;

      ctx.fillStyle = style.stroke;
      ctx.beginPath();
      ctx.roundRect(rx, tagY, tagW, tagH, 4);
      ctx.fill();

      ctx.fillStyle = "#FFFFFF";
      ctx.textBaseline = "middle";
      ctx.fillText(tagText, rx + 7, tagY + tagH / 2);
      ctx.restore();
    });
  }, [
    imageReady,
    currentPage,
    showAnnotations,
    visibleAnnotations,
    selectedAnnotationId,
  ]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!showAnnotations || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const normX = (clickX / canvasRef.current.width) * 1000;
    const normY = (clickY / canvasRef.current.height) * 1000;

    // Pick smallest matching box so nested regions are clickable
    const matches = visibleAnnotations.filter((ann) => {
      const [ymin, xmin, ymax, xmax] = ann.box_2d;
      return normX >= xmin && normX <= xmax && normY >= ymin && normY <= ymax;
    });

    if (matches.length > 0) {
      matches.sort((a, b) => {
        const areaA = (a.box_2d[2] - a.box_2d[0]) * (a.box_2d[3] - a.box_2d[1]);
        const areaB = (b.box_2d[2] - b.box_2d[0]) * (b.box_2d[3] - b.box_2d[1]);
        return areaA - areaB;
      });
      onSelectAnnotation(matches[0]);
    } else {
      onSelectAnnotation(null);
    }
  };

  const stepIssue = (direction: -1 | 1) => {
    if (issueAnnotations.length === 0) return;
    const currentIdx = issueAnnotations.findIndex(
      (a) => a.id === selectedAnnotationId
    );
    const nextIdx =
      currentIdx === -1
        ? 0
        : (currentIdx + direction + issueAnnotations.length) %
          issueAnnotations.length;
    onSelectAnnotation(issueAnnotations[nextIdx]);
  };

  const selectedAnn = useMemo(
    () => annotations.find((a) => a.id === selectedAnnotationId) ?? null,
    [annotations, selectedAnnotationId]
  );

  if (!currentPage) {
    return (
      <div className="flex h-80 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
        No student sheet image available.
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAnnotations((v) => !v)}
            className={`inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showAnnotations
                ? "border-blue-200 bg-blue-50 text-blue-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {showAnnotations ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
            <span>{showAnnotations ? "Annotations On" : "Original Sheet"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCorrectBoxes((v) => !v)}
            disabled={!showAnnotations}
            className={`inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              showCorrectBoxes && showAnnotations
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span>{showCorrectBoxes ? "Hide Correct Boxes" : "Show Correct Boxes"}</span>
          </button>

          {issueAnnotations.length > 0 && (
            <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
              <button
                type="button"
                onClick={() => stepIssue(-1)}
                className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                title="Previous flagged issue"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Prev Issue</span>
              </button>
              <button
                type="button"
                onClick={() => stepIssue(1)}
                className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                title="Next flagged issue"
              >
                <span>Next Issue</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {pages.length > 1 && (
            <div className="mr-2 flex items-center gap-1 border-r border-slate-200 pr-2">
              <button
                type="button"
                onClick={() => setCurrentPageIdx((p) => Math.max(0, p - 1))}
                disabled={safePageIdx === 0}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-1.5 font-mono text-xs text-slate-600 tabular-nums">
                Page {safePageIdx + 1} / {pages.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  setCurrentPageIdx((p) => Math.min(pages.length - 1, p + 1))
                }
                disabled={safePageIdx === pages.length - 1}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.2).toFixed(2))))}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-12 text-center font-mono text-xs text-slate-600 tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.2).toFixed(2))))}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
            aria-label="Reset zoom"
            title="Reset zoom to 100%"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-xs border border-red-600 bg-red-100" />
          Incorrect
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-xs border border-amber-600 bg-amber-100" />
          Incomplete
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-xs border border-dashed border-sky-600 bg-sky-100" />
          Uncertain Handwriting
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-xs border border-emerald-600 bg-emerald-100" />
          Correct (optional)
        </span>
        {annotations.length === 0 && (
          <span className="ml-auto text-slate-500">
            No bounding coordinates returned; review written feedback panel.
          </span>
        )}
      </div>

      {/* Canvas Viewport */}
      <div
        ref={scrollContainerRef}
        className="relative max-h-[620px] overflow-auto bg-slate-100/70 p-4"
      >
        <div
          className="mx-auto origin-top-left transition-transform duration-150"
          style={{ width: `${zoom * 100}%` }}
        >
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="block h-auto w-full cursor-crosshair rounded-lg border border-slate-200 bg-white shadow-xs"
          />
        </div>
      </div>

      {/* Selected Box Inspector Strip */}
      {selectedAnn && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span
                  className={
                    selectedAnn.category === "incorrect" ||
                    selectedAnn.category === "missing"
                      ? "text-red-700"
                      : selectedAnn.category === "incomplete"
                      ? "text-amber-700"
                      : selectedAnn.category === "uncertain"
                      ? "text-sky-700"
                      : "text-emerald-700"
                  }
                >
                  {CATEGORY_COLORS[selectedAnn.category].label}
                </span>
                <span aria-hidden="true">·</span>
                <span>Page {selectedAnn.pageIndex + 1}</span>
                {selectedAnn.marksDeducted !== undefined && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-red-700">
                      -{selectedAnn.marksDeducted} marks
                    </span>
                  </>
                )}
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {selectedAnn.title}
              </p>
              <p className="mt-0.5 text-sm text-slate-700">{selectedAnn.detail}</p>
              {(selectedAnn.studentAnswer || selectedAnn.expected) && (
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                  {selectedAnn.studentAnswer && (
                    <span>
                      <strong className="font-medium text-slate-800">
                        Student wrote:
                      </strong>{" "}
                      {selectedAnn.studentAnswer}
                    </span>
                  )}
                  {selectedAnn.expected && (
                    <span>
                      <strong className="font-medium text-slate-800">
                        Expected:
                      </strong>{" "}
                      {selectedAnn.expected}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onSelectAnnotation(null)}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
