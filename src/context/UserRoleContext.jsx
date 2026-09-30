/**
 * UserRoleContext — persists the user's EcoNet role selection.
 *
 * Roles:
 *   grinder — participates in missions, earns XP/EcoCoins
 *   whale   — creates/funds missions, discovers opportunities
 *   null    — not yet selected (triggers onboarding on first visit)
 *
 * The role is stored in localStorage so it survives page refreshes.
 * It is cleared on logout so returning users must choose again.
 */

import { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEY = 'econet_user_role';

const UserRoleContext = createContext(null);

export function UserRoleProvider({ children }) {
  const [role, setRoleState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || null; }
    catch { return null; }
  });

  const setRole = useCallback((newRole) => {
    setRoleState(newRole);
    try {
      if (newRole) localStorage.setItem(STORAGE_KEY, newRole);
      else         localStorage.removeItem(STORAGE_KEY);
    } catch { /* storage unavailable */ }
  }, []);

  const clearRole = useCallback(() => setRole(null), [setRole]);

  return (
    <UserRoleContext.Provider value={{ role, setRole, clearRole }}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  const ctx = useContext(UserRoleContext);
  if (!ctx) throw new Error('useUserRole must be used inside UserRoleProvider');
  return ctx;
}
