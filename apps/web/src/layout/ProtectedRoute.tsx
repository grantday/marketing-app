import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const ONBOARDING_EXEMPT = ['/onboarding', '/setup', '/verify-email'];

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="content">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  const needsOnboarding = user.onboarding && !user.onboarding.completed && !user.onboardingCompleted;
  const exempt = ONBOARDING_EXEMPT.some((p) => location.pathname.startsWith(p));

  if (needsOnboarding && !exempt) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
