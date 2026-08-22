/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useCMS } from '../../context/CMSContext';
import { SupportFaq } from '../../types';
import { Plus, Trash2, Edit2, Save, Check, ArrowLeft, HelpCircle } from 'lucide-react';

export const AdminFaqs: React.FC = () => {
  const { faqs, saveFaq, deleteFaq } = useCMS();
  const [editingFaq, setEditingFaq] = useState<SupportFaq | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleCreateFaq = () => {
    const newFaq: SupportFaq = {
      id: 'faq-' + Date.now(),
      category: 'PRODUCTS',
      question: 'How do Glamirk lipsticks prevent ashen undertones?',
      answer: 'Our lipsticks contain calibrated warm ochre and yellow micro-pigments that neutralize the white chalky base common in standard cosmetics, guaranteeing true-to-pan vibrancy on melanin-rich skin.',
      order: faqs.reduce((max, f) => Math.max(max, f.order || 0), 0) + 1,
      isVisible: true,
    };
    setEditingFaq(newFaq);
  };

  const handleSave = async () => {
    if (!editingFaq) return;
    setIsSaving(true);
    const ok = await saveFaq(editingFaq);
    setIsSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditingFaq(null);
      }, 700);
    }
  };

  if (editingFaq) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 rounded-xl bg-[#171717] border border-[#E8D5A8]/30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditingFaq(null)}
              className="p-2 rounded-lg bg-[#0B0B0B] text-[#E8D5A8] border border-[#E8D5A8]/20 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="font-serif text-xl text-[#FAF9F6]">Edit FAQ</h2>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50"
          >
            {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save FAQ'}</span>
          </button>
        </div>

        <div className="p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 max-w-2xl space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Category
            </label>
            <select
              value={editingFaq.category}
              onChange={(e) =>
                setEditingFaq({ ...editingFaq, category: e.target.value as SupportFaq['category'] })
              }
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            >
              <option value="PRODUCTS">PRODUCTS</option>
              <option value="FIND MY SHADE">FIND MY SHADE</option>
              <option value="ORDERS">ORDERS</option>
              <option value="DELIVERY">DELIVERY</option>
              <option value="PAYMENTS">PAYMENTS</option>
              <option value="RETURNS">RETURNS</option>
              <option value="ACCOUNT">ACCOUNT</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Question
            </label>
            <input
              type="text"
              value={editingFaq.question}
              onChange={(e) => setEditingFaq({ ...editingFaq, question: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
              Answer
            </label>
            <textarea
              rows={4}
              value={editingFaq.answer}
              onChange={(e) => setEditingFaq({ ...editingFaq, answer: e.target.value })}
              className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl text-[#FAF9F6]">Client Care FAQs</h2>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Manage customer queries, shipping timelines, formula science, and return policies.
          </p>
        </div>

        <button
          onClick={handleCreateFaq}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>New FAQ</span>
        </button>
      </div>

      <div className="space-y-3">
        {(faqs || []).map((faq) => (
          <div
            key={faq.id}
            className="p-5 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-[#C9972B] uppercase">
                {faq.category}
              </span>
              <h3 className="font-semibold text-sm text-[#FAF9F6]">{faq.question}</h3>
              <p className="text-xs text-[#6B6B6B] line-clamp-2">{faq.answer}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setEditingFaq(faq)}
                className="px-3 py-1.5 bg-[#0B0B0B] hover:bg-[#C9972B] hover:text-[#0B0B0B] border border-[#E8D5A8]/30 rounded text-xs font-semibold transition-colors cursor-pointer"
              >
                Edit
              </button>
              <button
                onClick={() => deleteFaq(faq.id)}
                className="p-1.5 hover:bg-[#F05A7E]/20 text-[#F05A7E] rounded transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
