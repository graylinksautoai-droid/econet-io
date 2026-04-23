import { useState, useEffect } from 'react';
import MapView from '../components/MapView';
import { HiOutlineShieldCheck, HiOutlineStatusOnline, HiOutlineGlobeAlt } from "react-icons/hi";

const CommandCenter = ({ reports = [] }) => {
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [activeSentinels, setActiveSentinels] = useState(1240);

  // Filter high-priority alerts for the "Sentinel Feed"
  const priorityReports = reports.filter(r => r.severity === 'high' || r.isVerified);

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-950 text-white overflow-hidden">
      
      {/* 1. Left Sidebar: The Live Sentinel Feed */}
      <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/40 backdrop-blur-xl">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2 mb-1">
            <HiOutlineShieldCheck className="text-emerald-500 w-5 h-5" />
            <h1 className="text-lg font-black tracking-tighter text-emerald-500 uppercase">Sentinel Hub</h1>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">Ground-Truth Intelligence</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
           {priorityReports.length > 0 ? (
             priorityReports.map((report) => (
               <div 
                key={report._id}
                onClick={() => setSelectedIncident(report)}
                className={`p-4 rounded-xl border transition-all cursor-pointer group ${
                  selectedIncident?._id === report._id 
                  ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.15)]' 
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-600'
                }`}
               >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${report.severity === 'high' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  </div>
                  <p className="text-sm font-bold group-hover:text-emerald-400 transition-colors">{report.summary}</p>
                  <p className="text-[11px] text-slate-400 mt-1 italic">{report.locationName || 'Retrieving Coordinates...'}</p>
                  
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                      {report.isVerified ? "Verified Logic" : "Awaiting Consensus"}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">TS: {report.trustScore || '82'}%</div>
                  </div>
               </div>
             ))
           ) : (
             <div className="text-center py-10 opacity-30">
               <HiOutlineStatusOnline className="w-8 h-8 mx-auto mb-2" />
               <p className="text-xs uppercase tracking-widest">Scanning Satellite Data...</p>
             </div>
           )}
        </div>
      </div>

      {/* 2. Main Area: The Map */}
      <div className="flex-1 relative">
        <MapView 
          reports={reports} 
          activeIncident={selectedIncident} 
          theme="satellite-dark"
        />
        
        {/* 3. Stats Overlays */}
        <div className="absolute top-6 left-6 flex gap-4 pointer-events-none">
           <div className="bg-slate-900/90 backdrop-blur-xl p-4 rounded-2xl border border-slate-800 pointer-events-auto shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <HiOutlineGlobeAlt className="text-emerald-400 w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-emerald-400 leading-none">{activeSentinels.toLocaleString()}</div>
                  <div className="text-[9px] uppercase font-black text-slate-500 tracking-wider mt-1">Global Nodes</div>
                </div>
              </div>
           </div>
           
           <div className="bg-slate-900/90 backdrop-blur-xl p-4 rounded-2xl border border-slate-800 pointer-events-auto shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <HiOutlineShieldCheck className="text-amber-400 w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-amber-400 leading-none">94.2%</div>
                  <div className="text-[9px] uppercase font-black text-slate-500 tracking-wider mt-1">Integrity Score</div>
                </div>
              </div>
           </div>
        </div>

        {/* Right Action Panel (Quick Verifier) */}
        {selectedIncident && (
          <div className="absolute top-6 right-6 w-64 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl p-5 pointer-events-auto animate-in fade-in slide-in-from-right-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Incident Verification</h3>
            <img 
              src={selectedIncident.media || "https://images.unsplash.com/photo-1547619292-8816ee7cdd50?w=400&q=80"} 
              className="w-full h-32 object-cover rounded-xl mb-4 grayscale hover:grayscale-0 transition-all border border-slate-700" 
              alt="Evidence"
            />
            <button className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold transition-all mb-2">
              Dispatch Verifier
            </button>
            <button 
              onClick={() => setSelectedIncident(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold transition-all"
            >
              Close Feed
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommandCenter;