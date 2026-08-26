/**
 * Activity feed: a bounded, newest-first list of file events plus the "follow agent"
 * flag that auto-opens files as they are written.
 */
import type { FileEvent } from '@prism/core'

export const ACTIVITY_CAP = 500

export interface ActivityState {
  /** Newest first. */
  events: readonly FileEvent[]
  follow: boolean
  cap: number
}

export function createActivity(opts: { follow?: boolean; cap?: number } = {}): ActivityState {
  return { events: [], follow: opts.follow ?? false, cap: opts.cap ?? ACTIVITY_CAP }
}

export function pushEvent(state: ActivityState, ev: FileEvent): ActivityState {
  const events = [ev, ...state.events]
  if (events.length > state.cap) events.length = state.cap
  return { ...state, events }
}

export function setFollow(state: ActivityState, follow: boolean): ActivityState {
  return state.follow === follow ? state : { ...state, follow }
}

/** Whether an event should open its file in the viewer when following. */
export function shouldAutoOpen(ev: FileEvent, follow: boolean): boolean {
  return follow && (ev.kind === 'created' || ev.kind === 'modified')
}

/** Human-readable relative time, e.g. "just now", "5s ago", "3m ago". */
export function relativeTime(timestamp: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - timestamp) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
