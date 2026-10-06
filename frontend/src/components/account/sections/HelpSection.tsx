/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Headphones, ChevronDown, MessageSquare, Phone, Mail } from 'lucide-react';
import { Order, SUPPORT_TICKET_TOPICS, SupportFaq } from '@glamirk/shared/types';
import { useAccount } from '../../../context/AccountContext';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { SUPPORT_FAQS } from '@glamirk/shared/data/commerce';
import {
  AccountButton,
  AccountCard,
  AccountField,
  AccountFormMessage,
  AccountLoading,
  AccountSectionHeader,
  StatusBadge,
  formatDate,
  inputClass,
} from '../AccountUI';

interface HelpSectionProps {
  orders: Order[];
  /** Pre-selects an order when the customer arrived via "Get Help" on one. */
  initialOrderId?: string;
  onOpenSupportCenter: () => void;
  showToast: (message: string) => void;
}

const FAQ_CATEGORIES = [
  { id: 'ALL', label: 'All' },
  { id: 'ORDERS', label: 'Order Help' },
  { id: 'DELIVERY', label: 'Delivery Help' },
  { id: 'PAYMENTS', label: 'Payment Help' },
  { id: 'RETURNS', label: 'Return / Refund Help' },
  { id: 'ACCOUNT', label: 'Account Help' },
] as const;

