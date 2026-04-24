import { useState, useEffect } from "react";
import { useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { RegionalProvider } from "./context/RegionalContext.jsx";
// Pages
import Dashboard from "./pages/Dashboard";
import SubmitReport from "./pages/SubmitReport";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Marketplace from "./pages/Marketplace";
import EditProfile from "./pages/EditProfile";
import Profile from "./pages/Profile";
import CommandCenter from "./pages/CommandCenter";
import AmberAlerts from "./pages/AmberAlerts"; 
// Layout
import MainLayout from "./layouts/MainLayout";
// Components
import UnifiedButton from "./components/UnifiedButton";
import SentinelLive from "./components/SentinelLive";

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isLive, setIsLive] = useState(false);
  const { user, logout } = useAuth();

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
      setIsLive(window.location.pathname === '/live');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    setIsLive(path === '/live');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderContent = () => {
    switch (currentPath) {
      case "/command":
        return (
          <MainLayout user={user} onLogout={handleLogout} onNavigate={navigate}>
            <CommandCenter user={user} onLogout={handleLogout} onNavigate={navigate} />
          </MainLayout>
        );
      case "/login":
        return <Login user={user} onLogout={handleLogout} onNavigate={navigate} />;
      case "/register":
        return <Register user={user} onLogout={handleLogout} onNavigate={navigate} />;
      case "/forgot-password":
        return <ForgotPassword user={user} onLogout={handleLogout} onNavigate={navigate} />;
      case "/submit":
        return <SubmitReport user={user} onNavigate={navigate} />;
      case "/marketplace":
        return <Marketplace user={user} onLogout={handleLogout} onNavigate={navigate} />;
      case "/edit-profile":
        return <EditProfile user={user} onNavigate={navigate} />;
      case "/profile":
        return <Profile user={user} onLogout={handleLogout} onNavigate={navigate} />;
      case "/amber-alerts":
        return <AmberAlerts user={user} onLogout={handleLogout} onNavigate={navigate} />;
      default:
        return <Dashboard user={user} onLogout={handleLogout} onNavigate={navigate} isCommandMode={false} />;
    }
  };

  const isAuthPage = ["/login", "/register", "/forgot-password"].includes(currentPath);
  const isCommandPage = currentPath === "/command";

  return (
    <ThemeProvider>
      <RegionalProvider>
        <div className="min-h-screen bg-primary">
          {renderContent()}

      {user && !isAuthPage && !isCommandPage && (
        <UnifiedButton onNavigate={navigate} />
      )}

      {isLive && (
        <SentinelLive user={user} onStop={() => navigate('/')} onNavigate={navigate} />
      )}
        </div>
      </RegionalProvider>
    </ThemeProvider>
  );
}

export default App;
