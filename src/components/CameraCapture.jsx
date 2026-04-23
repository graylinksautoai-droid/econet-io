import React, { useState, useRef, useCallback } from 'react';
import { FaCamera, FaVideo, FaVideoSlash, FaTimes, FaRedo, FaCheck } from 'react-icons/fa';

function CameraCapture({ onImageCapture, onClose }) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const startCamera = async () => {
    try {
      setError('');
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }, 
        audio: false 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
        setIsStreaming(true);
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Unable to access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsStreaming(false);
    }
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      
      const imageData = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(imageData);
      stopCamera();
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  const confirmPhoto = () => {
    if (capturedImage && onImageCapture) {
      onImageCapture(capturedImage);
      onClose();
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setCapturedImage(e.target.result);
        stopCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  React.useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-emerald-600 text-white p-4 flex justify-between items-center">
          <h3 className="text-lg font-semibold">Camera Capture</h3>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-200 transition-colors"
          >
            <FaTimes className="w-5 h-5" />
          </button>
        </div>

        {/* Camera View */}
        <div className="relative bg-black rounded-lg overflow-hidden" style={{ minHeight: '450px' }}>
          {error ? (
            <div className="flex flex-col items-center justify-center h-96 text-white p-8 bg-gradient-to-br from-red-900/90 to-red-800/90">
              <div className="text-center">
                <FaCamera className="w-20 h-20 mb-4 mx-auto text-red-400" />
                <h3 className="text-xl font-semibold mb-2">Camera Access Required</h3>
                <p className="text-center mb-4 text-red-200">{error}</p>
                <p className="text-sm text-red-300 mb-6">Please allow camera access to capture photos for your environmental reports.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={startCamera}
                  className="bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 transition-all transform hover:scale-105 shadow-lg flex items-center"
                >
                  <FaCamera className="w-5 h-5 mr-2" />
                  Retry Camera
                </button>
                <label className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-all transform hover:scale-105 shadow-lg flex items-center cursor-pointer">
                  <FaCamera className="w-5 h-5 mr-2" />
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          ) : capturedImage ? (
            <div className="flex items-center justify-center h-96 bg-gradient-to-br from-green-900/90 to-green-800/90">
              <div className="text-center">
                <h3 className="text-xl font-semibold mb-4 text-green-200">Photo Captured Successfully</h3>
                <div className="relative inline-block">
                  <img 
                    src={capturedImage} 
                    alt="Captured" 
                    className="max-w-sm max-h-80 object-contain rounded-lg shadow-2xl border-4 border-green-400/50"
                  />
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <FaCheck className="w-3 h-3 text-white" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover rounded-lg"
                style={{ minHeight: '450px' }}
              />
              {isStreaming && (
                <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium animate-pulse">
                  <FaVideo className="w-4 h-4 mr-1" />
                  LIVE
                </div>
              )}
            </div>
          )}
          
          {/* Hidden canvas for image capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Controls */}
        <div className="bg-gray-100 p-4">
          {capturedImage ? (
            <div className="flex justify-center space-x-4">
              <button
                onClick={retakePhoto}
                className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors flex items-center"
              >
                <FaRedo className="w-4 h-4 mr-2" />
                Retake
              </button>
              <button
                onClick={confirmPhoto}
                className="bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 transition-colors flex items-center"
              >
                <FaCheck className="w-4 h-4 mr-2" />
                Use Photo
              </button>
            </div>
          ) : (
            <div className="flex justify-center space-x-4">
              <button
                onClick={captureImage}
                disabled={!isStreaming}
                className="bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
              >
                <FaCamera className="w-4 h-4 mr-2" />
                Capture Photo
              </button>
              <label className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer flex items-center">
                <FaCamera className="w-4 h-4 mr-2" />
                Upload Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              {isStreaming && (
                <button
                  onClick={stopCamera}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors flex items-center"
                >
                  <FaVideoSlash className="w-4 h-4 mr-2" />
                  Stop Camera
                </button>
              )}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 p-4 text-sm text-blue-800">
          <p className="font-medium mb-1">Camera Instructions:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Allow camera access when prompted by your browser</li>
            <li>Position yourself in good lighting for best results</li>
            <li>Click "Capture Photo" or upload from your device</li>
            <li>Review the photo and confirm or retake as needed</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default CameraCapture;
