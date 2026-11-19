import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ClipboardCheck,
  FileSpreadsheet,
  Layers,
  Menu,
  Play,
  Settings,
  X,
} from "lucide-react";
import { BatchWorkspaceView } from "./components/BatchWorkspaceView";
import { GradingReviewView } from "./components/GradingReviewView";
import { ModelAnswersView } from "./components/ModelAnswersView";
import { ResultsLedgerView } from "./components/ResultsLedgerView";
import { SettingsBackupView } from "./components/SettingsBackupView";
import { ToastContainer, type ToastItem } from "./components/ToastContainer";
import {
  clearAllAppData,
  DEFAULT_SETTINGS,
  loadAllData,
  removeModelAnswer,
  removeReport,
  removeSubmission,
  saveModelAnswer,
  saveReport,
  saveSettings,
  saveSubmission,
} from "./lib/db";
import { buildWhatsAppMessage } from "./lib/exportUtils";
import { downscaleDataUrlForUpload } from "./lib/pdfProcessor";
import {
  createSampleDataset,
  loadDrSafwatChp3Dataset,
} from "./lib/sampleData";
import type {
  GradingReport,
  GradingSettings,
  ModelAnswer,
  StudentSubmission,
  StructuredGradingResult,
} from "./types/grading";

type ActiveTab = "workspace" | "models" | "review" | "ledger" | "settings";

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("workspace");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loadingDb, setLoadingDb] = useState(true);

  const [modelAnswers, setModelAnswers] = useState<ModelAnswer[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [reports, setReports] = useState<GradingReport[]>([]);
  const [settings, setSettings] = useState<GradingSettings>(DEFAULT_SETTINGS);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Sequential batch control state & refs
  const [batchState, setBatchState] = useState({
    isRunning: false,
    isPaused: false,
    currentSubmissionId: null as string | null,
    completedCount: 0,
    totalCount: 0,
  });
  const batchPausedRef = useRef(false);
  const batchRunningRef = useRef(false);

  const notify = useCallback(
    (type: "success" | "error" | "info", message: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const hydrateFromDb = useCallback(async () => {
    try {
      const data = await loadAllData();
      const cleanedSubmissions = await Promise.all(
        data.submissions.map(async (s) => {
          if (s.status === "grading") {
            const fixed: StudentSubmission = { ...s, status: "pending" };
            await saveSubmission(fixed);
            return fixed;
          }
          return s;
        })
      );
      setModelAnswers(data.modelAnswers);
      setSubmissions(cleanedSubmissions);
      setReports(data.reports);
      setSettings(data.settings);
      setSelectedModelId((prev) =>
        data.modelAnswers.some((m) => m.id === prev)
          ? prev
          : data.modelAnswers[0]?.id ?? ""
      );
      setActiveReportId((prev) =>
        data.reports.some((r) => r.id === prev)
          ? prev
          : data.reports[0]?.id ?? null
      );
      if (
        data.modelAnswers.length === 0 &&
        data.submissions.length === 0 &&
        localStorage.getItem("mmg_seeded_ch3") !== "1"
      ) {
        try {
          const { modelAnswer, submission } = await loadDrSafwatChp3Dataset();
          await saveModelAnswer(modelAnswer);
          await saveSubmission(submission);
          localStorage.setItem("mmg_seeded_ch3", "1");
          setModelAnswers([modelAnswer]);
          setSelectedModelId(modelAnswer.id);
          setSubmissions([submission]);
          notify(
            "success",
            "Loaded Dr. Safwat Chapter 3 Model Answer and Student 1."
          );
        } catch {
          // Non-fatal if static asset unavailable
        }
      }
    } catch {
      notify("error", "Could not initialize local IndexedDB storage.");
    } finally {
      setLoadingDb(false);
    }
  }, [notify]);

  useEffect(() => {
    hydrateFromDb();
  }, [hydrateFromDb]);

  // Model Answer Handlers
  const handleSaveModelAnswer = async (model: ModelAnswer) => {
    await saveModelAnswer(model);
    setModelAnswers((prev) => {
      const exists = prev.some((m) => m.id === model.id);
      const next = exists
        ? prev.map((m) => (m.id === model.id ? model : m))
        : [model, ...prev];
      return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  };

  const handleDeleteModelAnswer = async (id: string) => {
    await removeModelAnswer(id);
    setModelAnswers((prev) => {
      const next = prev.filter((m) => m.id !== id);
      if (selectedModelId === id) {
        setSelectedModelId(next[0]?.id ?? "");
      }
      return next;
    });
  };

  // Submission Handlers
  const handleAddSubmissions = async (items: StudentSubmission[]) => {
    for (const item of items) {
      await saveSubmission(item);
    }
    setSubmissions((prev) => [...items, ...prev]);
  };

  const handleUpdateSubmission = async (item: StudentSubmission) => {
    await saveSubmission(item);
    setSubmissions((prev) => prev.map((s) => (s.id === item.id ? item : s)));
  };

  const handleDeleteSubmission = async (id: string) => {
    await removeSubmission(id);
    const matchingReport = reports.find((r) => r.submissionId === id);
    if (matchingReport) {
      await removeReport(matchingReport.id);
      setReports((prev) => prev.filter((r) => r.id !== matchingReport.id));
    }
    setSubmissions((prev) => prev.filter((s) => s.id !== id));
  };

  const handleUpdateSettings = async (next: GradingSettings) => {
    setSettings(next);
    await saveSettings(next);
  };

  const handleSaveReport = async (report: GradingReport) => {
    await saveReport(report);
    setReports((prev) => {
      const exists = prev.some((r) => r.id === report.id);
      return exists
        ? prev.map((r) => (r.id === report.id ? report : r))
        : [report, ...prev];
    });
  };

  const handleDeleteReport = async (reportId: string, submissionId: string) => {
    await removeReport(reportId);
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    const sub = submissions.find((s) => s.id === submissionId);
    if (sub) {
      const resetSub: StudentSubmission = { ...sub, status: "pending" };
      await saveSubmission(resetSub);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === submissionId ? resetSub : s))
      );
    }
  };

  const handleLoadSampleDataset = async () => {
    const { modelAnswer, submissions: sampleSubs } = createSampleDataset();
    await saveModelAnswer(modelAnswer);
    for (const sub of sampleSubs) {
      await saveSubmission(sub);
    }
    setModelAnswers((prev) => [modelAnswer, ...prev]);
    setSelectedModelId(modelAnswer.id);
    setSubmissions((prev) => [...sampleSubs, ...prev]);
    setActiveTab("workspace");
    notify(
      "success",
      "Loaded Biology sample model answer and 2 student mind map sheets."
    );
  };

  const handleLoadDrSafwatChp3 = async () => {
    try {
      const { modelAnswer, submission } = await loadDrSafwatChp3Dataset();
      await saveModelAnswer(modelAnswer);
      await saveSubmission(submission);
      localStorage.setItem("mmg_seeded_ch3", "1");
      setModelAnswers((prev) => [modelAnswer, ...prev]);
      setSelectedModelId(modelAnswer.id);
      setSubmissions((prev) => [submission, ...prev]);
      setActiveTab("workspace");
      notify(
        "success",
        "Loaded Dr. Safwat Chapter 3 Model Answer and Student 1."
      );
    } catch (err: unknown) {
      notify(
        "error",
        err instanceof Error
          ? err.message
          : "Could not load Chapter 3 PDF files."
      );
    }
  };

  const handleClearAllData = async () => {
    await clearAllAppData();
    setModelAnswers([]);
    setSubmissions([]);
    setReports([]);
    setSettings(DEFAULT_SETTINGS);
    setSelectedModelId("");
    setActiveReportId(null);
  };

  // Core Grading Call (Server-side /api/grade)
  const executeGradingForSubmission = async (
    sub: StudentSubmission
  ): Promise<GradingReport> => {
    const model =
      modelAnswers.find((m) => m.id === sub.modelAnswerId) ??
      modelAnswers.find((m) => m.id === selectedModelId) ??
      modelAnswers[0];

    if (!model) {
      throw new Error("No official Model Answer found for this submission.");
    }

    const gradingSub: StudentSubmission = {
      ...sub,
      status: "grading",
      errorMessage: undefined,
    };
    await handleUpdateSubmission(gradingSub);

    const [optimizedModelPages, optimizedStudentPages] = await Promise.all([
      Promise.all(
        model.pages.map(async (p) => ({
          dataUrl: await downscaleDataUrlForUpload(p.dataUrl, 1440),
          pageNumber: p.pageNumber,
        }))
      ),
      Promise.all(
        sub.pages.map(async (p) => ({
          dataUrl: await downscaleDataUrlForUpload(p.dataUrl, 1440),
          pageNumber: p.pageNumber,
        }))
      ),
    ]);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    let response: Response;
    try {
      response = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          studentName: sub.studentName,
          chapterName: model.chapterName,
          gradingMode: settings.mode,
          maximumMarks: settings.maximumMarks,
          customCriteria: settings.customCriteria,
          modelNotes: model.notes,
          modelPages: optimizedModelPages,
          studentPages: optimizedStudentPages,
        }),
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Grading request timed out after 90 seconds. Please retry.");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await response.json();
    if (!response.ok || !data.ok || !data.result) {
      throw new Error(data.error || "Grading request failed.");
    }

    const structured = data.result as StructuredGradingResult;
    const existingReport = reports.find((r) => r.submissionId === sub.id);

    const reportBase: GradingReport = {
      ...structured,
      id: existingReport ? existingReport.id : `rep_${Date.now()}_${sub.id}`,
      submissionId: sub.id,
      modelAnswerId: model.id,
      chapterName: model.chapterName,
      studentId: sub.studentId,
      gradingMode: settings.mode,
      gradedAt: new Date().toISOString(),
      ai_total_marks: structured.total_marks,
      teacher_adjusted_marks: null,
      teacher_notes: "",
      is_teacher_approved: false,
      whatsapp_draft_en: "",
      whatsapp_draft_ar: "",
    };

    reportBase.whatsapp_draft_en = buildWhatsAppMessage(reportBase, "en");
    reportBase.whatsapp_draft_ar = buildWhatsAppMessage(reportBase, "ar");

    await saveReport(reportBase);
    setReports((prev) => {
      const exists = prev.some((r) => r.id === reportBase.id);
      return exists
        ? prev.map((r) => (r.id === reportBase.id ? reportBase : r))
        : [reportBase, ...prev];
    });

    await handleUpdateSubmission({
      ...sub,
      modelAnswerId: model.id,
      status: "graded",
      errorMessage: undefined,
    });

    return reportBase;
  };

  const handleGradeSingle = async (sub: StudentSubmission) => {
    try {
      const report = await executeGradingForSubmission(sub);
      setActiveReportId(report.id);
      notify("success", `Graded "${sub.studentName}" successfully.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Grading failed.";
      await handleUpdateSubmission({
        ...sub,
        status: "failed",
        errorMessage: msg,
      });
      notify("error", `${sub.studentName}: ${msg}`);
    }
  };

  const waitWhilePaused = async () => {
    while (batchPausedRef.current && batchRunningRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  const handleStartBatch = async (onlyFailed = false) => {
    if (batchRunningRef.current) return;

    const queue = submissions.filter((s) =>
      onlyFailed ? s.status === "failed" : s.status === "pending"
    );

    if (queue.length === 0) {
      notify("info", "No matching submissions in queue.");
      return;
    }

    batchRunningRef.current = true;
    batchPausedRef.current = false;

    setBatchState({
      isRunning: true,
      isPaused: false,
      currentSubmissionId: queue[0].id,
      completedCount: 0,
      totalCount: queue.length,
    });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < queue.length; i++) {
      await waitWhilePaused();
      if (!batchRunningRef.current) break;

      const sub = queue[i];
      setBatchState((prev) => ({
        ...prev,
        currentSubmissionId: sub.id,
      }));

      try {
        const rep = await executeGradingForSubmission(sub);
        successCount++;
        setActiveReportId((curr) => curr ?? rep.id);
      } catch (err: unknown) {
        failCount++;
        const msg = err instanceof Error ? err.message : "Grading error.";
        await handleUpdateSubmission({
          ...sub,
          status: "failed",
          errorMessage: msg,
        });
      }

      setBatchState((prev) => ({
        ...prev,
        completedCount: i + 1,
      }));

      // Respect Gemini API rate limits between sequential requests
      if (i < queue.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, settings.rateLimitDelayMs)
        );
      }
    }

    batchRunningRef.current = false;
    batchPausedRef.current = false;
    setBatchState((prev) => ({
      ...prev,
      isRunning: false,
      isPaused: false,
      currentSubmissionId: null,
    }));

    if (failCount === 0) {
      notify(
        "success",
        `Batch complete: graded ${successCount} student submission(s).`
      );
    } else {
      notify(
        "info",
        `Batch finished: ${successCount} graded, ${failCount} failed. Use Retry Failed to re-run.`
      );
    }
  };

  const handlePauseBatch = () => {
    batchPausedRef.current = true;
    setBatchState((prev) => ({ ...prev, isPaused: true }));
    notify("info", "Batch will pause after the current student finishes.");
  };

  const handleResumeBatch = () => {
    batchPausedRef.current = false;
    setBatchState((prev) => ({ ...prev, isPaused: false }));
    notify("info", "Batch grading resumed.");
  };

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: typeof Layers;
    count?: number;
  }> = [
    {
      id: "workspace",
      label: "Submissions & Batch",
      icon: Layers,
      count: submissions.length,
    },
    {
      id: "models",
      label: "Model Answers",
      icon: BookOpen,
      count: modelAnswers.length,
    },
    {
      id: "review",
      label: "Grading Review",
      icon: ClipboardCheck,
      count: reports.length,
    },
    {
      id: "ledger",
      label: "Results Ledger",
      icon: FileSpreadsheet,
    },
    {
      id: "settings",
      label: "Settings & Backup",
      icon: Settings,
    },
  ];

  const pendingCount = submissions.filter((s) => s.status === "pending").length;

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-slate-200 px-5">
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            MindMap Grader Pro
          </span>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full min-h-[42px] items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-50 text-blue-800"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="flex items-center gap-2.5 whitespace-nowrap">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.count !== undefined && item.count > 0 && (
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
          <p className="font-medium text-slate-700">Local IndexedDB Storage</p>
          <p className="mt-0.5 tabular-nums">
            {modelAnswers.length} chapters · {reports.length} reports
          </p>
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
              <span className="font-display text-base font-bold text-slate-900">
                MindMap Grader Pro
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`flex w-full min-h-[44px] items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${
                      active
                        ? "bg-blue-50 text-blue-800"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {item.count !== undefined && item.count > 0 && (
                      <span className="font-mono text-xs text-slate-500 tabular-nums">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Clean 3-Zone Top Bar */}
        <header className="flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 lg:gap-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-display text-sm font-semibold text-slate-900 whitespace-nowrap shrink-0 lg:hidden">
              MindMap Grader Pro
            </span>
            <span className="hidden text-sm text-slate-500 whitespace-nowrap lg:inline">
              {navItems.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex lg:hidden">
            {navItems.slice(0, 4).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  activeTab === item.id ? "text-blue-700" : ""
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              disabled={batchState.isRunning || pendingCount === 0 || modelAnswers.length === 0}
              onClick={() => {
                setActiveTab("workspace");
                handleStartBatch(false);
              }}
              className="inline-flex min-h-[38px] whitespace-nowrap shrink-0 items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              <span>
                {batchState.isRunning
                  ? "Grading Batch..."
                  : `Grade Pending (${pendingCount})`}
              </span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6 lg:p-8">
          {loadingDb ? (
            <div className="space-y-4">
              <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200" />
              <div className="h-64 w-full animate-pulse rounded-xl bg-slate-200" />
            </div>
          ) : (
            <>
              {activeTab === "workspace" && (
                <BatchWorkspaceView
                  modelAnswers={modelAnswers}
                  selectedModelId={selectedModelId}
                  onSelectModel={setSelectedModelId}
                  submissions={submissions}
                  reports={reports}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  onAddSubmissions={handleAddSubmissions}
                  onUpdateSubmission={handleUpdateSubmission}
                  onDeleteSubmission={handleDeleteSubmission}
                  onLoadSampleDataset={handleLoadSampleDataset}
                  onLoadDrSafwatChp3={handleLoadDrSafwatChp3}
                  onGradeSingle={handleGradeSingle}
                  onStartBatch={handleStartBatch}
                  onPauseBatch={handlePauseBatch}
                  onResumeBatch={handleResumeBatch}
                  batchState={batchState}
                  onOpenReport={(subId) => {
                    const rep = reports.find((r) => r.submissionId === subId);
                    if (rep) {
                      setActiveReportId(rep.id);
                      setActiveTab("review");
                    }
                  }}
                  onNotify={notify}
                />
              )}

              {activeTab === "models" && (
                <ModelAnswersView
                  modelAnswers={modelAnswers}
                  selectedModelId={selectedModelId}
                  onSelectModel={setSelectedModelId}
                  onSaveModelAnswer={handleSaveModelAnswer}
                  onDeleteModelAnswer={handleDeleteModelAnswer}
                  onLoadSampleDataset={handleLoadSampleDataset}
                  onLoadDrSafwatChp3={handleLoadDrSafwatChp3}
                  onNotify={notify}
                />
              )}

              {activeTab === "review" && (
                <GradingReviewView
                  reports={reports}
                  submissions={submissions}
                  modelAnswers={modelAnswers}
                  activeReportId={activeReportId}
                  defaultLanguage={settings.whatsappLanguage}
                  onSelectReport={setActiveReportId}
                  onSaveReport={handleSaveReport}
                  onGoToWorkspace={() => setActiveTab("workspace")}
                  onNotify={notify}
                />
              )}

              {activeTab === "ledger" && (
                <ResultsLedgerView
                  reports={reports}
                  submissions={submissions}
                  onOpenReport={(repId) => {
                    setActiveReportId(repId);
                    setActiveTab("review");
                  }}
                  onDeleteReport={handleDeleteReport}
                  onNotify={notify}
                />
              )}

              {activeTab === "settings" && (
                <SettingsBackupView
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  onClearAllData={handleClearAllData}
                  onDataRestored={hydrateFromDb}
                  onNotify={notify}
                />
              )}
            </>
          )}
        </main>
      </div>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }
      />
    </div>
  );
}
