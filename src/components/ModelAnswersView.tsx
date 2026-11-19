import { useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileUp,
  Layers,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { downloadOriginalPagesPdf } from "../lib/exportUtils";
import { processUploadedFiles } from "../lib/pdfProcessor";
import type { ModelAnswer, PageImage } from "../types/grading";
import { ConfirmDialog } from "./ConfirmDialog";

interface ModelAnswersViewProps {
  modelAnswers: ModelAnswer[];
  selectedModelId: string;
  onSelectModel: (id: string) => void;
  onSaveModelAnswer: (model: ModelAnswer) => Promise<void>;
  onDeleteModelAnswer: (id: string) => Promise<void>;
  onLoadSampleDataset: () => Promise<void>;
  onLoadDrSafwatChp3: () => Promise<void>;
  onNotify: (type: "success" | "error" | "info", message: string) => void;
}

export function ModelAnswersView({
  modelAnswers,
  selectedModelId,
  onSelectModel,
  onSaveModelAnswer,
  onDeleteModelAnswer,
  onLoadSampleDataset,
  onLoadDrSafwatChp3,
  onNotify,
}: ModelAnswersViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [processingMsg, setProcessingMsg] = useState<string | null>(null);

  // New / Edit Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [chapterName, setChapterName] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [draftPages, setDraftPages] = useState<PageImage[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Preview state
  const [previewPageIdx, setPreviewPageIdx] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ModelAnswer | null>(null);

  const activeModel =
    modelAnswers.find((m) => m.id === selectedModelId) ?? modelAnswers[0] ?? null;

  const handleFilesSelected = async (files: FileList | null, isReplace = false) => {
    if (!files || files.length === 0) return;
    try {
      setProcessingMsg("Preparing pages...");
      const pages = await processUploadedFiles(Array.from(files), (msg) =>
        setProcessingMsg(msg)
      );

      if (isReplace && activeModel) {
        const updated: ModelAnswer = {
          ...activeModel,
          pages,
          updatedAt: new Date().toISOString(),
        };
        await onSaveModelAnswer(updated);
        setPreviewPageIdx(0);
        onNotify(
          "success",
          `Replaced "${activeModel.chapterName}" with ${pages.length} page(s).`
        );
      } else {
        setDraftPages(pages);
        if (!chapterName.trim() && files[0]) {
          const baseName = files[0].name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
          setChapterName(baseName);
        }
        setShowCreateForm(true);
        onNotify("info", `Loaded ${pages.length} page(s). Add chapter details and save.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process uploaded file.";
      onNotify("error", msg);
    } finally {
      setProcessingMsg(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chapterName.trim()) {
      onNotify("error", "Please enter a chapter or topic name.");
      return;
    }
    if (draftPages.length === 0) {
      onNotify("error", "Please upload at least one PDF or image page.");
      return;
    }

    const now = new Date().toISOString();
    const existing = editingId
      ? modelAnswers.find((m) => m.id === editingId)
      : undefined;

    const record: ModelAnswer = {
      id: existing ? existing.id : `model_${Date.now()}`,
      chapterName: chapterName.trim(),
      subject: subject.trim() || "General",
      notes: notes.trim(),
      pages: draftPages,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    await onSaveModelAnswer(record);
    onSelectModel(record.id);
    setShowCreateForm(false);
    setEditingId(null);
    setChapterName("");
    setSubject("");
    setNotes("");
    setDraftPages([]);
    setPreviewPageIdx(0);
    onNotify(
      "success",
      existing
        ? `Updated model answer "${record.chapterName}".`
        : `Saved model answer "${record.chapterName}".`
    );
  };

  const startEditing = (model: ModelAnswer) => {
    setEditingId(model.id);
    setChapterName(model.chapterName);
    setSubject(model.subject);
    setNotes(model.notes);
    setDraftPages(model.pages);
    setShowCreateForm(true);
  };

  const cancelForm = () => {
    setShowCreateForm(false);
    setEditingId(null);
    setChapterName("");
    setSubject("");
    setNotes("");
    setDraftPages([]);
  };

  const safePreviewIdx = activeModel
    ? Math.min(previewPageIdx, Math.max(0, activeModel.pages.length - 1))
    : 0;

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Official Model Answers
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Upload reference mind maps by chapter. Saved persistently in your browser.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onLoadDrSafwatChp3}
            className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <BookOpen className="h-4 w-4 text-blue-700" />
            <span>Load Dr. Safwat Ch.3 + Student 1</span>
          </button>
          <button
            type="button"
            onClick={onLoadSampleDataset}
            className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Layers className="h-4 w-4 text-blue-700" />
            <span>Load Sample Biology Set</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setChapterName("");
              setSubject("");
              setNotes("");
              setDraftPages([]);
              setShowCreateForm(true);
            }}
            className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            <span>New Model Answer</span>
          </button>
        </div>
      </div>

      {/* Create / Edit Modal-like Inline Panel */}
      {showCreateForm && (
        <form
          onSubmit={handleSaveForm}
          className="rounded-xl border border-slate-200 bg-white p-6"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h3 className="text-base font-semibold text-slate-900">
              {editingId ? "Edit Model Answer Template" : "Add Official Model Answer"}
            </h3>
            <button
              type="button"
              onClick={cancelForm}
              className="text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Chapter / Topic Name
                </label>
                <input
                  type="text"
                  required
                  value={chapterName}
                  onChange={(e) => setChapterName(e.target.value)}
                  placeholder="e.g., Chapter 4: Photosynthesis Overview"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Subject / Course
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g., Biology — Grade 10"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Marking Notes & Mandatory Keywords (optional)
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Highlight any required formulas, terminology, or key connections the AI should pay close attention to..."
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Reference Pages (PDF, PNG, JPG, JPEG)
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFilesSelected(e.dataTransfer.files, false);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                  isDragging
                    ? "border-blue-600 bg-blue-50/50"
                    : "border-slate-300 bg-slate-50/60 hover:border-blue-400"
                }`}
              >
                <FileUp className="h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-700">
                  {processingMsg
                    ? processingMsg
                    : "Drop model answer PDF or images here, or click to browse"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Multi-page PDFs are automatically converted to crisp pages
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files, false)}
                />
              </div>

              {draftPages.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-600">
                    {draftPages.length} page(s) ready
                  </p>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {draftPages.map((pg) => (
                      <div
                        key={pg.id}
                        className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
                      >
                        <img
                          src={pg.dataUrl}
                          alt={`Model page ${pg.pageNumber}`}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-contain"
                        />
                        <span className="absolute bottom-1 right-1 rounded bg-slate-900/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
                          P{pg.pageNumber}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={cancelForm}
              className="min-h-[40px] whitespace-nowrap shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={Boolean(processingMsg)}
              className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg bg-blue-700 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              <span>{editingId ? "Update Model Answer" : "Save Model Answer"}</span>
            </button>
          </div>
        </form>
      )}

      {/* Main Split: Saved Templates List + Active Preview */}
      {modelAnswers.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFilesSelected(e.dataTransfer.files, false);
          }}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white px-6 py-16 text-center ${
            isDragging ? "border-blue-600 bg-blue-50/40" : "border-slate-200"
          }`}
        >
          <BookOpen className="h-10 w-10 text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900">
            No Model Answers Saved Yet
          </h3>
          <p className="mt-1 max-w-md text-sm text-slate-600">
            Upload your first official mind map (PDF or image) to start grading student
            sheets, or load the built-in Biology sample set to test the AI immediately.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              <Plus className="h-4 w-4" />
              <span>Upload Model Answer</span>
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
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Template Library */}
          <div className="space-y-3 lg:col-span-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Saved Chapters ({modelAnswers.length})
            </h3>
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {modelAnswers.map((model) => {
                const isSelected = activeModel?.id === model.id;
                return (
                  <div
                    key={model.id}
                    className={`p-4 transition-colors ${
                      isSelected ? "bg-blue-50/60" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectModel(model.id);
                          setPreviewPageIdx(0);
                        }}
                        className="flex-1 text-left focus-visible:outline-2 focus-visible:outline-blue-600"
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {model.chapterName}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{model.subject}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {model.pages.length} page{model.pages.length > 1 ? "s" : ""}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {new Date(model.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEditing(model)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Edit model answer"
                          aria-label={`Edit ${model.chapterName}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(model)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete model answer"
                          aria-label={`Delete ${model.chapterName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Model Preview */}
          {activeModel && (
            <div className="rounded-xl border border-slate-200 bg-white lg:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {activeModel.chapterName}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {activeModel.subject} · Updated{" "}
                    {new Date(activeModel.updatedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const safeName = activeModel.chapterName
                        .replace(/[^a-z0-9_-]/gi, "_")
                        .toLowerCase();
                      downloadOriginalPagesPdf(
                        activeModel.pages,
                        activeModel.chapterName,
                        `model_answer_${safeName}.pdf`
                      );
                      onNotify("success", "Downloaded Model Answer PDF.");
                    }}
                    className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download PDF</span>
                  </button>
                  <input
                    ref={replaceInputRef}
                    type="file"
                    multiple
                    accept=".pdf,image/png,image/jpeg,image/jpg"
                    className="hidden"
                    onChange={(e) => handleFilesSelected(e.target.files, true)}
                  />
                  <button
                    type="button"
                    onClick={() => replaceInputRef.current?.click()}
                    disabled={Boolean(processingMsg)}
                    className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Replace File</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditing(activeModel)}
                    className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit Details</span>
                  </button>
                </div>
              </div>

              {activeModel.notes && (
                <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-xs leading-relaxed text-slate-700">
                  <strong className="font-semibold text-slate-900">
                    Rubric Notes:
                  </strong>{" "}
                  {activeModel.notes}
                </div>
              )}

              <div className="p-4">
                {activeModel.pages[safePreviewIdx] && (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <img
                      src={activeModel.pages[safePreviewIdx].dataUrl}
                      alt={`${activeModel.chapterName} page ${safePreviewIdx + 1}`}
                      referrerPolicy="no-referrer"
                      className="mx-auto max-h-[540px] w-auto object-contain"
                    />
                  </div>
                )}

                {activeModel.pages.length > 1 && (
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewPageIdx((p) => Math.max(0, p - 1))
                      }
                      disabled={safePreviewIdx === 0}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      <span>Previous</span>
                    </button>
                    <span className="font-mono text-xs text-slate-600 tabular-nums">
                      Page {safePreviewIdx + 1} of {activeModel.pages.length}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewPageIdx((p) =>
                          Math.min(activeModel.pages.length - 1, p + 1)
                        )
                      }
                      disabled={safePreviewIdx === activeModel.pages.length - 1}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <span>Next</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Model Answer"
        description={`Are you sure you want to delete "${deleteTarget?.chapterName}"? Existing grading reports will remain in the ledger, but new grading for this chapter will require uploading a model answer.`}
        confirmLabel="Delete Template"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await onDeleteModelAnswer(deleteTarget.id);
            onNotify("info", `Deleted "${deleteTarget.chapterName}".`);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
