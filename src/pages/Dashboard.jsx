import React, { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import SocialDashboard from '../components/SocialDashboard';
import DashboardContainer from '../features/dashboard/DashboardContainer';
import { useAuth } from '../context/AuthContext';

/**
 * Dashboard Page - Social Media Style Interface
 * Uses SocialDashboard component for Twitter/LinkedIn-style UI
 */
function Dashboard({ user, onLogout, onNavigate, isCommandMode }) {
  const { user: currentUser } = useAuth(); // Get real-time user updates
  const dashboard = DashboardContainer({ user: currentUser || user, onLogout, onNavigate });

  return (
    <MainLayout user={user} onLogout={onLogout} onNavigate={onNavigate}>
      <SocialDashboard 
        user={currentUser || user} 
        reports={dashboard.feed || []}
        isCommandMode={isCommandMode}
      />
    </MainLayout>
  );
}

export default Dashboard;
