import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { TryOnModelPreset, SkinToneType, UndertoneType } from '../../types';
import { Plus, Trash2, Save, Check, ArrowLeft, ImageUp } from 'lucide-react';
import { ImageCropUploadModal } from './ImageCropUploadModal';

const SKIN_TONES: SkinToneType[] = ['Fair', 'Light', 'Medium', 'Tan', 'Deep'];
const UNDERTONES: UndertoneType[] = ['Warm', 'Cool', 'Neutral'];

export const AdminTryOnModels: React.FC = () => {
  const { tryOnModels, saveTryOnModel, deleteTryOnModel } = useCMS();
  const [editing, setEditing] = useState<TryOnModelPreset | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const sortedModels = [...(tryOnModels || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const handleCreate = () => {
    setError(null);
    setEditing({
      id: '',
      name: '',
      skinTone: 'Medium',
      undertone: 'Warm',
      image: '',
      description: '',
      isActive: true,
      sortOrder: sortedModels.reduce((max, m) => Math.max(max, m.sortOrder ?? 0), 0) + 1,
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError('Model name is required.');
      return;
    }
    if (!editing.image.trim()) {
      setError('A model image is required.');
      return;
    }
    setError(null);
    setIsSaving(true);
    const ok = await saveTryOnModel(editing);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditing(null);
      }, 700);
    } else {
      setError('Save failed. Please try again.');
    }
  };

  const handleDelete = async (model: TryOnModelPreset) => {
    if (!window.confirm(`Delete "${model.name}"?\n\nThis cannot be undone. If this is the only active model, Virtual Try-On's Standard Model view will have nothing to show.`)) return;
    await deleteTryOnModel(model.id);
  };

  const handleToggleActive = async (model: TryOnModelPreset) => {
    await saveTryOnModel({ id: model.id, isActive: !model.isActive });
  };

  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditing(null)}
              className="p-2 rounded-lg bg-[#0B0B0B] text-[#E8D5A8] border border-[#E8D5A8]/20 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="font-serif text-xl text-[#FAF9F6]">{editing.id ? 'Edit Standard Model' : 'Add Standard Model'}</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-white font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50"
            >
              {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : editing.id ? 'Update' : 'Create'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 max-w-4xl">
          <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
            {error && (
              <div className="p-3 bg-[#F05A7E]/10 border border-[#F05A7E]/30 rounded-lg text-xs text-[#F05A7E]">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Model Name *
              </label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Rhea"
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Skin Tone
                </label>
                <select
                  value={editing.skinTone}
                  onChange={(e) => setEditing({ ...editing, skinTone: e.target.value as SkinToneType })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                >
                  {SKIN_TONES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Undertone
                </label>
                <select
                  value={editing.undertone}
                  onChange={(e) => setEditing({ ...editing, undertone: e.target.value as UndertoneType })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                >
                  {UNDERTONES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Description
              </label>
              <input
                type="text"
                value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="e.g. Classic medium olive-warm complexion"
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Model Image * <span className="normal-case text-[#6B6B6B]">(clear, front-facing, well-lit — needed for face detection)</span>
              </label>
              {editing.image ? (
                <div className="space-y-2">
                  <img src={editing.image} alt="Model" className="w-full h-56 rounded-lg object-cover border border-[#E8D5A8]/30" />
                  <button
                    type="button"
                    onClick={() => setShowUpload(true)}
                    className="text-[11px] text-[#C9972B] hover:underline cursor-pointer"
                  >
                    Replace image
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowUpload(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#0B0B0B] hover:bg-[#171717] text-[#FAF9F6] border border-[#E8D5A8]/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <ImageUp className="w-3.5 h-3.5 text-[#F05A7E]" />
                  <span>Upload Model Image</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Sort Order
                </label>
                <input
                  type="number"
                  min={0}
                  value={editing.sortOrder ?? 0}
                  onChange={(e) => setEditing({ ...editing, sortOrder: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                  Status
                </label>
                <button
                  type="button"
                  onClick={() => setEditing({ ...editing, isActive: !editing.isActive })}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border cursor-pointer transition-colors ${
                    editing.isActive
                      ? 'bg-[#C9972B]/10 text-[#E3B84B] border-[#C9972B]/40'
                      : 'bg-[#F05A7E]/10 text-[#F05A7E] border-[#F05A7E]/30'
                  }`}
                >
                  {editing.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-semibold text-[#6B6B6B] uppercase tracking-wider">Live Preview</span>
            <div className="bg-white rounded-3xl border border-[#E8D5A8] shadow-[0_4px_16px_rgba(240,90,126,0.04)] overflow-hidden">
              <div className="aspect-[3/4] bg-[#FCE8ED] flex items-center justify-center overflow-hidden">
                {editing.image ? (
                  <img src={editing.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[11px] text-[#6B6B6B]">No image yet</span>
                )}
              </div>
              <div className="p-4">
                <p className="text-sm font-bold text-[#121212]">{editing.name || 'Model Name'} ({editing.skinTone})</p>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">{editing.description || 'Model description'}</p>
              </div>
            </div>
          </div>
        </div>

        <ImageCropUploadModal
          isOpen={showUpload}
          onClose={() => setShowUpload(false)}
          title="Upload Standard Model Image"
          aspectRatio={3 / 4}
          minWidth={600}
          minHeight={800}
          recommendedWidth={900}
          recommendedHeight={1200}
          outputWidth={900}
          outputHeight={1200}
          onUploaded={({ url }) => setEditing((prev) => (prev ? { ...prev, image: url } : prev))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Virtual Try-On — Standard Models</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            The preset "complexion" models shown in Virtual Try-On's Standard Model view. Only active models appear
            on the storefront, in Sort Order.
          </p>
        </div>

        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-white font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Add Model</span>
        </button>
      </div>

      <div className="rounded-xl border border-[#E8D5A8]/30 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-[#171717] text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B]">
              <th className="p-4">Model</th>
              <th className="p-4 w-32">Skin Tone</th>
              <th className="p-4 w-24">Order</th>
              <th className="p-4 w-28">Status</th>
              <th className="p-4 w-40 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedModels.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-xs text-[#6B6B6B] bg-[#0B0B0B]">
                  No standard models yet. Click "Add Model" to create one.
                </td>
              </tr>
            )}
            {sortedModels.map((model) => (
              <tr key={model.id} className="bg-[#0B0B0B] border-t border-[#E8D5A8]/10">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-12 rounded-lg bg-[#FCE8ED]/10 border border-[#E8D5A8]/20 overflow-hidden shrink-0">
                      {model.image && <img src={model.image} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#FAF9F6]">{model.name}</p>
                      <p className="text-[11px] text-[#6B6B6B] line-clamp-1">{model.description}</p>
                    </div>
                  </div>
                </td>
                <td className="p-4 text-xs text-[#FAF9F6]">{model.skinTone} · {model.undertone}</td>
                <td className="p-4 text-xs text-[#FAF9F6] font-mono">{model.sortOrder ?? 0}</td>
                <td className="p-4">
                  <button
                    onClick={() => handleToggleActive(model)}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                      model.isActive !== false
                        ? 'bg-[#C9972B]/10 text-[#E3B84B] border border-[#C9972B]/40'
                        : 'bg-[#6B6B6B]/10 text-[#6B6B6B] border border-[#6B6B6B]/30'
                    }`}
                  >
                    {model.isActive !== false ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setEditing(model)}
                      className="px-3 py-1.5 bg-[#171717] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(model)}
                      className="p-1.5 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
