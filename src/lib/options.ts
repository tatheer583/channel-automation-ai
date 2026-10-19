/** Display-mode option constants shared by several pages. */

import type { AspectId, FpsId, ResolutionId } from '../types'

export interface AspectOption {
  id: AspectId
  /** e.g. "Vertical 9:16". */
  label: string
  /** Short description e.g. "Shorts / Reels". */
  hint: string
}

export const ASPECTS: AspectOption[] = [
  { id: '9:16', label: 'Vertical 9:16', hint: 'Shorts, Reels, TikTok' },
  { id: '1:1', label: 'Square 1:1', hint: 'Feed posts' },
  { id: '4:5', label: 'Portrait 4:5', hint: 'Feed photos ratio' },
  { id: '16:9', label: 'Landscape 16:9', hint: 'Standard video' },
]

export const RESOLUTIONS: { id: ResolutionId; label: string }[] = [
  { id: '720p', label: 'HD 720p' },
  { id: '1080p', label: 'Full HD 1080p' },
  { id: '1440p', label: 'QHD 1440p' },
]

export const FPS_OPTIONS: { id: FpsId; label: string }[] = [
  { id: 24, label: '24 fps — cinematic' },
  { id: 30, label: '30 fps — standard' },
  { id: 60, label: '60 fps — smooth' },
]

export interface CaptionPreset {
  id: string
  label: string
  /** Partial applied on top of the current caption style. */
  style: {
    fontSize: number
    fontColor: string
    bgEnabled: boolean
    bgColor: string
    bgOpacity: number
    position: 'top' | 'center' | 'bottom'
  }
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: 'clean-minimal',
    label: 'Clean Minimal',
    style: {
      fontSize: 22,
      fontColor: '#ffffff',
      bgEnabled: false,
      bgColor: '#000000',
      bgOpacity: 0,
      position: 'bottom',
    },
  },
  {
    id: 'bold-pop',
    label: 'Bold Pop',
    style: {
      fontSize: 30,
      fontColor: '#ffffff',
      bgEnabled: true,
      bgColor: '#1a1030',
      bgOpacity: 66,
      position: 'bottom',
    },
  },
  {
    id: 'label-box',
    label: 'Label Box',
    style: {
      fontSize: 24,
      fontColor: '#0b0b12',
      bgEnabled: true,
      bgColor: '#ffffff',
      bgOpacity: 92,
      position: 'center',
    },
  },
  {
    id: 'neon-edge',
    label: 'Neon Edge',
    style: {
      fontSize: 28,
      fontColor: '#c7f0ff',
      bgEnabled: true,
      bgColor: '#0d1b3e',
      bgOpacity: 80,
      position: 'top',
    },
  },
]

export const YT_CATEGORIES: { id: string; label: string }[] = [
  { id: '22', label: 'People & Blogs' },
  { id: '24', label: 'Entertainment' },
  { id: '25', label: 'News & Politics' },
  { id: '28', label: 'Science & Technology' },
  { id: '27', label: 'Education' },
  { id: '26', label: 'Howto & Style' },
  { id: '17', label: 'Sports' },
  { id: '10', label: 'Music' },
  { id: '20', label: 'Gaming' },
  { id: '2', label: 'Autos & Vehicles' },
  { id: '1', label: 'Film & Animation' },
  { id: '23', label: 'Comedy' },
]

export const ACCENTS: { id: 'violet' | 'blue' | 'teal'; label: string; color: string }[] = [
  { id: 'violet', label: 'Violet', color: '#8b7bff' },
  { id: 'blue', label: 'Blue', color: '#57a0ff' },
  { id: 'teal', label: 'Teal', color: '#2ec7b9' },
]
