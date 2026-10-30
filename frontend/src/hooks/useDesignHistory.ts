import { useCallback, useState } from 'react'
import type { ComponentCustomisation } from '@/lib/types'

const HISTORY_LIMIT = 50

interface HistoryState {
  past: Record<string, ComponentCustomisation>[]
  present: Record<string, ComponentCustomisation>
  future: Record<string, ComponentCustomisation>[]
}

export interface DesignHistory {
  components: Record<string, ComponentCustomisation>
  /** Replace the document without adding an undo step (during a drag). */
  replace: (next: Record<string, ComponentCustomisation>) => void
  /** Add an undo step for the given snapshot (call once per gesture/change). */
  record: (snapshot: Record<string, ComponentCustomisation>) => void
  /** Replace and add an undo step in one call (discrete edits). */
  commit: (next: Record<string, ComponentCustomisation>) => void
  undo: () => void
  redo: () => void
  reset: (next: Record<string, ComponentCustomisation>) => void
  canUndo: boolean
  canRedo: boolean
}

export function useDesignHistory(
  initial: Record<string, ComponentCustomisation>,
): DesignHistory {
  const [state, setState] = useState<HistoryState>({ past: [], present: initial, future: [] })

  const replace = useCallback((next: Record<string, ComponentCustomisation>) => {
    setState((current) => ({ ...current, present: next }))
  }, [])

  const record = useCallback((snapshot: Record<string, ComponentCustomisation>) => {
    setState((current) => ({
      past: [...current.past.slice(-HISTORY_LIMIT + 1), snapshot],
      present: current.present,
      future: [],
    }))
  }, [])

  const commit = useCallback((next: Record<string, ComponentCustomisation>) => {
    setState((current) => ({
      past: [...current.past.slice(-HISTORY_LIMIT + 1), current.present],
      present: next,
      future: [],
    }))
  }, [])

  const undo = useCallback(() => {
    setState((current) => {
      if (current.past.length === 0) return current
      const previous = current.past[current.past.length - 1]
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, HISTORY_LIMIT),
      }
    })
  }, [])

  const redo = useCallback(() => {
    setState((current) => {
      if (current.future.length === 0) return current
      const [next, ...rest] = current.future
      return {
        past: [...current.past.slice(-HISTORY_LIMIT + 1), current.present],
        present: next,
        future: rest,
      }
    })
  }, [])

  const reset = useCallback((next: Record<string, ComponentCustomisation>) => {
    setState({ past: [], present: next, future: [] })
  }, [])

  return {
    components: state.present,
    replace,
    record,
    commit,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
