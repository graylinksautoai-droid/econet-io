/**
 * Communities — /communities
 *
 * Displays real communities from Engine 16 via GET /api/v2/communities.
 * Supports: browse, create, join, leave, membership state.
 *
 * Data source: canonical Engine 16 Community (MongoDB-backed when connected,
 * in-memory fallback otherwise).
 * Auth: read is public; create/join/leave require a logged-in user.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getV2ApiOrigin } from '../services/runtimeConfig';

// ─── Category images for visual enrichment ────────────────────────────────────
const CATEGORY_IMAGES = {
  'Climate Action':      'https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=400&q=60',
  'Urban Greening':      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=60',
  'Water Conservation':  'https://images.unsplash.com/photo-1504472478235-9bc48ba4d60f?w=400&q=60',
  'Wildlife Protection': 'https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=400&q=60',
  'Renewable Energy':    'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=400&q=60',
  'Ocean Health':        'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=400&q=60',
};
const DEFAULT_IMG = 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400&q=60';

// ─── Community card ───────────────────────────────────────────────────────────

function CommunityCard({ community, membership, onJoin, onLeave, onSelect, joining }) {
  const isActive = membership?.status === 'ACTIVE' || membership?.status === 'PENDING';
  const isPending = membership?.status === 'PENDING';
  const img = CATEGORY_IMAGES[community.name] || DEFAULT_IMG;

  return (
    <div
      className="eco-world-card cursor-pointer group"
      style={{ minHeight: 160 }}
      onClick={() => onSelect(community)}
    >
      <img src={img} alt={community.name} className="eco-world-card-img absolute inset-0" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

      <div className="absolute inset-0 p-4 flex flex-col justify-between">
        {/* Top — member count + visibility */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(34,197,94,0.18)', color: 'var(--eco-green)', border: '1px solid rgba(34,197,94,0.3)' }}>
            {community.visibility}
          </span>
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {community.memberCount ?? 0} member{community.memberCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Bottom — name + description + join */}
        <div>
          <p className="text-sm font-bold text-white leading-tight mb-0.5">{community.name}</p>
          <p className="text-[11px] mb-3 line-clamp-2" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {community.description}
          </p>

          {isActive ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg"
                style={{ background: isPending ? 'rgba(251,191,36,0.18)' : 'rgba(34,197,94,0.18)', color: isPending ? '#fbbf24' : 'var(--eco-green)' }}>
                {isPending ? 'Pending approval' : '✓ Member'}
              </span>
              {!isPending && (
                <button
                  onClick={e => { e.stopPropagation(); onLeave(community.communityId); }}
                  className="text-[10px] px-2 py-1 rounded-lg transition-colors hover:bg-red-500/20"
                  style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  Leave
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onJoin(community.communityId); }}
              disabled={joining === community.communityId}
              className="text-[10px] px-3 py-1.5 rounded-lg font-bold text-black transition-opacity disabled:opacity-50 hover:opacity-90"
              style={{ background: 'var(--eco-green)' }}>
              {joining === community.communityId ? 'Joining…' : 'Join'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateCommunityForm({ onCreated, onCancel, token }) {
  const [name, setName]       = useState('');
  const [desc, setDesc]       = useState('');
  const [vis, setVis]         = useState('PUBLIC');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const cls = "w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-[var(--eco-text-muted)] outline-none";
  const sty = { background: 'var(--eco-bg-elevated)', border: '1px solid var(--eco-border)' };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const v2 = getV2ApiOrigin();
    if (!v2) { setError('Communities require the Render backend. Set VITE_API_URL in the Netlify dashboard.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${v2}/api/v2/communities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), description: desc.trim(), visibility: vis }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create community'); return; }
      onCreated(data.community);
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(5,10,18,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md p-6 rounded-[var(--eco-radius-card)]"
        style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border)' }}>
        <h2 className="text-lg font-bold text-white mb-5">Create community</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--eco-text-secondary)' }}>
              Community name *
            </label>
            <input required value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Lagos River Watch" className={cls} style={sty} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--eco-text-secondary)' }}>
              Description *
            </label>
            <textarea required value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="What is this community about?" rows={3}
              className={`${cls} resize-none`} style={sty} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--eco-text-secondary)' }}>
              Visibility
            </label>
            <select value={vis} onChange={e => setVis(e.target.value)}
              className={`${cls}`} style={sty}>
              <option value="PUBLIC">Public — anyone can find and join</option>
              <option value="PRIVATE">Private — members only</option>
            </select>
          </div>
          {error && (
            <div className="px-3 py-2 rounded-lg text-sm text-red-300"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
              {error}
            </div>
          )}
          <div className="flex gap-3 mt-2">
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50 hover:opacity-90"
              style={{ background: 'var(--eco-green)' }}>
              {loading ? 'Creating…' : 'Create community'}
            </button>
            <button type="button" onClick={onCancel}
              className="px-4 py-2.5 rounded-xl text-sm transition-colors hover:bg-white/5"
              style={{ border: '1px solid var(--eco-border)', color: 'var(--eco-text-secondary)' }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function CommunityDetail({ community, membership, onJoin, onLeave, onClose, joining }) {
  const isActive  = membership?.status === 'ACTIVE';
  const isPending = membership?.status === 'PENDING';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(5,10,18,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg rounded-[var(--eco-radius-card)] overflow-hidden"
        style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border)' }}>
        {/* Header image */}
        <div className="relative h-32 overflow-hidden">
          <img src={CATEGORY_IMAGES[community.name] || DEFAULT_IMG}
            className="w-full h-full object-cover opacity-50" alt="" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--eco-bg-surface)] to-transparent" />
          <button onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-white transition-colors hover:bg-white/20"
            style={{ background: 'rgba(0,0,0,0.4)' }}>
            ✕
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-white">{community.name}</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--eco-green)', border: '1px solid rgba(34,197,94,0.25)' }}>
                {community.visibility}
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--eco-text-secondary)' }}>
              {community.description}
            </p>
          </div>

          <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--eco-text-muted)' }}>
            <span>{community.memberCount ?? 0} member{community.memberCount !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span>{community.status}</span>
          </div>

          {isActive ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold" style={{ color: 'var(--eco-green)' }}>✓ You are a member</span>
              <button onClick={() => onLeave(community.communityId)}
                className="ml-auto text-sm px-4 py-2 rounded-xl transition-colors hover:bg-red-500/15"
                style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                Leave
              </button>
            </div>
          ) : isPending ? (
            <span className="text-sm font-semibold" style={{ color: '#fbbf24' }}>⏳ Membership pending approval</span>
          ) : (
            <button onClick={() => onJoin(community.communityId)} disabled={joining === community.communityId}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50 hover:opacity-90"
              style={{ background: 'var(--eco-green)' }}>
              {joining === community.communityId ? 'Joining…' : 'Join this community'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Communities({ onNavigate }) {
  const { user, token } = useAuth();

  const [communities, setCommunities] = useState([]);
  const [memberships, setMemberships] = useState({}); // communityId → membership
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [joining, setJoining]   = useState(null); // communityId being joined

  const v2 = getV2ApiOrigin();

  // Load communities
  const loadCommunities = useCallback(async () => {
    if (!v2) {
      setError('Communities require the Render backend. Set VITE_API_URL in the Netlify dashboard to your Render backend URL.');
      setLoading(false);
      return;
    }
    setError('');
    try {
      const res = await fetch(`${v2}/api/v2/communities`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Defensive: never hand a non-array to the renderer. A malformed or
      // error-shaped response must show an actionable error, not crash the page.
      const list = data?.communities;
      if (!Array.isArray(list)) throw new Error('Unexpected response shape from the community API.');
      setCommunities(list.filter((c) => c && typeof c === 'object'));
    } catch (e) {
      setCommunities([]);
      setError('Could not load communities. ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [v2]);

  useEffect(() => { loadCommunities(); }, [loadCommunities]);

  // Load current user's memberships for all visible communities
  useEffect(() => {
    if (!token || !v2 || communities.length === 0) return;
    const load = async () => {
      const entries = await Promise.all(
        communities.map(async (c) => {
          try {
            const res = await fetch(`${v2}/api/v2/communities/${c.communityId}/membership`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return [c.communityId, null];
            const data = await res.json();
            return [c.communityId, data?.membership ?? null];
          } catch { return [c.communityId, null]; }
        })
      );
      setMemberships(Object.fromEntries(entries));
    };
    load();
  }, [token, v2, communities]);

  const handleJoin = async (communityId) => {
    if (!token) { onNavigate('/login'); return; }
    setJoining(communityId);
    try {
      const res = await fetch(`${v2}/api/v2/communities/${communityId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        setMemberships(prev => ({ ...prev, [communityId]: data.membership }));
        // Update member count optimistically
        setCommunities(prev => prev.map(c =>
          c.communityId === communityId ? { ...c, memberCount: (c.memberCount || 0) + 1 } : c
        ));
      }
    } catch { /* network error — user can retry */ }
    finally { setJoining(null); }
  };

  const handleLeave = async (communityId) => {
    if (!token) return;
    try {
      const res = await fetch(`${v2}/api/v2/communities/${communityId}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        setMemberships(prev => ({ ...prev, [communityId]: null }));
        setCommunities(prev => prev.map(c =>
          c.communityId === communityId ? { ...c, memberCount: Math.max(0, (c.memberCount || 1) - 1) } : c
        ));
        if (selected?.communityId === communityId) setSelected(null);
      }
    } catch { /* ignore */ }
  };

  const handleCreated = (community) => {
    setShowCreate(false);
    if (!community || !community.communityId) {
      setError('The community was not created — the server returned no community record. Nothing was added.');
      return;
    }
    setCommunities(prev => [{ ...community, memberCount: community.memberCount ?? 1 }, ...prev]);
    setMemberships(prev => ({ ...prev, [community.communityId]: { status: 'ACTIVE', role: 'OWNER' } }));
  };

  return (
    <div className="eco-page eco-fade-up w-full">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Communities</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--eco-text-secondary)' }}>
            Join or create communities around shared environmental causes.
          </p>
        </div>
        <button
          onClick={() => user ? setShowCreate(true) : onNavigate('/login')}
          className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-black transition-opacity hover:opacity-80 ml-4"
          style={{ background: 'var(--eco-green)' }}>
          + Create
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="eco-world-card animate-pulse" style={{ minHeight: 160 }}>
              <div className="absolute inset-0 rounded-[var(--eco-radius-card)]"
                style={{ background: 'var(--eco-bg-elevated)' }} />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="px-4 py-3 rounded-xl text-sm mb-6"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
          {error}
          <button onClick={loadCommunities} className="ml-3 underline text-xs">Retry</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && communities.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="text-5xl">🌍</div>
          <p className="text-base font-semibold text-white">No communities yet</p>
          <p className="text-sm" style={{ color: 'var(--eco-text-secondary)' }}>
            Be the first to create a community around an environmental cause.
          </p>
          <button onClick={() => user ? setShowCreate(true) : onNavigate('/login')}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-black hover:opacity-90"
            style={{ background: 'var(--eco-green)' }}>
            Create the first community
          </button>
        </div>
      )}

      {/* Community grid */}
      {!loading && communities.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {communities.map(c => (
            <CommunityCard
              key={c.communityId}
              community={c}
              membership={memberships[c.communityId]}
              onJoin={handleJoin}
              onLeave={handleLeave}
              onSelect={setSelected}
              joining={joining}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateCommunityForm
          token={token}
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {selected && (
        <CommunityDetail
          community={selected}
          membership={memberships[selected.communityId]}
          onJoin={handleJoin}
          onLeave={handleLeave}
          onClose={() => setSelected(null)}
          joining={joining}
        />
      )}
    </div>
  );
}
