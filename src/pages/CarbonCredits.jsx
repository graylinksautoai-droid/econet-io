/**
 * CarbonCredits — /carbon
 *
 * Foundation page for EcoNet's carbon-project tracking.
 *
 * Carbon credits are a potential future revenue stream, particularly in Nigeria.
 * This page establishes the honest project foundation WITHOUT:
 *   - Claiming credits have been issued or are tradeable.
 *   - Labelling mission estimates as verified carbon offsets.
 *   - Inventing registry certification or carbon prices.
 *   - Mixing EcoCoin rewards with carbon-credit ownership.
 *
 * What it DOES provide:
 *   - Project identification and location.
 *   - Methodology reference placeholders.
 *   - Monitoring and evidence requirements.
 *   - Estimated emissions reductions (clearly labelled as estimates).
 *   - Integration status with canonical verification engine.
 *
 * Full carbon-credit commercialisation requires:
 *   - Independent third-party verification (e.g. Gold Standard, Verra VCS).
 *   - Registry issuance and tracking.
 *   - Legal and compliance review.
 *   - Approved conversion and payout infrastructure.
 */
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const METHODOLOGY_OPTIONS = [
  'ACM0002 — Grid-connected electricity generation from renewable sources',
  'AMS-I.D — Grid connected renewable electricity generation',
  'VM0042 — Improved Agricultural Land Management',
  'VM0007 — REDD+ Methodology Framework',
  'GS-TPDDTEC — Technologies and Practices to Displace Decentralized Thermal Energy Consumption',
  'Other / Not yet determined',
];

const STATUS_LABELS = {
  concept:      { label: 'Concept',       color: 'rgba(148,163,184,0.15)', text: 'var(--eco-text-muted)' },
  design:       { label: 'Design',        color: 'rgba(56,189,248,0.12)',  text: '#38bdf8' },
  validation:   { label: 'Validation',    color: 'rgba(251,191,36,0.12)', text: '#fbbf24' },
  registered:   { label: 'Registered',    color: 'rgba(34,197,94,0.12)',  text: 'var(--eco-green)' },
  monitoring:   { label: 'Monitoring',    color: 'rgba(34,197,94,0.15)',  text: 'var(--eco-green)' },
  verification: { label: 'Verification',  color: 'rgba(167,139,250,0.12)', text: '#a78bfa' },
};

function ProjectCard({ project }) {
  const status = STATUS_LABELS[project.status] || STATUS_LABELS.concept;
  return (
    <div className="p-5 rounded-2xl flex flex-col gap-3"
      style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 pr-3">
          <p className="text-sm font-bold text-white leading-tight">{project.name}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--eco-text-muted)' }}>{project.location}</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: status.color, color: status.text }}>
          {status.label}
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--eco-text-secondary)' }}>
        {project.description}
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--eco-text-muted)' }}>
        {project.estimatedTonnesCO2e && (
          <div>
            <span className="block font-medium" style={{ color: 'var(--eco-text-secondary)' }}>Est. reduction</span>
            {project.estimatedTonnesCO2e.toLocaleString()} tCO₂e/yr <span className="italic">(estimate only)</span>
          </div>
        )}
        {project.methodology && (
          <div>
            <span className="block font-medium" style={{ color: 'var(--eco-text-secondary)' }}>Methodology</span>
            {project.methodology}
          </div>
        )}
      </div>
      <div className="text-[10px] px-3 py-2 rounded-lg italic"
        style={{ background: 'rgba(251,191,36,0.06)', color: 'var(--eco-text-muted)', border: '1px solid rgba(251,191,36,0.15)' }}>
        No credits have been issued or verified. Independent third-party validation required before any carbon credits can be claimed or traded.
      </div>
    </div>
  );
}

// Demo projects — clearly identified as project foundations, not issued credits.
// These will be replaced by API-sourced records when the carbon project backend is built.
const DEMO_PROJECTS = [
  {
    id: 'cp-001',
    name: 'Jabi Lake Shoreline Restoration',
    location: 'Abuja, FCT, Nigeria',
    status: 'design',
    description: 'Native grass planting and debris removal along 2.4km of Jabi Lake shoreline. Potential avoided emissions from reduced decomposition and improved carbon sequestration.',
    estimatedTonnesCO2e: 120,
    methodology: 'Not yet determined',
  },
  {
    id: 'cp-002',
    name: 'Lagos Urban Waste Diversion',
    location: 'Lagos State, Nigeria',
    status: 'concept',
    description: 'Community-led waste collection and composting initiative targeting informal dumpsites on the Lagos outskirts. Methane avoidance from landfill diversion.',
    estimatedTonnesCO2e: 850,
    methodology: 'Not yet determined',
  },
];

