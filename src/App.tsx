import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';
import LoginPage from './features/auth/LoginPage';
import SupervisorDashboard from './features/supervisor/SupervisorDashboard';
import AdminDashboard from './features/admin/AdminDashboard';
import NotFound from './components/NotFound';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { isLoading, isAuthenticated } = useAuth();
  const identity = useQuery(api.users.getCurrentUser);

  if (isLoading) return <LoadingSpinner />;

  if (!isAuthenticated || !identity) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(identity.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}

function SupervisorRoute({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute allowedRoles={['supervisor', 'admin']}>{children}</ProtectedRoute>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute allowedRoles={['admin']}>{children}</ProtectedRoute>;
}

export default function App() {
  const { isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<div className="unauthorized-page">Unauthorized</div>} />
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
        </Route>
        <Route path="/" element={<Navigate to="/supervisor/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}