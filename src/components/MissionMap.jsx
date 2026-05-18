import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  FaBroadcastTower,
  FaCheckCircle,
  FaCrosshairs,
  FaLeaf,
  FaMapMarkedAlt,
  FaRobot,
  FaSatelliteDish,
  FaShareAlt,
  FaShieldAlt,
  FaUsers
} from 'react-icons/fa';
import { GiEcology, GiWaveCrest, GiTreeGrowth } from 'react-icons/gi';
import { HiSparkles } from 'react-icons/hi2';
import { useAuth } from '../context/AuthContext.jsx';
import { applyRewardToReputation } from '../services/economy.js';
import './MissionMap.css';

const DEFAULT_CENTER = [7.4951, 9.0579];
const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 15000
};

const DEFAULT_MISSIONS = [
  {
    Mission_ID: 'JABI-RENEWAL-15',
    Title: 'Double Hands Cradling a Reforestation Seedling',
    Objective: 'Deploy on the Jabi Lake perimeter, verify seedling placement, and capture two proof frames plus a short field note.',
    Reward_Points: 42,
    Geofence_Radius: 650,
    LILO_Status: 'Pending',
    coordinates: [7.3975, 9.0814],
    category: 'Environmental Restoration',
    slots: '15 / 20 Slots',
    icon: 'leaf',
    region: 'Jabi Renewal'
  },
  {
    Mission_ID: 'DAM-FLOW-07',
    Title: 'Wave Shockwave',
    Objective: 'Validate dam inflow stress markers and confirm if downstream spill conditions need escalation.',
    Reward_Points: 35,
    Geofence_Radius: 900,
    LILO_Status: 'Active',
    coordinates: [7.3435, 9.0397],
    category: 'Hydrology / Flood Mitigation',
    slots: '7 Sentinels',
    icon: 'wave',
    region: 'Usuma Reservoir'
  },
  {
    Mission_ID: 'HEAT-NEAT-22',
    Title: 'Tactical Shield',
    Objective: 'Reach the flagged hotspot, confirm the anomaly footprint, and upload a geo-anchored thermal observation.',
    Reward_Points: 54,
    Geofence_Radius: 520,
    LILO_Status: 'Pending',
    coordinates: [7.4835, 9.0552],
    category: 'Emergency Response',
    slots: 'Heat anomaly alert',
    icon: 'shield',
    region: 'Abuja Core'
  }
];

const iconMap = {
  leaf: <GiTreeGrowth />,
  wave: <GiWaveCrest />,
  shield: <FaShieldAlt />
};

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const haversineMeters = ([lng1, lat1], [lng2, lat2]) => {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const normalizeMission = (mission, index) => ({
  Mission_ID: mission.Mission_ID || mission.missionId || `MISSION-${index + 1}`,
  Title: mission.Title || mission.title || `Mission ${index + 1}`,
  Objective: mission.Objective || mission.objective || 'No objective defined yet.',
  Reward_Points: Number(mission.Reward_Points ?? mission.rewardPoints ?? 0),
  Geofence_Radius: Number(mission.Geofence_Radius ?? mission.geofenceRadius ?? 500),
  LILO_Status: mission.LILO_Status || mission.liloStatus || 'Pending',
  coordinates: mission.coordinates || DEFAULT_CENTER,
  category: mission.category || 'Mission',
  slots: mission.slots || 'Open',
  icon: mission.icon || 'leaf',
  region: mission.region || 'Mission Zone'
});

const createToast = (title, message) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  title,
  message
});

const getProgress = (mission, acceptedMissionId, handshakeState) => {
  if (mission.LILO_Status === 'Verified') return 100;
  if (handshakeState === 'verifying' && acceptedMissionId === mission.Mission_ID) return 84;
  if (mission.LILO_Status === 'Active') return 58;
  if (acceptedMissionId === mission.Mission_ID) return 30;
  return 8;
};

const getStatusClass = (status) => {
  switch (status) {
    case 'Verified':
      return 'mission-status-badge mission-status-badge--verified';
    case 'Active':
      return 'mission-status-badge mission-status-badge--active';
    default:
      return 'mission-status-badge mission-status-badge--pending';
  }
};

