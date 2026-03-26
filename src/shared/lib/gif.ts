import { encode } from 'modern-gif'
import { Finder, Palette } from 'modern-palette'
import type { QuantizedColor } from 'modern-palette'
import * as config from '../config'
import { pngBytesToCanvas } from './compression'

/** Available dithering algorithms. */
type DitherMethod = 'floyd-steinberg' | 'jarvis-judice-ninke' | 'bayer'

/**
 * All methods tried during the quality search, ordered by perceptual quality
 * (best last so the loop naturally keeps the highest-quality winner on ties).
 * Bayer is listed first because it produces temporally stable patterns across
 * animation frames (no flicker in static areas), making it a strong candidate
 * for animated content even when its perceptual score per-frame is lower.
 */
const DITHER_METHODS: DitherMethod[] = ['bayer', 'floyd-steinberg', 'jarvis-judice-ninke']

/**
 * 4×4 Bayer ordered-dithering threshold matrix (values 0–15).
 * Tiled across the image by (x % 4, y % 4) to produce a regular screen pattern.
 */
const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

/**
 * Half the Bayer matrix range (0–15), used to centre the offset around zero.
 * At scale 32 the per-channel offset spans ±15, a good balance between
 * visible patterning and effective dithering.
 */
const BAYER_HALF = 7.5
const BAYER_SCALE = 32

/**
 * Applies Bayer ordered dithering to raw RGBA pixel data against a palette.
 * Each pixel's RGB channels are shifted by a position-dependent threshold before
 * palette lookup, creating a regular screen pattern.  Because the threshold is
 * determined solely by (x, y), the pattern is identical across animation frames
 * for any pixel that does not change colour, eliminating inter-frame flicker.
 * Returns a new Uint8ClampedArray — the original is not modified.
 * @param pixels - Source RGBA pixel data (4 bytes per pixel, row-major).
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @param paletteColors - RGB triples [r, g, b] indexed by palette position.
 * @param finder - Color finder used for nearest-neighbour palette lookups.
 * @returns Dithered RGBA pixel data as a new Uint8ClampedArray.
 */
function applyBayerDithering(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  paletteColors: number[][],
  finder: Finder,
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(pixels)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIdx = (y * width + x) * 4
      // Map the 0–15 Bayer value to a symmetric offset centred on zero.
      const offset = ((BAYER_4X4[y % 4][x % 4] - BAYER_HALF) * BAYER_SCALE) / 16

      const r = Math.max(0, Math.min(255, result[pixelIdx] + offset))
      const g = Math.max(0, Math.min(255, result[pixelIdx + 1] + offset))
      const b = Math.max(0, Math.min(255, result[pixelIdx + 2] + offset))
      const alpha = result[pixelIdx + 3]

      const colorIndex = finder.findNearestIndex(r, g, b, alpha)
      const [pr, pg, pb] = paletteColors[colorIndex]
      result[pixelIdx] = pr
      result[pixelIdx + 1] = pg
      result[pixelIdx + 2] = pb
    }
  }

  return result
}

/**
 * Applies Floyd-Steinberg error-diffusion dithering to raw RGBA pixel data.
 * Quantisation error is spread to four neighbours with weights 7/16 (right),
 * 3/16 (bottom-left), 5/16 (bottom), 1/16 (bottom-right).
 * Returns a new Uint8ClampedArray — the original is not modified.
 * @param pixels - Source RGBA pixel data (4 bytes per pixel, row-major).
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @param paletteColors - RGB triples [r, g, b] indexed by palette position.
 * @param finder - Color finder used for nearest-neighbour palette lookups.
 * @returns Dithered RGBA pixel data as a new Uint8ClampedArray.
 */
function applyFloydSteinbergDithering(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  paletteColors: number[][],
  finder: Finder,
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(pixels)
  // Accumulated RGB errors for every pixel position (3 channels, no alpha).
  const errors = new Float32Array(width * height * 3)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIdx = (y * width + x) * 4
      const errIdx = (y * width + x) * 3

      // Add accumulated error, clamped to a valid byte range.
      const r = Math.max(0, Math.min(255, result[pixelIdx] + errors[errIdx]))
      const g = Math.max(0, Math.min(255, result[pixelIdx + 1] + errors[errIdx + 1]))
      const b = Math.max(0, Math.min(255, result[pixelIdx + 2] + errors[errIdx + 2]))
      const alpha = result[pixelIdx + 3]

      const colorIndex = finder.findNearestIndex(r, g, b, alpha)
      const [pr, pg, pb] = paletteColors[colorIndex]
      result[pixelIdx] = pr
      result[pixelIdx + 1] = pg
      result[pixelIdx + 2] = pb

      const errR = r - pr
      const errG = g - pg
      const errB = b - pb

      // Right neighbour: 7/16.
      if (x + 1 < width) {
        const idx = (y * width + x + 1) * 3
        errors[idx] += (errR * 7) / 16
        errors[idx + 1] += (errG * 7) / 16
        errors[idx + 2] += (errB * 7) / 16
      }
      if (y + 1 < height) {
        // Bottom-left: 3/16.
        if (x > 0) {
          const idx = ((y + 1) * width + x - 1) * 3
          errors[idx] += (errR * 3) / 16
          errors[idx + 1] += (errG * 3) / 16
          errors[idx + 2] += (errB * 3) / 16
        }
        // Bottom: 5/16.
        const idxB = ((y + 1) * width + x) * 3
        errors[idxB] += (errR * 5) / 16
        errors[idxB + 1] += (errG * 5) / 16
        errors[idxB + 2] += (errB * 5) / 16
        // Bottom-right: 1/16.
        if (x + 1 < width) {
          const idx = ((y + 1) * width + x + 1) * 3
          errors[idx] += (errR * 1) / 16
          errors[idx + 1] += (errG * 1) / 16
          errors[idx + 2] += (errB * 1) / 16
        }
      }
    }
  }

  return result
}

