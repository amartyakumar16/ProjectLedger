import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStore } from './store/Store.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import ProjectWorkspace from './pages/ProjectWorkspace.jsx';
import Expenses from './pages/Expenses.jsx';
import DailyUpdate from './pages/DailyUpdate.jsx';
import WorkerProgress from './pages/WorkerProgress.jsx';
import PdfToExcel from './pages/PdfToExcel.jsx';
import ClosedRequests from './pages/ClosedRequests.jsx';
import Funding from './pages/Funding.jsx';
import FundingDetail from './pages/FundingDetail.jsx';
import FundingComposer from './pages/FundingComposer.jsx';
import Approvals from './pages/Approvals.jsx';
import People from './pages/People.jsx';
import Payroll from './pages/Payroll.jsx';
import Reports from './pages/Reports.jsx';
import Notifications from './pages/Notifications.jsx';
import Audit from './pages/Audit.jsx';
import Admin from './pages/Admin.jsx';
import Search from './pages/Search.jsx';
//import search from './excel/search.jsx';

export default function App() {
  const { user } = useStore();
  const location = useLocation();
  if (!user || location.pathname === '/login') return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectWorkspace />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="daily-update" element={<DailyUpdate />} />
        <Route path="worker-progress" element={<WorkerProgress />} />
        <Route path="pdf-to-excel" element={<PdfToExcel />} />
        <Route path="closed-requests" element={<ClosedRequests />} />
        <Route path="funding" element={<Funding />} />
        <Route path="funding/new" element={<FundingComposer />} />
        <Route path="funding/:id/edit" element={<FundingComposer />} />
        <Route path="funding/:id" element={<FundingDetail />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="people" element={<People />} />
        <Route path="payroll" element={<Payroll />} />
        <Route path="reports" element={<Reports />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="audit" element={<Audit />} />
        <Route path="admin" element={<Admin />} />
        <Route path="search" element={<Search />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
