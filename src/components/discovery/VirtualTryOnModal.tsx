import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Camera,
  Upload,
  User,
  Sparkles,
  ShoppingBag,
  Heart,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sliders,
  Check,
  ShieldCheck,
  AlertCircle,
  Eye,
} from 'lucide-react';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { Product, Shade, TryOnModelPreset, TryOnConfig } from '../../types';
import { GLAMIRK_PRODUCTS } from '../../data/products';
import { TRY_ON_MODELS } from '../../data/models';
import { useCMS } from '../../context/CMSContext';
import { useFaceLandmarker } from '../../hooks/useFaceLandmarker';
import { resolveTryOnConfig } from '../../utils/tryOnRenderer';
import { TryOnCanvas, TryOnCanvasHandle } from './TryOnCanvas';
import type { DetectionStatus } from '../../utils/faceMesh';

type FaceStatus = DetectionStatus | 'idle' | 'detecting';

const FACE_STATUS_MESSAGE: Record<FaceStatus, string | null> = {
  idle: null,
  detecting: 'Analyzing face…',
  ok: null,
  'no-face': 'No face detected. Center your face in frame with even lighting.',
  'multiple-faces': null,
  unsupported: "Your browser doesn't support live face analysis — showing the photo without the try-on effect.",
  'load-error': 'Could not analyze this image. Please try a different photo.',
};

interface VirtualTryOnModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProductId?: string;
  initialShadeId?: string;
  onAddToBag: (product: Product, shade?: Shade, size?: string, quantity?: number) => void;
  onToggleWishlist: (productId: string) => void;
  isWishlisted: boolean;
  onViewProduct: (product: Product) => void;
  onOpenShadeFinder: () => void;
}