/**
 * Applies Jarvis-Judice-Ninke error-diffusion dithering to raw RGBA pixel data.
 * Error is spread across 12 neighbours in two rows with weights summing to 48,
 * producing smoother gradients than Floyd-Steinberg at the cost of a wider
 * diffusion radius.  Distribution (X = current pixel):
 *
 *           X   7   5
 *   3   5   7   5   3
 *   1   3   5   3   1   (÷ 48)
 *
 * Returns a new Uint8ClampedArray — the original is not modified.
 * @param pixels - Source RGBA pixel data (4 bytes per pixel, row-major).
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @param paletteColors - RGB triples [r, g, b] indexed by palette position.
 * @param finder - Color finder used for nearest-neighbour palette lookups.
 * @returns Dithered RGBA pixel data as a new Uint8ClampedArray.
 */
function applyJarvisJudiceNinkeDithering(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  paletteColors: number[][],
  finder: Finder,
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(pixels)
  const errors = new Float32Array(width * height * 3)

  /**
   * Adds a fraction of the current pixel's error to a neighbour.
   * @param x
   * @param y
   * @param errR
   * @param errG
   * @param errB
   * @param weight
   */
  function diffuse(x: number, y: number, errR: number, errG: number, errB: number, weight: number) {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const idx = (y * width + x) * 3
    errors[idx] += (errR * weight) / 48
    errors[idx + 1] += (errG * weight) / 48
    errors[idx + 2] += (errB * weight) / 48
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIdx = (y * width + x) * 4
      const errIdx = (y * width + x) * 3

      const r = Math.max(0, Math.min(255, result[pixelIdx] + errors[errIdx]))
      const g = Math.max(0, Math.min(255, result[pixelIdx + 1] + errors[errIdx + 1]))
      const b = Math.max(0, Math.min(255, result[pixelIdx + 2] + errors[errIdx + 2]))
      const alpha = result[pixelIdx + 3]

      const colorIndex = finder.findNearestIndex(r, g, b, alpha)
      const [pr, pg, pb] = paletteColors[colorIndex]
      result[pixelIdx] = pr
      result[pixelIdx + 1] = pg
      result[pixelIdx + 2] = pb

      const errR = r - pr
      const errG = g - pg
      const errB = b - pb

      // Row +0: right neighbours.
      diffuse(x + 1, y, errR, errG, errB, 7)
      diffuse(x + 2, y, errR, errG, errB, 5)
      // Row +1.
      diffuse(x - 2, y + 1, errR, errG, errB, 3)
      diffuse(x - 1, y + 1, errR, errG, errB, 5)
      diffuse(x, y + 1, errR, errG, errB, 7)
      diffuse(x + 1, y + 1, errR, errG, errB, 5)
      diffuse(x + 2, y + 1, errR, errG, errB, 3)
      // Row +2.
      diffuse(x - 2, y + 2, errR, errG, errB, 1)
      diffuse(x - 1, y + 2, errR, errG, errB, 3)
      diffuse(x, y + 2, errR, errG, errB, 5)
      diffuse(x + 1, y + 2, errR, errG, errB, 3)
      diffuse(x + 2, y + 2, errR, errG, errB, 1)
    }
  }

  return result
}

/**
 * Dithers RGBA pixel data using the specified algorithm.
 * @param method - Which dithering algorithm to apply.
 * @param pixels - Source RGBA pixel data.
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @param paletteColors - RGB triples [r, g, b] indexed by palette position.
 * @param finder - Color finder for palette lookups.
 * @returns Dithered RGBA pixel data as a new Uint8ClampedArray.
 */
