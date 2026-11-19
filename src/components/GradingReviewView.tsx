import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileImage,
  FileText,
  HelpCircle,
  KeyRound,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  buildWhatsAppMessage,
  downloadAnnotatedSheetsPdf,
  downloadOriginalPagesPdf,
  exportReportToPdf,
  extractVisualAnnotations,
  getEffectiveScore,
} from "../lib/exportUtils";
import type {
  GradingReport,
  ModelAnswer,
  StudentSubmission,
  VisualAnnotation,
} from "../types/grading";
import { VisualAnnotationCanvas } from "./VisualAnnotationCanvas";

interface GradingReviewViewProps {
  reports: GradingReport[];
  submissions: StudentSubmission[];
  modelAnswers: ModelAnswer[];
  activeReportId: string | null;
  defaultLanguage: "en" | "ar";
  onSelectReport: (reportId: string) => void;
  onSaveReport: (report: GradingReport) => Promise<void>;
  onGoToWorkspace: () => void;
  onNotify: (type: "success" | "error" | "info", message: string) => void;
}

export function GradingReviewView({
  reports,
  submissions,
  modelAnswers,
  activeReportId,
  defaultLanguage,
  onSelectReport,
  onSaveReport,
  onGoToWorkspace,
  onNotify,
}: GradingReviewViewProps) {
  const report =
    reports.find((r) => r.id === activeReportId) ?? reports[0] ?? null;

  const submission = report
    ? submissions.find((s) => s.id === report.submissionId)
    : undefined;
  const modelAnswer = report
    ? modelAnswers.find((m) => m.id === report.modelAnswerId)
    : undefined;

  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [waLang, setWaLang] = useState<"en" | "ar">(defaultLanguage);
  const [waText, setWaText] = useState("");
  const [scoreInput, setScoreInput] = useState<string>("");
  const [teacherNotes, setTeacherNotes] = useState<string>("");
  const [showModelComparison, setShowModelComparison] = useState(false);

  const annotations = useMemo(
    () => (report ? extractVisualAnnotations(report) : []),
    [report]
  );

  useEffect(() => {
    if (!report) return;
    const eff = getEffectiveScore(report);
    setScoreInput(String(eff.marks));
    setTeacherNotes(report.teacher_notes || "");
    const existingDraft =
      waLang === "ar" ? report.whatsapp_draft_ar : report.whatsapp_draft_en;
    setWaText(existingDraft || buildWhatsAppMessage(report, waLang));
    setSelectedAnnotationId(null);
  }, [report?.id]);

  useEffect(() => {
    if (!report) return;
    const existingDraft =
      waLang === "ar" ? report.whatsapp_draft_ar : report.whatsapp_draft_en;
    setWaText(existingDraft || buildWhatsAppMessage(report, waLang));
  }, [waLang, report?.id]);

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
        <FileText className="h-10 w-10 text-slate-400" />
        <h3 className="mt-3 text-base font-semibold text-slate-900">
          No Grading Reports Available Yet
        </h3>
        <p className="mt-1 max-w-md text-sm text-slate-600">
          Grade one or more student submissions in the Workspace to inspect visual
          annotations, override AI marks, and generate WhatsApp feedback.
        </p>
        <button
          type="button"
          onClick={onGoToWorkspace}
          className="mt-5 min-h-[40px] whitespace-nowrap shrink-0 rounded-lg bg-blue-700 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Go to Submissions Workspace
        </button>
      </div>
    );
  }

  const eff = getEffectiveScore(report);

  const handleSaveOverrides = async (approve = report.is_teacher_approved) => {
    const parsedScore = Math.max(
      0,
      Math.min(
        report.maximum_marks,
        Math.round((Number(scoreInput) || 0) * 100) / 100
      )
    );
    const updatedPct =
      Math.round((parsedScore / Math.max(1, report.maximum_marks)) * 1000) / 10;

    const updated: GradingReport = {
      ...report,
      teacher_adjusted_marks: parsedScore,
      percentage: updatedPct,
      teacher_notes: teacherNotes,
      is_teacher_approved: approve,
      whatsapp_draft_en:
        waLang === "en" ? waText : report.whatsapp_draft_en,
      whatsapp_draft_ar:
        waLang === "ar" ? waText : report.whatsapp_draft_ar,
    };
    await onSaveReport(updated);
    onNotify(
      "success",
      approve
        ? `Saved & approved assessment for ${report.student_name}.`
        : `Saved teacher adjustments for ${report.student_name}.`
    );
  };

  const toggleOverrideIncorrect = async (idx: number) => {
    const target = report.incorrect_concepts[idx];
    if (!target) return;
    const nextOverridden = !target.overridden;
    const nextIncorrect = report.incorrect_concepts.map((item, i) =>
      i === idx ? { ...item, overridden: nextOverridden } : item
    );

    const delta = nextOverridden ? target.marks_deducted : -target.marks_deducted;
    const currentEffective = Number(scoreInput) || eff.marks;
    const nextScore = Math.max(
      0,
      Math.min(
        report.maximum_marks,
        Math.round((currentEffective + delta) * 100) / 100
      )
    );
    setScoreInput(String(nextScore));

    const updated: GradingReport = {
      ...report,
      incorrect_concepts: nextIncorrect,
      teacher_adjusted_marks: nextScore,
      percentage:
        Math.round((nextScore / Math.max(1, report.maximum_marks)) * 1000) / 10,
    };
    await onSaveReport(updated);
    onNotify(
      "info",
      nextOverridden
        ? `Waived deduction (-${target.marks_deducted}) for "${target.concept}".`
        : `Restored deduction (-${target.marks_deducted}) for "${target.concept}".`
    );
  };

  const toggleOverrideIncomplete = async (idx: number) => {
    const target = report.incomplete_concepts[idx];
    if (!target) return;
    const nextOverridden = !target.overridden;
    const nextList = report.incomplete_concepts.map((item, i) =>
      i === idx ? { ...item, overridden: nextOverridden } : item
    );

    const delta = nextOverridden ? target.marks_deducted : -target.marks_deducted;
    const currentEffective = Number(scoreInput) || eff.marks;
    const nextScore = Math.max(
      0,
      Math.min(
        report.maximum_marks,
        Math.round((currentEffective + delta) * 100) / 100
      )
    );
    setScoreInput(String(nextScore));

    const updated: GradingReport = {
      ...report,
      incomplete_concepts: nextList,
      teacher_adjusted_marks: nextScore,
      percentage:
        Math.round((nextScore / Math.max(1, report.maximum_marks)) * 1000) / 10,
    };
    await onSaveReport(updated);
    onNotify(
      "info",
      nextOverridden
        ? `Waived deduction (-${target.marks_deducted}) for "${target.concept}".`
        : `Restored deduction for "${target.concept}".`
    );
  };

  const toggleOverrideMissing = async (idx: number) => {
    const target = report.missing_concepts[idx];
    if (!target) return;
    const nextOverridden = !target.overridden;
    const nextList = report.missing_concepts.map((item, i) =>
      i === idx ? { ...item, overridden: nextOverridden } : item
    );

    const delta = nextOverridden ? target.marks_deducted : -target.marks_deducted;
    const currentEffective = Number(scoreInput) || eff.marks;
    const nextScore = Math.max(
      0,
      Math.min(
        report.maximum_marks,
        Math.round((currentEffective + delta) * 100) / 100
      )
    );
    setScoreInput(String(nextScore));

    const updated: GradingReport = {
      ...report,
      missing_concepts: nextList,
      teacher_adjusted_marks: nextScore,
      percentage:
        Math.round((nextScore / Math.max(1, report.maximum_marks)) * 1000) / 10,
    };
    await onSaveReport(updated);
  };

  const handleCopyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(waText);
      onNotify("success", "WhatsApp feedback copied to clipboard.");
    } catch {
      onNotify(
        "error",
        "Clipboard access blocked. Please select and copy the text manually."
      );
    }
  };

  const handleRegenerateWhatsApp = () => {
    const draft = buildWhatsAppMessage(
      {
        ...report,
        teacher_adjusted_marks: Number(scoreInput) || eff.marks,
      },
      waLang
    );
    setWaText(draft);
    onNotify("info", "Regenerated feedback using latest score and overrides.");
  };

  const handleAnnotationClickFromList = (id: string) => {
    const found = annotations.find((a) => a.id === id);
    if (found) {
      setSelectedAnnotationId(found.id);
    } else {
      onNotify(
        "info",
        "No exact bounding box was assigned for this item; refer to the written breakdown."
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Student Selector & Export */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="sr-only" htmlFor="report-student-select">
              Select Graded Student
            </label>
            <select
              id="report-student-select"
              value={report.id}
              onChange={(e) => onSelectReport(e.target.value)}
              className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              {reports.map((r) => {
                const s = getEffectiveScore(r);
                return (
                  <option key={r.id} value={r.id}>
                    {r.student_name} — {s.marks}/{s.max} ({s.percentage}%)
                  </option>
                );
              })}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{report.chapterName}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{report.gradingMode} mode</span>
            <span aria-hidden="true">·</span>
            <span>{new Date(report.gradedAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {modelAnswer && (
            <button
              type="button"
              onClick={() => setShowModelComparison((v) => !v)}
              className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <span>
                {showModelComparison ? "Hide Model Answer" : "Compare Model Answer"}
              </span>
            </button>
          )}
          {submission && submission.pages.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  const safeName = report.student_name
                    .replace(/[^a-z0-9_-]/gi, "_")
                    .toLowerCase();
                  downloadOriginalPagesPdf(
                    submission.pages,
                    `${report.student_name} — Uploaded Mind Map`,
                    `original_${safeName}.pdf`
                  );
                  onNotify("success", "Downloaded original uploaded mind map PDF.");
                }}
                className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Original PDF</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await downloadAnnotatedSheetsPdf(report, submission);
                  onNotify(
                    "success",
                    `Downloaded ${submission.pages.length}-page graded sheets PDF.`
                  );
                }}
                className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <FileImage className="h-3.5 w-3.5" />
                <span>Download Graded Sheets (PDF)</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={async () => {
              await exportReportToPdf(report, submission);
              onNotify("success", "Downloaded graded PDF report with annotated sheets.");
            }}
            className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download Graded PDF</span>
          </button>
          <button
            type="button"
            onClick={() => handleSaveOverrides(true)}
            className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>
              {report.is_teacher_approved
                ? "Update Approved Grade"
                : "Approve Final Grade"}
            </span>
          </button>
        </div>
      </div>

      {/* Human Review Warning */}
      {(report.requires_human_review || report.uncertain_readings.length > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="text-sm text-amber-950">
            <p className="font-semibold">Human Review Recommended</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-900">
              {report.uncertain_readings.length > 0
                ? `${report.uncertain_readings.length} handwritten section(s) had low legibility and were flagged instead of guessed. Inspect the blue dashed boxes and adjust marks if needed.`
                : "The AI flagged this submission for teacher verification before finalizing."}
            </p>
          </div>
        </div>
      )}

      {/* Optional Reference Model Answer Comparison Strip */}
      {showModelComparison && modelAnswer && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Reference Model Answer: {modelAnswer.chapterName}
            </h3>
            <button
              type="button"
              onClick={() => setShowModelComparison(false)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Close
            </button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {modelAnswer.pages.map((pg) => (
              <img
                key={pg.id}
                src={pg.dataUrl}
                alt={`Model Answer page ${pg.pageNumber}`}
                referrerPolicy="no-referrer"
                className="max-h-72 rounded-lg border border-slate-200 object-contain"
              />
            ))}
          </div>
        </div>
      )}

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <div>
          <p className="text-xs font-medium text-slate-500">Final Score</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {eff.marks} / {eff.max}
          </p>
          {eff.isAdjusted && (
            <p className="mt-0.5 font-mono text-xs text-blue-700 tabular-nums">
              AI original: {report.ai_total_marks}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Percentage</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {eff.percentage}%
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Concept Tallies</p>
          <p className="mt-1.5 text-sm text-slate-800 tabular-nums">
            <span className="font-semibold text-emerald-700">
              {report.correct_concepts.length} correct
            </span>
            {" · "}
            <span className="font-semibold text-red-700">
              {report.incorrect_concepts.length} errors
            </span>
            {" · "}
            <span className="font-semibold text-amber-700">
              {report.missing_concepts.length} missing
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Review Status</p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold">
            {report.is_teacher_approved ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Teacher Approved
              </span>
            ) : (
              <span className="text-slate-700">Awaiting Approval</span>
            )}
          </p>
        </div>
      </div>

      {/* Main 2-Column Assessment Layout */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Interactive Visual Error Canvas */}
        <div className="space-y-4 xl:col-span-7">
          <VisualAnnotationCanvas
            pages={submission?.pages ?? []}
            annotations={annotations}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={(ann: VisualAnnotation | null) =>
              setSelectedAnnotationId(ann ? ann.id : null)
            }
          />

          {/* Teacher Score Override & Notes */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-900">
              Teacher Score Override & Notes
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Final Adjusted Marks (Max {report.maximum_marks})
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={report.maximum_marks}
                  value={scoreInput}
                  onChange={(e) => setScoreInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-semibold text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none"
                />
                <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
                  AI raw score: {report.ai_total_marks} / {report.maximum_marks}
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600">
                  Teacher Notes (included in PDF report)
                </label>
                <textarea
                  rows={2}
                  value={teacherNotes}
                  onChange={(e) => setTeacherNotes(e.target.value)}
                  placeholder="Add rationale for manual mark adjustments or notes for student..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handleSaveOverrides(report.is_teacher_approved)}
                className="min-h-[36px] whitespace-nowrap shrink-0 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Save Score Only
              </button>
              <button
                type="button"
                onClick={() => handleSaveOverrides(true)}
                className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-800"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Save & Mark Approved</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Structured Concept Breakdown + WhatsApp Feedback */}
        <div className="space-y-5 xl:col-span-5">
          {/* Overall Assessment */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-900">
              Overall Assessment
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {report.overall_assessment}
            </p>
          </div>

          {/* Question Key Words Breakdown */}
          {report.question_keywords && report.question_keywords.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-blue-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Question Key Words ({report.question_keywords.length})
                </h3>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {report.question_keywords.map((qk, idx) => (
                  <div key={idx} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-xs font-semibold text-slate-900">
                      {qk.question_topic}
                    </p>
                    {qk.expected_keywords.length > 0 && (
                      <p className="mt-1 text-xs text-slate-700">
                        <strong className="font-medium text-slate-900">
                          Key Words:
                        </strong>{" "}
                        {qk.expected_keywords.join(" · ")}
                      </p>
                    )}
                    {qk.matched_keywords.length > 0 && (
                      <p className="mt-0.5 text-xs text-emerald-700">
                        <strong className="font-medium">Matched:</strong>{" "}
                        {qk.matched_keywords.join(", ")}
                      </p>
                    )}
                    {qk.missing_keywords.length > 0 && (
                      <p className="mt-0.5 text-xs text-red-700">
                        <strong className="font-medium">Missing / Wrong:</strong>{" "}
                        {qk.missing_keywords.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Incorrect Concepts */}
          {report.incorrect_concepts.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Incorrect Concepts ({report.incorrect_concepts.length})
                </h3>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {report.incorrect_concepts.map((item, idx) => (
                  <div key={idx} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleAnnotationClickFromList(`inc_${idx}`)
                        }
                        className="text-left text-sm font-semibold text-slate-900 hover:text-blue-700"
                      >
                        {item.concept}
                      </button>
                      <span
                        className={`shrink-0 font-mono text-xs tabular-nums ${
                          item.overridden
                            ? "text-slate-400 line-through"
                            : "font-semibold text-red-700"
                        }`}
                      >
                        -{item.marks_deducted}
                      </span>
                    </div>
                    {item.key_words && item.key_words.length > 0 && (
                      <p className="mt-1 text-xs text-blue-800">
                        <strong className="font-semibold">Key Words:</strong>{" "}
                        {item.key_words.join(" · ")}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-600">
                      <strong className="text-slate-800">Student wrote:</strong>{" "}
                      {item.student_answer}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      <strong className="text-slate-800">Expected:</strong>{" "}
                      {item.expected_answer}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700">
                      {item.explanation}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleOverrideIncorrect(idx)}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        {item.overridden
                          ? "Restore AI Deduction"
                          : "Override & Accept Answer"}
                      </button>
                      {item.box_2d && (
                        <button
                          type="button"
                          onClick={() =>
                            handleAnnotationClickFromList(`inc_${idx}`)
                          }
                          className="text-xs font-medium text-slate-500 hover:text-slate-800"
                        >
                          Locate on Sheet
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Incomplete Concepts */}
          {report.incomplete_concepts.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Incomplete Concepts ({report.incomplete_concepts.length})
                </h3>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {report.incomplete_concepts.map((item, idx) => (
                  <div key={idx} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleAnnotationClickFromList(`incomp_${idx}`)
                        }
                        className="text-left text-sm font-semibold text-slate-900 hover:text-blue-700"
                      >
                        {item.concept}
                      </button>
                      <span
                        className={`shrink-0 font-mono text-xs tabular-nums ${
                          item.overridden
                            ? "text-slate-400 line-through"
                            : "font-semibold text-amber-700"
                        }`}
                      >
                        -{item.marks_deducted}
                      </span>
                    </div>
                    {item.key_words && item.key_words.length > 0 && (
                      <p className="mt-1 text-xs text-blue-800">
                        <strong className="font-semibold">Key Words:</strong>{" "}
                        {item.key_words.join(" · ")}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-600">
                      <strong className="text-slate-800">Missing detail:</strong>{" "}
                      {item.expected_detail}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-700">
                      {item.explanation}
                    </p>
                    <button
                      type="button"
                      onClick={() => toggleOverrideIncomplete(idx)}
                      className="mt-2 text-xs font-medium text-blue-700 hover:underline"
                    >
                      {item.overridden
                        ? "Restore AI Deduction"
                        : "Override & Grant Full Credit"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing Concepts */}
          {report.missing_concepts.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-900">
                Missing Concepts ({report.missing_concepts.length})
              </h3>
              <div className="mt-3 divide-y divide-slate-100">
                {report.missing_concepts.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {item.concept}
                      </p>
                      {item.key_words && item.key_words.length > 0 && (
                        <p className="mt-0.5 text-xs text-blue-800">
                          <strong className="font-semibold">Key Words:</strong>{" "}
                          {item.key_words.join(" · ")}
                        </p>
                      )}
                      <p className="text-xs text-slate-500">
                        Importance: {item.importance}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleOverrideMissing(idx)}
                        className="mt-1 text-xs font-medium text-blue-700 hover:underline"
                      >
                        {item.overridden
                          ? "Restore Deduction"
                          : "Waive Missing Deduction"}
                      </button>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-xs tabular-nums ${
                        item.overridden
                          ? "text-slate-400 line-through"
                          : "font-semibold text-red-700"
                      }`}
                    >
                      -{item.marks_deducted}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Uncertain Readings */}
          {report.uncertain_readings.length > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-5">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-sky-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Uncertain Handwriting Readings ({report.uncertain_readings.length})
                </h3>
              </div>
              <div className="mt-3 space-y-3">
                {report.uncertain_readings.map((u, idx) => (
                  <div key={idx} className="text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        handleAnnotationClickFromList(`unc_${idx}`)
                      }
                      className="font-semibold text-slate-900 hover:text-blue-700"
                    >
                      {u.location_description}
                    </button>
                    <p className="mt-0.5 text-slate-700">
                      Reading: {u.tentative_reading}
                    </p>
                    <p className="mt-0.5 text-slate-600">{u.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Structural Errors */}
          {report.structural_errors.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-900">
                Structural & Connection Issues ({report.structural_errors.length})
              </h3>
              <ul className="mt-2.5 space-y-2 text-xs text-slate-700">
                {report.structural_errors.map((s, idx) => (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() =>
                        handleAnnotationClickFromList(`str_${idx}`)
                      }
                      className="font-semibold text-slate-900 hover:text-blue-700"
                    >
                      {s.issue}
                    </button>
                    <p className="mt-0.5 text-slate-600">{s.explanation}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Correct Concepts & Suggestions */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                Correct Concepts ({report.correct_concepts.length})
              </h3>
            </div>
            {report.correct_concepts.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                None recorded.
              </p>
            ) : (
              <ul className="mt-2.5 space-y-1.5 text-xs text-slate-700">
                {report.correct_concepts.map((c, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                    <button
                      type="button"
                      onClick={() =>
                        handleAnnotationClickFromList(`corr_${idx}`)
                      }
                      className="text-left hover:text-blue-700"
                    >
                      <span className="font-medium text-slate-900">
                        {c.concept}
                      </span>
                      {c.note ? ` — ${c.note}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {report.improvement_suggestions.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Improvement Suggestions
                </h4>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                  {report.improvement_suggestions.map((s, idx) => (
                    <li key={idx}>• {s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* WhatsApp Feedback Generator */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  WhatsApp Feedback Generator
                </h3>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setWaLang("en")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    waLang === "en"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setWaLang("ar")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    waLang === "ar"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  العربية
                </button>
              </div>
            </div>

            <textarea
              rows={9}
              dir={waLang === "ar" ? "rtl" : "ltr"}
              value={waText}
              onChange={(e) => setWaText(e.target.value)}
              className="mt-3 w-full rounded-lg border border-slate-300 bg-slate-50/50 p-3 text-sm leading-relaxed text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleRegenerateWhatsApp}
                className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Refresh from Score</span>
              </button>

              <button
                type="button"
                onClick={handleCopyWhatsApp}
                className="inline-flex min-h-[36px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Feedback</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
