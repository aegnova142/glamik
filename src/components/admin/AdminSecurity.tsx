/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useCMS } from '../../context/CMSContext';
import { CMSAuditLog } from '../../types';
import { apiFetch } from '../../utils/cmsClient';
import { ShieldCheck, Key, Lock, Activity, Check, AlertCircle, RefreshCw } from 'lucide-react';

export const AdminSecurity: React.FC = () => {
  const { adminUser, adminChangePassword } = useCMS();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [auditLogs, setAuditLogs] = useState<CMSAuditLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    const res = await apiFetch<CMSAuditLog[]>('/api/admin/audit-logs');
    if (res.data) {
      setAuditLogs(res.data);
    }
    setIsLoadingLogs(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    if (newPassword.length < 5) {
      setMessage({ type: 'error', text: 'Password must be at least 5 characters' });
      return;
    }

    setIsUpdating(true);
    const res = await adminChangePassword(currentPassword, newPassword);
    setIsUpdating(false);

    if (res.success) {
      setMessage({ type: 'success', text: 'Admin password updated successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      fetchLogs();
    } else {
      setMessage({ type: 'error', text: res.error || 'Failed to update password' });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-2xl text-[#FAF9F6]">Security & Audit Trail</h2>
        <p className="text-xs text-[#6B6B6B] mt-0.5">
          Manage administrator authentication credentials, password hashing, and review real-time CMS activity records.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Change Password Card */}
        <div className="lg:col-span-5 p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#E8D5A8]/10">
            <Key className="w-5 h-5 text-[#C9972B]" />
            <h3 className="font-serif text-base text-[#FAF9F6]">Update Administrator Password</h3>
          </div>

          {message && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg text-xs ${
                message.type === 'success'
                  ? 'bg-[#C9972B]/10/80 text-[#E3B84B] border border-[#C9972B]/40'
                  : 'bg-[#F05A7E]/20 text-[#F05A7E] border border-[#F05A7E]/30'
              }`}
            >
              {message.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{message.text}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#E8D5A8] uppercase tracking-wider mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3 py-2 bg-[#0B0B0B] border border-[#E8D5A8]/30 rounded-lg text-xs text-[#FAF9F6]"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isUpdating}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#F05A7E] hover:bg-[#E3B84B] hover:text-[#0B0B0B] text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isUpdating ? 'Updating...' : 'Update Password'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Audit Log Trail */}
        <div className="lg:col-span-7 p-6 rounded-xl bg-[#171717] border border-[#E8D5A8]/30 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#E8D5A8]/10">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#C9972B]" />
              <h3 className="font-serif text-base text-[#FAF9F6]">CMS Audit Log Activity</h3>
            </div>

            <button
              onClick={fetchLogs}
              className="p-1.5 rounded-lg bg-[#0B0B0B] text-[#E8D5A8] hover:text-[#FAF9F6] border border-[#E8D5A8]/20 transition-colors cursor-pointer"
              title="Refresh Logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {auditLogs.length === 0 ? (
              <p className="text-xs text-[#6B6B6B] text-center py-6">No audit records found yet.</p>
            ) : (
              auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg bg-[#0B0B0B] border border-[#E8D5A8]/15 flex items-start justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[10px] uppercase text-[#C9972B]">
                        {log.action}
                      </span>
                      <span className="text-[10px] text-[#6B6B6B] uppercase font-mono">
                        {log.entity}
                      </span>
                    </div>
                    <p className="text-[#FAF9F6] text-[11px] mt-0.5">{log.details}</p>
                    <span className="text-[10px] text-[#6B6B6B] font-mono">by {log.adminEmail}</span>
                  </div>

                  <span className="text-[10px] text-[#6B6B6B] font-mono shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
