# MindMap Grader Pro

An academic assessment workbench for grading students' handwritten mind maps against official model answers using multimodal vision (`gemini-4-hydrogen`), interactive HTML5 Canvas error annotations, teacher score overrides, persistent IndexedDB storage, and bilingual (English & Arabic) WhatsApp feedback generation.

## Folder Structure

```text
├── server.ts                          # Express + Vite server with /api/grade & /api/test-connection
├── server/
│   ├── geminiConfig.ts                # Centralized Gemini model config & SDK client factory
│   └── gradingService.ts              # Multimodal prompt, structured JSON schema, & coordinate validation
├── src/
│   ├── App.tsx                        # Main responsive dashboard, sidebar, & sequential batch runner
│   ├── index.css                      # Tailwind CSS v4 tokens & typography
│   ├── types/
│   │   └── grading.ts                 # TypeScript interfaces for models, submissions, reports, & annotations
│   ├── lib/
│   │   ├── db.ts                      # IndexedDB persistence layer + JSON backup/restore
│   │   ├── pdfProcessor.ts            # PDF.js multi-page renderer & Canvas image optimizer
│   │   ├── exportUtils.ts             # Visual annotation extraction, WhatsApp EN/AR drafts, CSV, & jsPDF
│   │   └── sampleData.ts              # Built-in Canvas generator for Biology sample model + student sheets
│   └── components/
│       ├── BatchWorkspaceView.tsx     # Student upload queue, grading settings, & pause/resume batch UI
│       ├── ModelAnswersView.tsx       # Chapter library, multi-page PDF/image upload, edit/replace/delete
│       ├── GradingReviewView.tsx      # Detailed report, teacher overrides, & WhatsApp feedback generator
│       ├── VisualAnnotationCanvas.tsx # Zoomable Canvas overlay for red/amber/blue/green bounding boxes
│       ├── ResultsLedgerView.tsx      # Searchable tabular ledger with CSV & PDF exports
│       ├── SettingsBackupView.tsx     # Server AI connection check, backup/restore, & testing checklist
│       ├── ConfirmDialog.tsx          # Accessible confirmation modal
│       └── ToastContainer.tsx         # Non-intrusive notifications
├── index.html
├── metadata.json
└── package.json
```

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure your Gemini API key in a local `.env` file (or via AI Studio **Settings > Secrets**):
   ```env
   GEMINI_API_KEY="your_gemini_api_key_here"
   ```
   Obtain a key from [Google AI Studio](https://aistudio.google.com/apikey). Because API calls run exclusively through the Express backend (`/api/grade`), your key is never bundled into browser JavaScript or stored in LocalStorage.
3. Start the full-stack development server (port `3000`):
   ```bash
   npm run dev
   ```

## Building & Deploying

1. Build the production frontend bundle:
   ```bash
   npm run build
   ```
2. Start the production server (`NODE_ENV=production` on port `3000`):
   ```bash
   npm start
   ```
Ensure `GEMINI_API_KEY` is configured in your hosting provider's secret environment variables before starting the server.

## Testing Checklist

1. **Sample Dataset**: Click **Load Sample Biology Set** on the Model Answers or Workspace view to populate an official *Photosynthesis Overview* model answer and two student submissions (*Amina Hassan* and *Omar Khalid*).
2. **Persistence**: Refresh the browser and verify saved model answers, submissions, and settings remain intact via IndexedDB.
3. **PDF & Image Optimization**: Upload a multi-page PDF or high-resolution photo and confirm pages render clearly and resize smoothly.
4. **AI Connection**: Open **Settings & Backup** and click **Test AI Connection** to confirm server connectivity.
5. **Sequential Batch Grading**: Click **Grade Pending**, test **Pause Batch** and **Resume Batch**, and confirm completed reports persist immediately.
6. **Visual Error Canvas & Overrides**: Open **Grading Review**, toggle annotations, click bounding boxes or use **Prev/Next Issue**, waive a deduction, approve the final grade, copy English/Arabic WhatsApp feedback, and export both PDF and CSV files.
