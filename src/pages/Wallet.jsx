/**
 * Wallet — /wallet
 *
 * Displays the user's EcoCoin balance, transaction history, and economy info.
 * Balance comes from the authoritative backend ledger (GET /api/economy/balance).
 * Transaction history from GET /api/economy/history.
 *
 * EcoCoins are platform reward credits — they are NOT real money and NOT
 * withdrawable without an approved payout integration. This page makes that
 * clear and never presents EcoCoins as a currency equivalent to cash.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getApiBaseUrl } from '../services/runtimeConfig';

function BalanceCard({ label, value, sub, color = 'var(--eco-green)', icon }) {
  return (
    <div className="p-5 rounded-2xl flex flex-col gap-1"
      style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
      <div className="flex items-center gap-2 mb-1">
        {icon && <span style={{ color }}>{icon}</span>}
        <span className="text-xs font-medium" style={{ color: 'var(--eco-text-muted)' }}>{label}</span>
      </div>
      <span className="text-3xl font-bold" style={{ color }}>
        {value !== null && value !== undefined ? Number(value).toLocaleString() : '—'}
      </span>
      {sub && <span className="text-xs mt-0.5" style={{ color: 'var(--eco-text-muted)' }}>{sub}</span>}
    </div>
  );
}

const TX_TYPE_LABELS = {
  earn_report:    'Report submitted',
  earn_mission:   'Mission completed',
  earn_evidence:  'Evidence submitted',
  earn_daily:     'Daily harvest',
  spend_boost:    'Boost spent',
  admin_adjust:   'Admin adjustment',
};

function TxRow({ tx }) {
  const isCredit = tx.amount > 0;
  const label = TX_TYPE_LABELS[tx.type] || tx.type;
  const date  = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  return (
    <div className="flex items-center justify-between py-3"
      style={{ borderBottom: '1px solid var(--eco-border-soft)' }}>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-white">{label}</span>
        {tx.reason && <span className="text-xs truncate" style={{ color: 'var(--eco-text-muted)' }}>{tx.reason}</span>}
        <span className="text-[10px]" style={{ color: 'var(--eco-text-muted)' }}>{date}</span>
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0 ml-4">
        <span className={`text-sm font-bold ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
          {isCredit ? '+' : ''}{tx.amount.toLocaleString()} EC
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{ background: tx.status === 'completed' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                   color:      tx.status === 'completed' ? 'var(--eco-green)' : '#f87171' }}>
          {tx.status}
        </span>
      </div>
    </div>
  );
}

export default function Wallet({ onNavigate }) {
  const { user, token } = useAuth();
  const base = getApiBaseUrl();

  const [balance, setBalance]   = useState(null);
  const [history, setHistory]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setError('');
    try {
      const [balRes, histRes] = await Promise.all([
        fetch(`${base}/economy/balance`,          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${base}/economy/history?limit=30`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (balRes.ok) {
        const b = await balRes.json();
        setBalance(b);
      } else {
        // DEV_AUTH fallback: use values from auth context
        const rep = user?.reputation || {};
        setBalance({ ecoCoins: rep.ecoCoins || 0, leaves: rep.leaves || 0, seeds: rep.seeds || 0, devMode: true });
      }

      if (histRes.ok) {
        const h = await histRes.json();
        setHistory(h.transactions || []);
      }
    } catch (e) {
      setError('Could not load wallet data. ' + e.message);
      // Fallback to auth context
      const rep = user?.reputation || {};
      setBalance({ ecoCoins: rep.ecoCoins || 0, leaves: rep.leaves || 0, seeds: rep.seeds || 0, offline: true });
    } finally {
      setLoading(false);
    }
  }, [token, base, user]);

  useEffect(() => { load(); }, [load]);

  if (!user) {
    return (
      <div className="eco-page eco-fade-up flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-base font-semibold text-white">Sign in to view your wallet</p>
        <button onClick={() => onNavigate('/login')}
          className="px-5 py-2.5 rounded-xl text-sm font-bold text-black"
          style={{ background: 'var(--eco-green)' }}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="eco-page eco-fade-up w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Wallet</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--eco-text-secondary)' }}>
          Your EcoCoin balance and transaction history.
        </p>
      </div>

      {/* EcoCoin definition notice */}
      <div className="mb-6 px-4 py-3 rounded-xl text-xs"
        style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)', color: 'var(--eco-text-secondary)' }}>
        <strong className="text-white">What are EcoCoins?</strong>{' '}
        EcoCoins (EC) are EcoNet platform reward credits earned by submitting reports, completing missions, and daily activity.
        They are <strong>not real money</strong> and are not currently convertible to cash.
        Seeds are a spendable alias for EcoCoins within the platform.
        Leaves represent reputation — they cannot be spent.
      </div>

      {loading && (
        <div className="flex items-center gap-3 py-12 justify-center" style={{ color: 'var(--eco-text-muted)' }}>
          <div className="w-5 h-5 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
          Loading wallet…
        </div>
      )}

      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
          {error}
          <button onClick={load} className="ml-3 underline text-xs">Retry</button>
        </div>
      )}

      {balance !== null && !loading && (
        <>
          {(balance.devMode || balance.offline) && (
            <div className="mb-4 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
              {balance.devMode ? 'DEV mode — balance is session-only and not persisted to the database.'
                               : 'Showing cached balance — database temporarily unavailable.'}
            </div>
          )}

          {/* Balance cards */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            <BalanceCard
              label="EcoCoins"
              value={balance.ecoCoins}
              sub="Platform credits"
              color="var(--eco-green)"
              icon={
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/>
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/>
                </svg>
              }
            />
            <BalanceCard
              label="Leaves"
              value={balance.leaves}
              sub="Reputation (not spendable)"
              color="var(--eco-teal)"
              icon={
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                </svg>
              }
            />
            <BalanceCard
              label="Seeds"
              value={balance.seeds}
              sub="Spendable credits"
              color="#a78bfa"
              icon={
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
              }
            />
          </div>

          {/* Pending payout note */}
          <div className="mb-8 p-4 rounded-2xl flex items-start gap-3"
            style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--eco-text-muted)' }}>
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
            </svg>
            <div>
              <p className="text-sm font-semibold text-white mb-0.5">Withdrawals</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--eco-text-secondary)' }}>
                EcoCoin withdrawal to a bank account requires an approved payout integration that is not yet configured on this deployment.
                When withdrawals are enabled, eligible earned EcoCoins will appear here with a withdrawal option.
              </p>
            </div>
          </div>

          {/* Transaction history */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white">Transaction history</h2>
              <button onClick={load} className="text-xs transition-opacity hover:opacity-70"
                style={{ color: 'var(--eco-green)' }}>
                Refresh
              </button>
            </div>

            {history.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10 opacity-20">
                  <rect x="4" y="10" width="40" height="28" rx="4" stroke="currentColor" strokeWidth="2"/>
                  <path d="M4 18h40" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 28h8M12 34h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <p className="text-sm" style={{ color: 'var(--eco-text-muted)' }}>
                  No transactions yet. Complete missions or submit reports to earn EcoCoins.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-2xl" style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
                {history.map(tx => <TxRow key={tx._id || tx.idempotencyKey} tx={tx} />)}
              </div>
            )}
          </section>
        </>
      )}

      <div className="mt-6">
        <button onClick={() => onNavigate('/hq')} className="text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--eco-green)' }}>
          ← Back to My HQ
        </button>
      </div>
    </div>
  );
}
