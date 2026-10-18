/** Pure helpers for building downloadable files (SRT/VTT captions, CSV). */

import type { CaptionLine } from '../types'

/** 12.345 → "00:00:12,345" (SRT style). */
export function secondsToSrtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000))
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const rest = ms % 1000
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rest, 3)}`
}

/** 12.345 → "00:00:12.345" (WebVTT style). */
export function secondsToVttTime(seconds: number): string {
  return secondsToSrtTime(seconds).replace(',', '.')
}

export function sortLines(lines: CaptionLine[]): CaptionLine[] {
  return [...lines].sort((a, b) => a.start - b.start)
}

export function buildSrt(lines: CaptionLine[]): string {
  const list = sortLines(lines).filter((l) => l.text.trim() !== '' && l.end > l.start)
  return (
    list
      .map((line, index) => {
        return `${index + 1}\n${secondsToSrtTime(line.start)} --> ${secondsToSrtTime(line.end)}\n${line.text.trim()}\n`
      })
      .join('\n') + '\n'
  )
}

export function buildVtt(lines: CaptionLine[]): string {
  const list = sortLines(lines).filter((l) => l.text.trim() !== '' && l.end > l.start)
  return (
    'WEBVTT\n\n' +
    list
      .map(
        (line) =>
          `${secondsToVttTime(line.start)} --> ${secondsToVttTime(line.end)}\n${line.text.trim()}\n`,
      )
      .join('\n')
  )
}

function csvCell(value: string | number): string {
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function buildCsv(header: string[], rows: Array<Array<string | number>>): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
}

/** Trigger a client-side file download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function downloadText(text: string, filename: string, mime = 'text/plain'): void {
  downloadBlob(new Blob([text], { type: `${mime };charset=utf-8` }), filename)
}

export async function downloadDataUrl(dataUrl: string, filename: string): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob()
  downloadBlob(blob, filename)
}
