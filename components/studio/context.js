'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

export const StudioContext = createContext(null);

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio doit être utilisé dans <Studio>');
  return ctx;
}

/** Historique annuler / rétablir du projet */
export function useProjectStore(initial) {
  const [state, setState] = useState({ project: initial, past: [], future: [], lastKey: null, lastTime: 0 });
  const ref = useRef(state);
  ref.current = state;

  const update = useCallback((fn, opts = {}) => {
    setState((s) => {
      const next = typeof fn === 'function' ? fn(s.project) : fn;
      if (!next || next === s.project) return s;
      if (opts.history === false) return { ...s, project: next };
      const now = Date.now();
      if (opts.coalesce && s.lastKey === opts.coalesce && now - s.lastTime < 1500) return { ...s, project: next, lastTime: now };
      return { project: next, past: [...s.past.slice(-149), s.project], future: [], lastKey: opts.coalesce || null, lastTime: now };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future].slice(0, 150), lastKey: null, lastTime: 0 };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return { project: next, past: [...s.past, s.project], future: rest, lastKey: null, lastTime: 0 };
    });
  }, []);

  return {
    project: state.project,
    update,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    getProject: () => ref.current.project,
  };
}
