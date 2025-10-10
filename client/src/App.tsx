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

function App() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <NavigationBar />
      <Routes>
        <Route path="/" element={<ProjectsList />} />
        <Route path="/stages" element={<AllStagesView />} />
        <Route path="/completed-projects" element={<CompletedProjectsView />} />
        <Route path="/users" element={<UserDashboard />} />
        <Route path="/users-management" element={<UsersManagement />} />
        <Route path="/clients-management" element={<ClientsManagement />} />
        <Route path="/stage-templates" element={<StageTemplatesManagement />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/stages/:id" element={<StageDetail />} />
      </Routes>
    </Box>
  );
}

export default App;
