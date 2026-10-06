// ==========================================
// MEDIA UPLOAD PIPELINE
//
// The one path an uploaded file takes from the browser to Cloudinary:
//
//   multer (memory, bounded)
//     → validateUpload (magic bytes, size, extension, SVG sanitisation)
//       → uploadToCloudinary (resource_type pinned, metadata returned)
//         → caller persists the reference
//
// This module owns the first and third steps and the error translation around
// all of them. The second lives in imageValidation.service.ts, which is pure
// so it can be tested without a Cloudinary account.
//
// It exists because the same ten lines of multer config and the same
// forty-line upload_stream promise had been copied into three route files
// with three slightly different sets of accepted formats and three different
// bugs. Fixing the validation in one of them fixed it in one of them.
// ==========================================

import multer from 'multer';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import {
  validateUpload,
  sanitizeFilename,
  ValidatedUpload,
  ValidationFailure,
  ValidationOutcome,
} from './imageValidation.service';

export type { ValidatedUpload, ValidationFailure, ValidationOutcome };

/** Everything worth keeping about a stored asset. */
export interface UploadedAsset {
  /** HTTPS delivery URL of the stored original. */
  url: string;
  publicId: string;
  resourceType: 'image' | 'video';
  width?: number;
  height?: number;
  /** Cloudinary's own name for the stored format, e.g. 'jpg', 'webp'. */
  format?: string;
  bytes?: number;
  /** sha256 of the uploaded bytes. Used to recognise a re-upload of the same file. */
  contentHash: string;
}

/**
 * multer, configured once.
 *
 * memoryStorage, not diskStorage: nothing is ever written to the server's
 * filesystem, which removes the entire class of "attacker controls a path"
 * and "a temp file survives and gets served" problems before they start. The
 * cost is that the file sits in RSS for the duration of the request, which is
 * what the limits below are for.
 *
 * `files: 1` matters as much as `fileSize`. Without it, a single request can
 * carry a hundred files each just under the ceiling, and the ceiling stops
 * meaning anything.
 */
export function createUploadMiddleware(options: { maxBytes?: number } = {}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      // The video ceiling, because multer has to decide before anything has
      // read a byte of the file and cannot know which kind this is. The image
      // ceiling is applied by validateUpload once the bytes have said.
      fileSize: options.maxBytes ?? env.media.maxVideoBytes,
      files: 1,
      // Keep a malicious client from sending thousands of tiny text fields
      // alongside the file; each one is buffered too.
      fields: 20,
      fieldSize: 64 * 1024,
    },
    // No fileFilter. It only ever sees the client-declared mimetype, which is
    // worth nothing, and acting on it here produced an error multer surfaces
    // in a shape that is awkward to turn into a clean response. Rejection
    // happens in one place instead: validateUpload, on the real bytes.
  });
}

/**
 * Translates a multer failure into a clean JSON response.
 *
 * Mount this immediately after the `upload.single(...)` middleware on each
 * route. Without it an oversized upload falls through to Express's default
 * handler, which answers with an HTML stack trace and a 500 — an internal
 * error page shown to an admin who simply picked too big a photo.
 */
export function respondToUploadError(err: unknown, res: Response): boolean {
  if (!err) return false;

  const code = (err as { code?: string }).code;
  if (code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      error: `That file is too large. Maximum image size is ${Math.round(
        env.media.maxImageBytes / (1024 * 1024)
      )} MB.`,
    });
    return true;
  }
  if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(400).json({ error: 'Please upload one file at a time.' });
    return true;
  }

  console.error('[media] upload middleware failed:', err);
  res.status(400).json({ error: 'That upload could not be read. Please try again.' });
  return true;
}

/** Express-style wrapper around respondToUploadError, for use as error middleware. */
export function uploadErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (!respondToUploadError(err, res)) next(err);
}

export interface ValidateFileOptions {
  accept?: 'image' | 'image-or-video';
  allowGif?: boolean;
  /**
   * Overrides env.media.allowSvg downward only.
   *
   * Set false on endpoints where SVG is never a sensible answer regardless of
   * configuration — a profile photo or a review attachment is a photograph,
   * and accepting XML there is risk with no corresponding feature.
   */
  allowSvg?: boolean;
  maxImageBytes?: number;
  maxVideoBytes?: number;
}

/**
 * Validates a multer file against the configured limits.
 *
 * Thin on purpose — it only supplies the environment-driven defaults so that
 * no route has to remember to read env.media itself and none of them can
 * drift to a different limit.
 */
