import { useState } from 'react';

/** Native HTML5 drag-and-drop reordering for a list held in parent state.
 * `setList` receives the reordered array — pass whatever setter already
 * updates that list (e.g. a field updater), same as a normal onChange. */
export function useDragReorder<T>(list: T[], setList: (next: T[]) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const updated = [...list];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(targetIndex, 0, moved);
    setList(updated);
    setDragIndex(null);
  };

  return { dragIndex, setDragIndex, handleDrop };
}
