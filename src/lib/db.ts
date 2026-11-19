import type {
  AppBackupPayload,
  GradingReport,
  GradingSettings,
  ModelAnswer,
  StudentSubmission,
} from "../types/grading";

const DB_NAME = "mindmap_grader_pro_db";
const DB_VERSION = 1;

const STORES = {
  MODEL_ANSWERS: "modelAnswers",
  SUBMISSIONS: "submissions",
  REPORTS: "reports",
  SETTINGS: "settings",
} as const;

export const DEFAULT_SETTINGS: GradingSettings = {
  id: "default",
  mode: "standard",
  maximumMarks: 20,
  customCriteria: "",
  whatsappLanguage: "en",
  rateLimitDelayMs: 1500,
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.MODEL_ANSWERS)) {
        db.createObjectStore(STORES.MODEL_ANSWERS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.SUBMISSIONS)) {
        db.createObjectStore(STORES.SUBMISSIONS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.REPORTS)) {
        db.createObjectStore(STORES.REPORTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function putInStore<T>(storeName: string, value: T): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function clearStore(storeName: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadAllData(): Promise<{
  modelAnswers: ModelAnswer[];
  submissions: StudentSubmission[];
  reports: GradingReport[];
  settings: GradingSettings;
}> {
  const [modelAnswers, submissions, reports, settingsList] = await Promise.all([
    getAllFromStore<ModelAnswer>(STORES.MODEL_ANSWERS),
    getAllFromStore<StudentSubmission>(STORES.SUBMISSIONS),
    getAllFromStore<GradingReport>(STORES.REPORTS),
    getAllFromStore<GradingSettings>(STORES.SETTINGS),
  ]);

  const settings = settingsList[0] ?? DEFAULT_SETTINGS;

  return {
    modelAnswers: modelAnswers.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    submissions: submissions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    reports: reports.sort((a, b) => b.gradedAt.localeCompare(a.gradedAt)),
    settings,
  };
}

export async function saveModelAnswer(item: ModelAnswer): Promise<void> {
  await putInStore(STORES.MODEL_ANSWERS, item);
}

export async function removeModelAnswer(id: string): Promise<void> {
  await deleteFromStore(STORES.MODEL_ANSWERS, id);
}

export async function saveSubmission(item: StudentSubmission): Promise<void> {
  await putInStore(STORES.SUBMISSIONS, item);
}

export async function removeSubmission(id: string): Promise<void> {
  await deleteFromStore(STORES.SUBMISSIONS, id);
}

export async function saveReport(item: GradingReport): Promise<void> {
  await putInStore(STORES.REPORTS, item);
}

export async function removeReport(id: string): Promise<void> {
  await deleteFromStore(STORES.REPORTS, id);
}

export async function saveSettings(settings: GradingSettings): Promise<void> {
  await putInStore(STORES.SETTINGS, { ...settings, id: "default" });
}

export async function clearAllAppData(): Promise<void> {
  await Promise.all([
    clearStore(STORES.MODEL_ANSWERS),
    clearStore(STORES.SUBMISSIONS),
    clearStore(STORES.REPORTS),
    clearStore(STORES.SETTINGS),
  ]);
}

export async function exportBackupPayload(): Promise<AppBackupPayload> {
  const data = await loadAllData();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    ...data,
  };
}

export async function restoreBackupPayload(payload: AppBackupPayload): Promise<void> {
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray(payload.modelAnswers) ||
    !Array.isArray(payload.submissions) ||
    !Array.isArray(payload.reports)
  ) {
    throw new Error("Invalid backup file format.");
  }

  await clearAllAppData();

  for (const item of payload.modelAnswers) {
    await saveModelAnswer(item);
  }
  for (const item of payload.submissions) {
    await saveSubmission(item);
  }
  for (const item of payload.reports) {
    await saveReport(item);
  }
  if (payload.settings) {
    await saveSettings(payload.settings);
  }
}
