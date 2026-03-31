import Dashboard from "./pages/Dashboard";
import SubmitReport from "./pages/SubmitReport";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Marketplace from "./pages/Marketplace";
import EditProfile from "./pages/EditProfile";
import { useState, useEffect } from "react";
import UnifiedButton from "./components/UnifiedButton";
import SentinelLive from "./components/SentinelLive";

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [user, setUser] = useState(null);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (storedUser) setUser(JSON.parse(storedUser));

    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
      if (window.location.pathname === '/live') {
        setIsLive(true);
      } else {
        setIsLive(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    if (path === '/live') {
      setIsLive(true);
    } else {
      setIsLive(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setUser(null);
    navigate('/login');
  };

  const renderContent = () => {
    if (currentPath === "/login") {
      return <Login user={user} onLogout={handleLogout} onNavigate={navigate} />;
    }

    if (currentPath === "/register") {
      return <Register user={user} onLogout={handleLogout} onNavigate={navigate} />;
    }

    if (currentPath === "/forgot-password") {
      return <ForgotPassword user={user} onLogout={handleLogout} onNavigate={navigate} />;
    }

    if (currentPath === "/submit") {
      return <SubmitReport user={user} onNavigate={navigate} />;
    }

    if (currentPath === "/marketplace") {
      return <Marketplace user={user} onLogout={handleLogout} onNavigate={navigate} />;
    }

    if (currentPath === "/edit-profile") {
      return <EditProfile user={user} onNavigate={navigate} />;
    }

    return <Dashboard user={user} onLogout={handleLogout} onNavigate={navigate} />;
  };

  return (
    <>
      {renderContent()}
      {user && currentPath !== "/login" && currentPath !== "/register" && (
        <UnifiedButton onNavigate={navigate} />
      )}
      {isLive && (
        <SentinelLive 
          user={user} 
          onStop={() => navigate('/')} 
          onNavigate={navigate} 
        />
      )}
    </>
  );
}

export default App;