export default function CarbonCredits({ onNavigate }) {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ name: '', location: '', description: '', methodology: METHODOLOGY_OPTIONS[5], estimatedTonnesCO2e: '' });

  const upd = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const inputCls = "w-full px-3.5 py-2.5 rounded-xl text-sm text-white placeholder:text-[var(--eco-text-muted)] outline-none";
  const inputSty = { background: 'var(--eco-bg-elevated)', border: '1px solid var(--eco-border)' };

  return (
    <div className="eco-page eco-fade-up w-full">

      {/* Header */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-white">Carbon Projects</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--eco-text-secondary)' }}>
          Project foundations for future carbon-credit development. No credits are currently issued or tradeable.
        </p>
      </div>

      {/* Integrity notice */}
      <div className="mb-6 px-4 py-3 rounded-xl text-xs"
        style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
        <strong>Carbon credit integrity policy:</strong> Emissions reductions shown are preliminary estimates, not verified carbon credits.
        Independent third-party validation, registry registration, and legal compliance are required before any credit can be issued, sold, or retired.
        EcoCoin rewards are separate from carbon-credit ownership and are not redeemable as carbon credits.
      </div>

      {/* How it works */}
      <div className="mb-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { n: '1', title: 'Project design', desc: 'Define the project boundary, baseline, and methodology. Estimate emissions reductions.' },
          { n: '2', title: 'Validation', desc: 'Independent third-party auditor validates the methodology and project design document.' },
          { n: '3', title: 'Issuance', desc: 'After monitoring and verification, an accredited registry issues carbon credits backed by real reductions.' },
        ].map(s => (
          <div key={s.n} className="p-4 rounded-2xl"
            style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-2"
              style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--eco-green)', border: '1px solid rgba(34,197,94,0.25)' }}>
              {s.n}
            </div>
            <p className="text-sm font-semibold text-white mb-1">{s.title}</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--eco-text-secondary)' }}>{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Project list */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-white">Project foundations</h2>
        {user && (
          <button onClick={() => setShowForm(f => !f)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-black transition-opacity hover:opacity-80"
            style={{ background: 'var(--eco-green)' }}>
            {showForm ? 'Cancel' : '+ New project'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-6 p-5 rounded-2xl"
          style={{ background: 'var(--eco-bg-surface)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <h3 className="text-sm font-bold text-white mb-4">Register project foundation</h3>
          <div className="flex flex-col gap-4">
            <div><label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--eco-text-secondary)' }}>Project name *</label>
              <input value={form.name} onChange={upd('name')} placeholder="e.g. Kano Reforestation Initiative" className={inputCls} style={inputSty} /></div>
            <div><label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--eco-text-secondary)' }}>Location *</label>
              <input value={form.location} onChange={upd('location')} placeholder="e.g. Kano State, Nigeria" className={inputCls} style={inputSty} /></div>
            <div><label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--eco-text-secondary)' }}>Project description</label>
              <textarea value={form.description} onChange={upd('description')} rows={3} placeholder="Describe the project, activities, and expected emissions reductions..." className={`${inputCls} resize-none`} style={inputSty} /></div>
            <div><label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--eco-text-secondary)' }}>Potential methodology</label>
              <select value={form.methodology} onChange={upd('methodology')} className={inputCls} style={inputSty}>
                {METHODOLOGY_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select></div>
            <div><label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--eco-text-secondary)' }}>Estimated tCO₂e/year (preliminary)</label>
              <input type="number" min="0" value={form.estimatedTonnesCO2e} onChange={upd('estimatedTonnesCO2e')} placeholder="e.g. 500" className={inputCls} style={inputSty} /></div>
            <p className="text-[10px] italic" style={{ color: 'var(--eco-text-muted)' }}>
              This registers a project concept only. No credits are created. Full validation, monitoring, and registry registration require separate verified processes.
            </p>
            <button
              className="w-full py-2.5 rounded-xl text-sm font-bold text-black opacity-60 cursor-not-allowed"
              style={{ background: 'var(--eco-green)' }} disabled>
              Submit project (backend not yet configured)
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {DEMO_PROJECTS.map(p => <ProjectCard key={p.id} project={p} />)}
      </div>

      <div className="mt-8">
        <button onClick={() => onNavigate('/')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'var(--eco-green)' }}>
          ← Back to home
        </button>
      </div>
    </div>
  );
}
