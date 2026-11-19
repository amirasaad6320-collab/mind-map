import { Type, ThinkingLevel, type Schema } from "@google/genai";
import {
  executeWithKeyFailover,
  GEMINI_VISION_MODEL,
} from "./geminiConfig.ts";
import type {
  GradingMode,
  NormalizedBox2D,
  StructuredGradingResult,
} from "../src/types/grading.ts";

export interface ImagePayload {
  mimeType: string;
  base64Data: string;
  pageNumber: number;
}

export interface GradeMindMapRequest {
  studentName: string;
  chapterName: string;
  gradingMode: GradingMode;
  maximumMarks: number;
  customCriteria?: string;
  modelNotes?: string;
  modelPages: ImagePayload[];
  studentPages: ImagePayload[];
}

const BOX_2D_SCHEMA: Schema = {
  type: Type.ARRAY,
  description:
    "Optional normalized bounding box [ymin, xmin, ymax, xmax] with integers 0 to 1000 on the specified student page_index. Omit if uncertain.",
  items: { type: Type.INTEGER },
};

const GRADING_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    student_name: { type: Type.STRING },
    total_marks: { type: Type.NUMBER },
    maximum_marks: { type: Type.NUMBER },
    percentage: { type: Type.NUMBER },
    overall_assessment: { type: Type.STRING },
    question_keywords: {
      type: Type.ARRAY,
      description:
        "Key words required for each main question/topic branch in the model answer.",
      items: {
        type: Type.OBJECT,
        properties: {
          question_topic: { type: Type.STRING },
          expected_keywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          matched_keywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          missing_keywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: [
          "question_topic",
          "expected_keywords",
          "matched_keywords",
          "missing_keywords",
        ],
      },
    },
    correct_concepts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          concept: { type: Type.STRING },
          key_words: { type: Type.ARRAY, items: { type: Type.STRING } },
          note: { type: Type.STRING },
          page_index: { type: Type.INTEGER },
          box_2d: BOX_2D_SCHEMA,
        },
        required: ["concept"],
      },
    },
    incorrect_concepts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          concept: { type: Type.STRING },
          key_words: { type: Type.ARRAY, items: { type: Type.STRING } },
          student_answer: { type: Type.STRING },
          expected_answer: { type: Type.STRING },
          explanation: { type: Type.STRING },
          marks_deducted: { type: Type.NUMBER },
          page_index: { type: Type.INTEGER },
          box_2d: BOX_2D_SCHEMA,
        },
        required: [
          "concept",
          "key_words",
          "student_answer",
          "expected_answer",
          "explanation",
          "marks_deducted",
        ],
      },
    },
    missing_concepts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          concept: { type: Type.STRING },
          key_words: { type: Type.ARRAY, items: { type: Type.STRING } },
          importance: { type: Type.STRING },
          marks_deducted: { type: Type.NUMBER },
          page_index: { type: Type.INTEGER },
          box_2d: BOX_2D_SCHEMA,
        },
        required: ["concept", "key_words", "importance", "marks_deducted"],
      },
    },
    incomplete_concepts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          concept: { type: Type.STRING },
          key_words: { type: Type.ARRAY, items: { type: Type.STRING } },
          student_answer: { type: Type.STRING },
          expected_detail: { type: Type.STRING },
          explanation: { type: Type.STRING },
          marks_deducted: { type: Type.NUMBER },
          page_index: { type: Type.INTEGER },
          box_2d: BOX_2D_SCHEMA,
        },
        required: [
          "concept",
          "key_words",
          "student_answer",
          "expected_detail",
          "explanation",
          "marks_deducted",
        ],
      },
    },
    structural_errors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          issue: { type: Type.STRING },
          explanation: { type: Type.STRING },
          page_index: { type: Type.INTEGER },
          box_2d: BOX_2D_SCHEMA,
        },
        required: ["issue", "explanation"],
      },
    },
    uncertain_readings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          location_description: { type: Type.STRING },
          tentative_reading: { type: Type.STRING },
          reason: { type: Type.STRING },
          page_index: { type: Type.INTEGER },
          box_2d: BOX_2D_SCHEMA,
        },
        required: ["location_description", "tentative_reading", "reason"],
      },
    },
    positive_feedback: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    improvement_suggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    requires_human_review: { type: Type.BOOLEAN },
  },
  required: [
    "student_name",
    "total_marks",
    "maximum_marks",
    "percentage",
    "overall_assessment",
    "question_keywords",
    "correct_concepts",
    "incorrect_concepts",
    "missing_concepts",
    "incomplete_concepts",
    "structural_errors",
    "uncertain_readings",
    "positive_feedback",
    "improvement_suggestions",
    "requires_human_review",
  ],
};

