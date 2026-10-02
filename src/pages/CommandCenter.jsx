/**
 * CommandCenter — /command
 *
 * Shows the canonical mission engine data.
 * For Grinders: MissionMap with all active missions.
 * For Whales: Mission Studio (create/manage) + active missions list.
 *
 * Data: GET /api/v2/missions (canonical Engine 11, read-only)
 * Create: POST /api/v2/missions (requires auth, role: mission_lead/admin/system/whale)
 * Activate: POST /api/v2/missions/:id/activate
 *
 * Empty state: shown when backend returns [] — NOT an error.
 * Error state: shown when backend is unreachable.
 * Dev fixture: only when VITE_ENABLE_MOCK_MISSIONS=true AND API unreachable.
 */

import { useEffect, useRef, useState } from 'react';
import MissionMap from '../components/MissionMap.jsx';
import { getV2ApiOrigin } from '../services/runtimeConfig.js';
import { useUserRole } from '../context/UserRoleContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const DEV_FIXTURE_MISSIONS = import.meta.env.VITE_ENABLE_MOCK_MISSIONS === 'true'
  ? [
      {
        Mission_ID: 'DEV-FIXTURE-01',
        Title: '[Dev] Clean Jabi Lake Shoreline',
        Objective: 'Development fixture — not a real mission.',
        Reward_Points: 42,
        Geofence_Radius: 650,
        LILO_Status: 'Active',
        coordinates: [7.3975, 9.0814],
        category: 'Environmental Restoration',
        slots: '15 / 20 Slots',
        icon: 'leaf',
        region: 'Abuja'
      }
    ]
  : null;

// ── Mission Studio — Whale creates a mission ──────────────────────────────────
// Full operational mission creation with location, dates, participants,
// required tools, budget, safety, and evidence requirements.

