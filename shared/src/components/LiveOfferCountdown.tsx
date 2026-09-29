/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface LiveOfferCountdownProps {
  targetDate: string; // ISO date string or timestamp
  title?: string;
  onExpire?: () => void;
  compact?: boolean;
  theme?: 'dark' | 'light' | 'gold';
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  totalSeconds: number;
}

function calculateTimeRemaining(targetIso: string): TimeRemaining {
  const target = new Date(targetIso).getTime();
  const now = new Date().getTime();
  const diff = target - now;

  if (isNaN(target) || diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true, totalSeconds: 0 };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, isExpired: false, totalSeconds };
}

export const LiveOfferCountdown: React.FC<LiveOfferCountdownProps> = ({
  targetDate,
  title = 'Offer Concludes In',
  onExpire,
  compact = false,
  theme = 'dark',
}) => {
  const [timeLeft, setTimeLeft] = useState<TimeRemaining>(() => calculateTimeRemaining(targetDate));

  useEffect(() => {
    const update = () => {
      const remaining = calculateTimeRemaining(targetDate);
      setTimeLeft(remaining);
      if (remaining.isExpired && onExpire) {
        onExpire();
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate, onExpire]);

  if (timeLeft.isExpired) {
    return null; // Gracefully disappear when expired
  }

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0B0B0B]/80 backdrop-blur-md border border-[#E8D5A8]/30 text-xs font-mono text-[#FAF9F6]">
        <Clock className="w-3.5 h-3.5 text-[#C9972B] animate-pulse" />
        <span className="font-sans uppercase text-[10px] tracking-widest text-[#E8D5A8]">Ends:</span>
        <span className="font-bold tracking-wider text-[#FAF9F6]">
          {timeLeft.days > 0 && `${timeLeft.days}d `}
          {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
        </span>
      </div>
    );
  }

  const bgBoxClass =
    theme === 'gold'
      ? 'bg-[#C9972B]/10 border border-[#C9972B]/40 text-[#0B0B0B]'
      : theme === 'light'
      ? 'bg-[#FAF9F6] border border-[#E8D5A8] text-[#121212]'
      : 'bg-[#171717] border border-[#E8D5A8]/20 text-[#FAF9F6]';

  const labelColor = theme === 'light' ? 'text-[#6B6B6B]' : 'text-[#E8D5A8]';

  return (
    <div className="flex flex-col items-center gap-2">
      {title && (
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase text-[#C9972B]">
          <Clock className="w-3.5 h-3.5" />
          <span>{title}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className={`flex flex-col items-center justify-center w-12 sm:w-14 h-14 rounded-lg ${bgBoxClass} shadow-sm`}>
          <span className="font-mono text-xl sm:text-2xl font-bold leading-none">{pad(timeLeft.days)}</span>
          <span className={`text-[9px] uppercase tracking-wider mt-1 ${labelColor}`}>Days</span>
        </div>
        <span className="text-[#C9972B] font-bold text-lg leading-none">:</span>
        <div className={`flex flex-col items-center justify-center w-12 sm:w-14 h-14 rounded-lg ${bgBoxClass} shadow-sm`}>
          <span className="font-mono text-xl sm:text-2xl font-bold leading-none">{pad(timeLeft.hours)}</span>
          <span className={`text-[9px] uppercase tracking-wider mt-1 ${labelColor}`}>Hours</span>
        </div>
        <span className="text-[#C9972B] font-bold text-lg leading-none">:</span>
        <div className={`flex flex-col items-center justify-center w-12 sm:w-14 h-14 rounded-lg ${bgBoxClass} shadow-sm`}>
          <span className="font-mono text-xl sm:text-2xl font-bold leading-none">{pad(timeLeft.minutes)}</span>
          <span className={`text-[9px] uppercase tracking-wider mt-1 ${labelColor}`}>Mins</span>
        </div>
        <span className="text-[#C9972B] font-bold text-lg leading-none">:</span>
        <div className={`flex flex-col items-center justify-center w-12 sm:w-14 h-14 rounded-lg ${bgBoxClass} shadow-sm`}>
          <span className="font-mono text-xl sm:text-2xl font-bold text-[#F05A7E] leading-none">{pad(timeLeft.seconds)}</span>
          <span className={`text-[9px] uppercase tracking-wider mt-1 ${labelColor}`}>Secs</span>
        </div>
      </div>
    </div>
  );
};
