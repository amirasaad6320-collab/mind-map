import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FileUp,
  Layers,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  downloadOriginalPagesPdf,
  exportReportToPdf,
} from "../lib/exportUtils";
import { processUploadedFiles } from "../lib/pdfProcessor";
import type {
  GradingMode,
  GradingReport,
  GradingSettings,
  ModelAnswer,
  StudentSubmission,
} from "../types/grading";
import { ConfirmDialog } from "./ConfirmDialog";

interface BatchWorkspaceViewProps {
  modelAnswers: ModelAnswer[];
  selectedModelId: string;
  onSelectModel: (id: string) => void;
  submissions: StudentSubmission[];
  reports: GradingReport[];
  settings: GradingSettings;
  onUpdateSettings: (next: GradingSettings) => Promise<void>;
  onAddSubmissions: (items: StudentSubmission[]) => Promise<void>;
  onUpdateSubmission: (item: StudentSubmission) => Promise<void>;
  onDeleteSubmission: (id: string) => Promise<void>;
  onLoadSampleDataset: () => Promise<void>;
  onLoadDrSafwatChp3: () => Promise<void>;
  onGradeSingle: (submission: StudentSubmission) => Promise<void>;
  onStartBatch: (onlyFailed?: boolean) => void;
  onPauseBatch: () => void;
  onResumeBatch: () => void;
  batchState: {
    isRunning: boolean;
    isPaused: boolean;
    currentSubmissionId: string | null;
    completedCount: number;
    totalCount: number;
  };
  onOpenReport: (submissionId: string) => void;
  onNotify: (type: "success" | "error" | "info", message: string) => void;
}

