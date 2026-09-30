/**
 * Dashboard / Social Feed page.
 *
 * Renders the social reports feed inside the new EcoShell chrome.
 * MainLayout is no longer used here — EcoShell provides the nav.
 */
import SocialDashboard from '../components/SocialDashboard';
import DashboardContainer from '../features/dashboard/DashboardContainer';
import { useAuth } from '../context/AuthContext';

export default function Dashboard({ user, onLogout, onNavigate, isCommandMode }) {
  const { user: currentUser } = useAuth();
  const dashboard = DashboardContainer({ user: currentUser || user, onLogout, onNavigate });

  return (
    <div className="eco-page max-w-2xl mx-auto">
      <SocialDashboard
        user={currentUser || user}
        reports={dashboard.feed || []}
        isCommandMode={isCommandMode}
      />
    </div>
  );
}
