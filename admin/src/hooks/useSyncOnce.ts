import { useEffect, useRef } from 'react';

/**
 * Syncs `setState(value)` only the first time `value` becomes truthy (e.g.
 * once the CMS context finishes its initial fetch), then never again.
 *
 * Admin forms hold their own editable copy of CMS data locally so the admin
 * can type without every keystroke round-tripping through context. If the
 * effect kept re-syncing on every context change, a background refresh
 * (the 30s poll, or an SSE 'CMS_UPDATE' broadcast fired by *any* admin
 * action anywhere) would silently overwrite in-progress unsaved edits —
 * including an image the admin just picked but hasn't saved yet.
 */
export function useSyncOnce<T>(value: T | null | undefined, setState: (value: T) => void) {
  const didInitRef = useRef(false);
  useEffect(() => {
    if (value && !didInitRef.current) {
      setState(value);
      didInitRef.current = true;
    }
  }, [value]);
}
