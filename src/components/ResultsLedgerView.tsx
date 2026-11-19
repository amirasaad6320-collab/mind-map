import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Search,
  Trash2,
} from "lucide-react";
import {
  exportReportsToCsv,
  exportReportToPdf,
  getEffectiveScore,
} from "../lib/exportUtils";
import type { GradingReport, StudentSubmission } from "../types/grading";
import { ConfirmDialog } from "./ConfirmDialog";

interface ResultsLedgerViewProps {
  reports: GradingReport[];
  submissions: StudentSubmission[];
  onOpenReport: (reportId: string) => void;
  onDeleteReport: (reportId: string, submissionId: string) => Promise<void>;
  onNotify: (type: "success" | "error" | "info", message: string) => void;
}

export function ResultsLedgerView({
  reports,
  submissions,
  onOpenReport,
  onDeleteReport,
  onNotify,
}: ResultsLedgerViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<
    "all" | "needs_review" | "approved"
  >("all");
  const [deleteTarget, setDeleteTarget] = useState<GradingReport | null>(null);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (filterMode === "needs_review" && !r.requires_human_review) {
        return false;
      }
      if (filterMode === "approved" && !r.is_teacher_approved) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.student_name.toLowerCase().includes(q) ||
        r.studentId.toLowerCase().includes(q) ||
        r.chapterName.toLowerCase().includes(q)
      );
    });
  }, [reports, filterMode, searchQuery]);

  const avgPct = useMemo(() => {
    if (reports.length === 0) return 0;
    const sum = reports.reduce((acc, r) => acc + getEffectiveScore(r).percentage, 0);
    return Math.round((sum / reports.length) * 10) / 10;
  }, [reports]);

  const reviewCount = useMemo(
    () => reports.filter((r) => r.requires_human_review).length,
    [reports]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Results Ledger
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Inspect all graded submissions, export CSV spreadsheets, or download individual PDFs.
          </p>
        </div>

        <button
          type="button"
          disabled={reports.length === 0}
          onClick={() => {
            exportReportsToCsv(filteredReports);
            onNotify(
              "success",
              `Exported ${filteredReports.length} grading record(s) to CSV.`
            );
          }}
          className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>Export CSV ({filteredReports.length})</span>
        </button>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium text-slate-500">Total Graded</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {reports.length}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Class Average</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {avgPct}%
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">
            Flagged for Human Review
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
            {reviewCount}
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student, ID, or chapter..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {[
            { id: "all", label: "All Reports" },
            { id: "needs_review", label: "Needs Review" },
            { id: "approved", label: "Approved" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setFilterMode(tab.id as "all" | "needs_review" | "approved")
              }
              className={`min-h-[34px] whitespace-nowrap shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                filterMode === tab.id
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filteredReports.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-800">
            No matching grading reports found
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Grade submissions in the workspace or adjust your search filter.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Chapter</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">Percent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredReports.map((r) => {
                const eff = getEffectiveScore(r);
                const sub = submissions.find((s) => s.id === r.submissionId);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">
                        {r.student_name}
                      </p>
                      {r.studentId && (
                        <p className="font-mono text-xs text-slate-500">
                          {r.studentId}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <p>{r.chapterName}</p>
                      <p className="text-xs capitalize text-slate-500">
                        {r.gradingMode} mode
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      <span className="font-semibold text-slate-900">
                        {eff.marks} / {eff.max}
                      </span>
                      {eff.isAdjusted && (
                        <p className="text-[11px] text-blue-700">
                          AI: {r.ai_total_marks}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {eff.percentage}%
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.is_teacher_approved ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approved
                        </span>
                      ) : r.requires_human_review ? (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Needs Review
                        </span>
                      ) : (
                        <span className="text-slate-600">AI Graded</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenReport(r.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Inspect</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => exportReportToPdf(r, sub)}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                          title="Export PDF report"
                          aria-label={`Export PDF for ${r.student_name}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          title="Delete report"
                          aria-label={`Delete report for ${r.student_name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Grading Report"
        description={`Remove the grading report and submission for "${deleteTarget?.student_name}"?`}
        confirmLabel="Delete Report"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await onDeleteReport(deleteTarget.id, deleteTarget.submissionId);
            onNotify("info", `Deleted report for "${deleteTarget.student_name}".`);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
