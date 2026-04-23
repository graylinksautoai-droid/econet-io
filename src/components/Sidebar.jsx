function Sidebar({ user, onLogout, onNavigate, isMobileMenuOpen, onMobileMenuToggle }) {
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    if (onLogout) onLogout();
    else window.location.href = '/login';
  };

  return (
    <>
      {/* Mobile Sidebar - Hidden by default, shown with overlay */}
      <div className={`fixed inset-0 z-50 lg:hidden ${isMobileMenuOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-black/50" onClick={onMobileMenuToggle}></div>
        <div className="fixed left-0 top-0 h-full w-64 min-h-screen relative text-white overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-900 via-emerald-800 to-green-700"></div>
          <div className="absolute inset-0 bg-gradient-to-b from-green-900/70 to-green-800/40"></div>
          <div className="relative z-10 p-6 space-y-10">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">EcoNet</h1>
              <button 
                onClick={onMobileMenuToggle}
                className="text-white/80 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="space-y-5 text-green-100">
              <button onClick={() => onNavigate('/')} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0">Dashboard</button>
              <button onClick={() => onNavigate('/submit')} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0">Report Event</button>
              <button onClick={() => onNavigate('/')} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0">Social Feed</button>
              <button onClick={() => onNavigate('/marketplace')} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0">Marketplace</button>
              <button onClick={() => onNavigate('/amber-alerts')} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0 text-red-300 font-semibold">AMBER Alerts</button>
              {user ? (
                <button onClick={handleLogout} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0">Logout</button>
              ) : (
                <button onClick={() => onNavigate('/login')} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0">Login</button>
              )}
            </nav>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar - Always visible */}
      <div className="hidden lg:block w-64 min-h-screen relative text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-green-900 via-emerald-800 to-green-700"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-green-900/70 to-green-800/40"></div>
        <div className="relative z-10 p-6 space-y-10">
          <h1 className="text-2xl font-bold">EcoNet</h1>
          <nav className="space-y-5 text-green-100">
            <button onClick={() => onNavigate('/')} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0">Dashboard</button>
            <button onClick={() => onNavigate('/submit')} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0">Report Event</button>
            <button onClick={() => onNavigate('/')} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0">Social Feed</button>
            <button onClick={() => onNavigate('/marketplace')} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0">Marketplace</button>
            <button onClick={() => onNavigate('/amber-alerts')} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0 text-red-300 font-semibold">AMBER Alerts</button>
            {user ? (
              <button onClick={handleLogout} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0">Logout</button>
            ) : (
              <button onClick={() => onNavigate('/login')} className="block w-full text-left hover:text-white cursor-pointer bg-transparent border-none p-0">Login</button>
            )}
          </nav>
        </div>
      </div>
    </>
  );
}
export default Sidebar;