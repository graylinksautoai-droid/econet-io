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
import ClimatePost from './components/ClimatePost';

const dummyPosts = [
  {
    id: 1,
    urgency: 'low',
    message: 'Rainfall expected in Lagos, bring your umbrellas!',
    location: 'Lagos',
    timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
  },
  {
    id: 2,
    urgency: 'medium',
    message: 'Heatwave warning issued for Kano. Stay hydrated!',
    location: 'Kano',
    timestamp: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
  },
  {
    id: 3,
    urgency: 'high',
    message: 'Flash flood alert in Abuja. Seek higher ground immediately!',
    location: 'Abuja',
    timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  },
];

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
      {/* Social Media Feed Section */}
      {currentPath !== "/login" && currentPath !== "/register" && currentPath !== "/forgot-password" && (
        <main className="p-4">
          <div className="glass-ui max-w-md mx-auto">
            {dummyPosts.map((post) => (
              <ClimatePost
                key={post.id}
                urgency={post.urgency}
                message={post.message}
                location={post.location}
                timestamp={post.timestamp}
              />
            ))}
          </div>
        </main>
      )}
    </>
  );
}

export default App;
