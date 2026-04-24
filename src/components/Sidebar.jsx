function Sidebar({ user, isAuthenticated, onLogout, onNavigate, onToggleCommandMode, isMobileMenuOpen, onMobileMenuToggle }) {
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    if (onLogout) onLogout();
    else window.location.href = '/login';
  };

  const Brand = () => (
    <div className="flex items-center gap-3">
      <img src="/econet-logo.jpeg" alt="EcoNet logo" className="h-11 w-11 rounded-2xl object-cover shadow-lg" />
      <div>
        <h1 className="text-2xl font-bold leading-tight">EcoNet</h1>
        <div className="text-xs uppercase tracking-[0.24em] text-green-100/70">Sentinel</div>
      </div>
    </div>
  );

  return (
    <>
      <div className={`fixed inset-0 z-50 lg:hidden ${isMobileMenuOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-black/50" onClick={onMobileMenuToggle}></div>
        <div className="fixed left-0 top-0 relative h-full min-h-screen w-64 overflow-hidden text-white">
          <div className="absolute inset-0 bg-gradient-to-br from-green-900 via-emerald-800 to-green-700"></div>
          <div className="absolute inset-0 bg-gradient-to-b from-green-900/70 to-green-800/40"></div>
          <div className="relative z-10 space-y-10 p-6">
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={onMobileMenuToggle} className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="space-y-5 text-green-100">
              <button onClick={() => { onNavigate('/'); onMobileMenuToggle?.(); }} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left hover:text-white">Dashboard</button>
              <button onClick={() => { onToggleCommandMode?.(); onMobileMenuToggle?.(); }} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left font-semibold text-emerald-200 hover:text-white">Command Mode</button>
              <button onClick={() => { onNavigate('/submit'); onMobileMenuToggle?.(); }} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left hover:text-white">Report Event</button>
              <button onClick={() => { onNavigate('/'); onMobileMenuToggle?.(); }} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left hover:text-white">Social Feed</button>
              <button onClick={() => { onNavigate('/marketplace'); onMobileMenuToggle?.(); }} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left hover:text-white">Marketplace</button>
              <button onClick={() => { onNavigate('/amber-alerts'); onMobileMenuToggle?.(); }} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left font-semibold text-red-300 hover:text-white">AMBER Alerts</button>
              {isAuthenticated ? (
                <button onClick={handleLogout} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left hover:text-white">Logout</button>
              ) : (
                <button onClick={() => { onNavigate('/login'); onMobileMenuToggle?.(); }} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left hover:text-white">Login</button>
              )}
            </nav>
          </div>
        </div>
      </div>

      <div className="relative hidden w-64 min-h-screen overflow-hidden text-white lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-green-900 via-emerald-800 to-green-700"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-green-900/70 to-green-800/40"></div>
        <div className="relative z-10 space-y-10 p-6">
          <Brand />
          <nav className="space-y-5 text-green-100">
            <button onClick={() => onNavigate('/')} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left hover:text-white">Dashboard</button>
            <button onClick={() => onToggleCommandMode?.()} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left font-semibold text-emerald-200 hover:text-white">Command Mode</button>
            <button onClick={() => onNavigate('/submit')} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left hover:text-white">Report Event</button>
            <button onClick={() => onNavigate('/')} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left hover:text-white">Social Feed</button>
            <button onClick={() => onNavigate('/marketplace')} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left hover:text-white">Marketplace</button>
            <button onClick={() => onNavigate('/amber-alerts')} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left font-semibold text-red-300 hover:text-white">AMBER Alerts</button>
            {isAuthenticated ? (
              <button onClick={handleLogout} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left hover:text-white">Logout</button>
            ) : (
              <button onClick={() => onNavigate('/login')} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left hover:text-white">Login</button>
            )}
          </nav>
        </div>
      </div>
    </>
  );
}

export default Sidebar;
