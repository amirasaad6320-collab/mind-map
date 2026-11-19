export type GradingMode = 'lenient' | 'standard' | 'strict';

export interface PageImage {
  id: string;
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
}

export interface ModelAnswer {
  id: string;
  chapterName: string;
  subject: string;
  notes: string;
  pages: PageImage[];
  createdAt: string;
  updatedAt: string;
}

export type SubmissionStatus = 'pending' | 'grading' | 'graded' | 'failed';

export interface StudentSubmission {
  id: string;
  studentName: string;
  studentId: string;
  modelAnswerId: string;
  pages: PageImage[];
  status: SubmissionStatus;
  errorMessage?: string;
  createdAt: string;
}

export type AnnotationCategory = 'incorrect' | 'incomplete' | 'uncertain' | 'correct' | 'missing';

/**
 * Normalized bounding box coordinates [ymin, xmin, ymax, xmax] in range 0..1000
 * relative to the original student page image.
 */
export type NormalizedBox2D = [number, number, number, number];

export interface QuestionKeywordItem {
  question_topic: string;
  expected_keywords: string[];
  matched_keywords: string[];
  missing_keywords: string[];
}

export interface IncorrectConcept {
  concept: string;
  key_words?: string[];
  student_answer: string;
  expected_answer: string;
  explanation: string;
  marks_deducted: number;
  page_index?: number;
  box_2d?: NormalizedBox2D;
  overridden?: boolean;
  teacher_note?: string;
}

export interface MissingConcept {
  concept: string;
  key_words?: string[];
  importance: string;
  marks_deducted: number;
  page_index?: number;
  box_2d?: NormalizedBox2D;
  overridden?: boolean;
  teacher_note?: string;
}

export interface IncompleteConcept {
  concept: string;
  key_words?: string[];
  student_answer: string;
  expected_detail: string;
  explanation: string;
  marks_deducted: number;
  page_index?: number;
  box_2d?: NormalizedBox2D;
  overridden?: boolean;
  teacher_note?: string;
}

export interface StructuralError {
  issue: string;
  explanation: string;
  page_index?: number;
  box_2d?: NormalizedBox2D;
}

export interface UncertainReading {
  location_description: string;
  tentative_reading: string;
  reason: string;
  page_index?: number;
  box_2d?: NormalizedBox2D;
  resolved_by_teacher?: boolean;
  teacher_resolution?: string;
}

export interface CorrectConcept {
  concept: string;
  key_words?: string[];
  note?: string;
  page_index?: number;
  box_2d?: NormalizedBox2D;
}

export interface VisualAnnotation {
  id: string;
  category: AnnotationCategory;
  pageIndex: number;
  box_2d: NormalizedBox2D;
  title: string;
  detail: string;
  expected?: string;
  studentAnswer?: string;
  marksDeducted?: number;
}

export interface StructuredGradingResult {
  student_name: string;
  total_marks: number;
  maximum_marks: number;
  percentage: number;
  overall_assessment: string;
  question_keywords: QuestionKeywordItem[];
  correct_concepts: CorrectConcept[];
  incorrect_concepts: IncorrectConcept[];
  missing_concepts: MissingConcept[];
  incomplete_concepts: IncompleteConcept[];
  structural_errors: StructuralError[];
  uncertain_readings: UncertainReading[];
  positive_feedback: string[];
  improvement_suggestions: string[];
  requires_human_review: boolean;
}

export interface GradingReport extends StructuredGradingResult {
  id: string;
  submissionId: string;
  modelAnswerId: string;
  chapterName: string;
  studentId: string;
  gradingMode: GradingMode;
  gradedAt: string;
  ai_total_marks: number;
  teacher_adjusted_marks: number | null;
  teacher_notes: string;
  is_teacher_approved: boolean;
  whatsapp_draft_en: string;
  whatsapp_draft_ar: string;
}

export interface GradingSettings {
  id: 'default';
  mode: GradingMode;
  maximumMarks: number;
  customCriteria: string;
  whatsappLanguage: 'en' | 'ar';
  rateLimitDelayMs: number;
}

export interface AppBackupPayload {
  version: number;
  exportedAt: string;
  modelAnswers: ModelAnswer[];
  submissions: StudentSubmission[];
  reports: GradingReport[];
  settings: GradingSettings;
}
