import { useState, useEffect } from "react";
import MainLayout from "../layouts/MainLayout";
import { HiOutlineLocationMarker, HiOutlineX, HiOutlineCloudUpload, HiOutlineShieldCheck } from "react-icons/hi";
import { addPendingReport } from "../services/offlineStorage";
import { progressiveSync } from "../services/progressiveSync";
import SentinelVerifiedModal from "../components/SentinelVerifiedModal";
import { API_ENDPOINTS } from "../services/api";

// !!! IMPORTANT !!!
const CLOUDINARY_CLOUD_NAME = 'dp9ffewdb';
const CLOUDINARY_UPLOAD_PRESET = 'econet_avatar';

function SubmitReport({ user, onNavigate }) {
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [showVerifiedModal, setShowVerifiedModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Idle");

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Neural Transcoding Preview (Simulated)
      setSyncStatus("Neural Transcoding...");
      const transcodedFile = await progressiveSync.transcode(file);
      setSelectedImage(transcodedFile);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        setSyncStatus("ROI Prioritized");
      };
      reader.readAsDataURL(transcodedFile);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setImageUrl("");
    setSyncStatus("Idle");
    setUploadProgress(0);
  };

  const uploadImage = async () => {
    if (!selectedImage) return "";
    setUploading(true);
    setSyncStatus("Progressive Sync...");
    
    try {
      // Progressive Sync: resumes from exact byte on recovery
      await progressiveSync.upload(selectedImage, `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, (progress) => {
        setUploadProgress(Math.round(progress));
      });

      // Now do the final Cloudinary upload for the transcoded file
      const formData = new FormData();
      formData.append('file', selectedImage);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.secure_url) {
        setImageUrl(data.secure_url);
        setSyncStatus("Sync Complete");
        return data.secure_url;
      } else {
        throw new Error(data.error?.message || 'Upload failed');
      }
    } catch (err) {
      console.error('Image upload error:', err);
      setError('Progressive Sync Interrupted. It will resume from the exact byte when network returns.');
      return "";
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) {
      setError("You must be logged in to save a report.");
      setLoading(false);
      return;
    }

    // Offline-first: if no network, save to pending-reports and register sync
    if (!navigator.onLine) {
      try {
        await addPendingReport({
          description,
          location,
          images: [],
          token,
        });
        setResult({
          category: "Progressive Sync Pending",
          severity: "—",
          urgency: "—",
          confidence: 0,
          summary: "Nigeria-Sync active. Report and image will resume upload from exact byte on network recovery.",
          recommendedAuthority: "Sentinel Sync",
        });
        setShowVerifiedModal(true);
        if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
          const reg = await navigator.serviceWorker.ready;
          if (reg.sync) {
            await reg.sync.register('sync-reports');
          }
        }
      } catch (err) {
        console.error('Offline save error:', err);
        setError('Could not save report locally. Please try again when online.');
      }
      setLoading(false);
      return;
    }

    try {
      // 1. Upload image if selected (using Progressive Sync)
      let uploadedImageUrl = "";
      if (selectedImage) {
        uploadedImageUrl = await uploadImage();
      }

      // 2. Analyze the report
      const analyzeResponse = await fetch(API_ENDPOINTS.REPORTS.ANALYZE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          description: `${description} Location: ${location}` 
        }),
      });

      const analyzeData = await analyzeResponse.json();
      
      if (!analyzeResponse.ok) {
        setError(analyzeData.error || "Failed to analyze report");
        setLoading(false);
        return;
      }

      setResult(analyzeData);

      // 3. Save the report to the database
      const saveResponse = await fetch(API_ENDPOINTS.REPORTS.CREATE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          description: description,
          category: analyzeData.category,
          severity: analyzeData.severity,
          urgency: analyzeData.urgency,
          confidence: analyzeData.confidence,
          summary: analyzeData.summary,
          location: { text: location, city: location.split(',')[0].trim(), state: "" },
          images: uploadedImageUrl ? [uploadedImageUrl] : []
        }),
      });

      const saveData = await saveResponse.json();
      if (!saveResponse.ok) {
        console.error("Save error:", saveData);
        setError("Report was analyzed but failed to save: " + (saveData.error || "Unknown error"));
      } else {
        console.log("Report saved:", saveData);
        setShowVerifiedModal(true);
      }
    } catch (err) {
      setError("Network error. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout user={user} onNavigate={onNavigate}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button 
          onClick={() => onNavigate('/')}
          className="text-emerald-600 hover:text-emerald-700 mb-4 inline-flex items-center gap-1 font-bold text-sm tracking-widest uppercase"
        >
          ← Dashboard
        </button>

        <h1 className="text-4xl font-black text-gray-900 mb-2 tracking-tighter">SUBMIT SENTINEL REPORT</h1>
        <p className="text-gray-500 mb-8 font-medium">Neural Transcoding and Progressive Sync active for high-integrity uploads.</p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Left Column - Form */}
          <div className="bg-white/50 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <label className="block text-[10px] font-black text-gray-400 mb-3 uppercase tracking-widest">
                  ENVIRONMENTAL INTELLIGENCE
                </label>
                <textarea
                  id="report-description"
                  name="reportDescription"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the environmental issue..."
                  className="w-full p-4 bg-gray-50/50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 h-32 transition-all"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-[10px] font-black text-gray-400 mb-3 uppercase tracking-widest">
                  GEOSPATIAL COORDINATES
                </label>
                <div className="flex items-center bg-gray-50/50 border border-gray-100 rounded-2xl px-4">
                  <HiOutlineLocationMarker className="text-emerald-500 w-5 h-5" />
                  <input
                    id="report-location"
                    name="reportLocation"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., Lagos Island"
                    className="w-full p-4 focus:outline-none bg-transparent"
                    required
                  />
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-[10px] font-black text-gray-400 mb-3 uppercase tracking-widest">
                  SOUL-MOTION MEDIA
                </label>
                
                {!imagePreview ? (
                  <div className="relative group">
                    <input
                      id="report-image"
                      name="reportImage"
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      disabled={uploading}
                    />
                    <div className="border-2 border-dashed border-gray-200 rounded-[2rem] p-10 text-center group-hover:border-emerald-500 transition-all bg-gray-50/30">
                      <svg className="w-10 h-10 text-gray-300 mx-auto mb-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Initiate Transcoding</p>
                    </div>
                  </div>
                ) : (
                  <div className="relative rounded-[2rem] overflow-hidden group shadow-xl">
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="w-full h-56 object-cover"
                      style={{ filter: "contrast(1.05) saturate(1.1)" }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
                       <div className="flex items-center gap-2 text-white">
                          <HiOutlineShieldCheck className="text-emerald-400 w-5 h-5" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Neural Sync: {syncStatus}</span>
                       </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-4 right-4 bg-white/20 backdrop-blur-md text-white p-2 rounded-full hover:bg-red-500 transition-colors"
                      disabled={uploading}
                    >
                      <HiOutlineX className="w-5 h-5" />
                    </button>
                    {uploading && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                        <div className="w-12 h-12 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin mb-4"></div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em]">{uploadProgress}% SYNCED</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || uploading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 px-6 rounded-2xl transition-all shadow-xl shadow-emerald-900/20 disabled:opacity-50 uppercase tracking-widest text-xs"
              >
                {loading ? "SENTINEL ANALYZING..." : uploading ? "RESUMABLE SYNC..." : "TRANSMIT DATA →"}
              </button>
            </form>

            {error && (
              <div className="mt-6 p-4 bg-red-50/80 backdrop-blur-md border border-red-100 rounded-2xl text-red-600 text-xs font-bold flex items-center gap-3">
                <HiOutlineCloudUpload className="text-lg" />
                {error}
              </div>
            )}
          </div>

          {/* Right Column - AI Analysis Result */}
          <div className="bg-gray-900 rounded-[2.5rem] shadow-2xl p-8 border border-white/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
               <HiOutlineShieldCheck className="text-8xl text-emerald-500" />
            </div>
            
            <h2 className="text-white text-xl font-black mb-6 tracking-tighter uppercase tracking-widest text-xs text-gray-500">Sentinel Intelligence Output</h2>
            
            {loading && !uploading && (
              <div className="flex flex-col items-center justify-center h-64">
                <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center animate-pulse">
                  <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                </div>
                <p className="mt-6 text-emerald-500/80 font-black text-[10px] uppercase tracking-[0.3em]">Decoding Signal...</p>
              </div>
            )}

            {result && !loading && (
              <div className="space-y-6">
                <div className="flex gap-2">
                  <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    result.severity === "Critical" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                    result.severity === "Moderate" ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" :
                    "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  }`}>
                    {result.severity} SEVERITY
                  </div>

                  <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    result.urgency === "Immediate" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                    result.urgency === "Medium" ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" :
                    "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  }`}>
                    {result.urgency} PRIORITY
                  </div>
                </div>

                <div className="mt-8">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">INTELLIGENCE CATEGORY</p>
                  <p className="font-black text-2xl text-white tracking-tighter">{result.category}</p>
                </div>

                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">NEURAL SUMMARY</p>
                  <p className="text-gray-400 text-sm leading-relaxed">{result.summary}</p>
                </div>

                <div className="bg-white/5 p-6 rounded-[2rem] border border-white/10 backdrop-blur-md">
                  <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                     <HiOutlineShieldCheck /> TARGET AUTHORITY
                  </p>
                  <p className="font-black text-white text-lg tracking-tight">{result.recommendedAuthority}</p>
                </div>

                <div className="flex items-center justify-between text-[10px] font-black text-gray-600 uppercase tracking-widest border-t border-white/5 pt-6">
                  <span>Neural Confidence</span>
                  <span className="text-emerald-500">{Math.round(result.confidence * 100)}% Verified</span>
                </div>
              </div>
            )}

            {!result && !loading && (
              <div className="text-center h-64 flex flex-col items-center justify-center">
                <div className="w-16 h-16 border-2 border-white/5 rounded-full flex items-center justify-center mb-4">
                   <HiOutlineCloudUpload className="text-gray-700 text-2xl" />
                </div>
                <p className="text-gray-600 font-black text-[10px] uppercase tracking-widest">Awaiting Signal Input</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <SentinelVerifiedModal
        isOpen={showVerifiedModal}
        onClose={() => setShowVerifiedModal(false)}
      />
    </MainLayout>
  );
}

export default SubmitReport;
