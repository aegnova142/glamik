/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { CMSMediaItem } from '@glamirk/shared/types';
import { apiFetch } from '@glamirk/shared/utils/cmsClient';
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  Copy,
  Check,
  Search,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { cloudinaryImageUrl } from '@glamirk/shared/utils/cloudinaryImage';

/** What a batch upload is currently doing, for the progress strip. */
interface BatchState {
  index: number;
  total: number;
  name: string;
  percent: number;
  processing: boolean;
}

export const AdminMediaLibrary: React.FC = () => {
  const { uploadMediaDetailed, deleteMedia } = useCMS();
  const [mediaList, setMediaList] = useState<CMSMediaItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [batch, setBatch] = useState<BatchState | null>(null);
  // Per-file, because a batch is usually "these nine are fine, that one is a
  // PDF" — collapsing them into one message would hide which file failed and
  // why, which is the only part the admin can act on.
  const [uploadErrors, setUploadErrors] = useState<{ name: string; message: string }[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMedia = async () => {
    try {
      const res = await apiFetch<CMSMediaItem[]>('/api/admin/media');
      if (res && Array.isArray(res.data)) {
        setMediaList(res.data);
      } else {
        setMediaList([]);
      }
    } catch (err) {
      console.warn('Could not fetch media list, defaulting to empty list:', err);
      setMediaList([]);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // A second batch while one is running would interleave two sets of
    // progress updates into one bar and read as nonsense.
    if (isUploading) return;

    setIsUploading(true);
    setUploadErrors([]);
    const failures: { name: string; message: string }[] = [];

    // Sequential, not Promise.all. Ten parallel 20 MB uploads saturate the
    // connection so every one of them crawls, and the server would be holding
    // ten full buffers in memory at once. One at a time also makes the
    // progress number mean something.
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setBatch({ index: i + 1, total: files.length, name: file.name, percent: 0, processing: false });
      const { error } = await uploadMediaDetailed(file, {
        name: file.name,
        altText: file.name.replace(/\.[^/.]+$/, ''),
        onProgress: (percent) =>
          setBatch((prev) => (prev ? { ...prev, percent, processing: percent >= 99 } : prev)),
      });
      // A rejected file does not abandon the rest of the batch — the other
      // nine photos the admin selected should still land.
      if (error) failures.push({ name: file.name, message: error });
    }

    setBatch(null);
    setIsUploading(false);
    setUploadErrors(failures);
    if (fileInputRef.current) fileInputRef.current.value = '';
    fetchMedia();
  };

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string, name: string) => {
    // Deletion is permanent and hits real Cloudinary storage, so it requires
    // an explicit admin confirmation rather than firing on a single click —
    // the server re-verifies the asset is unreferenced regardless, but that
    // check is a safety net, not a substitute for the admin meaning to do this.
    if (!window.confirm(`Delete "${name}" permanently? This cannot be undone.`)) return;
    setDeleteError(null);
    const result = await deleteMedia(id);
    if (!result.success) {
      setDeleteError(result.error || 'Delete failed. Please try again.');
      return;
    }
    fetchMedia();
  };

  const filteredMedia = Array.isArray(mediaList)
    ? mediaList.filter((m) =>
        (m?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m?.altText || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Media Asset Library</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Upload and organize luxury product photos, campaign graphics, and editorial banners.
          </p>
        </div>

        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            // Explicit rather than image/*, so the OS dialog greys out the
            // formats the API will refuse instead of letting one be picked
            // and failing afterwards.
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml"
            disabled={isUploading}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            <span>{isUploading ? 'Uploading...' : 'Upload Media'}</span>
          </button>
        </div>
      </div>

      {deleteError && (
        <p className="text-xs text-[#F05A7E] bg-[#F05A7E]/10 border border-[#F05A7E]/30 rounded-lg px-3 py-2">
          {deleteError}
        </p>
      )}

      {uploadErrors.length > 0 && (
        <div className="rounded-lg bg-[#F05A7E]/10 border border-[#F05A7E]/30 px-3 py-2 space-y-1">
          {uploadErrors.map((f) => (
            <p key={f.name} className="text-xs text-[#F05A7E]">
              <span className="font-semibold">{f.name}</span> — {f.message}
            </p>
          ))}
        </div>
      )}

      {batch && (
        <div className="rounded-xl bg-[#171717] border border-[#E8D5A8]/20 px-4 py-3" role="status" aria-live="polite">
          <div className="flex items-center justify-between text-[11px] mb-2">
            <span className="text-[#FAF9F6] truncate pr-3">
              {batch.processing ? 'Processing' : 'Uploading'}{' '}
              <span className="text-[#6B6B6B]">{batch.name}</span>
            </span>
            <span className="font-mono text-[#C9972B] shrink-0">
              {batch.total > 1 ? `${batch.index}/${batch.total} · ` : ''}
              {batch.processing ? '…' : `${batch.percent}%`}
            </span>
          </div>
          <div className="h-1 w-full rounded-full overflow-hidden bg-[#0B0B0B]">
            <div
              className={`h-full bg-[#C9972B] transition-[width] duration-200 ease-out ${
                batch.processing ? 'animate-pulse' : ''
              }`}
              style={{ width: `${batch.processing ? 100 : batch.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Drag & Drop Area */}
      <div
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`p-8 rounded-xl bg-[#171717] border-2 border-dashed border-[#E8D5A8]/30 transition-colors flex flex-col items-center justify-center text-center group ${
          isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#C9972B] cursor-pointer'
        }`}
      >
        <div className="w-12 h-12 rounded-full bg-[#C9972B]/10 flex items-center justify-center text-[#C9972B] mb-2 group-hover:scale-110 transition-transform">
          <Upload className="w-6 h-6" />
        </div>
        <p className="text-xs font-semibold text-[#FAF9F6]">
          Click to upload or drag and drop image files
        </p>
        <p className="text-[10px] text-[#6B6B6B] mt-1">
          JPG, PNG, WebP, AVIF, GIF or SVG up to 20MB · optimised and resized automatically
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center p-3 rounded-xl bg-[#171717] border border-[#E8D5A8]/20">
        <Search className="w-4 h-4 text-[#6B6B6B] mr-2" />
        <input
          type="text"
          placeholder="Search media files by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-transparent text-xs text-[#FAF9F6] focus:outline-none"
        />
      </div>

      {/* Media Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filteredMedia.map((m) => (
          <div
            key={m.id}
            className="group relative rounded-xl bg-[#171717] border border-[#E8D5A8]/20 overflow-hidden flex flex-col"
          >
            <div className="h-36 bg-[#0B0B0B] relative overflow-hidden">
              {/* A 300px thumbnail, not the stored original. This grid used to
                  download every full-resolution asset in the library at once
                  just to render 36px-tall tiles. */}
              <img
                src={cloudinaryImageUrl(m.url, 'thumb')}
                alt={m.altText || m.name}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>

            <div className="p-3 bg-[#171717] flex-1 flex flex-col justify-between">
              <p className="text-[11px] font-semibold text-[#FAF9F6] truncate" title={m.name}>
                {m.name}
              </p>
              <span className="text-[9px] text-[#6B6B6B] font-mono">
                {new Date(m.uploadedAt || Date.now()).toLocaleDateString()}
                {/* Only for records that carry them — entries uploaded before
                    these fields existed simply show the date, as they always
                    have. */}
                {m.width && m.height ? ` · ${m.width}×${m.height}` : ''}
                {m.format ? ` · ${m.format.toUpperCase()}` : ''}
              </span>

              <div className="pt-2 mt-2 border-t border-[#E8D5A8]/10 flex items-center justify-between">
                <button
                  onClick={() => handleCopyUrl(m.url, m.id)}
                  className="flex items-center gap-1 text-[10px] text-[#C9972B] hover:text-[#E3B84B] font-mono cursor-pointer"
                  title="Copy URL"
                >
                  {copiedId === m.id ? (
                    <>
                      <Check className="w-3 h-3 text-[#E3B84B]" />
                      <span className="text-[#E3B84B]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy URL</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleDelete(m.id, m.name)}
                  className="p-1 text-[#6B6B6B] hover:text-[#F05A7E] rounded cursor-pointer transition-colors"
                  title="Delete File"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
