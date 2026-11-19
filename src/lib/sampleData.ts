import type { ModelAnswer, PageImage, StudentSubmission } from "../types/grading";
import { processPdfFromUrl } from "./pdfProcessor";

function drawBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  lines: string[],
  options: {
    fill: string;
    stroke: string;
    titleColor: string;
    textColor: string;
    titleFont: string;
    bodyFont: string;
    handwritten?: boolean;
  }
) {
  ctx.save();
  ctx.fillStyle = options.fill;
  ctx.strokeStyle = options.stroke;
  ctx.lineWidth = options.handwritten ? 2.5 : 2;

  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = options.titleColor;
  ctx.font = options.titleFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(title, x, y - h / 2 + 12);

  ctx.fillStyle = options.textColor;
  ctx.font = options.bodyFont;
  lines.forEach((line, idx) => {
    ctx.fillText(line, x, y - h / 2 + 40 + idx * 21);
  });
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  label?: string
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.4;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 10;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - head * Math.cos(angle - Math.PI / 6),
    y2 - head * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x2 - head * Math.cos(angle + Math.PI / 6),
    y2 - head * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();

  if (label) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(mx - 44, my - 10, 88, 20);
    ctx.fillStyle = "#334155";
    ctx.font = "600 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, mx, my);
  }

  ctx.restore();
}

function drawRuledPaper(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#FAF9F5";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  for (let y = 70; y < h; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#FECACA";
  ctx.beginPath();
  ctx.moveTo(72, 0);
  ctx.lineTo(72, h);
  ctx.stroke();
}

function renderModelAnswerPage(): PageImage {
  const width = 1280;
  const height = 880;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#0F172A";
  ctx.font = "700 22px sans-serif";
  ctx.fillText("OFFICIAL MODEL ANSWER — CHAPTER 4: PHOTOSYNTHESIS", 44, 42);
  ctx.fillStyle = "#64748B";
  ctx.font = "500 14px sans-serif";
  ctx.fillText("6 CO2 + 6 H2O + Light Energy  -->  C6H12O6 + 6 O2  (Occurs in Chloroplast)", 44, 70);

  // Center Hub
  drawBox(
    ctx,
    640,
    430,
    260,
    110,
    "PHOTOSYNTHESIS",
    ["Autotrophic process in", "Chloroplasts of plant cells", "Converts light -> chemical energy"],
    {
      fill: "#EFF6FF",
      stroke: "#1D4ED8",
      titleColor: "#1E3A8A",
      textColor: "#1E293B",
      titleFont: "700 18px sans-serif",
      bodyFont: "500 14px sans-serif",
    }
  );

  // Top-Left: Light-Dependent Reactions
  drawArrow(ctx, 520, 390, 370, 260, "#1D4ED8", "Stage 1");
  drawBox(
    ctx,
    255,
    210,
    330,
    155,
    "1. Light-Dependent Reactions",
    [
      "Location: Thylakoid membranes",
      "Inputs: Light + H2O + ADP + NADP+",
      "Water splitting (Photolysis) releases O2",
      "Outputs: ATP + NADPH + O2 gas",
    ],
    {
      fill: "#F0FDF4",
      stroke: "#15803D",
      titleColor: "#14532D",
      textColor: "#1E293B",
      titleFont: "700 16px sans-serif",
      bodyFont: "500 14px sans-serif",
    }
  );

  // Top-Right: Calvin Cycle
  drawArrow(ctx, 760, 390, 910, 260, "#1D4ED8", "Stage 2");
  drawArrow(ctx, 420, 210, 855, 210, "#0F766E", "ATP + NADPH");
  drawBox(
    ctx,
    1025,
    210,
    330,
    155,
    "2. Calvin Cycle (Light-Independent)",
    [
      "Location: Stroma of chloroplast",
      "Inputs: CO2 + ATP + NADPH",
      "Enzyme: RuBisCO fixes carbon",
      "Output: Glucose (C6H12O6) + ADP/NADP+",
    ],
    {
      fill: "#F0F9FF",
      stroke: "#0369A1",
      titleColor: "#0C4A6E",
      textColor: "#1E293B",
      titleFont: "700 16px sans-serif",
      bodyFont: "500 14px sans-serif",
    }
  );

  // Bottom-Left: Chloroplast Pigments
  drawArrow(ctx, 540, 485, 370, 620, "#1D4ED8", "Site");
  drawBox(
    ctx,
    255,
    685,
    330,
    145,
    "3. Chloroplast & Pigments",
    [
      "Chlorophyll a & b absorb red/blue light",
      "Reflects green light",
      "Grana = stacks of thylakoids",
      "Stroma = fluid surrounding grana",
    ],
    {
      fill: "#FEFCE8",
      stroke: "#B45309",
      titleColor: "#78350F",
      textColor: "#1E293B",
      titleFont: "700 16px sans-serif",
      bodyFont: "500 14px sans-serif",
    }
  );

  // Bottom-Right: Limiting Factors
  drawArrow(ctx, 740, 485, 910, 620, "#1D4ED8", "Rate Factors");
  drawBox(
    ctx,
    1025,
    685,
    330,
    145,
    "4. Limiting Factors",
    [
      "Light intensity (increases rate to plateau)",
      "CO2 concentration",
      "Temperature (affects enzymes like RuBisCO)",
      "Water availability & chlorophyll level",
    ],
    {
      fill: "#FAF5FF",
      stroke: "#7E22CE",
      titleColor: "#581C87",
      textColor: "#1E293B",
      titleFont: "700 16px sans-serif",
      bodyFont: "500 14px sans-serif",
    }
  );

  return {
    id: "sample_model_p1",
    pageNumber: 1,
    dataUrl: canvas.toDataURL("image/jpeg", 0.9),
    width,
    height,
    mimeType: "image/jpeg",
  };
}