function getModeInstructions(mode: GradingMode): string {
  switch (mode) {
    case "lenient":
      return `GRADING MODE: LENIENT
- Focus primarily on scientific meaning and conceptual understanding.
- Ignore minor spelling mistakes, grammar slips, and harmless wording variations.
- Accept scientifically equivalent terminology and synonyms generously.
- Do not penalize layout differences as long as logical hierarchy is understandable.`;
    case "strict":
      return `GRADING MODE: STRICT
- Compare the student's work carefully against the official model answer marking scheme.
- Require key scientific terminology, exact relationships, sub-branches, and important supporting details.
- Deduct marks for vague statements, missing sub-details, or misdirected arrows/connections, while still avoiding unfair penalties for pure handwriting style or harmless spelling slips that preserve the exact term.`;
    case "standard":
    default:
      return `GRADING MODE: STANDARD
- Balance scientific accuracy, completeness of key concepts, and logical organization/connections.
- Do not penalize minor spelling errors unless they change scientific meaning.
- Accept scientifically equivalent wording, but deduct partial marks for incomplete explanations or missing key branches.`;
  }
}

function validateBox2D(raw: unknown): NormalizedBox2D | undefined {
  if (!Array.isArray(raw) || raw.length !== 4) return undefined;
  const nums = raw.map((n) => Math.round(Number(n)));
  if (nums.some((n) => !Number.isFinite(n))) return undefined;
  const [ymin, xmin, ymax, xmax] = nums;
  if (
    ymin < 0 ||
    xmin < 0 ||
    ymax > 1000 ||
    xmax > 1000 ||
    ymin >= ymax ||
    xmin >= xmax
  ) {
    return undefined;
  }
  return [ymin, xmin, ymax, xmax];
}

function clampPageIndex(raw: unknown, pageCount: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n >= pageCount) return pageCount - 1;
  return n;
}

