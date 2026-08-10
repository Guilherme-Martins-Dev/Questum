import { Routes, Route, Navigate } from "react-router-dom";
import { UploadPage } from "./pages/upload-page";
import { ExtractionPage } from "./pages/extraction-page";
import { QuestionsReviewPage } from "./pages/questions-review-page";
import { ExportPage } from "./pages/export-page";
import { HistoryPage } from "./pages/history-page";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/upload" replace />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/extraction" element={<ExtractionPage />} />
      <Route path="/questions" element={<QuestionsReviewPage />} />
      <Route path="/export" element={<ExportPage />} />
      <Route path="/history" element={<HistoryPage />} />
    </Routes>
  );
}
