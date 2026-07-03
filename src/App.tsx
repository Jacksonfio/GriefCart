import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute, PublicRoute } from './components/auth/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { TwinPage } from './pages/TwinPage';
import { DetectivePage } from './pages/DetectivePage';
import { TrustedPersonsPage } from './pages/TrustedPersonsPage';
import { ContinuityPlanPage } from './pages/ContinuityPlanPage';
import { RecoveryPage } from './pages/RecoveryPage';
import { LegacyPage } from './pages/LegacyPage';
import { IncapacityTimelinePage } from './pages/IncapacityTimelinePage';
import { AuthPage } from './pages/AuthPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicRoute />}>
          <Route path="/auth" element={<AuthPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/twin" element={<TwinPage />} />
            <Route path="/detective" element={<DetectivePage />} />
            <Route path="/trusted" element={<TrustedPersonsPage />} />
            <Route path="/plan" element={<ContinuityPlanPage />} />
            <Route path="/recovery" element={<RecoveryPage />} />
            <Route path="/legacy" element={<LegacyPage />} />
            <Route path="/timeline" element={<IncapacityTimelinePage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
