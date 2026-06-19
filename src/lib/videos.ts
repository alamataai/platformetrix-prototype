import type {
  Media, ResolvedMedia, ResolvedVideoMedia, ResolvedAudioMedia,
  SportsEvent, Competition, SportsEventTimeslice,
} from '../types'
import { makeVideoId } from './utils'

/** Resolve a Media item to a ResolvedMedia by filling in the derived parent-chain fields. */
export function resolveMedia(
  m: Media,
  sportsEvent: SportsEvent,
  competition: Competition,
): ResolvedMedia {
  const video_id = makeVideoId(competition.name, sportsEvent.name, m.label)
  if (m.type === 'video') {
    return { ...m, competition_name: competition.name, sports_event_name: sportsEvent.name, video_id } as ResolvedVideoMedia
  }
  return { ...m, competition_name: competition.name, sports_event_name: sportsEvent.name, video_id } as ResolvedAudioMedia
}

/** Resolve the media a SportsEvent references (by id), applying the excluded flag. */
export function resolveMediaList(
  mediaIds: string[],
  excludedIds: string[],
  lib: Media[],
  sportsEvent: SportsEvent,
  competition: Competition,
): ResolvedMedia[] {
  const excluded = new Set(excludedIds)
  const byId = new Map(lib.map(m => [m.id, m]))
  return mediaIds
    .map(id => byId.get(id))
    .filter((m): m is Media => m != null)
    .map(m => {
      const resolved = resolveMedia(m, sportsEvent, competition)
      return excluded.has(m.id) ? { ...resolved, is_excluded: true } : resolved
    })
}

/**
 * Collect pipeline-ready timeslices from all resolved VideoMedia items.
 * The video_id on each timeslice is updated to match the resolved video_id
 * (which may have changed if the competition or event name was renamed).
 */
export function collectTimeslices(resolved: ResolvedMedia[]): SportsEventTimeslice[] {
  const slices: SportsEventTimeslice[] = []
  for (const m of resolved) {
    if (m.type !== 'video') continue
    const vm = m as ResolvedVideoMedia
    for (const t of vm.timeslices) {
      slices.push(t.video_id === vm.video_id ? t : { ...t, video_id: vm.video_id })
    }
  }
  return slices
}

/** Type-narrowing helper — resolves to just the video items. */
export function videoMediaOnly(resolved: ResolvedMedia[]): ResolvedVideoMedia[] {
  return resolved.filter((m): m is ResolvedVideoMedia => m.type === 'video')
}
