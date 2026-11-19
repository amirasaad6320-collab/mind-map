import { jsPDF } from "jspdf";
import type {
  AnnotationCategory,
  GradingReport,
  PageImage,
  StudentSubmission,
  VisualAnnotation,
} from "../types/grading";

export function getEffectiveScore(report: GradingReport): {
  marks: number;
  max: number;
  percentage: number;
  isAdjusted: boolean;
} {
  const marks =
    report.teacher_adjusted_marks !== null &&
    report.teacher_adjusted_marks !== undefined
      ? report.teacher_adjusted_marks
      : report.total_marks;
  const max = Math.max(1, report.maximum_marks);
  const percentage = Math.round((marks / max) * 1000) / 10;
  return {
    marks,
    max,
    percentage,
    isAdjusted:
      report.teacher_adjusted_marks !== null &&
      report.teacher_adjusted_marks !== report.ai_total_marks,
  };
}

export function extractVisualAnnotations(report: GradingReport): VisualAnnotation[] {
  const list: VisualAnnotation[] = [];

  report.incorrect_concepts.forEach((item, idx) => {
    if (item.box_2d) {
      list.push({
        id: `inc_${idx}`,
        category: "incorrect",
        pageIndex: item.page_index ?? 0,
        box_2d: item.box_2d,
        title: item.concept,
        detail: item.explanation,
        studentAnswer: item.student_answer,
        expected: item.expected_answer,
        marksDeducted: item.marks_deducted,
      });
    }
  });

  report.incomplete_concepts.forEach((item, idx) => {
    if (item.box_2d) {
      list.push({
        id: `incomp_${idx}`,
        category: "incomplete",
        pageIndex: item.page_index ?? 0,
        box_2d: item.box_2d,
        title: item.concept,
        detail: item.explanation,
        studentAnswer: item.student_answer,
        expected: item.expected_detail,
        marksDeducted: item.marks_deducted,
      });
    }
  });

  report.uncertain_readings.forEach((item, idx) => {
    if (item.box_2d) {
      list.push({
        id: `unc_${idx}`,
        category: "uncertain",
        pageIndex: item.page_index ?? 0,
        box_2d: item.box_2d,
        title: item.location_description,
        detail: item.reason,
        studentAnswer: item.tentative_reading,
      });
    }
  });

  report.structural_errors.forEach((item, idx) => {
    if (item.box_2d) {
      list.push({
        id: `str_${idx}`,
        category: "incorrect",
        pageIndex: item.page_index ?? 0,
        box_2d: item.box_2d,
        title: `Structure: ${item.issue}`,
        detail: item.explanation,
      });
    }
  });

  report.missing_concepts.forEach((item, idx) => {
    if (item.box_2d) {
      list.push({
        id: `miss_${idx}`,
        category: "missing",
        pageIndex: item.page_index ?? 0,
        box_2d: item.box_2d,
        title: `Missing: ${item.concept}`,
        detail: `Importance: ${item.importance}`,
        marksDeducted: item.marks_deducted,
      });
    }
  });

  report.correct_concepts.forEach((item, idx) => {
    if (item.box_2d) {
      list.push({
        id: `corr_${idx}`,
        category: "correct",
        pageIndex: item.page_index ?? 0,
        box_2d: item.box_2d,
        title: item.concept,
        detail: item.note || "Scientifically accurate and well placed.",
      });
    }
  });

  return list;
}

