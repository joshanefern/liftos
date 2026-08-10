import { useCallback, useRef } from "react";

/**
 * Focus orchestration for power set-entry. Pass the ordered list of set ids
 * (the order the cursor should travel) on every render; each SetInputRow
 * registers its reps/weight inputs by id. Then:
 *
 *   - Enter in reps        → focusWeight(id)
 *   - marking a set done   → focusNextReps(id) (no-op on the last set)
 */
export const useEnterAdvance = (orderedSetIds: string[]) => {
  const repsRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const weightRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const idsRef = useRef(orderedSetIds);
  idsRef.current = orderedSetIds;

  const registerRepsRef = useCallback(
    (id: string) => (el: HTMLInputElement | null) => {
      repsRefs.current[id] = el;
    },
    [],
  );

  const registerWeightRef = useCallback(
    (id: string) => (el: HTMLInputElement | null) => {
      weightRefs.current[id] = el;
    },
    [],
  );

  const focusWeight = useCallback((id: string) => {
    weightRefs.current[id]?.focus();
  }, []);

  const focusNextReps = useCallback((id: string) => {
    const ids = idsRef.current;
    const next = ids[ids.indexOf(id) + 1];
    if (next) repsRefs.current[next]?.focus();
  }, []);

  return { registerRepsRef, registerWeightRef, focusWeight, focusNextReps };
};
