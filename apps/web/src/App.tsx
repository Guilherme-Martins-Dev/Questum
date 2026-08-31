import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/app-layout";
import { ExtractionPage } from "./pages/extraction-page";
import { QuestionsReviewPage } from "./pages/questions-review-page";
import { ExportPage } from "./pages/export-page";
import { HistoryPage } from "./pages/history-page";
import { NotFoundPage } from "./pages/not-found-page";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/extraction" replace />} />
        <Route path="/extraction" element={<ExtractionPage />} />
        <Route path="/questions" element={<QuestionsReviewPage />} />
        <Route path="/export" element={<ExportPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
