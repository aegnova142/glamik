/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useCMS } from '../../context/CMSContext';
import { CMSMediaItem } from '../../types';
import { apiFetch } from '../../utils/cmsClient';
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

export const AdminMediaLibrary: React.FC = () => {
  const { uploadMedia, deleteMedia } = useCMS();
  const [mediaList, setMediaList] = useState<CMSMediaItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
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

    setIsUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await uploadMedia(file, file.name, file.name.replace(/\.[^/.]+$/, ''));
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    fetchMedia();
  };

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string) => {
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
            accept="image/*"
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

      {/* Drag & Drop Area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="p-8 rounded-xl bg-[#171717] border-2 border-dashed border-[#E8D5A8]/30 hover:border-[#C9972B] transition-colors flex flex-col items-center justify-center text-center cursor-pointer group"
      >
        <div className="w-12 h-12 rounded-full bg-[#C9972B]/10 flex items-center justify-center text-[#C9972B] mb-2 group-hover:scale-110 transition-transform">
          <Upload className="w-6 h-6" />
        </div>
        <p className="text-xs font-semibold text-[#FAF9F6]">
          Click to upload or drag and drop image files
        </p>
        <p className="text-[10px] text-[#6B6B6B] mt-1">PNG, JPG, WEBP, GIF up to 20MB</p>
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
              <img src={m.url} alt={m.altText || m.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            </div>

            <div className="p-3 bg-[#171717] flex-1 flex flex-col justify-between">
              <p className="text-[11px] font-semibold text-[#FAF9F6] truncate" title={m.name}>
                {m.name}
              </p>
              <span className="text-[9px] text-[#6B6B6B] font-mono">
                {new Date(m.uploadedAt || m.createdAt || Date.now()).toLocaleDateString()}
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
                  onClick={() => handleDelete(m.id)}
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