const getMarkerClass = (status, isSelected) => {
  const classes = ['mission-marker'];

  if (status === 'Verified') classes.push('mission-marker--verified');
  else if (status === 'Active') classes.push('mission-marker--active');

  if (status !== 'Verified') classes.push('mission-pulse');
  if (isSelected) classes.push('mission-marker--selected');

  return classes.join(' ');
};

async function handshakeLILO() {
  await new Promise((resolve) => window.setTimeout(resolve, 5000));
  return { verifiedAt: new Date().toISOString() };
}

const MissionMap = ({ missions = DEFAULT_MISSIONS, initialCenter = DEFAULT_CENTER, className = '' }) => {
  const { user, setUser } = useAuth();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const watchIdRef = useRef(null);

  const normalizedMissions = useMemo(
    () => missions.map((mission, index) => normalizeMission(mission, index)),
    [missions]
  );

  const [missionState, setMissionState] = useState(normalizedMissions);
  const [selectedMissionId, setSelectedMissionId] = useState(normalizedMissions[0]?.Mission_ID || null);
  const [acceptedMissionId, setAcceptedMissionId] = useState(null);
  const [handshakeState, setHandshakeState] = useState('idle');
  const [userLocation, setUserLocation] = useState(null);
  const [geoState, setGeoState] = useState('idle');
  const [geoError, setGeoError] = useState('');
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    setMissionState(normalizedMissions);
    if (!normalizedMissions.some((mission) => mission.Mission_ID === selectedMissionId)) {
      setSelectedMissionId(normalizedMissions[0]?.Mission_ID || null);
    }
  }, [normalizedMissions, selectedMissionId]);

  const selectedMission = useMemo(
    () => missionState.find((mission) => mission.Mission_ID === selectedMissionId) || null,
    [missionState, selectedMissionId]
  );

  const missionCounts = useMemo(
    () => ({
      pending: missionState.filter((mission) => mission.LILO_Status === 'Pending').length,
      active: missionState.filter((mission) => mission.LILO_Status === 'Active').length,
      verified: missionState.filter((mission) => mission.LILO_Status === 'Verified').length
    }),
    [missionState]
  );

  const ecoBalance = user?.reputation?.ecoCoins || user?.reputation?.seeds || user?.ecoCoins || 0;
  const currentDistance = selectedMission && userLocation
    ? haversineMeters(userLocation, selectedMission.coordinates)
    : null;
  const withinGeofence = Boolean(
    selectedMission &&
    currentDistance != null &&
    currentDistance <= selectedMission.Geofence_Radius
  );

  const toast = (title, message) => {
    const entry = createToast(title, message);
    setToasts((current) => [...current, entry]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== entry.id));
    }, 4200);
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors'
          }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
      },
      center: initialCenter,
      zoom: 11.7,
      pitch: 48,
      bearing: -14,
      antialias: true
    });

    map.addControl(new maplibregl.NavigationControl({ showZoom: true, showCompass: true }), 'top-right');
    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [initialCenter]);

  useEffect(() => {
    if (!mapRef.current) return undefined;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    missionState.forEach((mission) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = getMarkerClass(mission.LILO_Status, mission.Mission_ID === selectedMissionId);
      element.setAttribute('aria-label', mission.Title);
      element.addEventListener('click', () => setSelectedMissionId(mission.Mission_ID));

      const marker = new maplibregl.Marker({ element, anchor: 'bottom' })
        .setLngLat(mission.coordinates)
        .addTo(mapRef.current);

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [missionState, selectedMissionId]);

  useEffect(() => {
    if (!mapRef.current || !selectedMission) return;

    mapRef.current.flyTo({
      center: selectedMission.coordinates,
      zoom: 12.8,
      pitch: 54,
      bearing: -12,
      speed: 0.8,
      essential: true
    });
  }, [selectedMission]);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoState('unsupported');
      setGeoError('Geolocation is unavailable on this device.');
      return undefined;
    }

    setGeoState('locating');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation([position.coords.longitude, position.coords.latitude]);
        setGeoState('ready');
        setGeoError('');
      },
      (error) => {
        setGeoState('error');
        setGeoError(error.message || 'Unable to determine your live position.');
      },
      GEOLOCATION_OPTIONS
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const acceptMission = () => {
    if (!selectedMission) return;
    setAcceptedMissionId(selectedMission.Mission_ID);
    toast('Mission accepted', `${selectedMission.Title} added to your live Sentinel queue.`);
  };

  const startMission = async () => {
    if (!selectedMission || !withinGeofence || handshakeState === 'verifying') return;

    setAcceptedMissionId(selectedMission.Mission_ID);
    setMissionState((current) =>
      current.map((mission) =>
        mission.Mission_ID === selectedMission.Mission_ID
          ? { ...mission, LILO_Status: 'Active' }
          : mission
      )
    );
    setHandshakeState('verifying');
    toast('LILO handshake', 'Satellite verification window opened. Hold position for orbital confirmation.');

    try {
      await handshakeLILO();
      setMissionState((current) =>
        current.map((mission) =>
          mission.Mission_ID === selectedMission.Mission_ID
            ? { ...mission, LILO_Status: 'Verified' }
            : mission
        )
      );

      setUser((currentUser) => {
        const reward = {
          ecoCoins: selectedMission.Reward_Points,
          leaves: Math.max(3, Math.round(selectedMission.Reward_Points / 7))
        };

        return {
          ...currentUser,
          ecoCoins: (currentUser?.ecoCoins || 0) + selectedMission.Reward_Points,
          reputation: applyRewardToReputation(currentUser?.reputation || {}, reward)
        };
      });

      toast(
        'Mission accomplished',
        `${selectedMission.Title} verified. +${selectedMission.Reward_Points} EcoPoints awarded.`
      );
    } finally {
      setHandshakeState('idle');
    }
  };

  const selectedIcon = selectedMission ? iconMap[selectedMission.icon] || <GiEcology /> : <GiEcology />;
  const statusLine = geoState === 'ready'
    ? 'Orbital lock and geofence engine active'
    : geoState === 'locating'
      ? 'Acquiring Sentinel position'
      : geoError || 'Awaiting field coordinates';

  return (
    <section className={`mission-map-command ${className}`.trim()}>
      <div ref={mapContainerRef} className="mission-map-canvas" />
      <div className="mission-status-ring" />

      <div className="mission-chrome">
        <header className="mission-topbar">
          <div className="mission-brand">
            <div className="mission-brand-badge">
              <GiEcology />
            </div>
            <div className="mission-brand-copy">
              <span className="mission-brand-title">EcoNet IO</span>
              <span className="mission-brand-subtitle">Mission Tactical Grid</span>
            </div>
          </div>

          <div className="mission-share">
            <FaShareAlt />
            Tactical Share
          </div>
        </header>

        <div className="mission-scorebar">
          <div className="mission-score">
            <div className="mission-score-label">Regional Eco-Velocity</div>
            <div className="mission-score-value">850 EC / HR</div>
          </div>
          <div className="mission-score">
            <div className="mission-score-label">Hive Carbon Offset</div>
            <div className="mission-score-value">2,450 Tons</div>
          </div>
          <div className="mission-score">
            <div className="mission-score-label">Total Leaves Awarded</div>
            <div className="mission-score-value">1.2M</div>
          </div>
        </div>

        <div className="mission-stage">
          <div className="mission-board">
            <aside className="mission-left-rail">
              <h3 className="mission-rail-title">Sentinel Network</h3>
              <div className="mission-sentinel-list">
                {missionState.map((mission, index) => (
                  <div key={mission.Mission_ID} className="mission-sentinel-card">
                    <div className={`mission-sentinel-badge ${index === 2 ? 'mission-sentinel-badge--gold' : ''}`}>
                      {index === 2 ? 'S' : 'G'}
                    </div>
                    <div className="mission-sentinel-copy">
                      <strong>{index === 2 ? 'Gamer Tag' : 'Gamer Tag'}</strong>
                      <span>@{mission.Mission_ID.toLowerCase()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            {selectedMission ? (
              <div className="mission-center-card">
                <div className="mission-center-icon">{selectedIcon}</div>
                <h2 className="mission-center-title">{selectedMission.Title}</h2>
                <p className="mission-center-subtitle">{selectedMission.category}</p>
                <p className="mission-center-body">{selectedMission.Objective}</p>
                <div className="mission-center-footer">
                  <div>
                    <span>Region</span>
                    <strong>{selectedMission.region}</strong>
                  </div>
                  <div>
                    <span>Slots</span>
                    <strong>{selectedMission.slots}</strong>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mission-target-card">
              <h4>Regional Impact Heatmap</h4>
              <p>Mission nodes intensify as Sentinels gather proof, complete check-ins, and push LILO closer to verification lock.</p>
              <span>{statusLine}</span>
            </div>

            <aside className="mission-right-rail">
              <div className="mission-panel">
                <h3 className="mission-panel-title">Lilo Live Activity Log</h3>
                <div className="mission-log-lines">
                  <div>* Analyzing report 442...</div>
                  <div>* Calculating EcoCoin reward for current mission...</div>
                  <div>* Verifying orbital sync window...</div>
                </div>
              </div>

              <div className="mission-panel">
                <h3 className="mission-panel-title">Regional Alert Ticker</h3>
                <div className="mission-log-lines">
                  <div>* {missionCounts.pending} pending missions awaiting pickup</div>
                  <div>* {missionCounts.active} missions are currently active in the field</div>
                  <div>* {missionCounts.verified} missions already verified by LILO</div>
                </div>
              </div>

              <div className="mission-panel mission-lilo-hud">
                <div className="mission-lilo-body">
                  <FaRobot />
                </div>
                <div>
                  <h3 className="mission-panel-title">Sentinel-Link Metadata HUD</h3>
                  <div className="mission-lilo-stats">
                    <div><strong>Orbiting Sentinel:</strong> LILO / PX</div>
                    <div><strong>Resolution:</strong> 10m / px</div>
                    <div><strong>Cloud Cover:</strong> 12%</div>
                    <div><strong>Coordinates:</strong> {selectedMission ? `${selectedMission.coordinates[1].toFixed(3)}, ${selectedMission.coordinates[0].toFixed(3)}` : 'Pending'}</div>
                    <div><strong>User Lock:</strong> {geoState === 'ready' ? 'Confirmed' : 'Pending'}</div>
                  </div>
                </div>
              </div>

              <div className="mission-panel">
                <h3 className="mission-panel-title">Dispatch Handshake</h3>
                <div className="mission-log-lines">
                  <div>{handshakeState === 'verifying' ? <FaSatelliteDish /> : <FaCheckCircle />} Data analyzed</div>
                  <div>{acceptedMissionId ? <FaCheckCircle /> : <FaCrosshairs />} Routed to agency</div>
                  <div>{selectedMission?.LILO_Status === 'Verified' ? <FaCheckCircle /> : <HiSparkles />} Awaiting proof receipt</div>
                </div>
              </div>
            </aside>

            <AnimatePresence initial={false}>
              {selectedMission ? (
                <motion.aside
                  key={selectedMission.Mission_ID}
                  className="mission-drawer"
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                >
                  <p className="mission-drawer-kicker">{selectedMission.Mission_ID}</p>
                  <div className="mission-drawer-row">
                    <div className={getStatusClass(selectedMission.LILO_Status)}>{selectedMission.LILO_Status}</div>
                    <div className={getStatusClass(withinGeofence ? 'Active' : 'Pending')}>
                      {withinGeofence ? 'Geofence Armed' : 'Move Closer'}
                    </div>
                  </div>

                  <h3 className="mission-drawer-title">{selectedMission.Title}</h3>
                  <p className="mission-drawer-objective">{selectedMission.Objective}</p>

                  <div className="mission-drawer-grid">
                    <div className="mission-drawer-stat">
                      <span>Reward</span>
                      <strong>{selectedMission.Reward_Points} EcoPoints</strong>
                    </div>
                    <div className="mission-drawer-stat">
                      <span>Radius</span>
                      <strong>{numberFormatter.format(selectedMission.Geofence_Radius)} m</strong>
                    </div>
                    <div className="mission-drawer-stat">
                      <span>Wallet</span>
                      <strong>{numberFormatter.format(ecoBalance)} EC</strong>
                    </div>
                    <div className="mission-drawer-stat">
                      <span>Sentinels</span>
                      <strong>{selectedMission.slots}</strong>
                    </div>
                  </div>

                  <div className="mission-progress-copy">
                    <span>Mission progress</span>
                    <span>{getProgress(selectedMission, acceptedMissionId, handshakeState)}%</span>
                  </div>
                  <div className="mission-progress-track">
                    <span style={{ width: `${getProgress(selectedMission, acceptedMissionId, handshakeState)}%` }} />
                  </div>

                  <div className="mission-proximity-panel">
                    {currentDistance == null ? (
                      <span>
                        <strong>Position required.</strong> Turn on live location to unlock the proximity check and arm the mission start control.
                      </span>
                    ) : (
                      <span>
                        <strong>Proximity check:</strong> you are {numberFormatter.format(currentDistance)} meters from the mission pin.{' '}
                        {withinGeofence
                          ? 'You are inside mission radius and clear to launch.'
                          : `Move within ${numberFormatter.format(selectedMission.Geofence_Radius)} meters to start.`}
                      </span>
                    )}
                    {geoError ? <div style={{ marginTop: 8, color: '#fca5a5' }}>{geoError}</div> : null}
                  </div>

                  <div className="mission-actions">
                    <button
                      type="button"
                      className="mission-action-btn mission-action-btn--secondary"
                      onClick={acceptMission}
                      disabled={acceptedMissionId === selectedMission.Mission_ID}
                    >
                      {acceptedMissionId === selectedMission.Mission_ID ? 'Mission Accepted' : 'Accept Mission'}
                    </button>
                    <button
                      type="button"
                      className="mission-action-btn mission-action-btn--primary"
                      onClick={startMission}
                      disabled={
                        !acceptedMissionId ||
                        acceptedMissionId !== selectedMission.Mission_ID ||
                        !withinGeofence ||
                        handshakeState === 'verifying' ||
                        selectedMission.LILO_Status === 'Verified'
                      }
                    >
                      {selectedMission.LILO_Status === 'Verified'
                        ? 'Verified'
                        : handshakeState === 'verifying' && acceptedMissionId === selectedMission.Mission_ID
                          ? 'Waiting for LILO...'
                          : 'Start Mission'}
                    </button>
                  </div>
                </motion.aside>
              ) : null}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {toasts.length > 0 ? (
                <div className="mission-toast-stack">
                  {toasts.map((entry) => (
                    <motion.div
                      key={entry.id}
                      className="mission-toast"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                    >
                      <strong>{entry.title}</strong>
                      <span>{entry.message}</span>
                    </motion.div>
                  ))}
                </div>
              ) : null}
            </AnimatePresence>

            <div className="mission-bottom-strip">
              <div className="mission-heat-label">
                <span>Regional Impact Heatmap</span>
                <span>Active</span>
                <span>Cold</span>
              </div>
              <div className="mission-heatbar">
                <span />
              </div>
              <div className="mission-bottom-nav">
                <div className="mission-bottom-tab mission-bottom-tab--active">
                  <span className="mission-bottom-icon"><FaMapMarkedAlt /></span>
                  <span>Map</span>
                </div>
                <div className="mission-bottom-tab">
                  <span className="mission-bottom-icon"><FaCrosshairs /></span>
                  <span>Missions</span>
                </div>
                <div className="mission-bottom-tab">
                  <span className="mission-bottom-icon"><FaUsers /></span>
                  <span>Hive</span>
                </div>
                <div className="mission-bottom-tab">
                  <span className="mission-bottom-icon"><FaLeaf /></span>
                  <span>Profile</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default MissionMap;
