/**
 * Simulation — /simulation
 *
 * Connected to Engine 19 (SimulationApplicationService) via
 * GET /api/v2/simulation/presets and POST /api/v2/simulation/run.
 *
 * SIMULATION MODE is always clearly displayed.
 * Results are NEVER mixed with real mission or report data.
 */

import { useState, useEffect } from 'react';
import { getV2ApiOrigin } from '../services/runtimeConfig';
import { useAuth } from '../context/AuthContext';

// ─── Parameter input descriptions ────────────────────────────────────────────
const PARAM_LABELS = {
  // DISASTER_SCENARIO
  hazardIntensity:       { label: 'Hazard intensity (0–1)', min: 0, max: 1, step: 0.01, default: 0.65 },
  exposedPopulation:     { label: 'Exposed population (count)', min: 0, max: 1000000, step: 100, default: 5000 },
  vulnerabilityIndex:    { label: 'Vulnerability index (0–1)', min: 0, max: 1, step: 0.01, default: 0.4 },
  responseCapacityIndex: { label: 'Response capacity (0–1)', min: 0, max: 1, step: 0.01, default: 0.5 },
  // ATMOSPHERIC_DISPERSION
  emissionRate:          { label: 'Emission rate (kg/s)', min: 0.001, max: 100, step: 0.001, default: 0.1 },
  windSpeed:             { label: 'Wind speed (m/s)', min: 0.1, max: 50, step: 0.1, default: 3.5 },
  downwindDistance:      { label: 'Downwind distance (m)', min: 1, max: 10000, step: 1, default: 500 },
  initialSpreadM:        { label: 'Initial plume spread (m)', min: 0.01, max: 100, step: 0.1, default: 1 },
  spreadCoefficient:     { label: 'Spread coefficient', min: 0.0001, max: 1, step: 0.001, default: 0.1 },
};

function formatResult(result) {
  if (!result) return null;
  const output = result.output || result.outputs || result.values || result;
  if (typeof output === 'object') {
    return Object.entries(output)
      .filter(([k]) => k !== 'dataOrigin' && k !== 'DATA_ORIGIN_SIMULATED')
      .map(([k, v]) => ({ key: k.replace(/_/g, ' '), value: typeof v === 'number' ? v.toFixed(3) : String(v) }));
  }
  return [{ key: 'result', value: String(output) }];
}

