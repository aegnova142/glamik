import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Camera,
  Upload,
  RotateCcw,
  ShieldCheck,
  Heart,
  ShoppingBag,
  HelpCircle,
  Eye,
  Sliders,
  ChevronRight,
} from 'lucide-react';
import {
  Product,
  Shade,
  SkinToneType,
  UndertoneType,
  BeautyStyleType,
  OccasionType,
  FinishPreferenceType,
  BeautyProfile,
  RecommendationMatch,
} from '../types';
import { GLAMIRK_PRODUCTS } from '../data/products';
import { generateBeautyMatch } from '../data/recommendationEngine';
import { UndertoneGuideModal } from './UndertoneGuideModal';
import { ShadeComparison } from './ShadeComparison';

interface FindMyShadePageProps {
  onExploreShop: () => void;
  onOpenTryOn: (product: Product, shade: Shade) => void;
  onAddToBag: (product: Product, shade?: Shade, size?: string, quantity?: number) => void;
  onSaveProfile: (profile: BeautyProfile) => void;
  onViewProduct: (product: Product) => void;
  onToggleWishlist: (productId: string) => void;
  wishlist: string[];
}

export const FindMyShadePage: React.FC<FindMyShadePageProps> = ({
  onExploreShop,
  onOpenTryOn,
  onAddToBag,
  onSaveProfile,
  onViewProduct,
  onToggleWishlist,
  wishlist,
}) => {
  // Step state: 0 = Landing, 1 to 5 = Questions, 6 = Optional Photo, 7 = Loading, 8 = Results
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isUndertoneGuideOpen, setIsUndertoneGuideOpen] = useState(false);

  // Form State
  const [skinTone, setSkinTone] = useState<SkinToneType>('Medium');
  const [undertone, setUndertone] = useState<UndertoneType>('Warm');
  const [style, setStyle] = useState<BeautyStyleType>('Natural');
  const [occasion, setOccasion] = useState<OccasionType>('Everyday');
  const [finish, setFinish] = useState<FinishPreferenceType>('Matte');

  // Camera / Upload state
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Recommendation Match Result
  const [matchResult, setMatchResult] = useState<RecommendationMatch | null>(null);
  const [comparedShadeIds, setComparedShadeIds] = useState<string[]>(['caramel', 'rose-red', 'ruby-desire']);
  const [isProfileSaved, setIsProfileSaved] = useState(false);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err) {
      console.warn('Camera access unavailable:', err);
      setCameraError('Camera access not granted or unavailable on this device. You may upload a photo or continue without one.');
      setIsCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Mirror horizontally
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedPhoto(dataUrl);
        stopCameraStream();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedPhoto(event.target?.result as string);
        stopCameraStream();
      };
      reader.readAsDataURL(file);
    }
  };

  // Generate Match Flow
  const handleGenerateMatch = () => {
    stopCameraStream();
    setCurrentStep(7); // Loading step
    setTimeout(() => {
      const profile: BeautyProfile = {
        skinTone,
        undertone,
        style,
        occasion,
        finish,
        capturedPhoto: capturedPhoto || undefined,
        savedAt: new Date().toISOString(),
      };
      const result = generateBeautyMatch(profile);
      setMatchResult(result);
      setCurrentStep(8); // Results view
    }, 1600);
  };

  const handleSaveBeautyProfile = () => {
    const profile: BeautyProfile = {
      skinTone,
      undertone,
      style,
      occasion,
      finish,
      capturedPhoto: capturedPhoto || undefined,
      savedAt: new Date().toISOString(),
    };
    onSaveProfile(profile);
    setIsProfileSaved(true);
  };

  const toggleComparedShade = (shadeId: string) => {
    setComparedShadeIds((prev) =>
      prev.includes(shadeId)
        ? prev.filter((id) => id !== shadeId)
        : prev.length < 3
        ? [...prev, shadeId]
        : [prev[1], prev[2], shadeId]
    );
  };

  // Skin tone definitions
  const skinTones: { id: SkinToneType; label: string; color: string; desc: string }[] = [
    { id: 'Fair', label: 'Fair', color: '#F8E3D2', desc: 'Porcelain or ivory surface tone' },
    { id: 'Light', label: 'Light', color: '#EFC9AF', desc: 'Warm cream or light golden surface tone' },
    { id: 'Medium', label: 'Medium', color: '#D6A681', desc: 'Olive, honey or golden medium surface tone' },
    { id: 'Tan', label: 'Tan', color: '#B37850', desc: 'Sun-kissed bronze or rich caramel tone' },
    { id: 'Deep', label: 'Deep', color: '#6F4129', desc: 'Rich mocha, cocoa or deep espresso tone' },
  ];

  return (
    <div className="bg-[#FAF9F6] min-h-screen text-[#121212] pb-24">
      
      {/* 1. LANDING VIEW (Step 0) */}
      {currentStep === 0 && (
        <div>
          {/* Editorial Consultation Hero */}
          <section className="relative py-20 lg:py-32 border-b border-[#FAF9F6] overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#FAF9F6] border border-[#E8D5A8] text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>INTELLIGENT SHADE DISCOVERY</span>
                </div>

                <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-[#121212] font-normal leading-[1.1]">
                  FIND YOUR <br />
                  <span className="italic font-light">PERFECT SHADE</span>
                </h1>

                <p className="text-base sm:text-lg text-[#6B6B6B] font-light max-w-xl leading-relaxed">
                  Beauty is personal. Your shade should be too. Let Glamirk curate your ideal lip & cosmetic matches based on your unique undertone, aesthetic style, and everyday rituals.
                </p>

                <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  <button
                    id="start-finding-shade-btn"
                    onClick={() => setCurrentStep(1)}
                    className="px-8 py-4 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.22em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                  >
                    <span>START FINDING MY SHADE</span>
                    <ArrowRight className="w-4 h-4 text-[#C9972B]" />
                  </button>

                  <button
                    onClick={onExploreShop}
                    className="px-8 py-4 bg-transparent border border-[#0B0B0B] text-[#121212] text-xs font-semibold tracking-[0.22em] uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors cursor-pointer text-center"
                  >
                    I ALREADY KNOW MY SHADE
                  </button>
                </div>

                {/* Consultation Assurance */}
                <div className="pt-8 border-t border-[#E8D5A8] flex items-center gap-6 text-xs text-[#6B6B6B]">
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-[#C9972B]" />
                    <span>60-Second Consultation</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-[#C9972B]" />
                    <span>Indian Skin Calibrated</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-[#C9972B]" />
                    <span>Virtual Try-On Ready</span>
                  </div>
                </div>
              </div>

              {/* Editorial Hero Visual */}
              <div className="lg:col-span-5">
                <div className="relative aspect-[4/5] bg-[#E8D5A8] border border-[#E8D5A8] p-3 shadow-xl">
                  <img
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=85"
                    alt="Glamirk Shade Consultation"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute -bottom-5 -left-5 bg-[#FAF9F6] p-4 border border-[#E8D5A8] shadow-lg max-w-[220px]">
                    <span className="text-[9.5px] uppercase tracking-widest text-[#C9972B] font-semibold block">
                      Undertone Precision
                    </span>
                    <p className="text-xs text-[#121212] font-medium mt-0.5">
                      Warm, Cool & Neutral pigments crafted for lasting wear.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </section>
        </div>
      )}

      {/* 2. QUESTIONNAIRE STEPS (Step 1 to 5) */}
      {currentStep >= 1 && currentStep <= 5 && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-20">
          
          {/* Progress Indicator: Minimal and elegant */}
          <div className="flex items-center justify-between border-b border-[#E8D5A8] pb-4 mb-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="p-1.5 text-[#6B6B6B] hover:text-[#121212] hover:bg-[#E8D5A8] rounded-full transition-colors cursor-pointer"
                aria-label="Previous step"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                CONSULTATION STEP {currentStep} OF 5
              </span>
            </div>

            <span className="font-serif text-lg text-[#121212] tracking-widest">
              0{currentStep} / 05
            </span>
          </div>

          {/* STEP 1: SKIN TONE */}
          {currentStep === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <h2 className="font-serif text-3xl sm:text-4xl text-[#121212]">
                  WHAT'S YOUR SKIN TONE?
                </h2>
                <p className="text-sm text-[#6B6B6B] font-light">
                  Select the tone that best reflects your surface complexion.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {skinTones.map((tone) => (
                  <button
                    key={tone.id}
                    onClick={() => setSkinTone(tone.id)}
                    className={`p-5 border text-left transition-all flex items-center gap-4 cursor-pointer ${
                      skinTone === tone.id
                        ? 'border-[#0B0B0B] bg-[#FAF9F6] shadow-sm ring-1 ring-[#C9972B]'
                        : 'border-[#E8D5A8] bg-[#FAF9F6] hover:border-[#0B0B0B]'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-full border border-black/10 shadow-xs shrink-0"
                      style={{ backgroundColor: tone.color }}
                    />
                    <div className="space-y-0.5">
                      <span className="text-sm font-bold uppercase tracking-wider text-[#121212] block">
                        {tone.label}
                      </span>
                      <span className="text-xs text-[#6B6B6B] font-light block">
                        {tone.desc}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-[#E8D5A8]">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="text-xs text-[#6B6B6B] hover:text-[#121212] uppercase tracking-wider font-medium cursor-pointer"
                >
                  Skip
                </button>
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <span>CONTINUE</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: UNDERTONE */}
          {currentStep === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-3xl sm:text-4xl text-[#121212]">
                    WHAT'S YOUR UNDERTONE?
                  </h2>
                </div>
                <p className="text-sm text-[#6B6B6B] font-light">
                  Undertone is the subtle tone under your skin surface.
                </p>
                <button
                  onClick={() => setIsUndertoneGuideOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#C9972B] font-semibold uppercase tracking-wider hover:underline underline-offset-4 pt-1 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>HOW DO I FIND MY UNDERTONE? (Mini-Guide)</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(['Warm', 'Cool', 'Neutral'] as UndertoneType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setUndertone(t)}
                    className={`p-6 border text-left transition-all space-y-2 cursor-pointer ${
                      undertone === t
                        ? 'border-[#0B0B0B] bg-[#FAF9F6] shadow-sm ring-1 ring-[#C9972B]'
                        : 'border-[#E8D5A8] bg-[#FAF9F6] hover:border-[#0B0B0B]'
                    }`}
                  >
                    <span className="text-sm font-bold uppercase tracking-wider text-[#121212] block">
                      {t}
                    </span>
                    <p className="text-xs text-[#6B6B6B] font-light leading-relaxed">
                      {t === 'Warm' && 'Peachy, golden, yellow or olive nuances.'}
                      {t === 'Cool' && 'Pink, rose, berry or bluish nuances.'}
                      {t === 'Neutral' && 'Equally balanced between warm and cool tones.'}
                    </p>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-[#E8D5A8]">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="text-xs text-[#6B6B6B] hover:text-[#121212] uppercase tracking-wider font-medium cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  className="px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <span>CONTINUE</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: SIGNATURE STYLE */}
          {currentStep === 3 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <h2 className="font-serif text-3xl sm:text-4xl text-[#121212]">
                  WHAT'S YOUR SIGNATURE STYLE?
                </h2>
                <p className="text-sm text-[#6B6B6B] font-light">
                  Choose the aesthetic that best aligns with your daily and evening mood.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(['Natural', 'Minimal', 'Bold', 'Glam', 'Soft'] as BeautyStyleType[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStyle(s)}
                    className={`p-5 border text-left transition-all space-y-1.5 cursor-pointer ${
                      style === s
                        ? 'border-[#0B0B0B] bg-[#FAF9F6] shadow-sm ring-1 ring-[#C9972B]'
                        : 'border-[#E8D5A8] bg-[#FAF9F6] hover:border-[#0B0B0B]'
                    }`}
                  >
                    <span className="text-sm font-bold uppercase tracking-wider text-[#121212] block">
                      {s}
                    </span>
                    <span className="text-xs text-[#6B6B6B] font-light block">
                      {s === 'Natural' && 'Effortless terracotta & nude tones'}
                      {s === 'Minimal' && 'Understated, clean skin & subtle rose'}
                      {s === 'Bold' && 'High-impact crimson & statement lips'}
                      {s === 'Glam' && 'Sophisticated bridal & evening elegance'}
                      {s === 'Soft' && 'Delicate berries & velvety soft focus'}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-[#E8D5A8]">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="text-xs text-[#6B6B6B] hover:text-[#121212] uppercase tracking-wider font-medium cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(4)}
                  className="px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <span>CONTINUE</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: OCCASION */}
          {currentStep === 4 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <h2 className="font-serif text-3xl sm:text-4xl text-[#121212]">
                  WHAT ARE YOU SHOPPING FOR?
                </h2>
                <p className="text-sm text-[#6B6B6B] font-light">
                  Tell us where you plan to wear your new Glamirk beauty creations.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {(['Everyday', 'Office', 'Date Night', 'Party', 'Wedding', 'Festive'] as OccasionType[]).map((occ) => (
                  <button
                    key={occ}
                    onClick={() => setOccasion(occ)}
                    className={`p-4 border text-center transition-all cursor-pointer ${
                      occasion === occ
                        ? 'border-[#0B0B0B] bg-[#FAF9F6] shadow-sm ring-1 ring-[#C9972B]'
                        : 'border-[#E8D5A8] bg-[#FAF9F6] hover:border-[#0B0B0B]'
                    }`}
                  >
                    <span className="text-xs font-bold uppercase tracking-wider text-[#121212] block">
                      {occ}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-[#E8D5A8]">
                <button
                  onClick={() => setCurrentStep(3)}
                  className="text-xs text-[#6B6B6B] hover:text-[#121212] uppercase tracking-wider font-medium cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(5)}
                  className="px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <span>CONTINUE</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 5: FINISH PREFERENCE */}
          {currentStep === 5 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <h2 className="font-serif text-3xl sm:text-4xl text-[#121212]">
                  WHAT FINISH DO YOU LOVE?
                </h2>
                <p className="text-sm text-[#6B6B6B] font-light">
                  Choose your preferred lip and cosmetic texture.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(['Matte', 'Glossy', 'Natural', 'Open'] as FinishPreferenceType[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFinish(f)}
                    className={`p-5 border text-left transition-all space-y-1 cursor-pointer ${
                      finish === f
                        ? 'border-[#0B0B0B] bg-[#FAF9F6] shadow-sm ring-1 ring-[#C9972B]'
                        : 'border-[#E8D5A8] bg-[#FAF9F6] hover:border-[#0B0B0B]'
                    }`}
                  >
                    <span className="text-sm font-bold uppercase tracking-wider text-[#121212] block">
                      {f === 'Open' ? "I'm Open to Suggestions" : f}
                    </span>
                    <span className="text-xs text-[#6B6B6B] font-light block">
                      {f === 'Matte' && 'Transfer-proof velvet matte with soft focus blur'}
                      {f === 'Glossy' && 'Radiant high-shine cushion finish'}
                      {f === 'Natural' && 'Lightweight melting comfort balm feel'}
                      {f === 'Open' && 'Let Glamirk recommend based on occasion'}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-[#E8D5A8]">
                <button
                  onClick={() => setCurrentStep(4)}
                  className="text-xs text-[#6B6B6B] hover:text-[#121212] uppercase tracking-wider font-medium cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(6)}
                  className="px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <span>NEXT: PHOTO MATCH</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}

        </div>
      )}

      {/* 3. OPTIONAL CAMERA / SELFIE STEP (Step 6) */}
      {currentStep === 6 && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-20 space-y-8">
          
          <div className="text-center space-y-2">
            <span className="text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
              OPTIONAL ENHANCEMENT
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl text-[#121212]">
              WANT A MORE PERSONAL MATCH?
            </h2>
            <p className="text-xs sm:text-sm text-[#6B6B6B] font-light max-w-md mx-auto leading-relaxed">
              Capture a selfie or upload a photo to preview shades on your face.
            </p>
          </div>

          {/* Privacy Notice Card */}
          <div className="p-4 bg-[#FAF9F6] border border-[#E8D5A8] flex items-start gap-3 text-left">
            <ShieldCheck className="w-5 h-5 text-[#C9972B] shrink-0 mt-0.5" />
            <div className="text-xs text-[#6B6B6B] space-y-0.5">
              <strong className="text-[#121212] block">Your privacy matters.</strong>
              <p className="font-light">
                Your photo is processed locally in your browser to help personalize your beauty match and is never uploaded or shared without permission.
              </p>
            </div>
          </div>

          {/* Camera Viewfinder or Photo Preview */}
          <div className="bg-[#0B0B0B] border border-[#171717] p-4 text-center relative aspect-[4/3] max-w-md mx-auto flex items-center justify-center overflow-hidden">
            {capturedPhoto ? (
              <div className="relative w-full h-full">
                <img
                  src={capturedPhoto}
                  alt="Captured Selfie"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => setCapturedPhoto(null)}
                  className="absolute bottom-3 right-3 px-3 py-1.5 bg-[#0B0B0B] text-white text-[10px] uppercase font-semibold tracking-wider flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Retake</span>
                </button>
              </div>
            ) : isCameraActive ? (
              <div className="relative w-full h-full">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
                <button
                  onClick={capturePhoto}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-2.5 bg-[#FAF9F6] text-[#121212] text-xs font-semibold tracking-widest uppercase hover:bg-white shadow-lg flex items-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-[#C9972B]" />
                  <span>CAPTURE</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-[#C9972B]">
                <Camera className="w-10 h-10 mx-auto text-[#C9972B]/70" />
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wider text-white">
                    Lighting Tips
                  </p>
                  <p className="text-[11px] font-light max-w-xs mx-auto">
                    Face the camera in natural daylight • Avoid heavy beauty filters
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Camera error if any */}
          {cameraError && (
            <div className="p-4 bg-[#FAF9F6] border border-[#E8D5A8] text-center max-w-md mx-auto space-y-3">
              <p className="text-xs uppercase tracking-wider font-semibold text-[#F05A7E]">
                CAMERA ACCESS IS REQUIRED FOR THIS EXPERIENCE
              </p>
              <p className="text-xs text-[#F05A7E] font-light">
                {cameraError}. You can retry allowing camera access or proceed immediately using our calibrated preset shade matches.
              </p>
              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  onClick={startCamera}
                  className="px-3.5 py-1.5 bg-[#F05A7E] text-white text-[11px] uppercase tracking-wider font-semibold hover:bg-[#F05A7E] transition-colors"
                >
                  TRY AGAIN
                </button>
                <button
                  onClick={handleGenerateMatch}
                  className="px-3.5 py-1.5 border border-[#F05A7E] text-[#F05A7E] text-[11px] uppercase tracking-wider font-semibold hover:bg-white transition-colors"
                >
                  CONTINUE WITHOUT CAMERA
                </button>
              </div>
            </div>
          )}

          {/* Camera & Upload Options */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {!isCameraActive && !capturedPhoto && (
              <button
                onClick={startCamera}
                className="w-full sm:w-auto px-6 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-[#C9972B]" />
                <span>USE CAMERA</span>
              </button>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto px-6 py-3.5 bg-[#FAF9F6] border border-[#0B0B0B] text-[#121212] text-xs font-semibold tracking-[0.2em] uppercase hover:bg-[#FAF9F6] transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#C9972B]" />
              <span>UPLOAD A PHOTO</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* Action Finalize Button */}
          <div className="pt-6 border-t border-[#E8D5A8] flex items-center justify-between">
            <button
              onClick={() => setCurrentStep(5)}
              className="text-xs text-[#6B6B6B] hover:text-[#121212] uppercase tracking-wider font-medium cursor-pointer"
            >
              Back
            </button>

            <button
              id="generate-my-glam-match-btn"
              onClick={handleGenerateMatch}
              className="px-8 py-3.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.22em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center gap-2 cursor-pointer shadow-lg"
            >
              <span>{capturedPhoto ? 'USE THIS PHOTO & VIEW MATCH' : 'CONTINUE WITHOUT PHOTO'}</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#C9972B]" />
            </button>
          </div>

        </div>
      )}

      {/* 4. AI LOADING STEP (Step 7) */}
      {currentStep === 7 && (
        <div className="py-32 max-w-xl mx-auto px-4 text-center space-y-6">
          <div className="relative w-16 h-16 mx-auto">
            <div className="w-16 h-16 rounded-full border-2 border-[#E8D5A8] border-t-[#C9972B] animate-spin" />
            <Sparkles className="w-6 h-6 text-[#C9972B] absolute inset-0 m-auto animate-pulse" />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
              CONSULTATION IN PROGRESS
            </span>
            <h2 className="font-serif text-3xl text-[#121212]">
              CREATING YOUR GLAM EDIT...
            </h2>
            <p className="text-xs sm:text-sm text-[#6B6B6B] font-light max-w-sm mx-auto">
              Finding formulations and shades calibrated for your {skinTone.toLowerCase()} skin tone with {undertone.toLowerCase()} undertones.
            </p>
          </div>
        </div>
      )}

      {/* 5. PERSONALIZED RESULTS VIEW (Step 8) */}
      {currentStep === 8 && matchResult && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 space-y-16">
          
          {/* Header Banner */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#FAF9F6] border border-[#E8D5A8] text-[10.5px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>YOUR GLAMIRK MATCH</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-[#121212]">
              YOUR PERSONAL BEAUTY EDIT
            </h2>
            <p className="text-sm sm:text-base text-[#6B6B6B] font-light max-w-xl mx-auto">
              Calibrated for your verified undertone, signature aesthetic, and occasion.
            </p>

            {/* Profile Summary Pills */}
            <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap pt-2">
              <span className="px-3 py-1 bg-[#FAF9F6] border border-[#E8D5A8] text-xs text-[#121212]">
                Skin Tone: <strong>{skinTone}</strong>
              </span>
              <span className="px-3 py-1 bg-[#FAF9F6] border border-[#E8D5A8] text-xs text-[#121212]">
                Undertone: <strong>{undertone}</strong>
              </span>
              <span className="px-3 py-1 bg-[#FAF9F6] border border-[#E8D5A8] text-xs text-[#121212]">
                Style: <strong>{style}</strong>
              </span>
              <span className="px-3 py-1 bg-[#FAF9F6] border border-[#E8D5A8] text-xs text-[#121212]">
                Finish: <strong>{finish}</strong>
              </span>
            </div>
          </div>

          {/* PRIMARY SHADE RECOMMENDATION HERO CARD */}
          <div className="bg-[#FAF9F6] border border-[#E8D5A8] shadow-xl grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
            
            {/* Left Image & Shade Swatch */}
            <div className="lg:col-span-6 bg-[#FAF9F6] p-8 sm:p-12 relative flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#E8D5A8]">
              <div className="relative aspect-square max-w-md mx-auto overflow-hidden bg-[#FAF9F6] border border-[#E8D5A8]">
                <img
                  src={matchResult.primaryProduct.images.primary}
                  alt={matchResult.primaryProduct.name}
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-4 left-4 px-3.5 py-1.5 bg-[#0B0B0B] text-[#FAF9F6] text-[10px] font-bold tracking-[0.2em] uppercase">
                  {matchResult.matchScoreTag}
                </span>
              </div>

              {/* Swatch Highlight */}
              <div className="mt-6 flex items-center justify-between bg-[#FAF9F6] p-4 border border-[#E8D5A8]">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full border border-black/20 shadow-xs ring-2 ring-[#C9972B]"
                    style={{ backgroundColor: matchResult.primaryShade.hex }}
                  />
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#121212] block">
                      {matchResult.primaryShade.name}
                    </span>
                    <span className="text-[10.5px] text-[#C9972B] font-medium">
                      {matchResult.primaryShade.undertone} Undertone
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onOpenTryOn(matchResult.primaryProduct, matchResult.primaryShade)}
                  className="px-4 py-2 bg-[#0B0B0B] text-[#FAF9F6] text-[10.5px] font-semibold tracking-wider uppercase flex items-center gap-1.5 hover:bg-[#0B0B0B] cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-[#C9972B]" />
                  <span>TRY IT ON</span>
                </button>
              </div>
            </div>

            {/* Right Information & Why We Picked It */}
            <div className="lg:col-span-6 p-8 sm:p-12 flex flex-col justify-between space-y-6">
              
              <div className="space-y-6">
                <div>
                  <span className="text-[10.5px] font-semibold tracking-[0.22em] uppercase text-[#C9972B] block mb-1">
                    YOUR SIGNATURE SHADE
                  </span>
                  <h3 className="font-serif text-3xl text-[#121212]">
                    {matchResult.primaryProduct.name}
                  </h3>
                  <p className="text-sm text-[#6B6B6B] font-light mt-1">
                    Shade: <strong className="text-[#121212]">{matchResult.primaryShade.name}</strong> • {matchResult.primaryProduct.finish || 'Velvet Matte'}
                  </p>
                </div>

                <div className="flex items-baseline gap-2 border-t border-b border-[#E8D5A8] py-3">
                  <span className="font-serif text-2xl text-[#121212]">
                    {matchResult.primaryProduct.currency}{matchResult.primaryProduct.price}
                  </span>
                  <span className="text-xs text-[#6B6B6B]">
                    (Inclusive of all taxes)
                  </span>
                </div>

                {/* Transparent Match Reason */}
                <div className="bg-[#FAF9F6] p-5 border border-[#E8D5A8] space-y-2">
                  <span className="text-[10.5px] font-bold tracking-[0.2em] uppercase text-[#C9972B] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>WHY WE PICKED IT</span>
                  </span>
                  <p className="text-xs text-[#6B6B6B] font-light leading-relaxed">
                    {matchResult.whyWePickedIt}
                  </p>
                </div>

                {/* Match Breakdown Formula */}
                <div className="text-xs text-[#6B6B6B] space-y-1.5 border-l-2 border-[#C9972B] pl-3">
                  <p><strong className="text-[#121212]">{undertone} Undertone</strong> + <strong className="text-[#121212]">{skinTone} Skin Tone</strong></p>
                  <p><strong className="text-[#121212]">{style} Style</strong> for <strong className="text-[#121212]">{occasion}</strong></p>
                </div>
              </div>

              {/* Action Area */}
              <div className="pt-6 border-t border-[#E8D5A8] space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onAddToBag(matchResult.primaryProduct, matchResult.primaryShade, undefined, 1)}
                    className="flex-grow py-4 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-[0.22em] uppercase hover:bg-[#0B0B0B] transition-colors flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                  >
                    <ShoppingBag className="w-4 h-4 text-[#C9972B]" />
                    <span>ADD MATCH TO BAG • ₹{matchResult.primaryProduct.price}</span>
                  </button>

                  <button
                    onClick={() => onToggleWishlist(matchResult.primaryProduct.id)}
                    className="p-3.5 border border-[#E8D5A8] bg-[#FAF9F6] hover:border-[#0B0B0B] text-[#121212] transition-colors cursor-pointer"
                    aria-label="Save to Wishlist"
                  >
                    <Heart
                      className={`w-5 h-5 ${
                        wishlist.includes(matchResult.primaryProduct.id)
                          ? 'fill-[#C9972B] text-[#C9972B]'
                          : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={handleSaveBeautyProfile}
                    className="text-xs text-[#C9972B] hover:text-[#121212] uppercase tracking-wider font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {isProfileSaved ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-700" />
                        <span>Saved to My Glam Profile</span>
                      </>
                    ) : (
                      <span>Save Match to My Glam Profile</span>
                    )}
                  </button>

                  <button
                    onClick={() => setCurrentStep(1)}
                    className="text-xs text-[#6B6B6B] hover:text-[#121212] uppercase tracking-wider font-light cursor-pointer"
                  >
                    Retake Quiz
                  </button>
                </div>
              </div>

            </div>

          </div>

          {/* ALTERNATIVE RECOMMENDATIONS */}
          <div className="space-y-6">
            <div className="border-b border-[#E8D5A8] pb-4">
              <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-[#C9972B]">
                CURATED VARIATIONS
              </span>
              <h3 className="font-serif text-2xl sm:text-3xl text-[#121212] mt-0.5">
                MORE SHADES YOU MAY LOVE
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {matchResult.alternativeShades.map((alt) => (
                <div
                  key={alt.shade.id}
                  className="bg-[#FAF9F6] border border-[#E8D5A8] p-6 space-y-4 flex flex-col justify-between hover:shadow-md transition-shadow"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-6 h-6 rounded-full border border-black/10 shadow-xs"
                          style={{ backgroundColor: alt.shade.hex }}
                        />
                        <span className="text-sm font-bold uppercase tracking-wider text-[#121212]">
                          {alt.shade.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#C9972B] font-semibold uppercase">
                        {alt.shade.undertone}
                      </span>
                    </div>

                    <p className="text-xs text-[#6B6B6B] font-light leading-relaxed">
                      {alt.matchReason}
                    </p>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-[#E8D5A8]">
                    <button
                      onClick={() => onOpenTryOn(alt.product, alt.shade)}
                      className="w-full py-2.5 bg-[#FAF9F6] border border-[#0B0B0B] text-[#121212] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] hover:text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#C9972B]" />
                      <span>TRY IT ON</span>
                    </button>

                    <button
                      onClick={() => onAddToBag(alt.product, alt.shade, undefined, 1)}
                      className="w-full py-2.5 bg-[#0B0B0B] text-[#FAF9F6] text-xs font-semibold tracking-wider uppercase hover:bg-[#0B0B0B] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 text-[#C9972B]" />
                      <span>ADD TO BAG • ₹{alt.product.price}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SHADE COMPARISON COMPONENT */}
          <ShadeComparison
            product={matchResult.primaryProduct}
            selectedShadeIds={comparedShadeIds}
            onToggleShadeSelection={toggleComparedShade}
            onTryShade={(shade) => onOpenTryOn(matchResult.primaryProduct, shade)}
            onAddShadeToBag={(shade) => onAddToBag(matchResult.primaryProduct, shade, undefined, 1)}
          />

        </div>
      )}

      {/* Undertone Educational Guide Modal */}
      <UndertoneGuideModal
        isOpen={isUndertoneGuideOpen}
        onClose={() => setIsUndertoneGuideOpen(false)}
        onSelectUndertone={(u) => setUndertone(u)}
      />

    </div>
  );
};
