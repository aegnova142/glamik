/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { CMSNavigationItem } from '../../types';
import { Layers, Plus, Trash2, Edit2, Save, Check, MoveUp, MoveDown, Eye, EyeOff } from 'lucide-react';

export const AdminNavigation: React.FC = () => {
  const { navigation, saveNavigation } = useCMS();
  const [navItems, setNavItems] = useState<CMSNavigationItem[]>(navigation || []);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  React.useEffect(() => {
    if (navigation && navigation.length > 0 && navItems.length === 0) {
      setNavItems(navigation);
    }
  }, [navigation]);

  const handleSave = async () => {
    setIsSaving(true);
    const ok = await saveNavigation(navItems);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const handleAddItem = () => {
    const newItem: CMSNavigationItem = {
      id: 'nav-' + Date.now(),
      label: 'New Link',
      url: '/shop',
      type: 'internal',
      order: navItems.length + 1,
      isVisible: true,
    };
    setNavItems([...navItems, newItem]);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= navItems.length) return;
    const updated = [...navItems];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    updated.forEach((item, i) => {
      item.order = i + 1;
    });
    setNavItems(updated);
  };

  const handleUpdate = (index: number, key: keyof CMSNavigationItem, val: any) => {
    const updated = [...navItems];
    updated[index] = { ...updated[index], [key]: val };
    setNavItems(updated);
  };

  const handleDelete = (index: number) => {
    const updated = navItems.filter((_, i) => i !== index);
    setNavItems(updated);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Header Navigation & Menu</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Configure main navigation items, dropdown links, badges, and reorder header menu.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAddItem}
            className="flex items-center gap-2 px-3 py-2 bg-[#0B0B0B] hover:bg-[#171717] border border-[#E8D5A8]/30 text-[#FAF9F6] font-semibold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Menu Item</span>
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50"
          >
            {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save Navigation'}</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {(navItems || []).map((item, idx) => (
          <div
            key={item.id || idx}
            className="p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 w-full md:w-auto">
              <span className="font-mono text-xs text-[#6B6B6B]">#{idx + 1}</span>
              <input
                type="text"
                value={item.label}
                placeholder="Link Label"
                onChange={(e) => handleUpdate(idx, 'label', e.target.value)}
                className="px-3 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] font-semibold w-40"
              />
              <input
                type="text"
                value={item.url}
                placeholder="URL (e.g. /shop)"
                onChange={(e) => handleUpdate(idx, 'url', e.target.value)}
                className="px-3 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6] font-mono w-48"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
              <input
                type="text"
                value={item.badge || ''}
                placeholder="Badge (e.g. NEW)"
                onChange={(e) => handleUpdate(idx, 'badge', e.target.value)}
                className="px-2 py-1.5 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-[10px] text-[#C9972B] font-mono uppercase w-24"
              />

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleUpdate(idx, 'isVisible', !item.isVisible)}
                  className={`p-1.5 rounded hover:bg-[#0B0B0B] ${
                    item.isVisible ? 'text-emerald-400' : 'text-[#6B6B6B]'
                  }`}
                  title={item.isVisible ? 'Visible' : 'Hidden'}
                >
                  {item.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleMove(idx, 'up')}
                  disabled={idx === 0}
                  className="p-1.5 rounded hover:bg-[#0B0B0B] text-[#E8D5A8] disabled:opacity-20 cursor-pointer"
                >
                  <MoveUp className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleMove(idx, 'down')}
                  disabled={idx === navItems.length - 1}
                  className="p-1.5 rounded hover:bg-[#0B0B0B] text-[#E8D5A8] disabled:opacity-20 cursor-pointer"
                >
                  <MoveDown className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(idx)}
                  className="p-1.5 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
