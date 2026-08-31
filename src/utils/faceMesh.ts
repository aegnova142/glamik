/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';

/**
 * MediaPipe's Face Landmarker returns 478 points in a fixed, published
 * topology (https://storage.googleapis.com/mediapipe-assets/documentation/mediapipe_face_landmark_fullsize.png).
 * These index groups are that fixed topology — not something specific to
 * any Glamirk product — used to build clip paths / stroke paths for a
 * given facial region. "Left"/"right" below follow MediaPipe's own
 * convention: the subject's own left/right, which is mirrored relative to
 * a face-on camera view.
 */
export const LIP_OUTER_RING = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
];
export const LIP_INNER_RING = [
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95,
];

export const RIGHT_EYE_RING = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const LEFT_EYE_RING = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
// Lower lash line only — where kajal/eyeliner is conventionally applied.
export const RIGHT_EYE_LOWER_LASH = [33, 7, 163, 144, 145, 153, 154, 155, 133];
export const LEFT_EYE_LOWER_LASH = [362, 382, 381, 380, 374, 373, 390, 249, 263];

export const FACE_OVAL_RING = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150,
  136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
// Rough cheekbone anchor points — used as a soft-edged circular region
// rather than a precise polygon (cheek segmentation needs a much finer
// mesh subdivision than the 478-point model reliably resolves).
export const RIGHT_CHEEK_ANCHOR = 116;
export const LEFT_CHEEK_ANCHOR = 345;

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
// The SDK doesn't expose a getter for the landmarker's current running
// mode, so it's tracked here alongside the singleton instead.
let currentRunningMode: 'IMAGE' | 'VIDEO' = 'IMAGE';

/** Loads the WASM runtime + model exactly once per page session and reuses
 * it for every detection call after that — this is a multi-megabyte
 * download, so repeating it per shade-switch or per frame would make the
 * feature unusable. */
function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE).then((filesetResolver) =>
      FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      })
    );
  }
  return landmarkerPromise;
}

/** Triggers the lazy WASM+model download without running a detection —
 * lets a caller show a loading state up front (e.g. as soon as the
 * Try-On modal opens) rather than only on first use. */
export function preloadFaceLandmarker(): Promise<FaceLandmarker> {
  return getLandmarker();
}

export type DetectionStatus = 'ok' | 'no-face' | 'multiple-faces' | 'load-error' | 'unsupported';

export interface DetectionResult {
  status: DetectionStatus;
  landmarks: NormalizedLandmark[] | null;
}

function toDetectionResult(landmarks: NormalizedLandmark[][]): DetectionResult {
  if (landmarks.length === 0) return { status: 'no-face', landmarks: null };
  // numFaces: 1 already caps detection at one face; a single detected face
  // is used even if more are technically present in frame, per spec §11
  // ("safely use the primary detected face with clear logic").
  return { status: 'ok', landmarks: landmarks[0] };
}

export async function detectFaceInImage(image: HTMLImageElement): Promise<DetectionResult> {
  if (typeof WebAssembly === 'undefined') return { status: 'unsupported', landmarks: null };
  try {
    const landmarker = await getLandmarker();
    if (currentRunningMode !== 'IMAGE') {
      await landmarker.setOptions({ runningMode: 'IMAGE' });
      currentRunningMode = 'IMAGE';
    }
    const result = landmarker.detect(image);
    return toDetectionResult(result.faceLandmarks);
  } catch (err) {
    console.error('Face landmark detection (image) failed:', err);
    return { status: 'load-error', landmarks: null };
  }
}

/** Video mode is a distinct MediaPipe running mode from image mode (it
 * keeps temporal state for smoother tracking) — switching to it is a real
 * async reconfiguration, so callers should do it once before starting
 * their frame loop, not on every frame. */
export async function ensureVideoMode(): Promise<FaceLandmarker> {
  const landmarker = await getLandmarker();
  if (currentRunningMode !== 'VIDEO') {
    await landmarker.setOptions({ runningMode: 'VIDEO' });
    currentRunningMode = 'VIDEO';
  }
  return landmarker;
}

export function detectFaceInVideoFrame(landmarker: FaceLandmarker, video: HTMLVideoElement, timestampMs: number): DetectionResult {
  try {
    const result = landmarker.detectForVideo(video, timestampMs);
    return toDetectionResult(result.faceLandmarks);
  } catch (err) {
    console.error('Face landmark detection (video) failed:', err);
    return { status: 'load-error', landmarks: null };
  }
}
