import { Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import NavigationBar from './components/NavigationBar';
import LandingPage from './components/LandingPage';
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
import SummaryView from './components/SummaryView';
import LoginPage from './components/LoginPage';
import VerifyEmailPage from './components/VerifyEmailPage';
import ForgotPasswordPage from './components/ForgotPasswordPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import Footer from './components/Footer';
import { ProtectedRoute } from './components/ProtectedRoute';
import AssistantWidget from './components/assistant/AssistantWidget';
import { AssistantDataBusProvider } from './components/assistant/AssistantDataBus';

function App() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AssistantDataBusProvider>
                  <NavigationBar />
                  <Routes>
                    <Route path="/dashboard" element={<ProjectsList />} />
                    <Route path="/stages" element={<AllStagesView />} />
                    <Route path="/completed-projects" element={<CompletedProjectsView />} />
                    <Route path="/paused-projects" element={<PausedProjectsView />} />
                    <Route path="/users" element={<UserDashboard />} />
                    <Route path="/users-management" element={<UsersManagement />} />
                    <Route path="/clients-management" element={<ClientsManagement />} />
                    <Route path="/stage-templates" element={<StageTemplatesManagement />} />
                    <Route path="/summary" element={<SummaryView />} />
                    <Route path="/projects/:id" element={<ProjectDetail />} />
                    <Route path="/stages/:id" element={<StageDetail />} />
                  </Routes>
                  <AssistantWidget />
                </AssistantDataBusProvider>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Box>
      <Footer />
    </Box>
  );
}

export default App;