export function buildWhatsAppMessage(
  report: GradingReport,
  language: "en" | "ar"
): string {
  const { marks, max, percentage } = getEffectiveScore(report);

  const positives =
    report.positive_feedback.length > 0
      ? report.positive_feedback.slice(0, 3)
      : report.correct_concepts.slice(0, 3).map((c) => c.concept);

  const mistakes = report.incorrect_concepts
    .filter((m) => !m.overridden)
    .slice(0, 3)
    .map((m) => `${m.concept} (Expected: ${m.expected_answer})`);

  const missing = report.missing_concepts
    .filter((m) => !m.overridden)
    .slice(0, 3)
    .map((m) => m.concept);

  const suggestions = report.improvement_suggestions.slice(0, 3);

  if (language === "ar") {
    const lines: string[] = [
      `السلام عليكم ${report.student_name}،`,
      `هذه نتيجة تقييم الخريطة الذهنية لدرس (${report.chapterName}):`,
      `الدرجة: ${marks} / ${max} (${percentage}%)`,
      "",
    ];

    if (positives.length > 0) {
      lines.push("نقاط القوة:");
      positives.forEach((p) => lines.push(`- ${p}`));
      lines.push("");
    }

    if (mistakes.length > 0) {
      lines.push("أهم الأخطاء التي تحتاج إلى مراجعة:");
      mistakes.forEach((m) => lines.push(`- ${m}`));
      lines.push("");
    }

    if (missing.length > 0) {
      lines.push("مفاهيم ناقصة يُنصح بإضافتها:");
      missing.forEach((m) => lines.push(`- ${m}`));
      lines.push("");
    }

    if (suggestions.length > 0) {
      lines.push("خطوات للتحسين:");
      suggestions.forEach((s) => lines.push(`- ${s}`));
      lines.push("");
    }

    lines.push("مجهود رائع، استمر في التقدم والمراجعة المنظمة!");
    return lines.join("\n");
  }

  const lines: string[] = [
    `Hi ${report.student_name},`,
    `Here is your feedback for the "${report.chapterName}" mind map:`,
    `Score: ${marks} / ${max} (${percentage}%)`,
    "",
  ];

  if (positives.length > 0) {
    lines.push("What you did well:");
    positives.forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }

  if (mistakes.length > 0) {
    lines.push("Key corrections to review:");
    mistakes.forEach((m) => lines.push(`- ${m}`));
    lines.push("");
  }

  if (missing.length > 0) {
    lines.push("Missing concepts to include next time:");
    missing.forEach((m) => lines.push(`- ${m}`));
    lines.push("");
  }

  if (suggestions.length > 0) {
    lines.push("Suggestions for improvement:");
    suggestions.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }

  lines.push("Great effort overall—keep refining your connections and you will master this topic!");
  return lines.join("\n");
}

function escapeCsvCell(value: string | number | boolean): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportReportsToCsv(reports: GradingReport[]): void {
  const headers = [
    "Student Name",
    "Student ID",
    "Chapter",
    "Grading Mode",
    "AI Score",
    "Final Score",
    "Max Marks",
    "Percentage (%)",
    "Teacher Approved",
    "Human Review Flagged",
    "Incorrect Count",
    "Missing Count",
    "Incomplete Count",
    "Uncertain Count",
    "Overall Assessment",
    "Teacher Notes",
    "Graded At",
  ];

  const rows = reports.map((r) => {
    const eff = getEffectiveScore(r);
    return [
      r.student_name,
      r.studentId || "",
      r.chapterName,
      r.gradingMode,
      r.ai_total_marks,
      eff.marks,
      eff.max,
      eff.percentage,
      r.is_teacher_approved ? "Yes" : "No",
      r.requires_human_review ? "Yes" : "No",
      r.incorrect_concepts.length,
      r.missing_concepts.length,
      r.incomplete_concepts.length,
      r.uncertain_readings.length,
      r.overall_assessment,
      r.teacher_notes || "",
      r.gradedAt,
    ].map(escapeCsvCell);
  });

  const csvContent = "\uFEFF" + [headers.map(escapeCsvCell).join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mindmap-grades-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const EXPORT_BOX_COLORS: Record<
  AnnotationCategory,
  { stroke: string; fill: string; label: string }
> = {
  incorrect: {
    stroke: "#DC2626",
    fill: "rgba(220, 38, 38, 0.14)",
    label: "Incorrect",
  },
  incomplete: {
    stroke: "#D97706",
    fill: "rgba(217, 119, 6, 0.14)",
    label: "Incomplete",
  },
  uncertain: {
    stroke: "#0284C7",
    fill: "rgba(2, 132, 199, 0.14)",
    label: "Uncertain",
  },
  missing: {
    stroke: "#B91C1C",
    fill: "rgba(185, 28, 28, 0.12)",
    label: "Missing",
  },
  correct: {
    stroke: "#059669",
    fill: "rgba(5, 150, 105, 0.10)",
    label: "Correct",
  },
};

export async function renderAnnotatedPageDataUrl(
  page: PageImage,
  pageAnnotations: VisualAnnotation[],
  format: "image/jpeg" | "image/png" = "image/jpeg"
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Failed to load page image for annotation export."));
    el.src = page.dataUrl;
  });

  const canvas = document.createElement("canvas");
  const w = img.naturalWidth || page.width;
  const h = img.naturalHeight || page.height;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return page.dataUrl;

  ctx.drawImage(img, 0, 0, w, h);

  pageAnnotations.forEach((ann, index) => {
    if (ann.category === "correct") return;
    const [ymin, xmin, ymax, xmax] = ann.box_2d;
    const rx = (xmin / 1000) * w;
    const ry = (ymin / 1000) * h;
    const rw = ((xmax - xmin) / 1000) * w;
    const rh = ((ymax - ymin) / 1000) * h;

    const style = EXPORT_BOX_COLORS[ann.category];
    ctx.save();
    ctx.fillStyle = style.fill;
    ctx.fillRect(rx, ry, rw, rh);

    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = Math.max(2.5, Math.round(w / 450));
    if (ann.category === "uncertain") {
      ctx.setLineDash([10, 6]);
    }
    ctx.strokeRect(rx, ry, rw, rh);

    const tagText = `${index + 1}. ${style.label}`;
    ctx.setLineDash([]);
    const fontSize = Math.max(13, Math.round(w / 90));
    ctx.font = `600 ${fontSize}px sans-serif`;
    const textWidth = ctx.measureText(tagText).width;
    const tagW = textWidth + 14;
    const tagH = fontSize + 10;
    const tagY = ry >= tagH + 3 ? ry - tagH - 3 : ry + 3;

    ctx.fillStyle = style.stroke;
    ctx.beginPath();
    ctx.roundRect(rx, tagY, tagW, tagH, 4);
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "middle";
    ctx.fillText(tagText, rx + 7, tagY + tagH / 2);
    ctx.restore();
  });

  return format === "image/png"
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", 0.9);
}