export function validateMediaFile(
  file: { buffer: Buffer; originalname?: string } | undefined,
  options: ValidateFileOptions = {}
): ValidationOutcome {
  if (!file || !file.buffer) {
    return {
      outcome: 'rejected',
      error: { message: 'No file was uploaded.', status: 400, logDetail: 'no file on request' },
    };
  }
  return validateUpload(file.buffer, file.originalname, {
    accept: options.accept ?? 'image-or-video',
    allowGif: options.allowGif,
    maxImageBytes: options.maxImageBytes ?? env.media.maxImageBytes,
    maxVideoBytes: options.maxVideoBytes ?? env.media.maxVideoBytes,
    // Both have to agree. A route can refuse SVG that the config allows, but
    // it cannot allow SVG the config has switched off.
    allowSvg: env.media.allowSvg && options.allowSvg !== false,
  });
}

export interface CloudinaryUploadOptions {
  folder: string;
  /** Fixed id — the asset is overwritten in place (avatars). Omit for a new asset each time. */
  publicId?: string;
  /** Applied to the STORED asset. Leave unset to keep the original untouched. */
  transformation?: Record<string, unknown>[];
  timeoutMs?: number;
}

/**
 * Streams a validated buffer to Cloudinary and returns its reference.
 *
 * WHAT IS DELIBERATELY *NOT* DONE HERE: the stored asset is not re-encoded,
 * downscaled or converted. Cloudinary keeps the original the admin uploaded,
 * and every delivered size and format is derived from it on request by the
 * f_auto/q_auto URLs that shared/utils/cloudinaryImage.ts builds. Baking the
 * optimisation into storage instead would be a one-way door: the day a layout
 * needs a wider crop, or a better codec appears, the pixels to make it from
 * would already have been thrown away.
 */
export function uploadToCloudinary(
  file: ValidatedUpload,
  options: CloudinaryUploadOptions
): Promise<UploadedAsset> {
  const contentHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

  return new Promise((resolve, reject) => {
    // The SDK has no built-in timeout, so a stalled call (bad credentials,
    // DNS or firewall trouble, a dropped connection) means the callback never
    // fires and the request hangs until the proxy gives up. Video gets longer
    // because Cloudinary transcodes it server-side before answering.
    const timeoutMs = options.timeoutMs ?? (file.kind === 'video' ? 120000 : 45000);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Cloudinary upload timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        // Pinned to what the bytes were verified as — never 'auto'. 'auto'
        // lets anything Cloudinary fails to classify land as a `raw` asset,
        // which it will then serve back with its original content type. That
        // is how an "image upload" becomes an HTML file hosted on your CDN.
        resource_type: file.kind,
        ...(options.publicId ? { public_id: options.publicId, overwrite: true, invalidate: true } : {}),
        ...(options.transformation ? { transformation: options.transformation } : {}),
      },
      (err, result) => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        if (err || !result) return reject(err || new Error('Cloudinary upload failed'));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: file.kind,
          // Prefer what Cloudinary measured; fall back to what we parsed from
          // the header, which is all there is for formats it reports nothing
          // for.
          width: result.width ?? file.width,
          height: result.height ?? file.height,
          format: result.format,
          bytes: result.bytes ?? file.buffer.length,
          contentHash,
        });
      }
    );
    stream.end(file.buffer);
  });
}

/** sha256 of a buffer, for recognising an identical re-upload. */
export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Best-effort removal of an asset that was just created and is not yet
 * referenced by anything.
 *
 * Only safe to call on an upload whose database write FAILED — i.e. an asset
 * no record points at. It must never be used to tidy up a replaced image; see
 * the "Rollback & Cleanup Timing" policy in routes/admin.routes.ts for why.
 */
export async function discardOrphanedAsset(asset: UploadedAsset | null): Promise<void> {
  if (!asset?.publicId) return;
  try {
    await cloudinary.uploader.destroy(asset.publicId, { resource_type: asset.resourceType });
    console.warn(`[media] rolled back orphaned upload ${asset.publicId} after a failed save`);
  } catch (err) {
    // Deliberately swallowed. The caller is already returning an error for
    // the original failure; a leaked asset is a storage-cost problem, not a
    // correctness one, and must not mask the real cause in the response.
    console.error(`[media] could not roll back orphaned upload ${asset.publicId}:`, err);
  }
}

export { sanitizeFilename };
