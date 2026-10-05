// [Glamik CMS] Added 2026-10-03 — shared admin image/video upload control used
// by the Personalized Beauty, Shop Mega-Menu and Shade Intelligence editors.
import React, { useState } from 'react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { Upload, Loader2, Trash2 } from 'lucide-react';

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_VIDEO = 60 * 1024 * 1024;

const inputCls = 'w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]';
const labelCls = 'block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1';

/**
 * Upload control that accepts an image OR a video, validates client-side
 * (type + size), uploads via the CMS media endpoint, and writes the resulting
 * Cloudinary URL back. Shared by every admin section that needs media.
 */
export const MediaUploadField: React.FC<{
  kind: 'image' | 'video';
  label: string;
  value: string;
  onChange: (url: string) => void;
}> = ({ kind, label, value, onChange }) => {
  const { uploadMedia } = useCMS();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accept = kind === 'video' ? VIDEO_TYPES.join(',') : IMAGE_TYPES.join(',');

  const handleFile = async (file: File) => {
    setErr(null);
    const allowed = kind === 'video' ? VIDEO_TYPES : IMAGE_TYPES;
    const max = kind === 'video' ? MAX_VIDEO : MAX_IMAGE;
    if (!allowed.includes(file.type)) {
      setErr(`Unsupported file. Use ${kind === 'video' ? 'MP4, WebM or MOV' : 'JPG, PNG or WebP'}.`);
      return;
    }
    if (file.size > max) {
      setErr(`File too large (max ${Math.round(max / 1024 / 1024)}MB).`);
      return;
    }
    setBusy(true);
    const item = await uploadMedia(file);
    setBusy(false);
    if (item?.url) onChange(item.url);
    else setErr('Upload failed. Please try again.');
  };

  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className={`flex-1 ${inputCls}`}
        />
        <label className="px-3 py-2 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {busy ? 'Uploading' : 'Upload'}
          <input
            type="file"
            accept={accept}
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="Remove media"
            className="px-2.5 py-2 bg-[#0B0B0B] hover:bg-[#F05A7E]/20 border border-[#E8D5A8]/30 rounded-lg text-[#F05A7E] transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {err && <p className="text-[10px] text-[#F05A7E] mt-1">{err}</p>}
    </div>
  );
};
