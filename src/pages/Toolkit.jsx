/**
 * Toolkit — /toolkit
 *
 * Grinder inventory and tool management.
 * Every eligible Grinder receives 3 free inventory slots.
 * Tool ownership and requests persist in the database.
 *
 * Current status: Tool catalog and request routes are not yet
 * configured on the backend. This page shows the inventory
 * foundation and connects to the economy + profile context.
 */
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const FREE_SLOTS = 3;

const TOOL_CATALOG = [
  { id: 'gloves',         name: 'Heavy-duty gloves',         category: 'Safety',     desc: 'Puncture-resistant gloves for debris handling.', availableFromPlatform: true },
  { id: 'trash-bags',     name: 'Biodegradable trash bags',   category: 'Cleanup',    desc: 'Pack of 20 large bags for waste collection.', availableFromPlatform: true },
  { id: 'gps-device',     name: 'GPS field device',           category: 'Monitoring', desc: 'Handheld GPS with 12h battery. Required for geo-tagged evidence.', availableFromPlatform: false },
  { id: 'soil-sampler',   name: 'Soil sample kit',            category: 'Monitoring', desc: 'Collects soil samples for environmental analysis.', availableFromPlatform: false },
  { id: 'water-tester',   name: 'Water quality test strips',  category: 'Monitoring', desc: '50-strip pack for pH, nitrates, and heavy metals.', availableFromPlatform: true },
  { id: 'safety-vest',    name: 'High-visibility vest',       category: 'Safety',     desc: 'Required for road-side or high-traffic missions.', availableFromPlatform: true },
];

function ToolCard({ tool, onRequest }) {
  return (
    <div className="p-4 rounded-2xl flex flex-col gap-2"
      style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{tool.name}</p>
          <span className="text-[10px] px-2 py-0.5 rounded-full mt-0.5 inline-block"
            style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--eco-green)' }}>
            {tool.category}
          </span>
        </div>
        {tool.availableFromPlatform ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>
            Platform supply
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(148,163,184,0.1)', color: 'var(--eco-text-muted)' }}>
            Bring own
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--eco-text-secondary)' }}>
        {tool.desc}
      </p>
      {tool.availableFromPlatform && (
        <button onClick={() => onRequest(tool)}
          className="mt-1 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors hover:opacity-80"
          style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }}>
          Request for mission
        </button>
      )}
    </div>
  );
}

export default function Toolkit({ onNavigate }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [flash, setFlash]       = useState('');

  const ownedItems = user?.toolkit || []; // future: fetched from backend
  const usedSlots  = ownedItems.length;
  const freeSlots  = Math.max(0, FREE_SLOTS - usedSlots);

  const handleRequest = (tool) => {
    // Tool request API is not yet configured — show honest pending state
    const already = requests.find(r => r.id === tool.id);
    if (already) { setFlash(`${tool.name} already requested.`); return; }
    setRequests(prev => [...prev, { ...tool, status: 'PENDING', requestedAt: new Date().toISOString() }]);
    setFlash(`${tool.name} request recorded. Platform fulfillment is not yet active on this deployment — your request will be reviewed when the service is configured.`);
    setTimeout(() => setFlash(''), 6000);
  };

  if (!user) {
    return (
      <div className="eco-page eco-fade-up flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-base font-semibold text-white">Sign in to access your toolkit</p>
        <button onClick={() => onNavigate('/login')} className="px-5 py-2.5 rounded-xl text-sm font-bold text-black" style={{ background: 'var(--eco-green)' }}>Sign in</button>
      </div>
    );
  }

  return (
    <div className="eco-page eco-fade-up w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Toolkit</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--eco-text-secondary)' }}>
          Your inventory and tool management for field missions.
        </p>
      </div>

      {flash && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}>
          {flash}
        </div>
      )}

      {/* Inventory slots */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--eco-text-secondary)' }}>
          Inventory capacity
        </h2>
        <div className="p-5 rounded-2xl flex items-center gap-6"
          style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
          <div className="flex gap-2">
            {Array.from({ length: FREE_SLOTS }).map((_, i) => (
              <div key={i} className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: i < usedSlots ? 'rgba(34,197,94,0.15)' : 'var(--eco-bg-elevated)',
                  border: `1px solid ${i < usedSlots ? 'rgba(34,197,94,0.35)' : 'var(--eco-border)'}`,
                }}>
                {i < usedSlots
                  ? <svg viewBox="0 0 16 16" fill="var(--eco-green)" className="w-4 h-4"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.5 6.5l-4 4a.75.75 0 01-1.06 0l-2-2a.75.75 0 011.06-1.06L7 8.94l3.44-3.44a.75.75 0 011.06 1.06z"/></svg>
                  : <span className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>{i + 1}</span>
                }
              </div>
            ))}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{usedSlots} / {FREE_SLOTS} slots used</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--eco-text-muted)' }}>
              {freeSlots > 0 ? `${freeSlots} free slot${freeSlots !== 1 ? 's' : ''} remaining.` : 'All free slots used.'}
              {' '}Additional storage can be purchased (not yet available).
            </p>
          </div>
        </div>
      </section>

      {/* Owned items */}
      {ownedItems.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--eco-text-secondary)' }}>Your tools</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ownedItems.map(item => (
              <div key={item.id} className="p-4 rounded-2xl"
                style={{ background: 'var(--eco-bg-surface)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <p className="text-sm font-semibold text-white">{item.name}</p>
                <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>Qty: {item.quantity ?? 1}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {ownedItems.length === 0 && (
        <div className="mb-8 flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm font-semibold text-white">No tools in inventory yet</p>
          <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>
            Request tools from the catalog below to add them to your inventory when fulfillment is active.
          </p>
        </div>
      )}

      {/* Pending requests */}
      {requests.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--eco-text-secondary)' }}>Pending requests</h2>
          <div className="flex flex-col gap-2">
            {requests.map(r => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 rounded-xl"
                style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
                <span className="text-sm text-white">{r.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs mt-2 italic" style={{ color: 'var(--eco-text-muted)' }}>
            Requests are pending platform fulfillment configuration. No tool has been reserved or charged.
          </p>
        </section>
      )}

      {/* Tool catalog */}
      <section>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--eco-text-secondary)' }}>Tool catalog</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TOOL_CATALOG.map(tool => <ToolCard key={tool.id} tool={tool} onRequest={handleRequest} />)}
        </div>
      </section>

      <div className="mt-6">
        <button onClick={() => onNavigate('/hq')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'var(--eco-green)' }}>
          ← Back to My HQ
        </button>
      </div>
    </div>
  );
}
