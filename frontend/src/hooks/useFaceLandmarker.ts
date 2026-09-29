import { useCallback, useEffect, useRef, useState } from 'react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { detectFaceInImage, detectFaceInVideoFrame, ensureVideoMode, preloadFaceLandmarker } from '../utils/faceMesh';
import type { DetectionResult } from '../utils/faceMesh';

export type LandmarkerStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Live camera doesn't need to run detection at the video's native frame
 * rate — the face barely moves frame-to-frame, and running the full ML
 * model that often would burn CPU/GPU for no visible benefit. 12fps keeps
 * tracking visibly responsive without pegging a laptop fan. */
const VIDEO_DETECTION_FPS = 12;

/** Wraps the MediaPipe FaceLandmarker (see src/utils/faceMesh.ts) with the
 * loading/error lifecycle a component actually needs: a status flag for
 * the one-time WASM+model download, a one-shot image detector (Standard
 * Model / Upload Photo), and a start/stop-able detection loop for live
 * video that a caller drives with its own render callback. */
export function useFaceLandmarker() {
  const [status, setStatus] = useState<LandmarkerStatus>('idle');
  const rafRef = useRef<number | null>(null);
  const lastDetectAtRef = useRef(0);

  const ensureReady = useCallback(async () => {
    if (status === 'ready') return true;
    setStatus('loading');
    try {
      await preloadFaceLandmarker();
      setStatus('ready');
      return true;
    } catch {
      setStatus('error');
      return false;
    }
  }, [status]);

  const detectImage = useCallback(async (image: HTMLImageElement): Promise<DetectionResult> => {
    setStatus('loading');
    const result = await detectFaceInImage(image);
    setStatus(result.status === 'ok' || result.status === 'no-face' ? 'ready' : 'error');
    return result;
  }, []);

  /** Starts a throttled detectForVideo loop against `video`, calling
   * `onResult` on every sampled frame until `stopVideoLoop` is called or
   * the component unmounts. Safe to call again to restart after a stop. */
  const startVideoLoop = useCallback((video: HTMLVideoElement, onResult: (result: DetectionResult) => void) => {
    let cancelled = false;
    setStatus('loading');

    ensureVideoMode()
      .then((landmarker: FaceLandmarker) => {
        if (cancelled) return;
        setStatus('ready');
        const frameIntervalMs = 1000 / VIDEO_DETECTION_FPS;

        const tick = (now: number) => {
          if (cancelled) return;
          if (now - lastDetectAtRef.current >= frameIntervalMs && video.readyState >= 2) {
            lastDetectAtRef.current = now;
            onResult(detectFaceInVideoFrame(landmarker, video, now));
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stopVideoLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => stopVideoLoop, [stopVideoLoop]);

  return { status, ensureReady, detectImage, startVideoLoop, stopVideoLoop };
}