export default function Simulation({ onNavigate }) {
  const { token } = useAuth();
  const [presets, setPresets]           = useState([]);
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [params, setParams]             = useState({});
  const [running, setRunning]           = useState(false);
  const [result, setResult]             = useState(null);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(true);

  const v2 = getV2ApiOrigin();

  useEffect(() => {
    if (!v2) { setLoading(false); return; }
    fetch(`${v2}/api/v2/simulation/presets`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.presets) setPresets(data.presets);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [v2]);

  const selectPreset = (preset) => {
    setSelectedPreset(preset);
    setResult(null);
    setError('');
    const defaults = {};
    for (const p of preset.parameterNames) {
      defaults[p] = PARAM_LABELS[p]?.default ?? 1;
    }
    setParams(defaults);
  };

  const handleRun = async (e) => {
    e.preventDefault();
    if (!selectedPreset || !v2) return;
    setRunning(true);
    setResult(null);
    setError('');
    try {
      const numericParams = {};
      for (const [k, v] of Object.entries(params)) {
        numericParams[k] = parseFloat(v) || 0;
      }
      const res = await fetch(`${v2}/api/v2/simulation/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ modelName: selectedPreset.name, parameters: numericParams })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Simulation failed'); return; }
      setResult(data);
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setRunning(false);
    }
  };

  const formattedOutput = result ? formatResult(result.result) : null;

  return (
    <div className="eco-page eco-fade-up w-full">

      {/* Simulation mode banner — always visible */}
      <div className="mb-6 px-4 py-2.5 rounded-xl flex items-center gap-3"
        style={{ background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.25)' }}>
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0" style={{ color: '#fbbf24' }}>
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-semibold" style={{ color: '#fbbf24' }}>
          SIMULATION MODE — all outputs are modelled estimates, not verified environmental outcomes.
        </span>
      </div>

      <h1 className="text-2xl font-bold text-white mb-1">Environmental Simulation</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--eco-text-secondary)' }}>
        Model the likely outcomes of environmental interventions before committing resources.
        Engine 19 runs deterministic scenario analysis on the selected model.
      </p>

      {!v2 && (
        <div className="p-4 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
          Simulation API is not available on this deployment.
        </div>
      )}

      {v2 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Left — model selection + parameters */}
          <div className="flex flex-col gap-4">
            <div className="p-5 rounded-[var(--eco-radius-card)]"
              style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
              <h2 className="text-sm font-bold text-white mb-3 uppercase tracking-widest">Select intervention model</h2>

              {loading && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--eco-text-muted)' }}>
                  <div className="w-4 h-4 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                  Loading models…
                </div>
              )}

              {!loading && presets.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--eco-text-muted)' }}>
                  No models available. Ensure the backend is running.
                </p>
              )}

              <div className="flex flex-col gap-2">
                {presets.map(preset => (
                  <button key={preset.name} onClick={() => selectPreset(preset)}
                    className="text-left p-3 rounded-xl transition-all"
                    style={{
                      background: selectedPreset?.name === preset.name ? 'rgba(34,197,94,0.12)' : 'var(--eco-bg-elevated)',
                      border: selectedPreset?.name === preset.name ? '1px solid rgba(34,197,94,0.35)' : '1px solid var(--eco-border)',
                    }}>
                    <p className="text-sm font-semibold text-white">{preset.name}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--eco-text-muted)' }}>{preset.modelType} · {preset.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Parameter form */}
            {selectedPreset && (
              <form onSubmit={handleRun} className="p-5 rounded-[var(--eco-radius-card)] flex flex-col gap-4"
                style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">Parameters</h2>
                {selectedPreset.parameterNames.map(p => {
                  const meta = PARAM_LABELS[p] || { label: p, min: 0, max: 9999, step: 1, default: 1 };
                  return (
                    <div key={p}>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--eco-text-secondary)' }}>
                        {meta.label}
                      </label>
                      <input
                        type="number" min={meta.min} max={meta.max} step={meta.step}
                        value={params[p] ?? meta.default}
                        onChange={e => setParams(prev => ({ ...prev, [p]: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none"
                        style={{ background: 'var(--eco-bg-elevated)', border: '1px solid var(--eco-border)' }}
                      />
                    </div>
                  );
                })}

                {error && (
                  <div className="px-3 py-2 rounded-lg text-sm text-red-300"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={running}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50 hover:opacity-90"
                  style={{ background: 'var(--eco-green)' }}>
                  {running ? 'Running simulation…' : 'Run Simulation'}
                </button>
              </form>
            )}
          </div>

          {/* Right — result */}
          <div className="p-5 rounded-[var(--eco-radius-card)] flex flex-col gap-4"
            style={{ background: 'var(--eco-bg-surface)', border: '1px solid var(--eco-border-soft)' }}>
            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Simulation output</h2>

            {!result && !running && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 opacity-20">
                  <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2"/>
                  <path d="M16 32V20l8-6 8 6v12" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                </svg>
                <p className="text-sm" style={{ color: 'var(--eco-text-muted)' }}>
                  Select a model and click Run to see projected outcomes.
                </p>
              </div>
            )}

            {running && (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--eco-green)' }}>
                  Engine 19 computing…
                </p>
              </div>
            )}

            {result && formattedOutput && (
              <div className="flex flex-col gap-4">
                {/* Result header */}
                <div className="px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                  SIMULATED · {result.model?.name} v{result.model?.version} · {result.model?.type}
                </div>

                {/* Output values */}
                <div className="flex flex-col gap-2">
                  {formattedOutput.map(row => (
                    <div key={row.key} className="flex items-start justify-between gap-3 py-2"
                      style={{ borderBottom: '1px solid var(--eco-border-soft)' }}>
                      <span className="text-xs capitalize" style={{ color: 'var(--eco-text-secondary)' }}>{row.key}</span>
                      <span className="text-sm font-bold text-white text-right">{row.value}</span>
                    </div>
                  ))}
                </div>

                <p className="text-xs italic mt-2" style={{ color: 'var(--eco-text-muted)' }}>
                  These are model-generated projections. Actual outcomes depend on real-world conditions.
                  All results carry <code>DATA_ORIGIN_SIMULATED</code> and are never stored alongside real data.
                </p>

                <button onClick={() => { setResult(null); setError(''); }}
                  className="text-sm transition-opacity hover:opacity-70"
                  style={{ color: 'var(--eco-green)' }}>
                  Clear and run again
                </button>
              </div>
            )}
          </div>

        </div>
      )}

      <div className="mt-8">
        <button onClick={() => onNavigate('/')}
          className="text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--eco-green)' }}>
          ← Back to Connect Worlds
        </button>
      </div>
    </div>
  );
}