function renderStudentAminaPage(): PageImage {
  const width = 1280;
  const height = 880;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  drawRuledPaper(ctx, width, height);

  ctx.fillStyle = "#1E3A8A";
  ctx.font = "italic 600 21px Georgia, serif";
  ctx.fillText("Name: Amina Hassan (STU-104)  —  Photosynthesis Mind Map", 92, 46);

  // Center Hub
  drawBox(
    ctx,
    640,
    435,
    255,
    105,
    "Photosynthesis",
    ["Plants make glucose using", "Solar energy + CO2 + Water", "Inside Chloroplasts"],
    {
      fill: "#FFFFFF",
      stroke: "#1E40AF",
      titleColor: "#1E3A8A",
      textColor: "#1E293B",
      titleFont: "italic 700 19px Georgia, serif",
      bodyFont: "italic 500 14px Georgia, serif",
      handwritten: true,
    }
  );

  // Top-Left: Light Reactions (Accurate)
  drawArrow(ctx, 515, 395, 365, 260, "#1E40AF", "Part 1");
  drawBox(
    ctx,
    260,
    210,
    315,
    145,
    "Light Reactions",
    [
      "Happens in Thylakoids",
      "Needs light and H2O",
      "Splits water -> releases O2",
      "Makes ATP (energy)",
    ],
    {
      fill: "#FFFFFF",
      stroke: "#1E40AF",
      titleColor: "#1E3A8A",
      textColor: "#1E293B",
      titleFont: "italic 700 17px Georgia, serif",
      bodyFont: "italic 500 14px Georgia, serif",
      handwritten: true,
    }
  );

  // Top-Right: Calvin Cycle (CONTAINS SCIENTIFIC ERROR: says Thylakoid instead of Stroma)
  drawArrow(ctx, 765, 395, 915, 260, "#1E40AF", "Part 2");
  drawArrow(ctx, 418, 210, 865, 210, "#1E40AF", "ATP");
  drawBox(
    ctx,
    1025,
    210,
    315,
    145,
    "Calvin Cycle",
    [
      "Location: Thylakoid membrane",
      "Uses CO2 and ATP",
      "Produces Glucose (C6H12O6)",
      "Does not need direct light",
    ],
    {
      fill: "#FFFFFF",
      stroke: "#1E40AF",
      titleColor: "#1E3A8A",
      textColor: "#1E293B",
      titleFont: "italic 700 17px Georgia, serif",
      bodyFont: "italic 500 14px Georgia, serif",
      handwritten: true,
    }
  );

  // Bottom-Left: Pigments (Accurate)
  drawArrow(ctx, 540, 488, 370, 625, "#1E40AF");
  drawBox(
    ctx,
    260,
    690,
    315,
    130,
    "Chlorophyll & Pigments",
    [
      "Chlorophyll absorbs red & blue",
      "Reflects green color",
      "Grana = stacked thylakoids",
    ],
    {
      fill: "#FFFFFF",
      stroke: "#1E40AF",
      titleColor: "#1E3A8A",
      textColor: "#1E293B",
      titleFont: "italic 700 17px Georgia, serif",
      bodyFont: "italic 500 14px Georgia, serif",
      handwritten: true,
    }
  );

  // Bottom-Right: Limiting Factors (Incomplete: omits Temperature & enzyme impact)
  drawArrow(ctx, 740, 488, 910, 625, "#1E40AF");
  drawBox(
    ctx,
    1025,
    690,
    315,
    120,
    "Rate Factors",
    [
      "1. Light intensity",
      "2. Amount of CO2",
    ],
    {
      fill: "#FFFFFF",
      stroke: "#1E40AF",
      titleColor: "#1E3A8A",
      textColor: "#1E293B",
      titleFont: "italic 700 17px Georgia, serif",
      bodyFont: "italic 500 14px Georgia, serif",
      handwritten: true,
    }
  );

  return {
    id: "sample_amina_p1",
    pageNumber: 1,
    dataUrl: canvas.toDataURL("image/jpeg", 0.9),
    width,
    height,
    mimeType: "image/jpeg",
  };
}

