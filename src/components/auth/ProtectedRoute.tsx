import { Navigate, Outlet } from 'react-router-dom';
import { Auth } from '@/services/griefcart-client';

export function ProtectedRoute() {
  return Auth.isAuthenticated() ? <Outlet /> : <Navigate to="/auth" replace />;
}

export function PublicRoute() {
  return Auth.isAuthenticated() ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
