import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, ZoomIn, Check, AlertCircle } from 'lucide-react';
import { useCMS } from '../../context/CMSContext';

interface ImageCropUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded: (result: { url: string; publicId?: string }) => void;
  /** width / height, e.g. 2 for a 2:1 crop. Defaults to 2:1. */
  aspectRatio?: number;
  title?: string;
  minWidth?: number;
  minHeight?: number;
  recommendedWidth?: number;
  recommendedHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const VIEWPORT_W = 480;

export const ImageCropUploadModal: React.FC<ImageCropUploadModalProps> = ({
  isOpen,
  onClose,
  onUploaded,
  aspectRatio = 2,
  title = 'Upload Image',
  minWidth = 800,
  minHeight = 400,
  recommendedWidth = 1200,
  recommendedHeight = 600,
  outputWidth = 1200,
  outputHeight = 600,
}) => {
  const { uploadMedia } = useCMS();
  const [step, setStep] = useState<'pick' | 'crop' | 'uploading' | 'done'>('pick');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const viewportH = VIEWPORT_W / aspectRatio;

  useEffect(() => {
    if (!isOpen) {
      setStep('pick');
      setError(null);
      setWarning(null);
      setImgEl(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [isOpen]);

  const baseScale = imgEl ? Math.max(VIEWPORT_W / imgEl.naturalWidth, viewportH / imgEl.naturalHeight) : 1;
  const scale = baseScale * zoom;

  const clampOffset = useCallback(
    (next: { x: number; y: number }, currentZoom: number) => {
      if (!imgEl) return next;
      const s = baseScale * currentZoom;
      const displayedW = imgEl.naturalWidth * s;
      const displayedH = imgEl.naturalHeight * s;
      const minX = Math.min(0, VIEWPORT_W - displayedW);
      const minY = Math.min(0, viewportH - displayedH);
      return {
        x: Math.min(0, Math.max(next.x, minX)),
        y: Math.min(0, Math.max(next.y, minY)),
      };
    },
    [imgEl, baseScale, viewportH]
  );

  const handleFileSelect = (file: File | undefined) => {
    setError(null);
    setWarning(null);
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only JPG, PNG, or WebP images are supported.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum file size is 5MB.`);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Size is flexible — the crop always outputs the exact required ratio regardless of
      // source resolution. We only warn (never block) when the source is on the smaller side.
      if (img.naturalWidth < minWidth || img.naturalHeight < minHeight) {
        setWarning(`This image is ${img.naturalWidth}×${img.naturalHeight}px, below the ${minWidth}×${minHeight}px minimum — it may look soft when enlarged, but the crop ratio will still come out exact.`);
      } else if (img.naturalWidth < recommendedWidth || img.naturalHeight < recommendedHeight) {
        setWarning(`For best quality, ${recommendedWidth}×${recommendedHeight}px or larger is recommended. This image is ${img.naturalWidth}×${img.naturalHeight}px.`);
      }
      setImgEl(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setStep('crop');
    };
    img.onerror = () => {
      setError('Could not read this image file. Please try a different file.');
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  };

  const handlePointerDown = (clientX: number, clientY: number) => {
    dragState.current = { startX: clientX, startY: clientY, startOffset: offset };
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!dragState.current) return;
    const dx = clientX - dragState.current.startX;
    const dy = clientY - dragState.current.startY;
    setOffset(clampOffset({ x: dragState.current.startOffset.x + dx, y: dragState.current.startOffset.y + dy }, zoom));
  };

  const handlePointerUp = () => {
    dragState.current = null;
  };

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
    setOffset((prev) => clampOffset(prev, newZoom));
  };

  const handleConfirmCrop = async () => {
    if (!imgEl) return;
    setStep('uploading');
    setError(null);

    try {
      const cropX = -offset.x / scale;
      const cropY = -offset.y / scale;
      const cropW = VIEWPORT_W / scale;
      const cropH = viewportH / scale;

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.drawImage(imgEl, cropX, cropY, cropW, cropH, 0, 0, outputWidth, outputHeight);

      // WebP: smallest file size at equal visual quality, fastest to decode — the single
      // consistent output format for every admin image upload across the site.
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
      if (!blob) throw new Error('Failed to generate cropped image');

      const file = new File([blob], `cropped-${Date.now()}.webp`, { type: 'image/webp' });
      const mediaItem = await uploadMedia(file);
      if (!mediaItem) throw new Error('Upload failed');

      onUploaded({ url: mediaItem.url, publicId: mediaItem.publicId });
      setStep('done');
      setTimeout(() => onClose(), 900);
    } catch (err) {
      console.error('Crop/upload failed:', err);
      setError('Upload failed. Please try again.');
      setStep('crop');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#171717] border border-[#E8D5A8]/30 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-[#E8D5A8]/20">
          <h3 className="font-serif text-lg text-[#FAF9F6]">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-[#6B6B6B] hover:text-[#F05A7E] transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-[#F05A7E]/10 border border-[#F05A7E]/30 rounded-lg text-xs text-[#F05A7E]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {warning && step !== 'pick' && (
            <div className="flex items-start gap-2 p-3 bg-[#C9972B]/10 border border-[#C9972B]/30 rounded-lg text-xs text-[#E3B84B]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{warning}</span>
            </div>
          )}

          {step === 'pick' && (
            <label className="flex flex-col items-center justify-center gap-3 py-12 border-2 border-dashed border-[#E8D5A8]/30 rounded-xl cursor-pointer hover:border-[#C9972B] transition-colors">
              <Upload className="w-8 h-8 text-[#C9972B]" />
              <div className="text-center">
                <span className="text-sm font-semibold text-[#FAF9F6] block">Click to choose an image</span>
                <span className="text-[11px] text-[#6B6B6B] block mt-1">JPG, PNG, or WebP · Max 5MB</span>
                <span className="text-[11px] text-[#6B6B6B] block">
                  Recommended {recommendedWidth}×{recommendedHeight}px ({aspectRatio}:1) · Minimum {minWidth}×{minHeight}px
                </span>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
            </label>
          )}

          {(step === 'crop' || step === 'uploading') && imgEl && (
            <>
              <p className="text-[11px] text-[#6B6B6B]">
                Drag to reposition. This crop is locked to {aspectRatio}:1 — required for consistent card layout.
              </p>
              <div
                ref={viewportRef}
                className="relative mx-auto overflow-hidden rounded-xl border border-[#E8D5A8]/30 bg-[#0B0B0B] cursor-grab active:cursor-grabbing select-none"
                style={{ width: VIEWPORT_W, height: viewportH }}
                onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
                onMouseMove={(e) => dragState.current && handlePointerMove(e.clientX, e.clientY)}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={(e) => handlePointerDown(e.touches[0].clientX, e.touches[0].clientY)}
                onTouchMove={(e) => dragState.current && handlePointerMove(e.touches[0].clientX, e.touches[0].clientY)}
                onTouchEnd={handlePointerUp}
              >
                <img
                  src={imgEl.src}
                  alt="Crop preview"
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: offset.x,
                    top: offset.y,
                    width: imgEl.naturalWidth * scale,
                    height: imgEl.naturalHeight * scale,
                    maxWidth: 'none',
                    pointerEvents: 'none',
                  }}
                />
              </div>

              <div className="flex items-center gap-3">
                <ZoomIn className="w-4 h-4 text-[#C9972B] shrink-0" />
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                  className="flex-1 accent-[#C9972B]"
                />
              </div>

              <div className="flex items-center justify-between text-[10.5px] font-mono text-[#6B6B6B] bg-[#0B0B0B] border border-[#E8D5A8]/20 rounded-lg px-3 py-2">
                <span>Original: {imgEl.naturalWidth}×{imgEl.naturalHeight}px</span>
                <span className="text-[#C9972B]">Output: {outputWidth}×{outputHeight}px · {aspectRatio}:1 exact</span>
              </div>
            </>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <div className="w-12 h-12 rounded-full bg-[#F05A7E]/15 flex items-center justify-center">
                <Check className="w-6 h-6 text-[#F05A7E]" />
              </div>
              <span className="text-sm font-semibold text-[#FAF9F6]">Image uploaded successfully!</span>
            </div>
          )}
        </div>

        {(step === 'crop' || step === 'uploading') && (
          <div className="flex items-center justify-end gap-2 p-5 border-t border-[#E8D5A8]/20">
            <button
              onClick={() => setStep('pick')}
              disabled={step === 'uploading'}
              type="button"
              className="px-4 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              Choose Different Image
            </button>
            <button
              onClick={handleConfirmCrop}
              disabled={step === 'uploading'}
              type="button"
              className="flex items-center gap-2 px-5 py-2 bg-[#F05A7E] hover:bg-[#F05A7E] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{step === 'uploading' ? 'Uploading...' : 'Crop & Upload'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