function renderStudentOmarPage(): PageImage {
  const width = 1280;
  const height = 880;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  drawRuledPaper(ctx, width, height);

  ctx.fillStyle = "#0F172A";
  ctx.font = "italic 600 21px Georgia, serif";
  ctx.fillText("Student: Omar Khalid (STU-112) — Photosynthesis", 92, 46);

  drawBox(
    ctx,
    640,
    435,
    240,
    100,
    "Photosynthesis",
    ["Plants turn CO2 + O2", "into sugar using sun"],
    {
      fill: "#FFFFFF",
      stroke: "#334155",
      titleColor: "#0F172A",
      textColor: "#1E293B",
      titleFont: "italic 700 18px Georgia, serif",
      bodyFont: "italic 500 14px Georgia, serif",
      handwritten: true,
    }
  );

  // Top-Left: Light Reactions with smudged/unclear region
  drawArrow(ctx, 520, 400, 360, 260, "#334155");
  drawBox(
    ctx,
    260,
    210,
    310,
    135,
    "Light Stage",
    [
      "In Chloroplast",
      "Takes in water (H2O)",
      "Produces ??? & Oxygen",
    ],
    {
      fill: "#FFFFFF",
      stroke: "#334155",
      titleColor: "#0F172A",
      textColor: "#1E293B",
      titleFont: "italic 700 17px Georgia, serif",
      bodyFont: "italic 500 14px Georgia, serif",
      handwritten: true,
    }
  );

  // Smudge over "???" to simulate illegible handwriting
  ctx.save();
  ctx.fillStyle = "rgba(100, 116, 139, 0.55)";
  ctx.fillRect(225, 224, 65, 22);
  ctx.restore();

  // Top-Right: Reversed arrow from Calvin Cycle -> Light Stage (structural mistake)
  drawArrow(ctx, 865, 210, 420, 210, "#334155", "Glucose");
  drawArrow(ctx, 760, 400, 910, 260, "#334155");
  drawBox(
    ctx,
    1025,
    210,
    310,
    135,
    "Dark Reaction (Calvin)",
    [
      "Location: Stroma",
      "Uses CO2 to make Glucose",
      "Needs light directly",
    ],
    {
      fill: "#FFFFFF",
      stroke: "#334155",
      titleColor: "#0F172A",
      textColor: "#1E293B",
      titleFont: "italic 700 17px Georgia, serif",
      bodyFont: "italic 500 14px Georgia, serif",
      handwritten: true,
    }
  );

  // Note: Limiting factors & Pigments branches intentionally omitted by Omar!

  return {
    id: "sample_omar_p1",
    pageNumber: 1,
    dataUrl: canvas.toDataURL("image/jpeg", 0.9),
    width,
    height,
    mimeType: "image/jpeg",
  };
}

