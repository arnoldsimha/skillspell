import { useAuth } from '../../hooks/useAuth.js';
import { Navigate } from 'react-router';

interface Props {
  children: React.ReactNode;
}

/**
 * Route guard that redirects to /skills if marketplace is disabled.
 */
export default function MarketplaceRouteGuard({ children }: Props) {
  const { organization } = useAuth();
  const marketplaceEnabled = organization?.marketplaceEnabled ?? true;

  if (!marketplaceEnabled) {
    return <Navigate to="/skills" replace />;
  }

  return children as React.ReactElement;
}
