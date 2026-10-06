import { useRef, useState } from 'react';
import { useCMS } from '@glamirk/shared/context/CMSContext';
import { CMSMediaItem } from '@glamirk/shared/types';

interface UseFileUploadOptions {
  /** Exact MIME types (e.g. 'image/png') or prefixes (e.g. 'video/' matches any video type). */
  acceptedTypes: string[];
  maxSizeBytes: number;
  /** Shown when the file's type isn't in acceptedTypes. */
  typeErrorMessage: string;
}

/** What the control is currently doing. Drives the label, not just a boolean. */
export type UploadPhase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

const matchesAcceptedType = (fileType: string, acceptedTypes: string[]) =>
  acceptedTypes.some((t) => (t.endsWith('/') ? fileType.startsWith(t) : fileType === t));

/** Validate → upload → surface progress/error, for a single admin file input.
 * Shared by every "pick a file, show a spinner, get a URL back" admin control
 * (hero backgrounds, look videos, the site logo, etc.) instead of each one
 * re-implementing the same validate/upload/error dance.
 *
 * The browser-side checks here are a courtesy, not a security control — they
 * exist so an admin learns a 40 MB file is too big before spending two minutes
 * sending it. The server re-derives the real type from the file's bytes and is
 * the only thing that actually decides (backend/services/imageValidation).
 */
export function useFileUpload({ acceptedTypes, maxSizeBytes, typeErrorMessage }: UseFileUploadOptions) {
  const { uploadMediaDetailed } = useCMS();
  const [isUploading, setIsUploading] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastUpload, setLastUpload] = useState<CMSMediaItem | null>(null);
  // Guards against a second upload starting while one is in flight — a double
  // click on the button, or an impatient re-pick. Without it both complete and
  // the later response wins, which is not necessarily the file they picked
  // last. A ref, not state, because the check has to be correct within a
  // single event handler rather than after the next render.
  const inFlight = useRef(false);

  const upload = async (file: File | undefined): Promise<CMSMediaItem | null> => {
    if (inFlight.current) return null;
    setError(null);
    if (!file) return null;
    if (!matchesAcceptedType(file.type, acceptedTypes)) {
      setError(typeErrorMessage);
      setPhase('error');
      return null;
    }
    if (file.size > maxSizeBytes) {
      setError(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is ${(
          maxSizeBytes /
          1024 /
          1024
        ).toFixed(0)}MB.`
      );
      setPhase('error');
      return null;
    }

    inFlight.current = true;
    setIsUploading(true);
    setProgress(0);
    setPhase('uploading');

    const { item, error: serverError } = await uploadMediaDetailed(file, {
      onProgress: (percent) => {
        setProgress(percent);
        // The bytes are delivered but the server is still storing them.
        // Saying so beats a bar that sits at 99% looking stuck.
        if (percent >= 99) setPhase('processing');
      },
    });

    inFlight.current = false;
    setIsUploading(false);

    if (!item) {
      // The server's message, when it gave one. It is written for an admin to
      // act on; a generic fallback is only for the cases where it did not.
      setError(serverError || 'Upload failed. Please try again.');
      setPhase('error');
      setProgress(0);
      return null;
    }

    setLastUpload(item);
    setProgress(100);
    setPhase('done');
    return item;
  };

  const reset = () => {
    setError(null);
    setProgress(0);
    setPhase('idle');
    setLastUpload(null);
  };

  return { upload, isUploading, error, progress, phase, lastUpload, reset };
}
