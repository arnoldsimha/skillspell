import { Navigate, Outlet } from 'react-router';
import { useHasRole } from '../../hooks/useHasRole.js';

export default function AdminRoute() {
  const isAdmin = useHasRole('admin');

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