export const HelpSection: React.FC<HelpSectionProps> = ({ orders, initialOrderId, onOpenSupportCenter, showToast }) => {
  const { supportTickets, loadSupportTickets, submitSupportTicket } = useAccount();
  const { faqs: cmsFaqs, globalSettings } = useCMS();

  const [category, setCategory] = useState<string>('ALL');
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  const [orderId, setOrderId] = useState(initialOrderId || '');
  const [topic, setTopic] = useState<string>(SUPPORT_TICKET_TOPICS[0]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadSupportTickets();
  }, [loadSupportTickets]);

  useEffect(() => {
    if (initialOrderId) setOrderId(initialOrderId);
  }, [initialOrderId]);

  // Admin-managed FAQs are the live source; the bundled set is only a
  // fallback for a store whose CMS hasn't been populated yet.
  const faqs: SupportFaq[] = useMemo(
    () => (cmsFaqs && cmsFaqs.length > 0 ? cmsFaqs.filter((f) => f.isVisible !== false) : SUPPORT_FAQS),
    [cmsFaqs]
  );

  const visibleFaqs = category === 'ALL' ? faqs : faqs.filter((f) => f.category === category);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (message.trim().length < 10) {
      setError('Please describe the issue in a little more detail (at least 10 characters).');
      return;
    }

    setSubmitting(true);
    const res = await submitSupportTicket({ topic, message: message.trim(), orderId: orderId || undefined });
    setSubmitting(false);

    if (!res.success) {
      setError(res.error || 'Could not send your request.');
      return;
    }
    setMessage('');
    setSuccess('Your request has been sent. Our concierge will reply by email.');
    showToast('Support request sent');
  };

  const whatsappNumber = (globalSettings?.whatsappOrderNumber || '').replace(/\D/g, '');

  return (
    <div className="space-y-7">
      <AccountSectionHeader
        kicker="Support"
        title="Help Center"
        description="Find an answer below, or raise a request about one of your orders and our concierge will follow up by email."
      />

      {/* Contact channels. Only channels the store has actually configured are
          offered — no placeholder live-chat widget that goes nowhere. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {globalSettings?.contactEmail && (
          <a
            href={`mailto:${globalSettings.contactEmail}`}
            className="bg-white border border-[#E8D5A8] rounded-xl p-4 flex items-center gap-3 hover:border-[#C9972B] transition-colors"
          >
            <Mail className="w-4 h-4 text-[#C9972B] shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#524C4C] block">Email us</span>
              <span className="text-[12.5px] text-[#121212] truncate block">{globalSettings.contactEmail}</span>
            </div>
          </a>
        )}
        {globalSettings?.contactPhone && (
          <a
            href={`tel:${globalSettings.contactPhone}`}
            className="bg-white border border-[#E8D5A8] rounded-xl p-4 flex items-center gap-3 hover:border-[#C9972B] transition-colors"
          >
            <Phone className="w-4 h-4 text-[#C9972B] shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#524C4C] block">Call us</span>
              <span className="text-[12.5px] text-[#121212] truncate block">{globalSettings.contactPhone}</span>
            </div>
          </a>
        )}
        {whatsappNumber && (
          <a
            href={`https://wa.me/${whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white border border-[#E8D5A8] rounded-xl p-4 flex items-center gap-3 hover:border-[#C9972B] transition-colors"
          >
            <MessageSquare className="w-4 h-4 text-[#C9972B] shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#524C4C] block">WhatsApp</span>
              <span className="text-[12.5px] text-[#121212] truncate block">Chat with our concierge</span>
            </div>
          </a>
        )}
      </div>

      {/* Raise a request */}
      <AccountCard className="overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8D5A8]">
          <h2 className="font-serif text-lg text-[#121212]">Need help with an order?</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AccountField label="Which order?" htmlFor="help-order" hint={orders.length === 0 ? "You haven't placed an order yet." : undefined}>
              <select id="help-order" value={orderId} onChange={(e) => setOrderId(e.target.value)} className={inputClass}>
                <option value="">Not about a specific order</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    #{order.orderNumber} — {formatDate(order.createdAt)}
                  </option>
                ))}
              </select>
            </AccountField>

            <AccountField label="What do you need help with?" htmlFor="help-topic" required>
              <select id="help-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={inputClass}>
                {SUPPORT_TICKET_TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </AccountField>
          </div>

          <AccountField label="Tell us what happened" htmlFor="help-message" required>
            <textarea
              id="help-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              className={inputClass}
              placeholder="The more detail you give us, the faster we can resolve it."
            />
          </AccountField>

          <AccountFormMessage tone="error" message={error} />
          <AccountFormMessage tone="success" message={success} />

          <AccountButton type="submit" loading={submitting}>
            Send Request
          </AccountButton>
        </form>
      </AccountCard>

      {/* Previous requests */}
      {supportTickets.loading && !supportTickets.loaded ? (
        <AccountLoading label="Loading your requests" rows={1} />
      ) : (
        (supportTickets.data || []).length > 0 && (
          <AccountCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E8D5A8]">
              <h2 className="font-serif text-lg text-[#121212]">Your Requests</h2>
            </div>
            <ul className="divide-y divide-[#F1EBDD]">
              {(supportTickets.data || []).map((ticket) => (
                <li key={ticket.id} className="px-5 py-4 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[13px] font-semibold text-[#121212] block">{ticket.subject}</span>
                      <span className="text-[11px] text-[#524C4C]">Raised {formatDate(ticket.createdAt)}</span>
                    </div>
                    <StatusBadge
                      status={ticket.status}
                      tone={ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'positive' : 'progress'}
                    />
                  </div>
                  <p className="text-[12px] text-[#524C4C] leading-relaxed">{ticket.message}</p>
                  {ticket.adminResponse && (
                    <div className="bg-[#FAF9F6] border border-[#E8D5A8] rounded-lg p-3">
                      <span className="text-[9.5px] font-semibold tracking-[0.14em] uppercase text-[#C9972B] block mb-1">
                        Glamirk Concierge
                      </span>
                      <p className="text-[12px] text-[#121212] leading-relaxed">{ticket.adminResponse}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </AccountCard>
        )
      )}

      {/* FAQs */}
      <section className="space-y-4">
        <h2 className="font-serif text-lg text-[#121212]">Frequently Asked Questions</h2>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {FAQ_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`shrink-0 px-3.5 py-2 text-[10.5px] font-semibold tracking-[0.12em] uppercase rounded-full border transition-colors cursor-pointer ${
                category === cat.id
                  ? 'bg-[#0B0B0B] text-white border-[#0B0B0B]'
                  : 'bg-white text-[#524C4C] border-[#E8D5A8] hover:text-[#121212] hover:border-[#C9972B]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {visibleFaqs.length === 0 ? (
          <AccountCard className="p-6 text-center">
            <p className="text-xs text-[#524C4C]">No questions in this category yet. Raise a request above and we'll help.</p>
          </AccountCard>
        ) : (
          <AccountCard className="divide-y divide-[#F1EBDD] overflow-hidden">
            {visibleFaqs.map((faq) => {
              const open = openFaqId === faq.id;
              return (
                <div key={faq.id}>
                  <button
                    onClick={() => setOpenFaqId(open ? null : faq.id)}
                    aria-expanded={open}
                    className="w-full px-5 py-4 flex items-start justify-between gap-4 text-left hover:bg-[#FAF9F6] transition-colors cursor-pointer"
                  >
                    <span className="text-[13px] text-[#121212] font-medium">{faq.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#C9972B] shrink-0 mt-0.5 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {open && (
                    <div className="px-5 pb-4 -mt-1">
                      <p className="text-[12.5px] text-[#524C4C] leading-relaxed">{faq.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </AccountCard>
        )}

        <button
          onClick={onOpenSupportCenter}
          className="inline-flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[#C9972B] hover:underline cursor-pointer"
        >
          <Headphones className="w-3.5 h-3.5" />
          Visit the full Support Center
        </button>
      </section>
    </div>
  );
};
