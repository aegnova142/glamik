// [Glamik CMS] Added 2026-10-03 — shared admin image/video upload control used
// by the Personalized Beauty, Shop Mega-Menu and Shade Intelligence editors.
import React from 'react';
import { Upload, Loader2, Trash2 } from 'lucide-react';
import { useFileUpload } from '../../hooks/useFileUpload';
import { UploadStatus } from './UploadStatus';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';

// Accepted image types. AVIF and GIF are new here and are already accepted by
// the API — the picker simply never offered them. The server re-checks every
// one of these against the file's actual bytes; this list only decides what
// the OS file dialog shows and what gets rejected before any upload starts.
const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_IMAGE = 20 * 1024 * 1024;
const MAX_VIDEO = 60 * 1024 * 1024;

const inputCls = 'w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]';
const labelCls = 'block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';

/**
 * Upload control that accepts an image OR a video, validates client-side
 * (type + size), uploads via the CMS media endpoint, and writes the resulting
 * Cloudinary URL back. Shared by every admin section that needs media.
 *
 * The existing value is only overwritten once the new upload has fully
 * succeeded. A failed or cancelled upload leaves whatever was already there
 * untouched and still rendering on the storefront — losing a working image to
 * a half-finished replacement is the one failure mode this control must not
 * have.
 */
export const MediaUploadField: React.FC<{
  kind: 'image' | 'video';
  label: string;
  value: string;
  onChange: (url: string) => void;
}> = ({ kind, label, value, onChange }) => {
  const isVideo = kind === 'video';
  const { upload, isUploading, error, progress, phase, lastUpload, reset } = useFileUpload({
    acceptedTypes: isVideo ? VIDEO_TYPES : IMAGE_TYPES,
    maxSizeBytes: isVideo ? MAX_VIDEO : MAX_IMAGE,
    typeErrorMessage: isVideo
      ? 'Unsupported file. Use MP4, WebM or MOV.'
      : 'Unsupported file. Use JPG, PNG, WebP, AVIF or GIF.',
  });

  const accept = (isVideo ? VIDEO_TYPES : IMAGE_TYPES).join(',');

  const handleFile = async (file: File) => {
    const item = await upload(file);
    // Only on success. `upload` returns null for a rejected type, an
    // over-size file, a network failure and a server refusal alike — and in
    // every one of those cases the field must keep the URL it already had.
    if (item?.url) onChange(item.url);
  };

  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex gap-2">
        {/* A small preview of what is currently set, so the admin can see
            which image a slot holds without copying the URL somewhere. Served
            through the thumbnail transform rather than at full size — an
            editor with twenty of these used to pull twenty full-resolution
            originals. */}
        {value && !isVideo && (
          <img
            src={cloudinaryImageUrl(value, 'thumb')}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-9 h-9 shrink-0 rounded-lg object-cover border border-[#E8D5A8]/20 bg-[#0B0B0B]"
          />
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className={`flex-1 min-w-0 ${inputCls}`}
        />
        <label
          className={`px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
            isUploading
              ? 'opacity-60 cursor-not-allowed'
              : 'hover:bg-[#C9972B] hover:text-[#0B0B0B] cursor-pointer'
          }`}
        >
          {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {isUploading ? 'Uploading' : value ? 'Replace' : 'Upload'}
          <input
            type="file"
            accept={accept}
            className="hidden"
            disabled={isUploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              // Cleared so picking the same file again still fires onChange.
              e.target.value = '';
            }}
          />
        </label>
        {value && (
          <button
            type="button"
            disabled={isUploading}
            onClick={() => {
              onChange('');
              reset();
            }}
            title="Remove media"
            className="px-2.5 py-2 bg-[#0B0B0B] hover:bg-[#F05A7E]/20 border border-[#E8D5A8]/30 rounded-lg text-[#F05A7E] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <UploadStatus phase={phase} progress={progress} error={error} result={lastUpload} />
    </div>
  );
};
