import { Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import NavigationBar from './components/NavigationBar';
import ProjectsList from './components/ProjectsList';
import UsersManagement from './components/UsersManagement';
import UserDashboard from './components/UserDashboard';
import ProjectDetail from './components/ProjectDetail';
import StageDetail from './components/StageDetail';
import ClientsManagement from './components/ClientsManagement';
import StageTemplatesManagement from './components/StageTemplatesManagement';
import AllStagesView from './components/AllStagesView';
import CompletedProjectsView from './components/CompletedProjectsView';
import PausedProjectsView from './components/PausedProjectsView';
import AuditLogsView from './components/AuditLogsView';
import LoginPage from './components/LoginPage';
import VerifyEmailPage from './components/VerifyEmailPage';
import ForgotPasswordPage from './components/ForgotPasswordPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <NavigationBar />
              <Routes>
                <Route path="/" element={<ProjectsList />} />
                <Route path="/stages" element={<AllStagesView />} />
                <Route path="/completed-projects" element={<CompletedProjectsView />} />
                <Route path="/paused-projects" element={<PausedProjectsView />} />
                <Route path="/users" element={<UserDashboard />} />
                <Route path="/users-management" element={<UsersManagement />} />
                <Route path="/clients-management" element={<ClientsManagement />} />
                <Route path="/stage-templates" element={<StageTemplatesManagement />} />
                <Route path="/audit-logs" element={<AuditLogsView />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/stages/:id" element={<StageDetail />} />
              </Routes>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Box>
  );
}

export default App;