function sanitizeResult(
  raw: Record<string, unknown>,
  studentName: string,
  maximumMarks: number,
  studentPageCount: number
): StructuredGradingResult {
  const maxMarks = Math.max(1, Number(maximumMarks) || 20);

  const safeString = (val: unknown, fallback = ""): string =>
    typeof val === "string" ? val.trim() : fallback;

  const safeNumber = (val: unknown, fallback = 0): number => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  const safeStringArray = (val: unknown): string[] =>
    Array.isArray(val) ? val.map((s) => safeString(s)).filter(Boolean) : [];

  const question_keywords = Array.isArray(raw.question_keywords)
    ? raw.question_keywords
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          question_topic: safeString(item.question_topic, "Topic"),
          expected_keywords: safeStringArray(item.expected_keywords),
          matched_keywords: safeStringArray(item.matched_keywords),
          missing_keywords: safeStringArray(item.missing_keywords),
        }))
    : [];

  const correct_concepts = Array.isArray(raw.correct_concepts)
    ? raw.correct_concepts
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          concept: safeString(item.concept, "Verified concept"),
          key_words: safeStringArray(item.key_words),
          note: safeString(item.note) || undefined,
          page_index: clampPageIndex(item.page_index, studentPageCount),
          box_2d: validateBox2D(item.box_2d),
        }))
    : [];

  const incorrect_concepts = Array.isArray(raw.incorrect_concepts)
    ? raw.incorrect_concepts
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          concept: safeString(item.concept, "Scientific error"),
          key_words: safeStringArray(item.key_words),
          student_answer: safeString(item.student_answer, "Unclear"),
          expected_answer: safeString(item.expected_answer, "See model answer"),
          explanation: safeString(item.explanation, "Differs from official model answer."),
          marks_deducted: Math.max(0, Math.round(safeNumber(item.marks_deducted, 0) * 100) / 100),
          page_index: clampPageIndex(item.page_index, studentPageCount),
          box_2d: validateBox2D(item.box_2d),
        }))
    : [];

  const missing_concepts = Array.isArray(raw.missing_concepts)
    ? raw.missing_concepts
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          concept: safeString(item.concept, "Missing concept"),
          key_words: safeStringArray(item.key_words),
          importance: safeString(item.importance, "medium"),
          marks_deducted: Math.max(0, Math.round(safeNumber(item.marks_deducted, 0) * 100) / 100),
          page_index: item.page_index !== undefined ? clampPageIndex(item.page_index, studentPageCount) : undefined,
          box_2d: validateBox2D(item.box_2d),
        }))
    : [];

  const incomplete_concepts = Array.isArray(raw.incomplete_concepts)
    ? raw.incomplete_concepts
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          concept: safeString(item.concept, "Incomplete concept"),
          key_words: safeStringArray(item.key_words),
          student_answer: safeString(item.student_answer, ""),
          expected_detail: safeString(item.expected_detail, ""),
          explanation: safeString(item.explanation, "Missing supporting details."),
          marks_deducted: Math.max(0, Math.round(safeNumber(item.marks_deducted, 0) * 100) / 100),
          page_index: clampPageIndex(item.page_index, studentPageCount),
          box_2d: validateBox2D(item.box_2d),
        }))
    : [];

  const structural_errors = Array.isArray(raw.structural_errors)
    ? raw.structural_errors
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          issue: safeString(item.issue, "Structural relationship issue"),
          explanation: safeString(item.explanation, ""),
          page_index: clampPageIndex(item.page_index, studentPageCount),
          box_2d: validateBox2D(item.box_2d),
        }))
    : [];

  const uncertain_readings = Array.isArray(raw.uncertain_readings)
    ? raw.uncertain_readings
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          location_description: safeString(item.location_description, "Handwritten region"),
          tentative_reading: safeString(item.tentative_reading, "Uncertain / Needs Human Review"),
          reason: safeString(item.reason, "Handwriting legibility is low or smudged."),
          page_index: clampPageIndex(item.page_index, studentPageCount),
          box_2d: validateBox2D(item.box_2d),
        }))
    : [];

  const positive_feedback = Array.isArray(raw.positive_feedback)
    ? raw.positive_feedback.map((s) => safeString(s)).filter(Boolean)
    : [];

  const improvement_suggestions = Array.isArray(raw.improvement_suggestions)
    ? raw.improvement_suggestions.map((s) => safeString(s)).filter(Boolean)
    : [];

  const rawMarks = safeNumber(raw.total_marks, maxMarks);
  const clampedMarks = Math.max(0, Math.min(maxMarks, Math.round(rawMarks * 100) / 100));
  const percentage = Math.round((clampedMarks / maxMarks) * 1000) / 10;

  const requiresHumanReview =
    Boolean(raw.requires_human_review) || uncertain_readings.length > 0;

  return {
    student_name: safeString(raw.student_name, studentName) || studentName,
    total_marks: clampedMarks,
    maximum_marks: maxMarks,
    percentage,
    overall_assessment:
      safeString(raw.overall_assessment) ||
      "Assessment completed. Please review detailed concept breakdown below.",
    question_keywords,
    correct_concepts,
    incorrect_concepts,
    missing_concepts,
    incomplete_concepts,
    structural_errors,
    uncertain_readings,
    positive_feedback,
    improvement_suggestions,
    requires_human_review: requiresHumanReview,
  };
}

async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const isRetryable =
        message.includes("429") ||
        message.includes("RESOURCE_EXHAUSTED") ||
        message.includes("503") ||
        message.includes("UNAVAILABLE") ||
        message.includes("timeout");

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 1500 * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

