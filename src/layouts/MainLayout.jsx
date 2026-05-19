import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import SplashScreen from '../components/SplashScreen';
import MapView from '../components/MapView';
import { useFeed } from '../features/dashboard/hooks/useFeed';
import { useAuth } from '../context/AuthContext';
import { isCommandEligible } from '../services/postSignal';
import { getApiBaseUrl } from '../services/runtimeConfig';

const MainLayout = ({ user, onLogout, onNavigate, children }) => {
  const { user: currentUser, token } = useAuth();
  const activeUser = currentUser || user;
  const isAuthenticated = Boolean(token && currentUser);
  const isStandaloneCommandRoute = window.location.pathname === '/command';
  const [showSplash, setShowSplash] = useState(true);
  const [isCommandMode, setIsCommandMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [commandMapReports, setCommandMapReports] = useState([]);
  const feed = useFeed('for-you', token);
  const commandReports = feed.reports.filter((report) => isCommandEligible(report));

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadCommandReports = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/map/reports`);
        if (!response.ok) {
          throw new Error(`Map reports failed: ${response.status}`);
        }

        const payload = await response.json();
        const features = payload?.features || [];
        const mappedReports = features.map((feature) => ({
          id: feature.properties?.id,
          category: feature.properties?.category,
          severity: feature.properties?.severity,
          postStatus: feature.properties?.postStatus,
          trustScore: feature.properties?.trustScore,
          aiScore: feature.properties?.aiScore,
          content: feature.properties?.summary || feature.properties?.category || 'Command signal',
          location: {
            lon: feature.geometry?.coordinates?.[0],
            lat: feature.geometry?.coordinates?.[1],
            coordinates: feature.geometry?.coordinates
          }
        }));

        if (!ignore) {
          setCommandMapReports(mappedReports);
        }
      } catch (error) {
        console.warn('Command map reports fallback to feed data:', error);
        if (!ignore) {
          setCommandMapReports([]);
        }
      }
    };

    loadCommandReports();
    const interval = window.setInterval(loadCommandReports, 15000);

    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, [feed.reports.length, token]);

  const handleToggleCommandMode = () => {
    if (isStandaloneCommandRoute) {
      onNavigate('/');
      return;
    }

    onNavigate('/command');
  };

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <div className="flex h-screen">
      {/* Mobile: Sidebar hidden by default, shown when menu is open */}
      <div className="hidden lg:block">
        <Sidebar 
          user={activeUser} 
          isAuthenticated={isAuthenticated}
          onLogout={onLogout} 
          onNavigate={onNavigate}
          onToggleCommandMode={handleToggleCommandMode}
          isMobileMenuOpen={isMobileMenuOpen}
          onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />
      </div>
      
      {/* Mobile Sidebar - Overlay */}
      <div className="lg:hidden">
        <Sidebar 
          user={activeUser} 
          isAuthenticated={isAuthenticated}
          onLogout={onLogout} 
          onNavigate={onNavigate}
          onToggleCommandMode={handleToggleCommandMode}
          isMobileMenuOpen={isMobileMenuOpen}
          onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />
      </div>
      <div className="flex-1 flex flex-col">
        <Navbar
          onNavigate={onNavigate}
          onToggleCommandMode={handleToggleCommandMode}
          isCommandMode={isCommandMode || isStandaloneCommandRoute}
          isMobileMenuOpen={isMobileMenuOpen}
          onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />
        <div className="flex-1 flex overflow-hidden">
          <div className={`transition-all duration-300 overflow-auto ${isCommandMode && !isStandaloneCommandRoute ? 'w-full lg:w-[30%] absolute inset-0 lg:relative z-10 bg-white/90 lg:bg-transparent backdrop-blur-sm lg:backdrop-blur-none' : 'w-full'}`}>
            {React.Children.map(children, child => {
              if (React.isValidElement(child)) {
                // Only pass isCommandMode to components that might need it
                const childName = child.type?.name || typeof child.type;
                const componentsNeedingCommandMode = ['Dashboard', 'CommandCenter', 'MapView'];
                
                if (componentsNeedingCommandMode.includes(childName) && !child.props.isCommandMode) {
                  return React.cloneElement(child, { isCommandMode });
                }
              }
              return child;
            })}
          </div>
          {isCommandMode && !isStandaloneCommandRoute && (
            <div className="w-full lg:w-[70%] h-full min-h-0 flex flex-col bg-gray-900 absolute lg:relative inset-0 z-0 lg:z-10">
              {activeUser ? (
                <MapView reports={commandMapReports.length > 0 ? commandMapReports : commandReports} />
              ) : (
                <div className="p-4 text-center opacity-80">
                  Geospatial command view is locked.
                  <br />
                  Please sign in to access the Sentinel map.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

MainLayout.propTypes = {
  user: PropTypes.object,
  onLogout: PropTypes.func.isRequired,
  onNavigate: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

export default MainLayout;
