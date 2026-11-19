import { useEffect, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Database,
  Download,
  Loader2,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";
import {
  exportBackupPayload,
  restoreBackupPayload,
} from "../lib/db";
import type { AppBackupPayload, GradingSettings } from "../types/grading";
import { ConfirmDialog } from "./ConfirmDialog";

interface SettingsBackupViewProps {
  settings: GradingSettings;
  onUpdateSettings: (next: GradingSettings) => Promise<void>;
  onClearAllData: () => Promise<void>;
  onDataRestored: () => Promise<void>;
  onNotify: (type: "success" | "error" | "info", message: string) => void;
}

export function SettingsBackupView({
  settings,
  onUpdateSettings,
  onClearAllData,
  onDataRestored,
  onNotify,
}: SettingsBackupViewProps) {
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const [healthState, setHealthState] = useState<{
    checked: boolean;
    configured: boolean;
    model: string;
    keyCount: number;
  }>({ checked: false, configured: false, model: "", keyCount: 0 });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        setHealthState({
          checked: true,
          configured: Boolean(data.configured),
          model: data.model || "gemini-4-hydrogen",
          keyCount: Number(data.keyCount) || 0,
        });
      })
      .catch(() => {
        setHealthState({
          checked: true,
          configured: false,
          model: "gemini-4-hydrogen",
          keyCount: 0,
        });
      });
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-connection", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestResult({
          ok: true,
          message: `Connected to ${data.model} via Key #${data.usedKeySlot ?? 1} of ${data.totalKeys ?? 1}.`,
          latencyMs: data.latencyMs,
        });
        onNotify("success", "Gemini AI service connection verified.");
      } else {
        setTestResult({
          ok: false,
          message: data.message || "Connection test failed.",
        });
        onNotify("error", data.message || "Connection test failed.");
      }
    } catch {
      setTestResult({
        ok: false,
        message: "Network error reaching server /api/test-connection.",
      });
      onNotify("error", "Could not reach backend server.");
    } finally {
      setTesting(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const payload = await exportBackupPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mindmap-grader-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify("success", "Downloaded full IndexedDB JSON backup.");
    } catch {
      onNotify("error", "Failed to export backup.");
    }
  };

  const handleRestoreFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const text = await files[0].text();
      const payload = JSON.parse(text) as AppBackupPayload;
      await restoreBackupPayload(payload);
      await onDataRestored();
      onNotify("success", "Backup restored successfully.");
    } catch (err: unknown) {
      onNotify(
        "error",
        err instanceof Error ? err.message : "Invalid backup JSON file."
      );
    } finally {
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          Settings, Backup & AI Service
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Manage default rubric preferences, verify server-side AI connectivity, and back up local IndexedDB records.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Server-Side AI Service Status */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-700" />
            <h3 className="text-base font-semibold text-slate-900">
              AI Grading Engine & Security
            </h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Gemini API calls execute exclusively through the application&apos;s
            server-side proxy route (<code className="font-mono text-xs">/api/grade</code>).
            Add <code className="font-mono text-xs">GEMINI_API_KEY</code> plus optional
            backup keys (<code className="font-mono text-xs">GEMINI_API_KEY_2</code>,{" "}
            <code className="font-mono text-xs">GEMINI_API_KEY_3</code>, or comma-separated{" "}
            <code className="font-mono text-xs">GEMINI_API_KEYS</code>) in{" "}
            <strong>Settings &gt; Secrets</strong> for automatic server-side failover.
          </p>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
            <div className="flex items-center justify-between">
              <span className="font-medium">Active Multimodal Model</span>
              <span className="font-mono font-semibold text-slate-900">
                {healthState.model || "gemini-4-hydrogen"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-medium">Failover Key Pool</span>
              <span
                className={`font-semibold tabular-nums ${
                  healthState.configured ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {!healthState.checked
                  ? "Checking..."
                  : healthState.configured
                  ? `${healthState.keyCount} key${healthState.keyCount > 1 ? "s" : ""} configured`
                  : "Missing GEMINI_API_KEY in Secrets"}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={testing}
              onClick={handleTestConnection}
              className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>{testing ? "Testing..." : "Test AI Connection"}</span>
            </button>

            {testResult && (
              <span
                className={`text-xs font-medium ${
                  testResult.ok ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {testResult.message}
                {testResult.latencyMs !== undefined
                  ? ` (${testResult.latencyMs} ms)`
                  : ""}
              </span>
            )}
          </div>
        </div>

        {/* IndexedDB Backup & Data Management */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-700" />
            <h3 className="text-base font-semibold text-slate-900">
              Local Persistence & Backup
            </h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Model answers, student mind map pages, AI reports, and teacher score
            overrides are saved persistently in browser IndexedDB across refreshes.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Default WhatsApp Feedback Language
              </label>
              <div className="mt-1 inline-flex rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ ...settings, whatsappLanguage: "en" })
                  }
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    settings.whatsappLanguage === "en"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ ...settings, whatsappLanguage: "ar" })
                  }
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    settings.whatsappLanguage === "ar"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600"
                  }`}
                >
                  العربية (Arabic)
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleExportBackup}
                className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                <span>Backup Data (JSON)</span>
              </button>

              <input
                ref={restoreInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => handleRestoreFile(e.target.files)}
              />
              <button
                type="button"
                onClick={() => restoreInputRef.current?.click()}
                className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Upload className="h-4 w-4" />
                <span>Restore Backup</span>
              </button>

              <button
                type="button"
                onClick={() => setConfirmClearOpen(true)}
                className="inline-flex min-h-[40px] whitespace-nowrap shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4" />
                <span>Clear All Data</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Testing & Verification Guide */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-slate-700" />
          <h3 className="text-base font-semibold text-slate-900">
            Production Verification & Testing Checklist
          </h3>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 text-xs leading-relaxed text-slate-700 md:grid-cols-2">
          <ul className="space-y-2">
            <li>
              <strong>1. Model Answer Persistence:</strong> Upload a multi-page PDF or
              load the sample Biology set, refresh the browser, and confirm the
              saved chapter remains in IndexedDB.
            </li>
            <li>
              <strong>2. Grading Modes:</strong> Grade the same student under
              Lenient vs. Strict mode and verify stricter terminology checks under
              Strict mode.
            </li>
            <li>
              <strong>3. Visual Error Coordinates:</strong> Open Grading Review,
              toggle annotations on/off, zoom in, and use Prev/Next Issue to jump
              between bounding boxes.
            </li>
          </ul>
          <ul className="space-y-2">
            <li>
              <strong>4. Human-Review Guardrail:</strong> Verify smudged or
              ambiguous handwriting (such as Omar Khalid&apos;s sample) triggers
              the Uncertain Reading flag instead of fabricated text.
            </li>
            <li>
              <strong>5. Teacher Overrides & Exports:</strong> Waive an AI
              deduction, approve the final score, copy Arabic/English WhatsApp
              feedback, and download both PDF and CSV exports.
            </li>
            <li>
              <strong>6. Batch Controls:</strong> Queue multiple submissions,
              test Pause/Resume mid-batch, and verify already-graded sheets are
              skipped unless explicitly re-graded.
            </li>
          </ul>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear All Local Application Data"
        description="This permanently deletes all saved model answers, student submissions, grading reports, and settings from IndexedDB. Export a JSON backup first if you want to keep a copy."
        confirmLabel="Clear Everything"
        destructive
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={async () => {
          await onClearAllData();
          setConfirmClearOpen(false);
          onNotify("info", "All local data has been cleared.");
        }}
      />
    </div>
  );
}
