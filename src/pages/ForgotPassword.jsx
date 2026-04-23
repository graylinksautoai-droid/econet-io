import MainLayout from '../layouts/MainLayout';
import { useState } from 'react';

function ForgotPassword({ user, onLogout, onNavigate }) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: Implement actual password reset logic
    setSubmitted(true);
  };

  return (
    <MainLayout user={user} onLogout={onLogout} onNavigate={onNavigate}>
      {/* Background Image with Overlay */}
      <div className="fixed inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1557683316-e3c48f43f8a5?w=1920&h=1080&fit=crop&crop=entropy&auto=format"
          alt="Background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/60"></div>
      </div>

      {/* Forgot Password Form Container */}
      <div className="relative z-10 min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-transparent">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-white drop-shadow-lg">
              Reset your password
            </h2>
          </div>
          {!submitted ? (
            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              <div className="bg-black/30 backdrop-blur-sm p-4 rounded-lg">
                <div>
                  <label htmlFor="email" className="sr-only">Email address</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 focus:z-10 sm:text-sm bg-white/90"
                    placeholder="Enter your email address"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 shadow-lg"
                >
                  Send reset link
                </button>
              </div>
              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => onNavigate('/login')}
                  className="font-medium text-emerald-300 hover:text-emerald-200 drop-shadow"
                >
                  Back to login
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center bg-black/30 backdrop-blur-sm p-6 rounded-lg">
              <p className="text-emerald-300 mb-4 drop-shadow">If an account exists with that email, we've sent a reset link.</p>
              <button
                type="button"
                onClick={() => onNavigate('/login')}
                className="font-medium text-emerald-300 hover:text-emerald-200 drop-shadow underline"
              >
                Return to login
              </button>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

export default ForgotPassword;