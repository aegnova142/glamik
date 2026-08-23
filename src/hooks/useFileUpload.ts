import { useState } from 'react';
import { useCMS } from '../context/CMSContext';
import { CMSMediaItem } from '../types';

interface UseFileUploadOptions {
  /** Exact MIME types (e.g. 'image/png') or prefixes (e.g. 'video/' matches any video type). */
  acceptedTypes: string[];
  maxSizeBytes: number;
  /** Shown when the file's type isn't in acceptedTypes. */
  typeErrorMessage: string;
}

const matchesAcceptedType = (fileType: string, acceptedTypes: string[]) =>
  acceptedTypes.some((t) => (t.endsWith('/') ? fileType.startsWith(t) : fileType === t));

/** Validate → upload → surface progress/error, for a single admin file input.
 * Shared by every "pick a file, show a spinner, get a URL back" admin control
 * (hero backgrounds, look videos, the site logo, etc.) instead of each one
 * re-implementing the same validate/upload/error dance. */
export function useFileUpload({ acceptedTypes, maxSizeBytes, typeErrorMessage }: UseFileUploadOptions) {
  const { uploadMedia } = useCMS();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined): Promise<CMSMediaItem | null> => {
    setError(null);
    if (!file) return null;
    if (!matchesAcceptedType(file.type, acceptedTypes)) {
      setError(typeErrorMessage);
      return null;
    }
    if (file.size > maxSizeBytes) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is ${(maxSizeBytes / 1024 / 1024).toFixed(0)}MB.`);
      return null;
    }
    setIsUploading(true);
    const mediaItem = await uploadMedia(file);
    setIsUploading(false);
    if (!mediaItem) {
      setError('Upload failed. Please try again.');
      return null;
    }
    return mediaItem;
  };

  return { upload, isUploading, error };
}
