import { useState } from "react";
import { HiOutlineLocationMarker, HiOutlineX, HiOutlineCloudUpload, HiOutlineShieldCheck } from "react-icons/hi";
import { addPendingReport } from "../services/offlineStorage";
import { progressiveSync } from "../services/progressiveSync";
import SentinelVerifiedModal from "../components/SentinelVerifiedModal";
import { API_ENDPOINTS, getAuthToken } from "../services/api";
import { resolveMediaUrl } from "../services/runtimeConfig";

// NOTE: Media upload credentials are handled exclusively on the server side.
// The client sends files to /api/upload/image and the server manages storage.
// Cloudinary cloud name and upload preset must NEVER appear in frontend source.

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB — matches server multer limit

function SubmitReport({ user, onNavigate }) {
  const [description, setDescription] = useState("");
  const [location, setLocation]       = useState("");
  const [loading, setLoading]         = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview]   = useState(null);
  const [imageUrl, setImageUrl]           = useState("");
  const [showVerifiedModal, setShowVerifiedModal] = useState(false);
  const [syncStatus, setSyncStatus]   = useState("Ready");

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Client-side size validation — mirrors server multer limit
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be under 10 MB. Please choose a smaller file.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Only image files are accepted (JPG, PNG, WebP, GIF).");
      return;
    }
    setError("");
    setSyncStatus("Transcoding…");
    const transcodedFile = await progressiveSync.transcode(file);
    setSelectedImage(transcodedFile);

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
      setSyncStatus("Ready");
    };
    reader.readAsDataURL(transcodedFile);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setImageUrl("");
    setSyncStatus("Ready");
    setUploadProgress(0);
  };

  const uploadImage = async () => {
    if (!selectedImage) return "";
    setUploading(true);
    setSyncStatus("Uploading…");
    try {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append("image", selectedImage);
      const res  = await fetch(API_ENDPOINTS.UPLOAD.IMAGE, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Upload failed");
      const uploadedUrl = resolveMediaUrl(data.data.url);
      setImageUrl(uploadedUrl);
      setSyncStatus("Uploaded");
      setUploadProgress(100);
      return uploadedUrl;
    } catch (err) {
      console.error("Image upload error:", err);
      setError("Upload failed — report will be saved without image.");
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

    const token = getAuthToken();
    if (!token) {
      setError("You must be logged in to submit a report.");
      setLoading(false);
      return;
    }

    // Offline-first queue
    if (!navigator.onLine) {
      try {
        await addPendingReport({ description, location, images: [], token });
        setResult({
          category: "Queued for sync",
          severity: "—",
          urgency: "—",
          confidence: 0,
          summary: "Report saved locally. It will upload automatically when your connection is restored.",
          recommendedAuthority: "Sentinel Sync",
        });
        setShowVerifiedModal(true);
        if ("serviceWorker" in navigator && navigator.serviceWorker.ready) {
          const reg = await navigator.serviceWorker.ready;
          if (reg.sync) await reg.sync.register("sync-reports");
        }
      } catch (err) {
        setError("Could not save offline. Please try again.");
      }
      setLoading(false);
      return;
    }

    try {
      let uploadedImageUrl = "";
      if (selectedImage) uploadedImageUrl = await uploadImage();

      // Analyze via Lilo/GROQ
      const analyzeRes  = await fetch(API_ENDPOINTS.REPORTS.ANALYZE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: `${description} Location: ${location}` }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) { setError(analyzeData.error || "Analysis failed"); setLoading(false); return; }
      setResult(analyzeData);

      // Persist
      const saveRes  = await fetch(API_ENDPOINTS.REPORTS.CREATE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          description,
          category:  analyzeData.category,
          severity:  analyzeData.severity,
          urgency:   analyzeData.urgency,
          confidence: analyzeData.confidence,
          summary:   analyzeData.summary,
          location:  { text: location, city: location.split(",")[0].trim(), state: "" },
          images:    uploadedImageUrl ? [uploadedImageUrl] : [],
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        setError("Analyzed but failed to save: " + (saveData.error || "Unknown error"));
      } else {
        setShowVerifiedModal(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Shared input class — dark bg, white text, eco focus ring ───────────────
  const inputCls = "w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-[var(--eco-text-muted)] outline-none transition-all focus:ring-2 focus:ring-[rgba(34,197,94,0.5)]";
  const inputStyle = { background: "var(--eco-bg-elevated)", border: "1px solid var(--eco-border)" };

  return (
    <>
      <div className="eco-page eco-fade-up">
        {/* Back */}
        <button onClick={() => onNavigate("/")}
          className="mb-5 inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
          style={{ color: "var(--eco-green)" }}>
          ← Back
        </button>

        <h1 className="text-2xl font-bold text-white mb-1">Submit Report</h1>
        <p className="text-sm mb-8" style={{ color: "var(--eco-text-secondary)" }}>
          Describe what you've observed. Lilo will classify and route it automatically.
        </p>

        <div className="grid md:grid-cols-2 gap-6">

          {/* ── Left — Form ── */}
          <div className="p-6 rounded-[var(--eco-radius-card)] flex flex-col gap-5"
            style={{ background: "var(--eco-bg-surface)", border: "1px solid var(--eco-border-soft)" }}>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">

              {/* Description */}
              <div>
                <label htmlFor="report-description"
                  className="block text-xs font-semibold mb-1.5 uppercase tracking-widest"
                  style={{ color: "var(--eco-text-secondary)" }}>
                  What did you observe?
                </label>
                <textarea
                  id="report-description"
                  name="reportDescription"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe the environmental issue — what, where, how severe…"
                  rows={4}
                  required
                  className={`${inputCls} resize-none`}
                  style={inputStyle}
                />
              </div>

              {/* Location */}
              <div>
                <label htmlFor="report-location"
                  className="block text-xs font-semibold mb-1.5 uppercase tracking-widest"
                  style={{ color: "var(--eco-text-secondary)" }}>
                  Location
                </label>
                <div className="relative">
                  <HiOutlineLocationMarker className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 flex-shrink-0"
                    style={{ color: "var(--eco-green)" }} />
                  <input
                    id="report-location"
                    name="reportLocation"
                    type="text"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="e.g. Lagos Island, Nigeria"
                    required
                    className={`${inputCls} pl-10`}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Image upload */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-widest"
                  style={{ color: "var(--eco-text-secondary)" }}>
                  Evidence photo (optional · max 10 MB)
                </label>

                {!imagePreview ? (
                  <label htmlFor="report-image"
                    className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl cursor-pointer transition-all hover:border-[rgba(34,197,94,0.35)]"
                    style={{ border: "2px dashed var(--eco-border)", background: "var(--eco-bg-elevated)" }}>
                    <HiOutlineCloudUpload className="w-8 h-8" style={{ color: "var(--eco-text-muted)" }} />
                    <span className="text-xs font-semibold" style={{ color: "var(--eco-text-secondary)" }}>
                      Click to attach image
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--eco-text-muted)" }}>JPG / PNG / WebP / GIF</span>
                    <input id="report-image" name="reportImage" type="file" accept="image/*"
                      onChange={handleImageChange} className="sr-only" disabled={uploading} />
                  </label>
                ) : (
                  <div className="relative rounded-xl overflow-hidden" style={{ border: "1px solid var(--eco-border)" }}>
                    <img src={imagePreview} alt="Preview" className="w-full h-44 object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-3">
                      <span className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-1">
                        <HiOutlineShieldCheck className="text-emerald-400 w-3.5 h-3.5" />
                        {syncStatus}
                      </span>
                    </div>
                    <button type="button" onClick={handleRemoveImage} disabled={uploading}
                      className="absolute top-2 right-2 p-1.5 rounded-full text-white transition-colors hover:bg-red-500/80"
                      style={{ background: "rgba(0,0,0,0.45)" }}>
                      <HiOutlineX className="w-4 h-4" />
                    </button>
                    {uploading && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                        <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-widest">{uploadProgress}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="px-4 py-3 rounded-xl text-sm text-red-300"
                  style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || uploading}
                className="w-full py-3 rounded-xl text-sm font-bold text-black transition-opacity disabled:opacity-50 hover:opacity-90"
                style={{ background: "var(--eco-green)" }}>
                {loading ? "Analyzing…" : uploading ? "Uploading…" : "Submit Report"}
              </button>
            </form>
          </div>

          {/* ── Right — AI result ── */}
          <div className="p-6 rounded-[var(--eco-radius-card)] flex flex-col gap-4"
            style={{ background: "var(--eco-bg-surface)", border: "1px solid var(--eco-border-soft)" }}>

            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Lilo Signal Classification</h2>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--eco-text-muted)" }}>
              Text classification only — not event verification. Uploaded media is user-submitted evidence and stays
              <span className="font-bold text-amber-300"> EVIDENCE UNVERIFIED</span> until corroborated.
            </p>

            {loading && !uploading && (
              <div className="flex flex-col items-center justify-center gap-4 h-48">
                <div className="w-12 h-12 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--eco-green)" }}>
                  Classifying signal…
                </p>
              </div>
            )}

            {result && !loading && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: result.severity + " severity", warn: result.severity === "Critical" },
                    { label: result.urgency + " priority",  warn: result.urgency === "Immediate" },
                  ].map(badge => (
                    <span key={badge.label}
                      className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
                      style={{
                        background: badge.warn ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.12)",
                        color:      badge.warn ? "#fca5a5" : "var(--eco-green)",
                        border:     `1px solid ${badge.warn ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
                      }}>
                      {badge.label}
                    </span>
                  ))}
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--eco-text-muted)" }}>Category</p>
                  <p className="text-xl font-bold text-white">{result.category}</p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--eco-text-muted)" }}>Summary</p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--eco-text-secondary)" }}>{result.summary}</p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--eco-text-muted)" }}>Suggested routing (triage only)</p>
                  <p className="text-sm font-semibold text-white">{result.recommendedAuthority}</p>
                  <p className="text-[11px] mt-1" style={{ color: "var(--eco-text-muted)" }}>
                    Operational severity for triage — not a confirmed emergency and not an agency dispatch.
                  </p>
                </div>

                <div className="p-3 rounded-xl text-[11px] leading-relaxed" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", color: "#fde68a" }}>
                  Event status: <span className="font-bold">SUBMITTED · EVIDENCE UNVERIFIED · NEEDS CORROBORATION</span>.
                  No trust reward, verified badge, or emergency alert is granted on classification alone.
                </div>

                <div className="flex items-center justify-between text-[11px] pt-2"
                  style={{ borderTop: "1px solid var(--eco-border-soft)", color: "var(--eco-text-muted)" }}>
                  <span>Text-classification confidence (not event proof)</span>
                  <span style={{ color: "var(--eco-green)" }} className="font-bold">
                    {Math.round(result.confidence * 100)}%
                  </span>
                </div>
              </div>
            )}

            {!result && !loading && (
              <div className="flex flex-col items-center justify-center gap-3 h-48">
                <HiOutlineCloudUpload className="w-10 h-10" style={{ color: "var(--eco-text-muted)" }} />
                <p className="text-xs font-medium text-center" style={{ color: "var(--eco-text-muted)" }}>
                  Submit a report to see Lilo's classification here.
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
      <SentinelVerifiedModal isOpen={showVerifiedModal} onClose={() => setShowVerifiedModal(false)} />
    </>
  );
}

export default SubmitReport;
