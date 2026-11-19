import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  executeWithKeyFailover,
  GEMINI_VISION_MODEL,
  getConfiguredApiKeys,
  isGeminiKeyConfigured,
} from "./server/geminiConfig.ts";
import {
  gradeMindMapSubmission,
  type ImagePayload,
} from "./server/gradingService.ts";
import type { GradingMode } from "./src/types/grading.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function parseDataUrl(dataUrl: string, pageNumber: number): ImagePayload {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error(`Invalid image payload on page ${pageNumber}.`);
  }
  return {
    mimeType: match[1],
    base64Data: match[2],
    pageNumber,
  };
}

function formatSafeError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : "Unexpected grading error.";
  const lower = raw.toLowerCase();

  if (lower.includes("gemini_api_key") || lower.includes("api_key_invalid") || lower.includes("400")) {
    return {
      status: 400,
      message:
        "Gemini API key is missing or invalid on the server. Check Settings > Secrets.",
    };
  }
  if (lower.includes("403") || lower.includes("permission_denied")) {
    return {
      status: 403,
      message:
        "Permission denied by Gemini API. Verify your server API key permissions in Settings > Secrets.",
    };
  }
  if (lower.includes("429") || lower.includes("resource_exhausted")) {
    return {
      status: 429,
      message:
        "Gemini API rate limit reached. Wait a few seconds or pause and resume the batch queue.",
    };
  }
  if (lower.includes("404") || lower.includes("not_found")) {
    return {
      status: 404,
      message: `Requested Gemini model (${GEMINI_VISION_MODEL}) was not found.`,
    };
  }

  return {
    status: 500,
    message: raw,
  };
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: "50mb" }));

  app.get("/api/health", (_req, res) => {
    const keys = getConfiguredApiKeys();
    res.json({
      ok: true,
      model: GEMINI_VISION_MODEL,
      configured: isGeminiKeyConfigured(),
      keyCount: keys.length,
    });
  });

  app.post("/api/test-connection", async (_req, res) => {
    try {
      if (!isGeminiKeyConfigured()) {
        res.status(400).json({
          ok: false,
          message:
            "Server Gemini API key is not configured. Set GEMINI_API_KEY in Settings > Secrets.",
        });
        return;
      }

      const started = Date.now();
      const { data: response, usedKeySlot, totalKeys } =
        await executeWithKeyFailover((ai) =>
          ai.models.generateContent({
            model: GEMINI_VISION_MODEL,
            contents: "Reply with the single word: READY",
          })
        );

      const latencyMs = Date.now() - started;
      res.json({
        ok: true,
        model: GEMINI_VISION_MODEL,
        latencyMs,
        usedKeySlot,
        totalKeys,
        reply: (response.text ?? "").trim(),
      });
    } catch (err: unknown) {
      const safe = formatSafeError(err);
      res.status(safe.status).json({
        ok: false,
        message: safe.message,
      });
    }
  });

  app.post("/api/grade", async (req, res) => {
    try {
      const {
        studentName,
        chapterName,
        gradingMode,
        maximumMarks,
        customCriteria,
        modelNotes,
        modelPages,
        studentPages,
      } = req.body as {
        studentName?: string;
        chapterName?: string;
        gradingMode?: GradingMode;
        maximumMarks?: number;
        customCriteria?: string;
        modelNotes?: string;
        modelPages?: Array<{ dataUrl: string; pageNumber: number }>;
        studentPages?: Array<{ dataUrl: string; pageNumber: number }>;
      };

      if (!studentName || !chapterName) {
        res.status(400).json({ error: "studentName and chapterName are required." });
        return;
      }
      if (!Array.isArray(modelPages) || modelPages.length === 0) {
        res.status(400).json({ error: "At least one model answer page is required." });
        return;
      }
      if (!Array.isArray(studentPages) || studentPages.length === 0) {
        res.status(400).json({ error: "At least one student submission page is required." });
        return;
      }

      const parsedModelPages = modelPages.map((p, idx) =>
        parseDataUrl(p.dataUrl, p.pageNumber ?? idx + 1)
      );
      const parsedStudentPages = studentPages.map((p, idx) =>
        parseDataUrl(p.dataUrl, p.pageNumber ?? idx + 1)
      );

      const mode: GradingMode =
        gradingMode === "lenient" || gradingMode === "strict"
          ? gradingMode
          : "standard";

      const result = await gradeMindMapSubmission({
        studentName,
        chapterName,
        gradingMode: mode,
        maximumMarks: Number(maximumMarks) || 20,
        customCriteria: customCriteria || "",
        modelNotes: modelNotes || "",
        modelPages: parsedModelPages,
        studentPages: parsedStudentPages,
      });

      res.json({ ok: true, result });
    } catch (err: unknown) {
      const safe = formatSafeError(err);
      res.status(safe.status).json({ ok: false, error: safe.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MindMap Grader Pro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