function MissionStudio({ onMissionCreated, onNavigate }) {
  const { token } = useAuth();

  const searchParams = new URLSearchParams(window.location.search);
  const prefillTitle    = searchParams.get('title') || '';
  const prefillDesc     = searchParams.get('description') || '';
  const prefillLocation = searchParams.get('location') || '';
  const prefillPriority = searchParams.get('priority') || 'MEDIUM';
  const prefillOppId    = searchParams.get('oppId') || '';

  const [form, setForm] = useState({
    // Identity
    title:       prefillTitle,
    description: prefillDesc,
    priority:    prefillPriority,
    type:        'cleanup',
    objective:   '',
    // Location & schedule
    region:      prefillLocation,
    city:        '',
    coordinates: '',
    startDate:   '',
    endDate:     '',
    durationDays: '',
    // Team
    participantsMin: '',
    participantsMax: '',
    coordinator:     '',
    // Tools (free-text list, comma separated)
    requiredTools:   '',
    // Budget
    budgetTotal:    '',
    budgetReward:   '',
    budgetCurrency: 'NGN',
    // Safety / evidence
    safetyNotes:    '',
    evidenceRequired: '',
    completionCriteria: '',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState(null);
  const [step, setStep]     = useState(0); // 0=identity, 1=location, 2=team, 3=budget, 4=safety

  const steps = ['Identity', 'Location & Schedule', 'Team & Tools', 'Budget', 'Safety & Evidence'];

  const upd = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl text-sm text-white placeholder:text-[var(--eco-text-muted)] outline-none";
  const inputSty = { background: 'var(--eco-bg-elevated)', border: '1px solid var(--eco-border)' };
  const labelCls = "block text-xs font-medium mb-1.5";
  const labelSty = { color: 'var(--eco-text-secondary)' };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(null);
    if (!form.title.trim() || !form.description.trim()) {
      setError('Title and description are required.');
      return;
    }
    setCreating(true);
    const v2 = getV2ApiOrigin();
    if (!v2) { setError('Mission API is not available on this deployment.'); setCreating(false); return; }

    // Parse coordinates if provided (format: "lng,lat")
    let coordinates = undefined;
    if (form.coordinates.trim()) {
      const parts = form.coordinates.split(',').map(s => parseFloat(s.trim()));
      if (parts.length === 2 && parts.every(Number.isFinite)) coordinates = parts;
    }

    // Build objectives from evidence required
    const objectives = form.evidenceRequired.trim()
      ? [{ description: form.evidenceRequired.trim() }]
      : [];

    try {
      const res = await fetch(`${v2}/api/v2/missions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          title:       form.title.trim(),
          description: form.description.trim(),
          priority:    form.priority,
          objectives,
          coordinates,
          targetCriteria: {
            region:      form.region.trim() || 'Nigeria',
            city:        form.city.trim() || undefined,
            type:        form.type,
            objective:   form.objective.trim() || undefined,
            startDate:   form.startDate || undefined,
            endDate:     form.endDate || undefined,
            durationDays: form.durationDays ? Number(form.durationDays) : undefined,
            participantsMin: form.participantsMin ? Number(form.participantsMin) : undefined,
            participantsMax: form.participantsMax ? Number(form.participantsMax) : undefined,
            coordinator:     form.coordinator.trim() || undefined,
            requiredTools:   form.requiredTools.trim()
              ? form.requiredTools.split(',').map(t => t.trim()).filter(Boolean)
              : undefined,
            budgetTotal:     form.budgetTotal ? Number(form.budgetTotal) : undefined,
            budgetReward:    form.budgetReward ? Number(form.budgetReward) : undefined,
            budgetCurrency:  form.budgetCurrency || 'NGN',
            safetyNotes:     form.safetyNotes.trim() || undefined,
            completionCriteria: form.completionCriteria.trim() || undefined,
          }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed: ${res.status}`);
      setSuccess(data.mission);
      if (onMissionCreated) onMissionCreated(data.mission);
    } catch (err) {
      setError(err.message || 'Failed to create mission');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="eco-page eco-fade-up w-full">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white">Mission Studio</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--eco-text-secondary)' }}>
          {prefillOppId ? 'Funding a Lilo-identified opportunity — review and confirm details.' : 'Create a detailed mission for Grinders to discover and join.'}
        </p>
      </div>

      {prefillOppId && (
        <div className="mb-5 px-4 py-3 rounded-xl flex items-center gap-3 text-sm"
          style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}>
          Pre-filled from Lilo opportunity <strong>{prefillOppId}</strong>. Review and adjust before creating.
        </div>
      )}

      {success ? (
        <div className="p-6 rounded-[var(--eco-radius-card)]"
          style={{ background: 'var(--eco-bg-surface)', border: '1px solid rgba(34,197,94,0.3)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(34,197,94,0.15)' }}>
              <svg viewBox="0 0 20 20" fill="none" stroke="var(--eco-green)" strokeWidth={2.5} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l4 4 6-6" />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-white">Mission created</p>
              <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>
                {success.title} · {success.status} · {success.missionId}
              </p>
            </div>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--eco-text-secondary)' }}>
            The mission is now in the canonical engine. Use the Mission Map tab to activate it and make it discoverable by Grinders.
          </p>
          <div className="flex gap-3">
            <button onClick={() => { setSuccess(null); setStep(0); setForm(f => ({...f, title:'', description:'', region:'', city:'', coordinates:'', objective:'', startDate:'', endDate:'', durationDays:'', participantsMin:'', participantsMax:'', coordinator:'', requiredTools:'', budgetTotal:'', budgetReward:'', safetyNotes:'', evidenceRequired:'', completionCriteria:''})); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-black hover:opacity-90"
              style={{ background: 'var(--eco-green)' }}>
              Create another
            </button>
            <button onClick={() => onNavigate('/command')}
              className="px-4 py-2 rounded-xl text-sm transition-colors hover:bg-white/5"
              style={{ border: '1px solid var(--eco-border)', color: 'var(--eco-text-secondary)' }}>
              View missions
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* Step tabs */}
          <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
            {steps.map((s, i) => (
              <button key={i} type="button" onClick={() => setStep(i)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all"
                style={{
                  background: step === i ? 'rgba(56,189,248,0.15)' : 'var(--eco-bg-elevated)',
                  color:      step === i ? '#38bdf8' : 'var(--eco-text-secondary)',
                  border:     step === i ? '1px solid rgba(56,189,248,0.3)' : '1px solid var(--eco-border)',
                }}>
                {i + 1}. {s}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-[var(--eco-radius-card)] flex flex-col gap-4"
              style={{ background: 'var(--eco-bg-surface)', border: '1px solid rgba(56,189,248,0.2)' }}>

              {/* Step 0: Identity */}
              {step === 0 && (<>
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">Mission Identity</h2>
                <div><label className={labelCls} style={labelSty}>Title *</label>
                  <input required value={form.title} onChange={upd('title')} placeholder="e.g. Clean Lagos Shoreline" className={inputCls} style={inputSty} /></div>
                <div><label className={labelCls} style={labelSty}>Description *</label>
                  <textarea required value={form.description} onChange={upd('description')} placeholder="What will Grinders do? What is the environmental goal?" rows={3} className={`${inputCls} resize-none`} style={inputSty} /></div>
                <div><label className={labelCls} style={labelSty}>Environmental objective</label>
                  <input value={form.objective} onChange={upd('objective')} placeholder="e.g. Remove 500kg of plastic waste from shoreline" className={inputCls} style={inputSty} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls} style={labelSty}>Priority</label>
                    <select value={form.priority} onChange={upd('priority')} className={inputCls} style={inputSty}>
                      <option value="LOW">Low</option><option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option><option value="CRITICAL">Critical</option>
                    </select></div>
                  <div><label className={labelCls} style={labelSty}>Mission type</label>
                    <select value={form.type} onChange={upd('type')} className={inputCls} style={inputSty}>
                      <option value="cleanup">Cleanup</option><option value="monitoring">Monitoring</option>
                      <option value="restoration">Restoration</option><option value="reporting">Reporting</option>
                      <option value="emergency">Emergency Response</option><option value="planting">Tree Planting</option>
                    </select></div>
                </div>
              </>)}

              {/* Step 1: Location & Schedule */}
              {step === 1 && (<>
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">Location & Schedule</h2>
                <div><label className={labelCls} style={labelSty}>Region / State *</label>
                  <input value={form.region} onChange={upd('region')} placeholder="e.g. Lagos State, Nigeria" className={inputCls} style={inputSty} /></div>
                <div><label className={labelCls} style={labelSty}>City / Area</label>
                  <input value={form.city} onChange={upd('city')} placeholder="e.g. Victoria Island" className={inputCls} style={inputSty} /></div>
                <div><label className={labelCls} style={labelSty}>Coordinates (lng, lat)</label>
                  <input value={form.coordinates} onChange={upd('coordinates')} placeholder="e.g. 3.3792, 6.4698" className={inputCls} style={inputSty} />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--eco-text-muted)' }}>Used to place the mission pin on the map.</p></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls} style={labelSty}>Start date</label>
                    <input type="date" value={form.startDate} onChange={upd('startDate')} className={inputCls} style={inputSty} /></div>
                  <div><label className={labelCls} style={labelSty}>End date</label>
                    <input type="date" value={form.endDate} onChange={upd('endDate')} className={inputCls} style={inputSty} /></div>
                </div>
                <div><label className={labelCls} style={labelSty}>Duration (days)</label>
                  <input type="number" min="1" value={form.durationDays} onChange={upd('durationDays')} placeholder="e.g. 2" className={inputCls} style={inputSty} /></div>
              </>)}

              {/* Step 2: Team & Tools */}
              {step === 2 && (<>
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">Team & Tools</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls} style={labelSty}>Min participants</label>
                    <input type="number" min="1" value={form.participantsMin} onChange={upd('participantsMin')} placeholder="e.g. 5" className={inputCls} style={inputSty} /></div>
                  <div><label className={labelCls} style={labelSty}>Max participants</label>
                    <input type="number" min="1" value={form.participantsMax} onChange={upd('participantsMax')} placeholder="e.g. 20" className={inputCls} style={inputSty} /></div>
                </div>
                <div><label className={labelCls} style={labelSty}>Mission coordinator</label>
                  <input value={form.coordinator} onChange={upd('coordinator')} placeholder="e.g. Dr. Amaka Obi" className={inputCls} style={inputSty} /></div>
                <div><label className={labelCls} style={labelSty}>Required tools (comma-separated)</label>
                  <input value={form.requiredTools} onChange={upd('requiredTools')} placeholder="e.g. Gloves, Trash bags, GPS device" className={inputCls} style={inputSty} />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--eco-text-muted)' }}>List tools participants need to bring or request from the platform.</p></div>
              </>)}

              {/* Step 3: Budget */}
              {step === 3 && (<>
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">Budget</h2>
                <div className="px-3 py-2 rounded-lg text-xs mb-2"
                  style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                  Budget is a proposal only — it does not fund the mission automatically. Funding confirmation requires a separate payment step.
                </div>
                <div><label className={labelCls} style={labelSty}>Currency</label>
                  <select value={form.budgetCurrency} onChange={upd('budgetCurrency')} className={inputCls} style={inputSty}>
                    <option value="NGN">NGN (Nigerian Naira)</option>
                    <option value="USD">USD</option>
                  </select></div>
                <div><label className={labelCls} style={labelSty}>Total mission budget</label>
                  <input type="number" min="0" value={form.budgetTotal} onChange={upd('budgetTotal')} placeholder="e.g. 500000 (in NGN minor units / kobo)" className={inputCls} style={inputSty} />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--eco-text-muted)' }}>Enter amount in smallest currency unit (kobo for NGN). ₦5,000 = 500000.</p></div>
                <div><label className={labelCls} style={labelSty}>Reward pool for Grinders</label>
                  <input type="number" min="0" value={form.budgetReward} onChange={upd('budgetReward')} placeholder="e.g. 250000" className={inputCls} style={inputSty} /></div>
              </>)}

              {/* Step 4: Safety & Evidence */}
              {step === 4 && (<>
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">Safety & Evidence</h2>
                <div><label className={labelCls} style={labelSty}>Safety instructions</label>
                  <textarea value={form.safetyNotes} onChange={upd('safetyNotes')} placeholder="List any hazards, required PPE, or emergency contacts..." rows={3} className={`${inputCls} resize-none`} style={inputSty} /></div>
                <div><label className={labelCls} style={labelSty}>Required evidence</label>
                  <input value={form.evidenceRequired} onChange={upd('evidenceRequired')} placeholder="e.g. Before/after photos, GPS coordinates, bag count" className={inputCls} style={inputSty} /></div>
                <div><label className={labelCls} style={labelSty}>Completion criteria</label>
                  <input value={form.completionCriteria} onChange={upd('completionCriteria')} placeholder="e.g. All trash bags collected and evidence photos submitted" className={inputCls} style={inputSty} /></div>
              </>)}

              {error && (
                <div className="px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                  {error}
                </div>
              )}

              <div className="flex gap-3 mt-2">
                {step > 0 && (
                  <button type="button" onClick={() => setStep(s => s - 1)}
                    className="px-4 py-2.5 rounded-xl text-sm transition-colors hover:bg-white/5"
                    style={{ border: '1px solid var(--eco-border)', color: 'var(--eco-text-secondary)' }}>
                    ← Back
                  </button>
                )}
                {step < steps.length - 1 && (
                  <button type="button" onClick={() => setStep(s => s + 1)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black hover:opacity-90"
                    style={{ background: '#38bdf8' }}>
                    Next: {steps[step + 1]} →
                  </button>
                )}
                {step === steps.length - 1 && (
                  <button type="submit" disabled={creating}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50 hover:opacity-90"
                    style={{ background: 'var(--eco-green)' }}>
                    {creating ? 'Creating…' : 'Create & Activate Mission'}
                  </button>
                )}
              </div>
            </div>

            {/* Summary preview */}
            <div className="p-5 rounded-[var(--eco-radius-card)] flex flex-col gap-3"
              style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Mission preview</h2>
              {form.title && <p className="text-lg font-bold text-white">{form.title}</p>}
              {form.description && <p className="text-xs leading-relaxed" style={{ color: 'var(--eco-text-secondary)' }}>{form.description}</p>}
              <div className="flex flex-wrap gap-2 mt-1">
                {form.priority && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}>{form.priority}</span>}
                {form.type && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--eco-green)' }}>{form.type}</span>}
              </div>
              {(form.region || form.city) && (
                <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>
                  📍 {[form.city, form.region].filter(Boolean).join(', ')}
                </p>
              )}
              {form.coordinates && <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>🗺 {form.coordinates}</p>}
              {(form.startDate || form.endDate) && (
                <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>
                  📅 {[form.startDate, form.endDate].filter(Boolean).join(' → ')}
                  {form.durationDays && ` (${form.durationDays} days)`}
                </p>
              )}
              {(form.participantsMin || form.participantsMax) && (
                <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>
                  👥 {form.participantsMin && `Min ${form.participantsMin}`}{form.participantsMax && ` · Max ${form.participantsMax}`}
                  {form.coordinator && ` · Coordinator: ${form.coordinator}`}
                </p>
              )}
              {form.requiredTools && (
                <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>
                  🔧 Tools: {form.requiredTools}
                </p>
              )}
              {form.budgetTotal && (
                <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>
                  💰 Budget: {Number(form.budgetTotal).toLocaleString()} {form.budgetCurrency}
                  {form.budgetReward && ` · Rewards: ${Number(form.budgetReward).toLocaleString()}`}
                </p>
              )}
              {!form.title && (
                <p className="text-xs italic" style={{ color: 'var(--eco-text-muted)' }}>
                  Fill in the form to see your mission preview here.
                </p>
              )}
              <div className="mt-auto pt-3" style={{ borderTop: '1px solid var(--eco-border-soft)' }}>
                <p className="text-[10px] italic" style={{ color: 'var(--eco-text-muted)' }}>
                  Budget amounts are proposals. Missions are not funded until a payment is authorized through the canonical funding workflow.
                </p>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Main CommandCenter ────────────────────────────────────────────────────────

const CommandCenter = ({ user, onNavigate }) => {
  const { role } = useUserRole();
  const { token } = useAuth();
  const [missions, setMissions] = useState([]);
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [view, setView] = useState(role === 'whale' ? 'studio' : 'map');
  const abortRef = useRef(null);

  const fetchMissions = async () => {
    setStatus('loading');
    setErrorMsg('');
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const v2Origin = getV2ApiOrigin();
    if (v2Origin === null) {
      if (DEV_FIXTURE_MISSIONS) {
        setMissions(DEV_FIXTURE_MISSIONS);
        setStatus('ready');
      } else {
        setErrorMsg('Mission data requires the Render backend. Set VITE_API_URL in the Netlify dashboard to your Render backend URL (e.g. https://econet-api.onrender.com).');
        setStatus('error');
      }
      return;
    }

    try {
      const res = await fetch(`${v2Origin}/api/v2/missions`, {
        signal: abortRef.current.signal,
        headers: { Accept: 'application/json' }
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      const raw = data?.missions ?? [];

      if (raw.length === 0) {
        // Genuine empty state — NOT an error
        setStatus('empty');
        setMissions([]);
      } else {
        setStatus('ready');
        setMissions(raw);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (DEV_FIXTURE_MISSIONS) {
        setMissions(DEV_FIXTURE_MISSIONS);
        setStatus('ready');
      } else {
        setErrorMsg(err.message || 'Failed to load missions');
        setStatus('error');
        setMissions([]);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchMissions();
    return () => { cancelled = true; abortRef.current?.abort(); };
  }, []);

  const handleMissionCreated = (newMission) => {
    // Refresh mission list after creation
    fetchMissions();
    setView('map');
  };

  // ── Loading ──
  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--eco-bg-canvas)' }}>
        <div className="flex flex-col items-center gap-4" style={{ color: 'var(--eco-green)' }}>
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-500" />
          <span className="text-xs font-bold uppercase tracking-widest">Loading missions…</span>
        </div>
      </div>
    );
  }

  // ── Backend unreachable (real error) ──
  if (status === 'error') {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--eco-bg-canvas)' }}>
        <div className="flex flex-col items-center gap-4 text-red-400 max-w-sm text-center px-6">
          <span className="text-4xl">⚠</span>
          <p className="text-sm font-bold uppercase tracking-widest">Mission service unavailable</p>
          <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>{errorMsg}</p>
          <p className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>
            The canonical Mission Engine is not reachable. Ensure the backend server is running on port 5000.
          </p>
          <button onClick={fetchMissions}
            className="mt-2 px-4 py-2 rounded-xl text-sm font-semibold text-black"
            style={{ background: 'var(--eco-green)' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--eco-bg-canvas)' }}>
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: 'var(--eco-border-soft)' }}>
        <button onClick={() => setView('map')}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: view === 'map' ? 'rgba(34,197,94,0.12)' : 'transparent',
            color: view === 'map' ? 'var(--eco-green)' : 'var(--eco-text-secondary)',
            border: view === 'map' ? '1px solid rgba(34,197,94,0.3)' : '1px solid transparent'
          }}>
          Mission Map
          {missions.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(34,197,94,0.2)', color: 'var(--eco-green)' }}>
              {missions.length}
            </span>
          )}
        </button>
        {role === 'whale' && (
          <button onClick={() => setView('studio')}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: view === 'studio' ? 'rgba(56,189,248,0.12)' : 'transparent',
              color: view === 'studio' ? '#38bdf8' : 'var(--eco-text-secondary)',
              border: view === 'studio' ? '1px solid rgba(56,189,248,0.3)' : '1px solid transparent'
            }}>
            Mission Studio
          </button>
        )}
        <div className="ml-auto text-xs" style={{ color: 'var(--eco-text-muted)' }}>
          {status === 'empty' ? 'No active missions' : `${missions.length} active`}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view === 'studio' && role === 'whale'
          ? <MissionStudio onMissionCreated={handleMissionCreated} onNavigate={onNavigate} />
          : status === 'empty'
            ? (
              <div className="flex h-full items-center justify-center" style={{ minHeight: 400 }}>
                <div className="flex flex-col items-center gap-4 max-w-sm text-center px-6">
                  <span className="text-4xl">🌍</span>
                  <p className="text-base font-bold text-white">No active missions</p>
                  <p className="text-sm" style={{ color: 'var(--eco-text-secondary)' }}>
                    {role === 'whale'
                      ? 'Create a mission in the Mission Studio tab to get started.'
                      : 'No funded missions are currently active. Check back soon or explore the map for Lilo-discovered opportunities.'}
                  </p>
                  {role === 'whale' && (
                    <button onClick={() => setView('studio')}
                      className="px-4 py-2 rounded-xl text-sm font-bold text-black"
                      style={{ background: '#38bdf8' }}>
                      Open Mission Studio
                    </button>
                  )}
                  {onNavigate && (
                    <button onClick={() => onNavigate('/map')}
                      className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                      style={{ border: '1px solid rgba(34,197,94,0.3)', color: 'var(--eco-green)' }}>
                      Explore the map
                    </button>
                  )}
                </div>
              </div>
            )
            : <MissionMap missions={missions} />
        }
      </div>
    </div>
  );
};

export default CommandCenter;