export function createSampleDataset(): {
  modelAnswer: ModelAnswer;
  submissions: StudentSubmission[];
} {
  const now = new Date().toISOString();
  const modelId = `model_sample_${Date.now()}`;

  const modelAnswer: ModelAnswer = {
    id: modelId,
    chapterName: "Chapter 4: Photosynthesis Overview",
    subject: "Biology — Grade 10",
    notes:
      "Key points: 6CO2 + 6H2O -> C6H12O6 + 6O2. Light-dependent reactions occur in thylakoids (produce ATP, NADPH, O2). Calvin cycle occurs in stroma (uses ATP, NADPH, CO2, RuBisCO to make glucose). Include chlorophyll pigments and limiting factors (light, CO2, temperature).",
    pages: [renderModelAnswerPage()],
    createdAt: now,
    updatedAt: now,
  };

  const submissions: StudentSubmission[] = [
    {
      id: `sub_sample_amina_${Date.now()}`,
      studentName: "Amina Hassan",
      studentId: "STU-104",
      modelAnswerId: modelId,
      pages: [renderStudentAminaPage()],
      status: "pending",
      createdAt: now,
    },
    {
      id: `sub_sample_omar_${Date.now() + 1}`,
      studentName: "Omar Khalid",
      studentId: "STU-112",
      modelAnswerId: modelId,
      pages: [renderStudentOmarPage()],
      status: "pending",
      createdAt: now,
    },
  ];

  return { modelAnswer, submissions };
}

export async function loadDrSafwatChp3Dataset(
  onProgress?: (message: string) => void
): Promise<{
  modelAnswer: ModelAnswer;
  submission: StudentSubmission;
}> {
  onProgress?.("Rendering Dr. Safwat Chapter 3 Model Answer (2 pages)...");
  const modelPages = await processPdfFromUrl(
    "/assets/aistudio/Dr_Safwat_Chp3_Mindmaps_febeec7a.pdf",
    "Dr_Safwat_Chp3_Mindmaps.pdf"
  );

  onProgress?.("Rendering Student 1 handwritten sheets (2 pages)...");
  const studentPages = await processPdfFromUrl(
    "/assets/aistudio/Mind_map_ch3_c7f8c33e.pdf",
    "Student_1_Chp3.pdf"
  );

  const now = new Date().toISOString();
  const modelId = `model_dr_safwat_chp3_${Date.now()}`;

  const modelAnswer: ModelAnswer = {
    id: modelId,
    chapterName: "Chapter 3: Water (Dr. Safwat Hatem)",
    subject: "Environmental Management — Class 07 & 08",
    notes:
      "Covers 3.1 Water sources & supply, Water treatment, Desalination, 3.2 Water pollution (Sources, Impacts, Strategies, Diseases), 3.4 Marine aquaculture, 3.5 Oil pollution, and 3.6 Plastic pollution.",
    pages: modelPages,
    createdAt: now,
    updatedAt: now,
  };

  const submission: StudentSubmission = {
    id: `sub_student_1_chp3_${Date.now()}`,
    studentName: "Student 1",
    studentId: "STU-001",
    modelAnswerId: modelId,
    pages: studentPages,
    status: "pending",
    createdAt: now,
  };

  return { modelAnswer, submission };
}