function ditherPixels(
  method: DitherMethod,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  paletteColors: number[][],
  finder: Finder,
): Uint8ClampedArray {
  switch (method) {
    case 'bayer':
      return applyBayerDithering(pixels, width, height, paletteColors, finder)
    case 'floyd-steinberg':
      return applyFloydSteinbergDithering(pixels, width, height, paletteColors, finder)
    case 'jarvis-judice-ninke':
      return applyJarvisJudiceNinkeDithering(pixels, width, height, paletteColors, finder)
  }
}

/**
 * Assembles multiple PNG frames into a GIF animation, automatically selecting
 * the dithering algorithm and palette size that maximise visual quality within
 * the given file-size limit.
 *
 * Search strategy:
 *  For each dithering method (Bayer, Floyd-Steinberg, Jarvis-Judice-Ninke):
 *    1. Build a global palette from all frames via median-cut quantisation.
 *    2. Dither every frame against that palette.
 *    3. Encode with modern-gif (pre-dithered pixels already match palette
 *       colours exactly, so findNearestIndex hits exact matches).
 *    4. Binary-search over maxColors (2–255) to find the highest palette size
 *       whose encoded file fits within the size limit.
 *  Pick the candidate with the highest maxColors; break ties by preferring
 *  the method listed last in DITHER_METHODS (Jarvis-Judice-Ninke).
 *  Bayer is included because it produces temporally stable patterns across
 *  frames (no flicker in static areas of the animation).
 *
 * Encoding runs on the main thread (no Web Worker) to avoid Figma sandbox CSP
 * restrictions.
 * @param framesData - PNG frame data as ArrayBuffers, sorted left-to-right.
 * @param width - Output GIF width in pixels.
 * @param height - Output GIF height in pixels.
 * @param delay - Frame delay in milliseconds.
 * @param limit - Maximum file size in bytes, or null for no limit.
 * @returns The best GIF Blob found.
 */
export async function assembleGif(
  framesData: ArrayBuffer[],
  width: number,
  height: number,
  delay: number,
  limit: number | null,
): Promise<Blob> {
  const canvases = await Promise.all(framesData.map((f) => pngBytesToCanvas(new Uint8Array(f))))

  // Extract original pixel data once; binary-search iterations re-read from here.
  const originalFramePixels: Uint8ClampedArray[] = canvases.map((canvas) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data
  })

  /**
   * Encodes all frames with the given palette size and dithering method.
   * Builds a fresh global palette on each call so iterations remain independent.
   * @param maxColors - Maximum palette colours (2–255); higher = better quality.
   * @param method - Dithering algorithm to apply.
   */
  async function renderGif(maxColors: number, method: DitherMethod): Promise<Blob> {
    // Build a global palette by sampling every frame's original pixel data.
    const palette = new Palette({ maxColors })
    originalFramePixels.forEach((pixels) => palette.addSample(pixels as unknown as BufferSource))
    const colors: QuantizedColor[] = await palette.generate()

    const paletteColors = colors.map((color) => [color.rgb.r, color.rgb.g, color.rgb.b])
    const finder = new Finder(colors)

    // Dither each frame and place it on a new canvas for modern-gif.
    // Because pixels are already snapped to palette colours, modern-gif's internal
    // findNearestIndex finds exact matches and preserves the dithering perfectly.
    const ditheredFrames = originalFramePixels.map((pixels) => {
      const dithered = ditherPixels(method, pixels, width, height, paletteColors, finder)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas
        .getContext('2d', { willReadFrequently: true })!
        .putImageData(new ImageData(dithered, width, height), 0, 0)
      return canvas
    })

    return encode({
      width,
      height,
      maxColors,
      frames: ditheredFrames.map((canvas) => ({ data: canvas, delay })),
      format: 'blob',
    })
  }

  // No limit: use maximum palette with the highest-quality dithering method.
  if (!limit) return renderGif(255, 'jarvis-judice-ninke')

  // With a size limit: run a binary search per dithering method and keep the
  // candidate that achieves the highest maxColors.  Ties are broken in favour
  // of the method listed later in DITHER_METHODS (Jarvis-Judice-Ninke wins).
  let bestBlob: Blob | null = null
  let bestMaxColors = 0

  for (const method of DITHER_METHODS) {
    let lo = 2,
      hi = 255,
      methodBestBlob: Blob | null = null,
      methodBestColors = 0

    for (let i = 0; i < config.GIF_SEARCH_ITERATIONS; i++) {
      const mid = Math.floor((lo + hi) / 2)
      const blob = await renderGif(mid, method)
      if (blob.size <= limit) {
        methodBestBlob = blob
        methodBestColors = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    // Accept this method if it achieves strictly more colours, or ties with the
    // current best (meaning a higher-quality method in DITHER_METHODS order wins).
    if (methodBestBlob && methodBestColors >= bestMaxColors) {
      bestBlob = methodBestBlob
      bestMaxColors = methodBestColors
    }
  }

  return bestBlob ?? renderGif(2, 'floyd-steinberg')
}