export const VirtualTryOnModal: React.FC<VirtualTryOnModalProps> = ({
  isOpen,
  onClose,
  initialProductId,
  initialShadeId,
  onAddToBag,
  onToggleWishlist,
  isWishlisted,
  onViewProduct,
  onOpenShadeFinder,
}) => {
  // Active product & shades
  const { products: cmsProducts, tryOnModels: cmsTryOnModels } = useCMS();
  const catalogProducts = cmsProducts && cmsProducts.length > 0 ? cmsProducts : GLAMIRK_PRODUCTS;
  const currentProduct =
    catalogProducts.find((p) => p.id === (initialProductId || 'matte-liquid-lipstick-collection')) ||
    catalogProducts[0];
  const allShades = currentProduct.shades || [];
  const tryOnConfig = resolveTryOnConfig(currentProduct);

  // Admin-managed (Admin → Virtual Try-On Models) — falls back to the
  // static seed list only if the CMS has none configured yet.
  const activeModels = (cmsTryOnModels && cmsTryOnModels.length > 0 ? cmsTryOnModels : TRY_ON_MODELS).filter(
    (m) => m.isActive !== false
  );
  const defaultModels = activeModels.length > 0 ? activeModels : TRY_ON_MODELS;

  const [selectedShadeIndex, setSelectedShadeIndex] = useState(0);
  const [tryOnMode, setTryOnMode] = useState<'MODEL' | 'CAMERA' | 'UPLOAD'>('MODEL');
  const [selectedModel, setSelectedModel] = useState<TryOnModelPreset>(TRY_ON_MODELS[2]); // Medium Rhea by default
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);

  // AR settings
  const [showBeforeAfter, setShowBeforeAfter] = useState(false); // false = After (with shade), true = Before (bare lip)
  const [intensity, setIntensity] = useState(85); // 50% to 100%
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

  // Camera video ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Real face-landmark detection + canvas rendering (src/utils/faceMesh.ts,
  // src/utils/tryOnRenderer.ts) — replaces the old fixed CSS-gradient
  // "lip overlay" with an actual per-frame lip/eye/face mask built from
  // detected landmarks.
  const { startVideoLoop, stopVideoLoop, detectImage } = useFaceLandmarker();
  const canvasHandleRef = useRef<TryOnCanvasHandle>(null);
  const modelImgRef = useRef<HTMLImageElement | null>(null);
  const uploadImgRef = useRef<HTMLImageElement | null>(null);
  const [modelLandmarks, setModelLandmarks] = useState<NormalizedLandmark[] | null>(null);
  const [uploadLandmarks, setUploadLandmarks] = useState<NormalizedLandmark[] | null>(null);
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('idle');

  // The live-camera detection loop runs outside React's render cycle
  // (~12fps via requestAnimationFrame) to avoid re-rendering the whole
  // modal on every frame — it reads shade/config through refs kept in
  // sync below instead of closing over stale render-time values.
  const shadeHexRef = useRef<string>('#F05A7E');
  const configRef = useRef<TryOnConfig>({ enabled: true, type: 'lipstick', region: 'lips', intensity: 70, opacity: 85 });
  const showBeforeAfterRef = useRef(false);

  // The CMS model list loads asynchronously after mount — once it's in,
  // make sure the selected model is actually one of the active ones
  // (the initial state is just a reasonable static guess).
  useEffect(() => {
    if (defaultModels.length > 0 && !defaultModels.some((m) => m.id === selectedModel.id)) {
      setSelectedModel(defaultModels[Math.min(2, defaultModels.length - 1)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultModels]);

  // Sync initial shade
  useEffect(() => {
    if (initialShadeId && allShades.length > 0) {
      const idx = allShades.findIndex((s) => s.id === initialShadeId);
      if (idx !== -1) setSelectedShadeIndex(idx);
    }
  }, [initialShadeId, allShades]);

  // Clean up camera stream on close or mode change
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
    }
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      setTryOnMode('CAMERA');
    } catch (err: any) {
      console.warn('Camera not available or denied:', err);
      setCameraError('Camera access unavailable. Enjoying simulated beauty preview with our luxury model presets.');
      setTryOnMode('MODEL');
    }
  };

  // The <video> element only mounts once tryOnMode === 'CAMERA', so the
  // stream must be attached after that render (setting it inside startCamera
  // would hit a still-null ref, since the element doesn't exist yet).
  useEffect(() => {
    if (tryOnMode === 'CAMERA' && isCameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [tryOnMode, isCameraActive]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setUploadError(`"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Please choose a photo under 2MB.`);
      e.target.value = '';
      return;
    }
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedPhoto(event.target?.result as string);
      setTryOnMode('UPLOAD');
      stopCameraStream();
    };
    reader.readAsDataURL(file);
  };

  const currentShade = allShades[selectedShadeIndex] || allShades[0];

  // Keep the live-camera loop's refs current without restarting the loop
  // or re-rendering per frame — a shade/intensity change takes effect on
  // the very next sampled frame.
  useEffect(() => {
    shadeHexRef.current = currentShade?.hex || '#F05A7E';
  }, [currentShade]);
  useEffect(() => {
    configRef.current = { ...tryOnConfig, opacity: intensity, intensity };
  }, [tryOnConfig, intensity]);
  useEffect(() => {
    showBeforeAfterRef.current = showBeforeAfter;
  }, [showBeforeAfter]);

  // STANDARD MODEL mode: detect once per model image, then redraw
  // (cheap — no re-detection) whenever shade/intensity/before-after toggles.
  useEffect(() => {
    if (tryOnMode !== 'MODEL') return;
    setModelLandmarks(null);
    setFaceStatus('detecting');
  }, [tryOnMode, selectedModel]);

  const handleModelImageLoad = async () => {
    const img = modelImgRef.current;
    if (!img) return;
    const result = await detectImage(img);
    setModelLandmarks(result.landmarks);
    setFaceStatus(result.status);
  };

  useEffect(() => {
    if (tryOnMode !== 'MODEL' || !modelImgRef.current) return;
    canvasHandleRef.current?.draw(
      modelImgRef.current,
      showBeforeAfter ? null : modelLandmarks,
      currentShade?.hex || '#F05A7E',
      { ...tryOnConfig, opacity: intensity, intensity }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryOnMode, modelLandmarks, currentShade, intensity, showBeforeAfter, tryOnConfig]);

  // UPLOAD PHOTO mode: detect once per uploaded photo, then redraw on the
  // same shade/intensity/before-after changes as Standard Model.
  const handleUploadImageLoad = async () => {
    const img = uploadImgRef.current;
    if (!img) return;
    setFaceStatus('detecting');
    const result = await detectImage(img);
    setUploadLandmarks(result.landmarks);
    setFaceStatus(result.status);
  };

  useEffect(() => {
    if (tryOnMode !== 'UPLOAD' || !uploadImgRef.current) return;
    canvasHandleRef.current?.draw(
      uploadImgRef.current,
      showBeforeAfter ? null : uploadLandmarks,
      currentShade?.hex || '#F05A7E',
      { ...tryOnConfig, opacity: intensity, intensity }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryOnMode, uploadLandmarks, currentShade, intensity, showBeforeAfter, tryOnConfig]);

  // LIVE CAMERA mode: continuous detect-and-draw loop, started once the
  // stream is attached and stopped on mode change/close. Reads
  // shade/config through the refs above rather than closure state so
  // switching shades never needs to restart the loop.
  useEffect(() => {
    if (tryOnMode !== 'CAMERA' || !isCameraActive) return;
    const video = videoRef.current;
    if (!video) return;

    setFaceStatus('detecting');
    const cleanup = startVideoLoop(video, (result) => {
      setFaceStatus(result.status);
      canvasHandleRef.current?.draw(
        video,
        showBeforeAfterRef.current ? null : result.landmarks,
        shadeHexRef.current,
        configRef.current
      );
    });

    return () => {
      cleanup();
      stopVideoLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryOnMode, isCameraActive]);

  if (!isOpen) return null;

  const handlePrevShade = () => {
    setSelectedShadeIndex((prev) => (prev > 0 ? prev - 1 : allShades.length - 1));
  };

  const handleNextShade = () => {
    setSelectedShadeIndex((prev) => (prev < allShades.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto bg-[#0B0B0B]/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative bg-[#FAF9F6] border border-[#E8D5A8] shadow-2xl max-w-6xl w-full h-[94vh] max-h-[900px] flex flex-col overflow-hidden"
      >
        {/* Top Luxury Bar */}
        <div className="px-6 py-4 bg-[#0B0B0B] text-[#FAF9F6] border-b border-[#0B0B0B] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[#C9972B] animate-pulse" />
            <div>
              <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B] block">
                GLAMIRK VIRTUAL ATELIER
              </span>
              <h2 className="font-serif text-lg text-[#FAF9F6] tracking-wide">
                TRY YOUR GLAM
              </h2>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="hidden sm:flex items-center gap-1 bg-[#0B0B0B] p-1 border border-[#171717] rounded-none">
            <button
              onClick={() => {
                stopCameraStream();
                setTryOnMode('MODEL');
              }}
              className={`px-3 py-1.5 text-[11px] font-medium tracking-wider uppercase transition-colors flex items-center gap-1.5 cursor-pointer ${
                tryOnMode === 'MODEL' ? 'bg-[#FAF9F6] text-[#121212]' : 'text-[#C9972B] hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Standard Model</span>
            </button>

            <button
              onClick={startCamera}
              className={`px-3 py-1.5 text-[11px] font-medium tracking-wider uppercase transition-colors flex items-center gap-1.5 cursor-pointer ${
                tryOnMode === 'CAMERA' ? 'bg-[#FAF9F6] text-[#121212]' : 'text-[#C9972B] hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Live Camera</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              title="Max file size 2MB"
              className={`px-3 py-1.5 text-[11px] font-medium tracking-wider uppercase transition-colors flex items-center gap-1.5 cursor-pointer ${
                tryOnMode === 'UPLOAD' ? 'bg-[#FAF9F6] text-[#121212]' : 'text-[#C9972B] hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Photo (max 2MB)</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* Close button */}
          <button
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            className="p-2 text-[#C9972B] hover:text-white hover:bg-[#0B0B0B] transition-colors rounded-full cursor-pointer"
            aria-label="Close try-on"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera fallback notification if triggered */}
        {cameraError && (
          <div className="bg-[#FAF9F6] px-4 py-2 text-xs text-[#6B6B6B] border-b border-[#E8D5A8] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#C9972B] shrink-0" />
              <span>{cameraError}</span>
            </div>
            <button
              onClick={() => setCameraError(null)}
              className="text-[10px] uppercase font-semibold text-[#121212] hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Upload size limit notification */}
        {uploadError && (
          <div className="bg-[#FCE8ED] px-4 py-2 text-xs text-[#F05A7E] border-b border-[#E8D5A8] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
            <button
              onClick={() => setUploadError(null)}
              className="text-[10px] uppercase font-semibold text-[#121212] hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Body: 2-Column Split Layout */}
        <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          
          {/* Left Canvas Preview (Col 1 to 7) */}
          <div className="lg:col-span-7 bg-[#0B0B0B] relative flex items-center justify-center overflow-hidden">
            
            {/* Visualizer Area */}
            <div className="relative w-full h-full flex items-center justify-center">
              
              {/* Mode 1: MODEL PREVIEW — real detected-landmark lip/eye/face
                  mask (src/utils/tryOnRenderer.ts), not a fixed gradient.
                  The <img> is the pixel source for detection/drawing only;
                  the canvas is what's actually shown. */}
              {tryOnMode === 'MODEL' && (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img
                    key={selectedModel.id}
                    ref={modelImgRef}
                    src={selectedModel.image}
                    alt={selectedModel.name}
                    crossOrigin="anonymous"
                    onLoad={handleModelImageLoad}
                    onError={() => setFaceStatus('load-error')}
                    className="hidden"
                  />
                  <TryOnCanvas
                    ref={canvasHandleRef}
                    className="w-full h-full object-cover object-center max-h-[600px] lg:max-h-full"
                  />
                </div>
              )}

              {/* Mode 2: LIVE CAMERA STREAM — continuous detect+draw loop
                  (see the CAMERA useEffect above); the <video> is hidden,
                  the canvas mirrors it plus the live effect together. */}
              {tryOnMode === 'CAMERA' && (
                <div className="relative w-full h-full flex items-center justify-center bg-[#0B0B0B]">
                  <video ref={videoRef} autoPlay playsInline muted className="hidden" />
                  <TryOnCanvas ref={canvasHandleRef} className="w-full h-full object-cover" mirror />
                  <div className="absolute top-4 left-4 bg-[#0B0B0B]/60 backdrop-blur-xs text-white px-3 py-1 text-[10px] tracking-widest uppercase flex items-center gap-2 border border-white/20">
                    <span className="w-2 h-2 rounded-full bg-[#F05A7E] animate-ping" />
                    <span>Live AR Studio</span>
                  </div>
                </div>
              )}

              {/* Mode 3: UPLOADED PHOTO — detected once on load, then
                  redrawn (no re-detection) on shade/intensity changes. */}
              {tryOnMode === 'UPLOAD' && uploadedPhoto && (
                <div className="relative w-full h-full flex items-center justify-center bg-[#0B0B0B]">
                  <img
                    ref={uploadImgRef}
                    src={uploadedPhoto}
                    alt="Uploaded Portrait"
                    onLoad={handleUploadImageLoad}
                    className="hidden"
                  />
                  <TryOnCanvas ref={canvasHandleRef} className="w-full h-full object-contain max-h-[600px]" />
                </div>
              )}

              {/* Face analysis status — no-face / unsupported-browser /
                  detecting states, per spec §11 & §23. Never silent. */}
              {FACE_STATUS_MESSAGE[faceStatus] && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 bg-[#0B0B0B]/80 backdrop-blur-xs text-white text-[11px] px-4 py-2 border border-white/20 flex items-center gap-2 max-w-[90%] text-center">
                  <AlertCircle className="w-3.5 h-3.5 text-[#C9972B] shrink-0" />
                  <span>{FACE_STATUS_MESSAGE[faceStatus]}</span>
                </div>
              )}

              {/* Before/After Indicator Badge */}
              <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-[#0B0B0B]/60 backdrop-blur-xs px-3 py-1.5 border border-white/20">
                <button
                  onClick={() => setShowBeforeAfter(!showBeforeAfter)}
                  className={`text-[10px] tracking-wider uppercase font-semibold transition-colors cursor-pointer ${
                    showBeforeAfter ? 'text-[#C9972B]' : 'text-white/70 hover:text-white'
                  }`}
                >
                  {showBeforeAfter ? '• Bare Lip (Before)' : '• Glamirk Shade (After)'}
                </button>
              </div>

              {/* Mobile Mode Switcher */}
              <div className="sm:hidden absolute bottom-4 left-4 right-4 flex justify-center gap-2 z-10">
                <button
                  onClick={() => {
                    stopCameraStream();
                    setTryOnMode('MODEL');
                  }}
                  className={`px-3 py-1 text-[10px] tracking-wider uppercase font-medium bg-[#0B0B0B]/80 text-white border ${
                    tryOnMode === 'MODEL' ? 'border-[#C9972B] text-[#C9972B]' : 'border-white/20'
                  }`}
                >
                  Model
                </button>
                <button
                  onClick={startCamera}
                  className={`px-3 py-1 text-[10px] tracking-wider uppercase font-medium bg-[#0B0B0B]/80 text-white border ${
                    tryOnMode === 'CAMERA' ? 'border-[#C9972B] text-[#C9972B]' : 'border-white/20'
                  }`}
                >
                  Camera
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`px-3 py-1 text-[10px] tracking-wider uppercase font-medium bg-[#0B0B0B]/80 text-white border ${
                    tryOnMode === 'UPLOAD' ? 'border-[#C9972B] text-[#C9972B]' : 'border-white/20'
                  }`}
                >
                  Upload
                </button>
              </div>
            </div>

            {/* Model Selection Selector Bar (when in model mode) */}
            {tryOnMode === 'MODEL' && (
              <div className="absolute bottom-4 left-4 right-4 bg-[#0B0B0B]/80 backdrop-blur-xs p-2.5 border border-white/10 flex items-center justify-between gap-2 overflow-x-auto">
                <span className="text-[9.5px] uppercase tracking-widest text-[#C9972B] font-semibold whitespace-nowrap hidden sm:inline">
                  Complexion:
                </span>
                <div className="flex items-center gap-2">
                  {defaultModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model)}
                      className={`px-2.5 py-1 text-[10px] tracking-wider uppercase font-medium transition-all whitespace-nowrap cursor-pointer ${
                        selectedModel.id === model.id
                          ? 'bg-[#FAF9F6] text-[#121212]'
                          : 'bg-transparent text-[#C9972B] hover:text-white border border-white/10'
                      }`}
                    >
                      {model.name} ({model.skinTone})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Product & Shade Atelier Control Panel (Col 8 to 12) */}
          <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between overflow-y-auto bg-[#FAF9F6]">
            
            <div className="space-y-6">
              
              {/* Product Info Header */}
              <div className="border-b border-[#E8D5A8] pb-4">
                <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-[#C9972B] block mb-1">
                  {currentProduct.subCategory} • {currentProduct.category}
                </span>
                <h3 className="font-serif text-2xl text-[#121212]">
                  {currentProduct.name}
                </h3>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-serif text-xl text-[#121212] font-medium">
                    {currentProduct.currency}{currentProduct.price}
                  </span>
                  <span className="text-xs text-[#6B6B6B] uppercase tracking-wider">
                    Finish: <strong>{currentProduct.finish || 'Velvet Matte'}</strong>
                  </span>
                </div>
              </div>

              {/* Active Shade Highlight with Prev / Next Navigation */}
              <div className="bg-[#FAF9F6] p-4 sm:p-5 border border-[#E8D5A8] space-y-3">
                <div className="flex items-center justify-between">
                  <button
                    onClick={handlePrevShade}
                    className="p-1.5 text-[#6B6B6B] hover:text-[#121212] hover:bg-[#E8D5A8] rounded-full transition-colors cursor-pointer"
                    title="Previous Shade"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  <div className="flex items-center gap-3 text-center">
                    <div
                      className="w-7 h-7 rounded-full border border-[#0B0B0B]/20 shadow-xs ring-2 ring-[#C9972B]"
                      style={{ backgroundColor: currentShade.hex }}
                    />
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#121212] block">
                        {currentShade.name}
                      </span>
                      <span className="text-[10.5px] text-[#C9972B] font-medium tracking-wide">
                        {currentShade.undertone} Undertone
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleNextShade}
                    className="p-1.5 text-[#6B6B6B] hover:text-[#121212] hover:bg-[#E8D5A8] rounded-full transition-colors cursor-pointer"
                    title="Next Shade"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-xs text-[#6B6B6B] font-light text-center leading-relaxed italic pt-1 border-t border-[#E8D5A8]">
                  "{currentShade.description}"
                </p>
              </div>

              {/* Shade Selector Carousel */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#6B6B6B] block">
                  Select Another Shade ({allShades.length} Available):
                </span>
                <div className="grid grid-cols-4 gap-2.5">
                  {allShades.map((shade, idx) => (
                    <button
                      key={shade.id}
                      onClick={() => setSelectedShadeIndex(idx)}
                      className={`p-2 border text-left transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                        selectedShadeIndex === idx
                          ? 'border-[#0B0B0B] bg-[#FAF9F6] ring-1 ring-[#C9972B]'
                          : 'border-[#E8D5A8] bg-[#FAF9F6] hover:border-[#0B0B0B]'
                      }`}
                    >
                      <div
                        className="w-5 h-5 rounded-full border border-[#0B0B0B]/10 shadow-xs"
                        style={{ backgroundColor: shade.hex }}
                      />
                      <span className="text-[10px] font-medium text-[#121212] text-center leading-tight truncate w-full">
                        {shade.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* AR Intensity Slider */}
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between text-xs text-[#6B6B6B]">
                  <span className="uppercase tracking-wider font-medium flex items-center gap-1">
                    <Sliders className="w-3 h-3 text-[#C9972B]" />
                    <span>Coverage Intensity</span>
                  </span>
                  <span>{intensity}%</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="100"
                  value={intensity}
                  onChange={(e) => setIntensity(Number(e.target.value))}
                  className="w-full accent-[#0B0B0B] cursor-pointer"
                />
              </div>

              {/* Personal Consultation Teaser */}
              <div className="p-3 bg-[#FAF9F6] border border-[#E8D5A8] flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[9.5px] uppercase tracking-widest text-[#C9972B] font-semibold block">
                    Not sure if it matches?
                  </span>
                  <span className="text-xs text-[#6B6B6B] font-light">
                    Take our 60-second shade quiz.
                  </span>
                </div>
                <button
                  onClick={() => {
                    stopCameraStream();
                    onClose();
                    onOpenShadeFinder();
                  }}
                  className="px-3 py-1.5 bg-[#FAF9F6] border border-[#0B0B0B] text-[#121212] text-[10px] font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer"
                >
                  Match Undertone
                </button>
              </div>

            </div>

            {/* Bottom Actions Bar */}
            <div className="pt-6 border-t border-[#E8D5A8] space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onToggleWishlist(currentProduct.id)}
                  className="p-3.5 border border-[#E8D5A8] bg-[#FAF9F6] hover:border-[#0B0B0B] text-[#121212] transition-colors cursor-pointer"
                  title="Save Shade to Wishlist"
                  aria-label="Save Shade"
                >
                  <Heart
                    className={`w-5 h-5 ${
                      isWishlisted ? 'fill-[#C9972B] text-[#C9972B]' : ''
                    }`}
                  />
                </button>

                <button
                  id="tryon-add-to-bag-btn"
                  onClick={() => {
                    onAddToBag(currentProduct, currentShade, undefined, 1);
                    stopCameraStream();
                    onClose();
                  }}
                  className="flex-grow py-3.5 px-6 bg-[#0B0B0B] text-[#FAF9F6] text-[12px] font-semibold tracking-[0.22em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4 text-[#C9972B]" />
                  <span>ADD TO BAG • ₹{currentProduct.price}</span>
                </button>
              </div>

              <button
                onClick={() => {
                  stopCameraStream();
                  onClose();
                  onViewProduct(currentProduct);
                }}
                className="w-full py-2 text-center text-xs tracking-widest uppercase font-medium text-[#6B6B6B] hover:text-[#121212] transition-colors cursor-pointer"
              >
                View Full Product Details & Formulation Ritual →
              </button>
            </div>

          </div>

        </div>
      </motion.div>
    </div>
  );
};
