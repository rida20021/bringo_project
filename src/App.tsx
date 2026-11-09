import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useConvexAuth } from 'convex/react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';
import LoginPage from './features/auth/LoginPage';
import SetupPage from './features/auth/SetupPage';
import SupervisorDashboard from './features/supervisor/SupervisorDashboard';
import SupervisorPage from './features/supervisor/SupervisorPage';
import AdminDashboard from './features/admin/AdminDashboard';
import AdminOverview from './features/admin/AdminOverview';
import MarketsPage from './features/admin/MarketsPage';
import RidersPage from './features/admin/RidersPage';
import RiderDetailPage from './features/admin/RiderDetailPage';
import RiderHome from './features/rider/RiderHome';
import FinancialReportPage from './features/admin/reports/FinancialReportPage';
import ReconciliationPage from './features/admin/reports/ReconciliationPage';
import NotFound from './components/NotFound';

type Role = 'supervisor' | 'admin' | 'rider';

const homeByRole: Record<Role, string> = {
  admin: '/admin/dashboard',
  supervisor: '/supervisor/dashboard',
  rider: '/rider',
};

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: Role[];
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const identity = useQuery(api.users.getCurrentUser);

  if (isLoading || identity === undefined) return <LoadingSpinner />;

  if (!isAuthenticated || identity === null) {
    return <Navigate to="/login" replace />;
  }

  if (!identity.role) {
    return <Navigate to="/setup" replace />;
  }

  if (!allowedRoles.includes(identity.role)) {
    return <Navigate to={homeByRole[identity.role]} replace />;
  }

  return <>{children}</>;
}

function SupervisorRoute({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute allowedRoles={['supervisor']}>{children}</ProtectedRoute>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute allowedRoles={['admin']}>{children}</ProtectedRoute>;
}

function RiderRoute({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute allowedRoles={['rider']}>{children}</ProtectedRoute>;
}

function HomeRedirect() {
  const identity = useQuery(api.users.getCurrentUser);

  if (identity === undefined) return <LoadingSpinner />;
  if (identity === null) return <Navigate to="/login" replace />;
  if (!identity.role) return <Navigate to="/setup" replace />;

  return <Navigate to={homeByRole[identity.role]} replace />;
}

export default function App() {
  const { isLoading } = useConvexAuth();

  if (isLoading) return <LoadingSpinner />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route
        path="/rider"
        element={
          <RiderRoute>
            <RiderHome />
          </RiderRoute>
        }
      />
      <Route path="/unauthorized" element={<div className="notice-page">Accès non autorisé.</div>} />
      <Route element={<Layout />}>
        <Route
          path="/supervisor/*"
          element={
            <SupervisorRoute>
              <Outlet />
            </SupervisorRoute>
          }
        >
          <Route index element={<Navigate to="/supervisor/dashboard" replace />} />
          <Route path="dashboard" element={<SupervisorDashboard />} />
          <Route path="supervision" element={<SupervisorPage />} />
        </Route>
        <Route
          path="/admin/*"
          element={
            <AdminRoute>
              <Outlet />
            </AdminRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="overview" element={<AdminOverview />} />
          <Route path="markets" element={<MarketsPage />} />
          <Route path="riders" element={<RidersPage />} />
          <Route path="riders/:riderId" element={<RiderDetailPage />} />
          <Route path="reports/riders" element={<RidersPage />} />
          <Route path="reports/financials" element={<FinancialReportPage />} />
          <Route path="reports/reconciliation" element={<ReconciliationPage />} />
        </Route>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