export async function downloadAnnotatedPagePng(
  page: PageImage,
  annotations: VisualAnnotation[],
  pageIndex: number,
  studentName: string
): Promise<void> {
  const pageAnns = annotations.filter((a) => a.pageIndex === pageIndex);
  const pngUrl = await renderAnnotatedPageDataUrl(page, pageAnns, "image/png");
  const link = document.createElement("a");
  const safeName = studentName.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  link.href = pngUrl;
  link.download = `graded_${safeName}_page${pageIndex + 1}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function downloadAnnotatedSheetsPdf(
  report: GradingReport,
  submission: StudentSubmission
): Promise<void> {
  if (!submission || submission.pages.length === 0) return;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const maxWidth = pageWidth - margin * 2;
  const eff = getEffectiveScore(report);
  const allAnnotations = extractVisualAnnotations(report);

  for (let idx = 0; idx < submission.pages.length; idx++) {
    if (idx > 0) doc.addPage();
    const page = submission.pages[idx];
    const pageAnns = allAnnotations.filter((a) => a.pageIndex === idx);
    const annotatedUrl = await renderAnnotatedPageDataUrl(
      page,
      pageAnns,
      "image/jpeg"
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `${report.student_name} — Graded Sheet (Page ${idx + 1} of ${submission.pages.length})  |  Score: ${eff.marks} / ${eff.max} (${eff.percentage}%)`,
      margin,
      30
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Red = Incorrect  |  Amber = Incomplete  |  Dashed Blue = Uncertain Handwriting",
      margin,
      43
    );

    const ratio = page.height / Math.max(1, page.width);
    let imgW = maxWidth;
    let imgH = imgW * ratio;
    const maxImgH = pageHeight - 76;
    if (imgH > maxImgH) {
      imgH = maxImgH;
      imgW = imgH / ratio;
    }
    const x = margin + (maxWidth - imgW) / 2;
    doc.addImage(annotatedUrl, "JPEG", x, 54, imgW, imgH);
  }

  const safeName = report.student_name
    .replace(/[^a-z0-9_-]/gi, "_")
    .toLowerCase();
  doc.save(
    `graded_sheets_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`
  );
}

export function downloadOriginalPagesPdf(
  pages: PageImage[],
  title: string,
  filename: string
): void {
  if (pages.length === 0) return;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 30;
  const maxWidth = pageWidth - margin * 2;

  pages.forEach((page, idx) => {
    if (idx > 0) doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${title} — Page ${idx + 1} of ${pages.length}`, margin, 32);

    const ratio = page.height / Math.max(1, page.width);
    let imgW = maxWidth;
    let imgH = imgW * ratio;
    const maxImgH = pageHeight - 66;
    if (imgH > maxImgH) {
      imgH = maxImgH;
      imgW = imgH / ratio;
    }
    const x = margin + (maxWidth - imgW) / 2;
    doc.addImage(page.dataUrl, "JPEG", x, 44, imgW, imgH);
  });

  doc.save(filename);
}