export function BatchWorkspaceView({
  modelAnswers,
  selectedModelId,
  onSelectModel,
  submissions,
  reports,
  settings,
  onUpdateSettings,
  onAddSubmissions,
  onUpdateSubmission,
  onDeleteSubmission,
  onLoadSampleDataset,
  onLoadDrSafwatChp3,
  onGradeSingle,
  onStartBatch,
  onPauseBatch,
  onResumeBatch,
  batchState,
  onOpenReport,
  onNotify,
}: BatchWorkspaceViewProps) {
  const bulkInputRef = useRef<HTMLInputElement | null>(null);
  const singleStudentInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [processingMsg, setProcessingMsg] = useState<string | null>(null);
  const [singleName, setSingleName] = useState("");
  const [singleId, setSingleId] = useState("");
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [previewSubmission, setPreviewSubmission] =
    useState<StudentSubmission | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudentSubmission | null>(
    null
  );
  const [elapsedSec, setElapsedSec] = useState(0);

  const anyGrading =
    batchState.isRunning || submissions.some((s) => s.status === "grading");

  useEffect(() => {
    if (!anyGrading) {
      setElapsedSec(0);
      return;
    }
    setElapsedSec(0);
    const id = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [anyGrading, batchState.currentSubmissionId]);

  const activeModel =
    modelAnswers.find((m) => m.id === selectedModelId) ?? modelAnswers[0] ?? null;

  const handleBulkUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!activeModel) {
      onNotify(
        "error",
        "Please upload or select an official Model Answer first."
      );
      return;
    }

    try {
      const created: StudentSubmission[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProcessingMsg(
          `Processing ${file.name} (${i + 1} of ${files.length})...`
        );
        const pages = await processUploadedFiles([file], (m) =>
          setProcessingMsg(m)
        );
        const cleanName = file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim();
        created.push({
          id: `sub_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          studentName: cleanName || `Student ${submissions.length + i + 1}`,
          studentId: "",
          modelAnswerId: activeModel.id,
          pages,
          status: "pending",
          createdAt: new Date().toISOString(),
        });
      }

      await onAddSubmissions(created);
      onNotify("success", `Added ${created.length} student submission(s) to queue.`);
    } catch (err: unknown) {
      onNotify(
        "error",
        err instanceof Error ? err.message : "Failed to process student files."
      );
    } finally {
      setProcessingMsg(null);
      if (bulkInputRef.current) bulkInputRef.current.value = "";
    }
  };

  const handleSingleStudentMultiPageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!activeModel) {
      onNotify(
        "error",
        "Please upload or select an official Model Answer first."
      );
      return;
    }

    try {
      setProcessingMsg("Combining pages into single student submission...");
      const pages = await processUploadedFiles(Array.from(files), (m) =>
        setProcessingMsg(m)
      );
      const fallbackName = files[0].name
        .replace(/\.[^.]+$/, "")
        .replace(/[_-]+/g, " ")
        .trim();

      const item: StudentSubmission = {
        id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        studentName: singleName.trim() || fallbackName || "Student Submission",
        studentId: singleId.trim(),
        modelAnswerId: activeModel.id,
        pages,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await onAddSubmissions([item]);
      setSingleName("");
      setSingleId("");
      onNotify(
        "success",
        `Added "${item.studentName}" with ${pages.length} page(s).`
      );
    } catch (err: unknown) {
      onNotify(
        "error",
        err instanceof Error ? err.message : "Failed to process student pages."
      );
    } finally {
      setProcessingMsg(null);
      if (singleStudentInputRef.current) singleStudentInputRef.current.value = "";
    }
  };

  const handleReplaceFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !replaceTargetId) return;
    const target = submissions.find((s) => s.id === replaceTargetId);
    if (!target) return;

    try {
      setProcessingMsg("Replacing submission pages...");
      const pages = await processUploadedFiles(Array.from(files), (m) =>
        setProcessingMsg(m)
      );
      await onUpdateSubmission({
        ...target,
        pages,
        status: "pending",
        errorMessage: undefined,
      });
      onNotify("success", `Replaced pages for "${target.studentName}".`);
    } catch (err: unknown) {
      onNotify(
        "error",
        err instanceof Error ? err.message : "Failed to replace pages."
      );
    } finally {
      setProcessingMsg(null);
      setReplaceTargetId(null);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  };

  const pendingCount = submissions.filter((s) => s.status === "pending").length;
  const failedCount = submissions.filter((s) => s.status === "failed").length;
  const gradedCount = submissions.filter((s) => s.status === "graded").length;

  const progressPct =
    batchState.totalCount > 0
      ? Math.round((batchState.completedCount / batchState.totalCount) * 100)
      : 0;

  const currentBatchStudent = batchState.currentSubmissionId
    ? submissions.find((s) => s.id === batchState.currentSubmissionId)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Student Submissions & Batch Grading
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Upload handwritten sheets, configure rubric strictness, and grade sequentially.
          </p>
        </div>

        {modelAnswers.length === 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onLoadDrSafwatChp3}
              className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Layers className="h-4 w-4 text-blue-700" />
              <span>Load Dr. Safwat Ch.3 + Student 1</span>
            </button>
            <button
              type="button"
              onClick={onLoadSampleDataset}
              className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Layers className="h-4 w-4 text-blue-700" />
              <span>Load Sample Biology Set</span>
            </button>
          </div>
        )}
      </div>

      {/* Top Configuration Grid: Grading Settings + Upload Zone */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Grading Settings Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
          <h3 className="text-base font-semibold text-slate-900">
            Grading Settings
          </h3>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Reference Model Answer
              </label>
              <select
                value={activeModel?.id ?? ""}
                onChange={(e) => onSelectModel(e.target.value)}
                disabled={modelAnswers.length === 0}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-50"
              >
                {modelAnswers.length === 0 ? (
                  <option value="">No model answers saved yet</option>
                ) : (
                  modelAnswers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.chapterName} ({m.pages.length}p)
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Grading Mode
              </label>
              <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                {(["lenient", "standard", "strict"] as GradingMode[]).map(
                  (mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdateSettings({ ...settings, mode })}
                      className={`min-h-[34px] whitespace-nowrap shrink-0 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                        settings.mode === mode
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {mode}
                    </button>
                  )
                )}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                {settings.mode === "lenient" &&
                  "Focuses on scientific meaning & understanding; ignores minor spelling and wording differences."}
                {settings.mode === "standard" &&
                  "Balances scientific accuracy, completeness of key branches, and logical organization."}
                {settings.mode === "strict" &&
                  "Checks closely against the marking scheme for required terminology and specific sub-details."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Total Marks
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={settings.maximumMarks}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      maximumMarks: Math.max(1, Number(e.target.value) || 20),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Batch Delay (ms)
                </label>
                <input
                  type="number"
                  min={500}
                  max={10000}
                  step={500}
                  value={settings.rateLimitDelayMs}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      rateLimitDelayMs: Math.max(
                        500,
                        Number(e.target.value) || 1500
                      ),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Custom Grading Criteria (optional)
              </label>
              <textarea
                rows={2}
                value={settings.customCriteria}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    customCriteria: e.target.value,
                  })
                }
                placeholder="e.g., Deduct 2 marks if chemical equation is unbalanced."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Upload Zone Card */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Upload Student Mind Maps
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Supports PDF (including multi-page), PNG, JPG, and JPEG.
            </p>

            {/* Bulk Drag & Drop */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleBulkUpload(e.dataTransfer.files);
              }}
              onClick={() => bulkInputRef.current?.click()}
              className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                isDragging
                  ? "border-blue-600 bg-blue-50/60"
                  : "border-slate-300 bg-slate-50/70 hover:border-blue-400"
              }`}
            >
              <FileUp className="h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-800">
                {processingMsg
                  ? processingMsg
                  : "Bulk Drop: Each file creates one student submission"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                File names automatically prefill student names (editable below)
              </p>
              <input
                ref={bulkInputRef}
                type="file"
                multiple
                accept=".pdf,image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={(e) => handleBulkUpload(e.target.files)}
              />
            </div>
          </div>

          {/* Single Multi-Page Student Entry */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-700">
              Or add one student with multiple photo pages combined:
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                placeholder="Student Name"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
              <input
                type="text"
                value={singleId}
                onChange={(e) => setSingleId(e.target.value)}
                placeholder="Student ID (optional)"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none sm:w-40"
              />
              <input
                ref={singleStudentInputRef}
                type="file"
                multiple
                accept=".pdf,image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={(e) =>
                  handleSingleStudentMultiPageUpload(e.target.files)
                }
              />
              <button
                type="button"
                disabled={Boolean(processingMsg)}
                onClick={() => singleStudentInputRef.current?.click()}
                className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4 text-blue-700" />
                <span>Add Pages</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Batch Control Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">
                Submission Queue
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{submissions.length} total</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums text-amber-700">
                {pendingCount} pending
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums text-emerald-700">
                {gradedCount} graded
              </span>
              {failedCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums text-red-700">
                    {failedCount} failed
                  </span>
                </>
              )}
            </div>
            {batchState.isRunning && currentBatchStudent && (
              <p className="mt-1 text-xs text-blue-700">
                {batchState.isPaused
                  ? `Paused — next up: ${currentBatchStudent.studentName}`
                  : `Currently grading: ${currentBatchStudent.studentName}...`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {failedCount > 0 && !batchState.isRunning && (
              <button
                type="button"
                onClick={() => onStartBatch(true)}
                className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Retry Failed ({failedCount})</span>
              </button>
            )}

            {batchState.isRunning ? (
              batchState.isPaused ? (
                <button
                  type="button"
                  onClick={onResumeBatch}
                  className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
                >
                  <Play className="h-4 w-4" />
                  <span>Resume Batch</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onPauseBatch}
                  className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                >
                  <Pause className="h-4 w-4" />
                  <span>Pause Batch</span>
                </button>
              )
            ) : (
              <button
                type="button"
                disabled={pendingCount === 0 || !activeModel}
                onClick={() => onStartBatch(false)}
                className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg bg-blue-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                <span>Grade Pending ({pendingCount})</span>
              </button>
            )}
          </div>
        </div>

        {(batchState.isRunning || batchState.totalCount > 0) && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Batch Progress</span>
              <span className="font-mono tabular-nums">
                {batchState.completedCount} / {batchState.totalCount} ({progressPct}
                %)
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-blue-700 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Submissions List */}
      <input
        ref={replaceInputRef}
        type="file"
        multiple
        accept=".pdf,image/png,image/jpeg,image/jpg"
        className="hidden"
        onChange={(e) => handleReplaceFiles(e.target.files)}
      />

      {submissions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-800">
            No student submissions queued yet
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Drop student PDFs or photos above, or load the sample Biology set to test grading.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {submissions.map((sub) => {
            const report = reports.find((r) => r.submissionId === sub.id);
            const targetModel = modelAnswers.find(
              (m) => m.id === sub.modelAnswerId
            );
            const isCurrentlyGrading =
              sub.status === "grading" ||
              batchState.currentSubmissionId === sub.id;

            return (
              <div
                key={sub.id}
                className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-3.5">
                  {sub.pages[0] && (
                    <button
                      type="button"
                      onClick={() => setPreviewSubmission(sub)}
                      className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition-opacity hover:opacity-85"
                      title="Preview uploaded sheet"
                    >
                      <img
                        src={sub.pages[0].dataUrl}
                        alt={sub.studentName}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={sub.studentName}
                        onChange={(e) =>
                          onUpdateSubmission({
                            ...sub,
                            studentName: e.target.value,
                          })
                        }
                        aria-label="Student name"
                        className="w-48 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-slate-900 hover:border-slate-200 focus:border-blue-500 focus:bg-white focus:outline-none"
                      />
                      <input
                        type="text"
                        value={sub.studentId}
                        placeholder="Add ID"
                        onChange={(e) =>
                          onUpdateSubmission({
                            ...sub,
                            studentId: e.target.value,
                          })
                        }
                        aria-label="Student ID"
                        className="w-28 rounded border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-xs text-slate-600 hover:border-slate-200 focus:border-blue-500 focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>
                        {targetModel?.chapterName ?? "Unassigned Chapter"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {sub.pages.length} page{sub.pages.length > 1 ? "s" : ""}
                      </span>
                      <span aria-hidden="true">·</span>
                      {sub.status === "graded" && report ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span className="font-mono tabular-nums">
                            Graded:{" "}
                            {report.teacher_adjusted_marks ?? report.total_marks} /{" "}
                            {report.maximum_marks}
                          </span>
                        </span>
                      ) : isCurrentlyGrading ? (
                        <span className="inline-flex items-center gap-1 font-medium text-blue-700">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span className="tabular-nums">
                            Analyzing ({elapsedSec}s)...
                          </span>
                        </span>
                      ) : sub.status === "failed" ? (
                        <span className="inline-flex items-center gap-1 font-medium text-red-700">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span>Failed: {sub.errorMessage || "Error"}</span>
                        </span>
                      ) : (
                        <span className="text-slate-600">Pending grading</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewSubmission(sub)}
                    className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Preview</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const safeName = sub.studentName
                        .replace(/[^a-z0-9_-]/gi, "_")
                        .toLowerCase();
                      downloadOriginalPagesPdf(
                        sub.pages,
                        `${sub.studentName} — Uploaded Mind Map`,
                        `original_${safeName}.pdf`
                      );
                      onNotify("success", `Downloaded original PDF for "${sub.studentName}".`);
                    }}
                    className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    title="Download uploaded mind map PDF"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Original PDF</span>
                  </button>

                  {report ? (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          await exportReportToPdf(report, sub);
                          onNotify("success", `Downloaded graded PDF for "${sub.studentName}".`);
                        }}
                        className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        title="Download graded annotated PDF"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Graded PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenReport(sub.id)}
                        className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800"
                      >
                        <span>View Report</span>
                      </button>
                      <button
                        type="button"
                        disabled={batchState.isRunning || isCurrentlyGrading}
                        onClick={() => onGradeSingle(sub)}
                        className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        title="Re-grade this submission"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>Re-grade</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        batchState.isRunning ||
                        isCurrentlyGrading ||
                        !activeModel
                      }
                      onClick={() => onGradeSingle(sub)}
                      className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>{sub.status === "failed" ? "Retry" : "Grade"}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isCurrentlyGrading}
                    onClick={() => {
                      setReplaceTargetId(sub.id);
                      replaceInputRef.current?.click();
                    }}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40"
                    title="Replace uploaded pages"
                    aria-label={`Replace pages for ${sub.studentName}`}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    disabled={isCurrentlyGrading}
                    onClick={() => setDeleteTarget(sub)}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    title="Delete submission"
                    aria-label={`Delete ${sub.studentName}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {previewSubmission && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {previewSubmission.studentName}
                </h3>
                <p className="text-xs text-slate-500">
                  {previewSubmission.pages.length} page(s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewSubmission(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-100 p-4">
              {previewSubmission.pages.map((pg) => (
                <div
                  key={pg.id}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white p-2"
                >
                  <p className="mb-2 px-1 font-mono text-xs text-slate-500">
                    Page {pg.pageNumber}
                  </p>
                  <img
                    src={pg.dataUrl}
                    alt={`${previewSubmission.studentName} page ${pg.pageNumber}`}
                    referrerPolicy="no-referrer"
                    className="mx-auto max-h-[600px] w-auto object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Student Submission"
        description={`Remove "${deleteTarget?.studentName}" and its grading report? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await onDeleteSubmission(deleteTarget.id);
            onNotify("info", `Removed "${deleteTarget.studentName}".`);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
