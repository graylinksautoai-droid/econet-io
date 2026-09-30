/**
 * WorldMap — /map destination.
 *
 * Shows two categories of map data:
 *
 *   ACTIVE MISSIONS — funded, playable, from canonical Engine 11
 *   LILO OPPORTUNITIES — unfunded, suggested, visually greyed
 *
 * Visual distinction:
 *   Active missions: emerald/green pins
 *   Lilo opportunities: grey/muted pins with "Not yet funded" label
 *
 * Data:
 *   Active missions:     GET /api/v2/missions (canonical engine)
 *   Legacy report pins:  GET /api/map/reports (legacy MongoDB, may be unavailable)
 *   Lilo opportunities:  dev fixtures when VITE_ENABLE_MOCK_MISSIONS=true
 *
 * Role awareness:
 *   Whale — sees "Fund mission" CTA on opportunity panels
 *   Grinder — sees "Not yet available" on unfunded opportunities
 */

import { useState, useEffect } from 'react';
import MapView from '../components/MapView';
import { getApiBaseUrl, getV2ApiOrigin } from '../services/runtimeConfig';
import { useUserRole } from '../context/UserRoleContext';

// Dev fixture Lilo opportunities (greyed on map, not playable)
const DEV_LILO_OPPORTUNITIES = import.meta.env.VITE_ENABLE_MOCK_MISSIONS === 'true'
  ? [
      {
        id: 'OPP-MAP-01',
        title: 'Shoreline Erosion — Anambra',
        description: 'Lilo identified high-probability shoreline erosion affecting 3 communities. Unfunded.',
        status: 'suggested',
        source: 'lilo',
        location: { lat: 6.2209, lon: 6.9386, coordinates: [6.9386, 6.2209] },
        category: 'Erosion',
        severity: 'Moderate',
      },
      {
        id: 'OPP-MAP-02',
        title: 'Illegal Dumping Cluster — Lagos',
        description: 'Lilo detected 14 clustered dump reports. Not yet funded as a mission.',
        status: 'suggested',
        source: 'lilo',
        location: { lat: 6.4541, lon: 3.4246, coordinates: [3.4246, 6.4541] },
        category: 'Pollution',
        severity: 'Low',
      },
    ]
  : [];

export default function WorldMap({ onNavigate, role: propRole }) {
  const { role: ctxRole } = useUserRole();
  const role = propRole || ctxRole || 'grinder';

  // Read optional focus coordinates from query params (set by WhaleHome "View on map")
  const searchParams = new URLSearchParams(window.location.search);
  const focusLng = parseFloat(searchParams.get('lng')) || null;
  const focusLat = parseFloat(searchParams.get('lat')) || null;
  const focusOppId = searchParams.get('oppId') || null;
  // If coordinates were passed, use them as the initial center; otherwise default
  const initialCenter = (focusLng && focusLat) ? [focusLng, focusLat] : null;

  const [reports, setReports] = useState([]);
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  // Load legacy map reports (may fail when MongoDB is down)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}/map/reports`);
        if (!res.ok) throw new Error(res.status);
        const payload = await res.json();
        if (cancelled) return;
        const features = payload?.features || [];
        setReports(features.map(f => ({
          id:        f.properties?.id,
          category:  f.properties?.category,
          severity:  f.properties?.severity,
          postStatus: f.properties?.postStatus,
          trustScore: f.properties?.trustScore,
          aiScore:   f.properties?.aiScore,
          content:   f.properties?.summary || f.properties?.category || 'Environmental signal',
          location: {
            lon: f.geometry?.coordinates?.[0],
            lat: f.geometry?.coordinates?.[1],
            coordinates: f.geometry?.coordinates
          }
        })));
      } catch {
        if (!cancelled) setOffline(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Load canonical missions
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const v2 = getV2ApiOrigin();
      if (!v2) return;
      try {
        const res = await fetch(`${v2}/api/v2/missions`, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMissions(data?.missions ?? []);
      } catch { /* canonical missions optional */ }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Merge all map data: reports + Lilo opportunities (as muted pins)
  const allMapReports = [
    ...reports,
    ...DEV_LILO_OPPORTUNITIES.map(opp => ({
      id:        opp.id,
      category:  opp.category,
      severity:  opp.severity,
      postStatus: 'lilo_opportunity',  // sentinel value for muted styling
      content:   opp.description,
      liloOpportunity: true,
      location: opp.location
    }))
  ];

  const totalActive = missions.filter(m => m.status === 'ACTIVE').length;
  const totalOpps   = DEV_LILO_OPPORTUNITIES.length;

  return (
    <div className="eco-fade-up flex flex-col" style={{ height: 'calc(100vh - var(--eco-topnav-h))' }}>

      {/* Page header */}
      <div className="px-4 sm:px-8 py-4 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">World Map</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--eco-text-muted)' }}>
              Explore missions, Lilo-discovered opportunities and environmental activity
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {offline && (
              <span className="text-xs px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                Report pins unavailable
              </span>
            )}
            {totalActive > 0 && (
              <span className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(34,197,94,0.10)', color: 'var(--eco-green)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--eco-green)' }} />
                {totalActive} active mission{totalActive !== 1 ? 's' : ''}
              </span>
            )}
            {totalOpps > 0 && (
              <span className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(148,163,184,0.08)', color: 'var(--eco-text-secondary)', border: '1px solid rgba(148,163,184,0.15)' }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block bg-gray-400" />
                {totalOpps} Lilo opportunit{totalOpps !== 1 ? 'ies' : 'y'}
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--eco-text-secondary)' }}>
            <span className="w-3 h-3 rounded-full" style={{ background: 'var(--eco-green)' }} />
            Active / funded mission
          </div>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--eco-text-secondary)' }}>
            <span className="w-3 h-3 rounded-full bg-gray-500" />
            Lilo opportunity (not yet funded)
          </div>
          {role === 'whale' && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(56,189,248,0.10)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }}>
              Whale view: fund opportunities directly
            </span>
          )}
          {role === 'grinder' && totalOpps > 0 && (
            <span className="text-xs" style={{ color: 'var(--eco-text-muted)' }}>
              Grey pins become playable once funded
            </span>
          )}
        </div>
      </div>

      {/* Map fills remaining height */}
      <div className="flex-1 px-4 sm:px-8 pb-4 min-h-0">
        {/* Focus banner — shown when navigated from an opportunity card */}
        {focusOppId && (
          <div className="mb-2 px-3 py-2 rounded-xl text-xs flex items-center gap-2"
            style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}>
            <span>Map centred on opportunity: <strong>{focusOppId}</strong></span>
          </div>
        )}
        <div className="w-full h-full rounded-[var(--eco-radius-card)] overflow-hidden"
          style={{ border: '1px solid var(--eco-border-soft)' }}>
          <MapView reports={allMapReports} initialCenter={initialCenter} />
        </div>
      </div>
    </div>
  );
}
