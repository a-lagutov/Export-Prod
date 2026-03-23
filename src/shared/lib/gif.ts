import GIF from 'gif.js'
import { pngBytesToCanvas } from './compression'

// gif.worker.js content injected at build time via esbuild define
declare const __GIF_WORKER_CONTENT__: string
let GIF_WORKER_URL: string | null = null

/**
 * Returns the Blob URL for the gif.js worker script, creating it lazily on first call.
 * The worker content is injected at build time via esbuild `define` as `__GIF_WORKER_CONTENT__`.
 */
export function getGifWorkerUrl(): string {
  if (!GIF_WORKER_URL) {
    const blob = new Blob([__GIF_WORKER_CONTENT__], { type: 'application/javascript' })
    GIF_WORKER_URL = URL.createObjectURL(blob)
  }
  return GIF_WORKER_URL
}

/**
 * Assembles multiple PNG frames into a GIF animation, applying size compression if needed.
 * If a size limit is set, uses binary search over gif.js quality (1–30, lower = better quality)
 * to find the highest quality that fits within the limit.
 * @param framesData - Array of PNG frame data as ArrayBuffers, sorted left-to-right.
 * @param width - Output GIF width in pixels.
 * @param height - Output GIF height in pixels.
 * @param delay - Frame delay in milliseconds.
 * @param limit - Maximum file size in bytes, or null for no limit.
 * @returns A GIF Blob.
 */
export async function assembleGif(
  framesData: ArrayBuffer[],
  width: number,
  height: number,
  delay: number,
  limit: number | null,
): Promise<Blob> {
  const canvases = await Promise.all(framesData.map((f) => pngBytesToCanvas(new Uint8Array(f))))

  function renderGif(quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const gif = new GIF({ workers: 2, quality, width, height, workerScript: getGifWorkerUrl() })
      canvases.forEach((c) => gif.addFrame(c, { delay, copy: true }))
      gif.on('finished', resolve)
      gif.on('error', reject)
      gif.render()
    })
  }

  if (!limit) return renderGif(10)

  let lo = 1,
    hi = 30,
    best: Blob | null = null
  for (let i = 0; i < 6; i++) {
    const mid = Math.floor((lo + hi) / 2)
    const blob = await renderGif(mid)
    if (blob.size <= limit) {
      best = blob
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  return best ?? renderGif(30)
}
