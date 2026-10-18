/**
 * Deterministic title/description/hashtag templating.
 * Variables: {{clip}}, {{video}}, {{range}}, {{aspect}}, {{date}}, {{time}}
 * This runs 100% locally — no LLM/API required.
 */

import type { TextTemplate } from '../types'

export const DEFAULT_TEXT_TEMPLATES: TextTemplate[] = [
  {
    id: 'clean-facts',
    label: 'Clean Facts',
    title: '{{clip}}',
    description:
      'Clip: {{clip}}\nSource: {{video}}\nRange: {{range}}\n\n#shorts',
    hashtags: '#shorts #clips #{{videoTag}}',
  },
  {
    label: 'Hook + CTA',
    id: 'hook-cta',
    title: '{{clip}} 👀',
    description:
      '{{clip}}\n\n⏱ From {{range}} in "{{video}}".\n\nSubscribe for a new reel every day!\n\n#shorts',
    hashtags: '#shorts #reels #viral #{{videoTag}}',
  },
  {
    id: 'series-batch',
    label: 'Series / Batch',
    title: '{{video}} — {{range}} ({{date}})',
    description:
      'Daily cut from "{{video}}".\n\nThis reel: {{range}} · formatted for {{aspect}}.\n\n#shorts',
    hashtags: '#shorts #daily #{{videoTag}}',
  },
]

/** Replace {{var}} tokens; unknown variables become empty strings. */
export function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_m, name: string) => vars[name] ?? '')
}

/** "Studio Session — Episode 04.mp4" → "studiosession" for a hashtag. */
export function videoTagOf(videoName: string): string {
  return (
    videoName
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 20) || 'clips'
  )
}

export function templateVars(input: {
  clipTitle: string
  videoName: string
  startText: string
  endText: string
  aspect: string
  date: string
  time: string
}): Record<string, string> {
  return {
    clip: input.clipTitle,
    video: input.videoName,
    videoTag: videoTagOf(input.videoName),
    range: `${input.startText}–${input.endText}`,
    aspect: input.aspect,
    date: input.date,
    time: input.time,
  }
}
