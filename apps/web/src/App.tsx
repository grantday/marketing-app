import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './layout/ProtectedRoute';
import AppLayout from './layout/AppLayout';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import OnboardingPage from './pages/OnboardingPage';
import StatusPage from './pages/StatusPage';
import DashboardPage from './pages/DashboardPage';
import SetupPage from './pages/SetupPage';
import ContactsPage from './pages/ContactsPage';
import ListsPage from './pages/ListsPage';
import TemplatesPage from './pages/TemplatesPage';
import CampaignsPage from './pages/CampaignsPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import InboxPage from './pages/InboxPage';
import IntegrationsPage from './pages/IntegrationsPage';
import SettingsPage from './pages/SettingsPage';
import AutomationsPage from './pages/AutomationsPage';
import DeveloperPage from './pages/DeveloperPage';
import ReportsPage from './pages/ReportsPage';
import KnowledgePage from './pages/KnowledgePage';
import BillingPage from './pages/BillingPage';
import HelpPage from './pages/HelpPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/lists" element={<ListsPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
              <Route path="/automations" element={<AutomationsPage />} />
              <Route path="/knowledge" element={<KnowledgePage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/developer" element={<DeveloperPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
