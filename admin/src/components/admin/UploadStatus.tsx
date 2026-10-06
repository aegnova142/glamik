// Shared upload feedback strip: progress bar, processing state, result
// summary and error. Used by every admin control that uploads a file, so an
// upload looks and reads the same whether it started from the Media Library,
// a product image slot or the site-logo picker.
import React from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { CMSMediaItem } from '@glamirk/shared/types';
import type { UploadPhase } from '../../hooks/useFileUpload';

interface UploadStatusProps {
  phase: UploadPhase;
  progress: number;
  error: string | null;
  /** The item just uploaded, for the dimensions/format summary. */
  result?: CMSMediaItem | null;
  /** Hides the success line once the caller has moved on. */
  showResult?: boolean;
}

const BAR_BG = 'bg-[#0B0B0B]';
const BAR_FILL = 'bg-[#C9972B]';

export const UploadStatus: React.FC<UploadStatusProps> = ({
  phase,
  progress,
  error,
  result,
  showResult = true,
}) => {
  if (phase === 'idle') return null;

  if (phase === 'error') {
    return (
      <div className="flex items-start gap-1.5 mt-1.5 text-[10px] text-[#F05A7E]">
        <AlertCircle className="w-3 h-3 shrink-0 mt-[1px]" aria-hidden="true" />
        <span>{error || 'Upload failed. Please try again.'}</span>
      </div>
    );
  }

  if (phase === 'uploading' || phase === 'processing') {
    return (
      <div className="mt-1.5" role="status" aria-live="polite">
        <div className="flex items-center justify-between text-[10px] text-[#6B6B6B] mb-1">
          <span className="flex items-center gap-1.5 text-[#E8D5A8]">
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            {phase === 'processing' ? 'Processing image…' : 'Uploading…'}
          </span>
          {/* During processing the byte count is already 100% and the number
              would just sit there, so it is dropped rather than left to look
              frozen. */}
          {phase === 'uploading' && <span className="font-mono">{progress}%</span>}
        </div>
        <div className={`h-1 w-full rounded-full overflow-hidden ${BAR_BG}`}>
          <div
            className={`h-full ${BAR_FILL} transition-[width] duration-200 ease-out ${
              phase === 'processing' ? 'animate-pulse' : ''
            }`}
            style={{ width: `${phase === 'processing' ? 100 : progress}%` }}
          />
        </div>
      </div>
    );
  }

  if (phase === 'done' && showResult) {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-[#E3B84B]" role="status">
        <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>Uploaded</span>
        {/* Only shown when the server actually determined them. Older media
            records predate these fields and must not render "undefined ×
            undefined". */}
        {result?.width && result?.height && (
          <span className="font-mono text-[#6B6B6B]">
            {result.width} × {result.height}
          </span>
        )}
        <span className="text-[#6B6B6B]">· Web optimised</span>
      </div>
    );
  }

  return null;
};