export async function exportReportToPdf(
  report: GradingReport,
  submission?: StudentSubmission
): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const maxWidth = pageWidth - margin * 2;
  let y = 50;

  const ensureSpace = (needed = 40) => {
    if (y + needed > pageHeight - 44) {
      doc.addPage();
      y = 50;
    }
  };

  const writeWrapped = (
    text: string,
    fontSize = 10,
    style: "normal" | "bold" = "normal",
    color: [number, number, number] = [30, 41, 59],
    indent = 0
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxWidth - indent);
    for (const line of lines) {
      ensureSpace(fontSize + 6);
      doc.text(line, margin + indent, y);
      y += fontSize + 4;
    }
  };

  const eff = getEffectiveScore(report);
  const allAnnotations = extractVisualAnnotations(report);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42);
  doc.text("MindMap Grader Pro — Graded Report", margin, y);
  y += 22;

  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  writeWrapped(
    `Student: ${report.student_name}${report.studentId ? ` (${report.studentId})` : ""}`,
    11,
    "bold"
  );
  writeWrapped(
    `Chapter: ${report.chapterName}  |  Mode: ${report.gradingMode.toUpperCase()}  |  Graded: ${new Date(report.gradedAt).toLocaleString()}`,
    9.5,
    "normal",
    [71, 85, 105]
  );
  y += 4;
  writeWrapped(
    `Final Score: ${eff.marks} / ${eff.max} (${eff.percentage}%)${eff.isAdjusted ? `  [AI Original: ${report.ai_total_marks}]` : ""}${report.is_teacher_approved ? "  —  Teacher Approved" : ""}`,
    12,
    "bold",
    [29, 78, 216]
  );
  y += 8;

  writeWrapped("Overall Assessment", 11, "bold", [15, 23, 42]);
  writeWrapped(report.overall_assessment, 10, "normal");
  y += 8;

  if (report.teacher_notes.trim()) {
    writeWrapped("Teacher Notes", 11, "bold", [15, 23, 42]);
    writeWrapped(report.teacher_notes, 10, "normal");
    y += 8;
  }

  // Question Key Words Section
  if (report.question_keywords && report.question_keywords.length > 0) {
    writeWrapped("Question Key Words Checklist", 11, "bold", [29, 78, 216]);
    report.question_keywords.forEach((qk) => {
      writeWrapped(`• ${qk.question_topic}`, 9.5, "bold", [15, 23, 42], 6);
      if (qk.expected_keywords.length > 0) {
        writeWrapped(
          `Expected Key Words: ${qk.expected_keywords.join(", ")}`,
          9,
          "normal",
          [51, 65, 85],
          16
        );
      }
      if (qk.matched_keywords.length > 0) {
        writeWrapped(
          `Matched: ${qk.matched_keywords.join(", ")}`,
          9,
          "normal",
          [5, 150, 105],
          16
        );
      }
      if (qk.missing_keywords.length > 0) {
        writeWrapped(
          `Missing / Wrong: ${qk.missing_keywords.join(", ")}`,
          9,
          "normal",
          [220, 38, 38],
          16
        );
      }
    });
    y += 8;
  }

  if (report.incorrect_concepts.length > 0) {
    writeWrapped(`Incorrect Concepts (${report.incorrect_concepts.length})`, 11, "bold", [220, 38, 38]);
    report.incorrect_concepts.forEach((c) => {
      writeWrapped(
        `• ${c.concept} (-${c.marks_deducted} marks)${c.overridden ? " [Overridden by Teacher]" : ""}`,
        9.5,
        "bold",
        [30, 41, 59],
        8
      );
      if (c.key_words && c.key_words.length > 0) {
        writeWrapped(`Key Words: ${c.key_words.join(", ")}`, 9, "bold", [29, 78, 216], 16);
      }
      writeWrapped(`Student wrote: ${c.student_answer} | Expected: ${c.expected_answer}`, 9, "normal", [71, 85, 105], 16);
      writeWrapped(`Reason: ${c.explanation}`, 9, "normal", [71, 85, 105], 16);
    });
    y += 8;
  }

  if (report.incomplete_concepts.length > 0) {
    writeWrapped(`Incomplete Concepts (${report.incomplete_concepts.length})`, 11, "bold", [217, 119, 6]);
    report.incomplete_concepts.forEach((c) => {
      writeWrapped(
        `• ${c.concept} (-${c.marks_deducted} marks)${c.overridden ? " [Overridden]" : ""}`,
        9.5,
        "bold",
        [30, 41, 59],
        8
      );
      if (c.key_words && c.key_words.length > 0) {
        writeWrapped(`Key Words: ${c.key_words.join(", ")}`, 9, "bold", [29, 78, 216], 16);
      }
      writeWrapped(`Missing detail: ${c.expected_detail}`, 9, "normal", [71, 85, 105], 16);
    });
    y += 8;
  }

  if (report.missing_concepts.length > 0) {
    writeWrapped(`Missing Concepts (${report.missing_concepts.length})`, 11, "bold", [185, 28, 28]);
    report.missing_concepts.forEach((c) => {
      writeWrapped(
        `• ${c.concept} (Importance: ${c.importance}, -${c.marks_deducted} marks)`,
        9.5,
        "bold",
        [30, 41, 59],
        8
      );
      if (c.key_words && c.key_words.length > 0) {
        writeWrapped(`Key Words: ${c.key_words.join(", ")}`, 9, "normal", [29, 78, 216], 16);
      }
    });
    y += 8;
  }

  if (report.uncertain_readings.length > 0) {
    writeWrapped(`Uncertain Handwriting Readings (${report.uncertain_readings.length})`, 11, "bold", [2, 132, 199]);
    report.uncertain_readings.forEach((u) => {
      writeWrapped(
        `• ${u.location_description}: ${u.tentative_reading} — ${u.reason}`,
        9.5,
        "normal",
        [30, 41, 59],
        8
      );
    });
    y += 8;
  }

  if (report.correct_concepts.length > 0) {
    writeWrapped(`Correct Concepts (${report.correct_concepts.length})`, 11, "bold", [5, 150, 105]);
    report.correct_concepts.forEach((c) => {
      const kwStr = c.key_words && c.key_words.length > 0 ? ` [Key words: ${c.key_words.join(", ")}]` : "";
      writeWrapped(`• ${c.concept}${c.note ? ` — ${c.note}` : ""}${kwStr}`, 9.5, "normal", [30, 41, 59], 8);
    });
    y += 8;
  }

  if (report.improvement_suggestions.length > 0) {
    writeWrapped("Improvement Suggestions", 11, "bold", [15, 23, 42]);
    report.improvement_suggestions.forEach((s) => {
      writeWrapped(`• ${s}`, 9.5, "normal", [30, 41, 59], 8);
    });
    y += 8;
  }

  // Embed ALL Graded Annotated Pages
  if (submission && submission.pages.length > 0) {
    for (let idx = 0; idx < submission.pages.length; idx++) {
      const page = submission.pages[idx];
      const pageAnns = allAnnotations.filter((a) => a.pageIndex === idx);
      const annotatedUrl = await renderAnnotatedPageDataUrl(
        page,
        pageAnns,
        "image/jpeg"
      );

      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Graded Annotated Mind Map — Page ${idx + 1} of ${submission.pages.length}`,
        margin,
        36
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        "Red = Incorrect  |  Amber = Incomplete  |  Dashed Blue = Uncertain Handwriting",
        margin,
        49
      );

      const ratio = page.height / Math.max(1, page.width);
      let imgW = maxWidth;
      let imgH = imgW * ratio;
      const maxImgH = pageHeight - 90;
      if (imgH > maxImgH) {
        imgH = maxImgH;
        imgW = imgH / ratio;
      }
      const x = margin + (maxWidth - imgW) / 2;
      doc.addImage(annotatedUrl, "JPEG", x, 60, imgW, imgH);
    }
  }

  const safeName = report.student_name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  doc.save(`graded_report_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
