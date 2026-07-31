import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { TenantLayout } from './components/TenantLayout';
import { ProtectedAdmin, ProtectedTenant } from './components/guards';

import PlatformHome from './pages/PlatformHome';
import AdminOverview from './pages/admin/AdminOverview';
import AdminTenantsPage from './pages/admin/AdminTenantsPage';
import AdminTenantDetail from './pages/admin/AdminTenantDetail';
import AdminUsers from './pages/admin/AdminUsers';
import AdminMonitoring from './pages/admin/AdminMonitoring';
import AdminAiUsage from './pages/admin/AdminAiUsage';
import AdminPayments from './pages/admin/AdminPayments';
import AdminAudit from './pages/admin/AdminAudit';

import TenantLanding from './pages/TenantLanding';
import TenantRegister from './pages/TenantRegister';
import StudentInvite from './pages/StudentInvite';

import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import ClassDetail from './pages/ClassDetail';
import ClassDashboard from './pages/class/ClassDashboard';
import ClassSection from './pages/class/ClassSection';
import MaterialViewer from './pages/MaterialViewer';
import QuizRunner from './pages/QuizRunner';
import QuizResult from './pages/QuizResult';
import Payments from './pages/Payments';
import Videos from './pages/Videos';
import Notices from './pages/Notices';
import Events from './pages/Events';
import Students from './pages/Students';
import Teachers from './pages/Teachers';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Attendance from './pages/Attendance';
import LiveClass from './pages/LiveClass';
import AiStudentArea from './pages/AiStudentArea';
import AiTeacherCopilot from './pages/AiTeacherCopilot';
import InterventionTimeline from './pages/InterventionTimeline';
import ParentTrustCenter from './pages/ParentTrustCenter';
import Chat from './pages/Chat';

export default function App() {
  return (
    <Routes>
      {/* Single, unified server login. */}
      <Route path="/login" element={<PlatformHome />} />
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Platform super-admin */}
      <Route
        path="/admin"
        element={
          <ProtectedAdmin>
            <AdminLayout />
          </ProtectedAdmin>
        }
      >
        <Route index element={<AdminOverview />} />
        <Route path="tenants" element={<AdminTenantsPage />} />
        <Route path="tenants/:id" element={<AdminTenantDetail />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="monitoring" element={<AdminMonitoring />} />
        <Route path="ai" element={<AdminAiUsage />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      {/* Tenant space: /:slug (public) and /:slug/... (authenticated app) */}
      <Route path="/:slug">
        <Route index element={<TenantLanding />} />
        <Route path="register" element={<TenantRegister />} />
        <Route path="invite/:token" element={<StudentInvite />} />
        <Route path="parent" element={<ParentTrustCenter />} />

        <Route
          element={
            <ProtectedTenant>
              <TenantLayout />
            </ProtectedTenant>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="classes" element={<Classes />} />
          <Route path="classes/:classId" element={<ClassDetail />}>
            <Route index element={<ClassDashboard />} />
            <Route path=":section" element={<ClassSection />} />
          </Route>
          <Route path="materials/:materialId" element={<MaterialViewer />} />
          <Route path="quizzes/:quizId/take" element={<QuizRunner />} />
          <Route path="attempts/:attemptId/result" element={<QuizResult />} />
          <Route
            path="students"
            element={
              <ProtectedTenant roles={['admin', 'teacher']}>
                <Students />
              </ProtectedTenant>
            }
          />
          <Route
            path="teachers"
            element={
              <ProtectedTenant roles={['admin']}>
                <Teachers />
              </ProtectedTenant>
            }
          />
          <Route path="payments" element={<Payments />} />
          <Route path="profile" element={<Profile />} />
          <Route path="videos" element={<Videos />} />
          <Route path="notices" element={<Notices />} />
          <Route path="events" element={<Events />} />
          <Route
            path="attendance"
            element={
              <ProtectedTenant roles={['admin', 'teacher']}>
                <Attendance />
              </ProtectedTenant>
            }
          />
          <Route path="live" element={<LiveClass />} />
          <Route
            path="chat"
            element={
              <ProtectedTenant roles={['admin', 'teacher', 'student']}>
                <Chat />
              </ProtectedTenant>
            }
          />
          <Route
            path="ai"
            element={
              <ProtectedTenant roles={['student']}>
                <AiStudentArea />
              </ProtectedTenant>
            }
          />
          <Route
            path="ai-copilot"
            element={
              <ProtectedTenant roles={['admin', 'teacher']}>
                <AiTeacherCopilot />
              </ProtectedTenant>
            }
          />
          <Route
            path="interventions"
            element={
              <ProtectedTenant roles={['admin', 'teacher']}>
                <InterventionTimeline />
              </ProtectedTenant>
            }
          />
          <Route
            path="settings"
            element={
              <ProtectedTenant roles={['admin']}>
                <Settings />
              </ProtectedTenant>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
