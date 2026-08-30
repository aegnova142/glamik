import { useEffect, RefObject } from 'react';

/** Calls `onOutside` on any mousedown outside the given ref — e.g. to close a dropdown/popover.
 * Pass `enabled: false` (e.g. while the dropdown is already closed) to skip attaching the
 * document-level listener entirely rather than attaching it unconditionally for the component's
 * whole lifetime. */
export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, enabled]);
}
