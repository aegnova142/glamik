/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Loader2, Trash2, UploadCloud, Video } from 'lucide-react';
import type { ProductVideo } from '@glamirk/shared/types';
import { MAX_PRODUCT_VIDEOS } from '@glamirk/shared/utils/productValidation';
import { cloudinaryVideoPoster, cloudinaryVideoUrl } from '@glamirk/shared/utils/cloudinaryVideo';
import { useFileUpload } from '../../hooks/useFileUpload';

/** Matches MEDIA_MAX_VIDEO_MB on the server (default 60). */
const VIDEO_MAX_MB = 60;

const newVideoId = () => `vid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const btn =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold text-[#FAF9F6] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9972B]/60';

interface Props {
  videos: ProductVideo[];
  onChange: (videos: ProductVideo[]) => void;
}

/**
 * Product videos: upload (MP4, WebM or iPhone MOV), preview, title, reorder,
 * remove. Videos go to the media library like images; only their URLs are
 * stored on the product. They appear in the product page gallery after the
 * images, for every shade.
 */
export const ProductVideosEditor: React.FC<Props> = ({ videos, onChange }) => {
  const { upload, isUploading, phase, progress, error } = useFileUpload({
    acceptedTypes: ['video/'],
    maxSizeBytes: VIDEO_MAX_MB * 1024 * 1024,
    typeErrorMessage: 'Please choose a video file (MP4, WebM or MOV).',
  });
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const full = videos.length >= MAX_PRODUCT_VIDEOS;

  const add = async (file: File | undefined) => {
    if (full) return;
    const item = await upload(file);
    if (item) onChange([...videos, { id: newVideoId(), url: item.url }]);
  };
  const update = (i: number, patch: Partial<ProductVideo>) => onChange(videos.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= videos.length) return;
    const next = [...videos];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="pt-4 border-t border-[#E8D5A8]/15 space-y-3">
      <div>
        <h4 className="text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider">Product Videos ({videos.length}/{MAX_PRODUCT_VIDEOS})</h4>
        <p className="text-[11px] text-[#B5B0AA] mt-0.5">
          Shown in the product page gallery after the images, for every colour. MP4, WebM or iPhone MOV, up to {VIDEO_MAX_MB} MB.
          A poster is generated from the first frame automatically.
        </p>
      </div>

      {videos.length > 0 && (
        <ol className="space-y-2.5">
          {videos.map((v, i) => (
            <li key={v.id} className="flex flex-col sm:flex-row gap-3 p-3 rounded-lg border border-[#E8D5A8]/20 bg-[#0B0B0B]">
              <video
                src={cloudinaryVideoUrl(v.url)}
                poster={v.posterUrl || cloudinaryVideoPoster(v.url) || undefined}
                controls
                muted
                playsInline
                preload="metadata"
                className="w-full sm:w-40 aspect-[4/5] object-contain bg-black rounded-md"
              />
              <div className="flex-1 min-w-0 space-y-2">
                <div>
                  <label htmlFor={`pv-title-${v.id}`} className="block text-[10px] font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                    Title (optional, used as its label)
                  </label>
                  <input
                    id={`pv-title-${v.id}`}
                    maxLength={80}
                    value={v.title || ''}
                    placeholder={`Video ${i + 1}`}
                    onChange={(e) => update(i, { title: e.target.value })}
                    className="w-full px-3 py-2 bg-[#171717] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                  />
                </div>
                <p className="text-[10px] text-[#6B6B6B] break-all">{v.url}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={btn} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move video ${i + 1} up`}>
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" className={btn} disabled={i === videos.length - 1} onClick={() => move(i, 1)} aria-label={`Move video ${i + 1} down`}>
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => window.confirm('Remove this video from the product?') && onChange(videos.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void add(e.dataTransfer.files?.[0]);
        }}
        className={`rounded-lg border border-dashed p-4 text-center ${dragging ? 'border-[#C9972B] bg-[#C9972B]/10' : 'border-[#E8D5A8]/30 bg-[#0B0B0B]'}`}
      >
        <Video className="w-5 h-5 mx-auto text-[#C9972B]" aria-hidden="true" />
        <p className="text-[11px] text-[#FAF9F6] mt-1">{full ? 'Video limit reached — remove one to add another.' : 'Drag a video here, or'}</p>
        {!full && (
          <button type="button" className={`${btn} mt-2`} disabled={isUploading} onClick={() => fileRef.current?.click()}>
            {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
            {isUploading ? 'Uploading…' : 'Upload video'}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mov,.m4v"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void add(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <div role="status" aria-live="polite" className="mt-2 text-[11px] min-h-[1rem]">
          {isUploading && (
            <div className="space-y-1 max-w-xs mx-auto">
              <div className="h-1.5 rounded-full bg-[#E8D5A8]/15 overflow-hidden">
                <div className="h-full bg-[#C9972B] transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[#E8D5A8]">{phase === 'processing' ? 'Processing video — large files can take a minute…' : `Uploading… ${progress}%`}</span>
            </div>
          )}
          {!isUploading && error && (
            <span className="inline-flex items-center gap-1 text-[#FF9AB2]">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