export async function gradeMindMapSubmission(
  request: GradeMindMapRequest
): Promise<StructuredGradingResult> {
  const systemInstruction = `You are an expert STEM educator, assessment specialist, and computer vision analyst grading handwritten student mind maps against an official model answer.

CRITICAL GRADING PROTOCOL:
1. First, thoroughly inspect ALL pages of the OFFICIAL MODEL ANSWER. Map out every central topic, box, keyword, branch, sub-branch, chemical/mathematical formula, and directional connection/relationship across every page.
2. Second, inspect ALL pages of the STUDENT SUBMISSION box by box. Carefully read handwritten text, arrows, hierarchy, and grouping. Note that many mind maps are structured fill-in-the-blank worksheets spanning multiple pages (e.g., Page 1 and Page 2).
3. Match corresponding concepts spatially and semantically between the model answer and the student's mind map, even when the student arranges boxes differently on the page.
4. Evaluate carefully:
   - Scientific accuracy of every statement, term, and value (watch for subtle scientific errors such as "organic ions" vs "inorganic ions", or "oceans and seas" where the model specifies a supply/source like "Desalination plants").
   - Conceptual equivalence (do NOT penalize harmless spelling slips like "procted" for "protected", or harmless wording variations if the scientific meaning is preserved).
   - Logical relationships and directional arrows between concepts (not merely isolated keyword presence).
   - Missing concepts, incomplete boxes (e.g., listing only "Cholera" when both "Cholera & Typhoid" are required), misplaced items, and incorrect facts.
5. STRICT EVIDENCE & HONESTY RULES:
   - Never fabricate or hallucinate student text that is not visibly written on the student's sheet.
   - Never claim a concept is missing unless you have checked all student pages carefully.
   - If handwriting is smudged, cropped, or illegible, do NOT guess what it says — add it to "uncertain_readings" with tentative_reading marked "Uncertain / Needs Human Review" and set "requires_human_review": true.
   - Do not award full marks for vague or incomplete answers.
6. QUESTION KEY WORDS (CRITICAL):
   - Populate "question_keywords" for each major question/topic branch (e.g., "3.1 Water distribution", "3.1 Water cycle", "3.2 Water pollution - Impacts & Diseases", "3.4 Marine aquaculture", "3.5 Oil pollution", "3.6 Plastic pollution"), explicitly listing:
     * expected_keywords: the essential scientific terms from the official model answer for that question.
     * matched_keywords: the expected keywords the student got right.
     * missing_keywords: the expected keywords the student missed or wrote incorrectly.
   - Also include concise "key_words" on every item in incorrect_concepts, incomplete_concepts, missing_concepts, and correct_concepts.
   - Group "correct_concepts" concisely by topic branch (and omit box_2d for correct_concepts to keep response fast) while ALWAYS providing accurate "page_index" and "box_2d" for incorrect_concepts, incomplete_concepts, uncertain_readings, and structural_errors.
7. VISUAL BOUNDING BOXES (0–1000 normalized coordinates):
   - Provide "page_index" (0-based: 0 for Page 1, 1 for Page 2, etc.) and "box_2d" as [ymin, xmin, ymax, xmax] integers (0–1000) for visible incorrect, incomplete, uncertain, and structural error boxes.
   - If a concept is completely absent (missing_concepts) or you cannot reliably locate coordinates, omit "box_2d".
8. SCORING:
   - Grade out of ${request.maximumMarks} total marks.
   - Ensure total_marks equals maximum_marks minus the sum of marks_deducted across incorrect, missing, and incomplete concepts (clamped between 0 and ${request.maximumMarks}).`;

  const promptText = `Chapter / Topic: ${request.chapterName}
Student Name: ${request.studentName}
Maximum Marks: ${request.maximumMarks}

${getModeInstructions(request.gradingMode)}

${request.modelNotes ? `Official Model Answer Notes:\n${request.modelNotes}\n` : ""}
${request.customCriteria ? `Teacher Custom Grading Criteria:\n${request.customCriteria}\n` : ""}

The images below are organized into two clear sections:
- First ${request.modelPages.length} image(s): OFFICIAL MODEL ANSWER (pages 1..${request.modelPages.length}).
- Next ${request.studentPages.length} image(s): STUDENT HANDWRITTEN SUBMISSION (page_index 0..${request.studentPages.length - 1}).

Analyze both sets and return the structured JSON grading report including question_keywords and key_words.`;

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  parts.push({
    text: `--- SECTION 1: OFFICIAL MODEL ANSWER (${request.modelPages.length} page(s)) ---`,
  });
  for (const page of request.modelPages) {
    parts.push({
      text: `Model Answer Page ${page.pageNumber}:`,
    });
    parts.push({
      inlineData: {
        mimeType: page.mimeType,
        data: page.base64Data,
      },
    });
  }

  parts.push({
    text: `--- SECTION 2: STUDENT SUBMISSION FOR "${request.studentName}" (${request.studentPages.length} page(s)) ---`,
  });
  request.studentPages.forEach((page, idx) => {
    parts.push({
      text: `Student Page (page_index=${idx}, pageNumber=${page.pageNumber}):`,
    });
    parts.push({
      inlineData: {
        mimeType: page.mimeType,
        data: page.base64Data,
      },
    });
  });

  parts.push({ text: promptText });

  const { data: response } = await withExponentialBackoff(() =>
    executeWithKeyFailover((ai) =>
      ai.models.generateContent({
        model: GEMINI_VISION_MODEL,
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: GRADING_RESPONSE_SCHEMA,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      })
    )
  );

  const rawText = (response.text ?? "").trim();
  if (!rawText) {
    throw new Error("Gemini returned an empty response. Please retry grading.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    // Attempt to extract JSON block if wrapped unexpectedly
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("AI response was not valid JSON. Please retry grading.");
    }
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  }

  return sanitizeResult(
    parsed,
    request.studentName,
    request.maximumMarks,
    request.studentPages.length
  );
}
