/**
 * Deterministic canvas stand-in for headless compression tests.
 *
 * `compression.ts` only touches the DOM through `document.createElement('canvas')`, the 2D context's
 * `putImageData` / `getImageData`, `ImageData` and `canvas.toBlob`. This module replaces exactly
 * those with a fake whose "encoded size" comes from a pluggable size model, so the search/selection
 * logic can be tested without a real image codec. Real encoding is out of scope here (level 2).
 */
import { vi } from 'vitest'

/** Computes the fake encoded size (bytes) for given pixels, MIME type and quality. */
export type SizeModel = (
  pixels: Uint8ClampedArray,
  mimeType: string,
  quality: number | undefined,
) => number

/** One `toBlob` invocation recorded by the fake. */
export interface EncodeCall {
  mimeType: string
  quality: number | undefined
  pixels: Uint8ClampedArray
  size: number
}

/** Fake `<canvas>` that stores RGBA pixels and "encodes" them via the size model. */
export class FakeCanvas {
  width = 0
  height = 0
  pixels = new Uint8ClampedArray(0)

  /**
   * @param sizeModel - Size model used by `toBlob`.
   * @param calls - Shared log every encode is appended to.
   */
  constructor(
    private readonly sizeModel: SizeModel,
    private readonly calls: EncodeCall[],
  ) {}

  /**
   * Returns a minimal 2D context bound to this canvas.
   * @returns Object with `putImageData`, `getImageData` and a no-op `drawImage`.
   */
  getContext(): {
    putImageData: (image: { data: Uint8ClampedArray }) => void
    getImageData: () => { data: Uint8ClampedArray }
    drawImage: () => void
  } {
    return {
      putImageData: (image) => {
        this.pixels = new Uint8ClampedArray(image.data)
      },
      getImageData: () => ({ data: new Uint8ClampedArray(this.pixels) }),
      drawImage: () => {},
    }
  }

  /**
   * Synchronously "encodes" the current pixels and hands back a Blob of the modelled size.
   * @param callback - Receives the Blob.
   * @param mimeType - Requested MIME type.
   * @param quality - Requested quality (undefined for PNG).
   */
  toBlob(callback: (blob: Blob) => void, mimeType: string, quality?: number): void {
    const size = this.sizeModel(this.pixels, mimeType, quality)
    this.calls.push({ mimeType, quality, pixels: this.pixels, size })
    callback(new Blob([new Uint8Array(size)], { type: mimeType }))
  }
}

/** Minimal `ImageData` replacement (Node has none). */
class FakeImageData {
  /**
   * @param data - RGBA pixels.
   * @param width - Width in px.
   * @param height - Height in px.
   */
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

/**
 * Installs the fake canvas globals (`document.createElement`, `ImageData`) for the current test.
 * Globals are restored automatically by Vitest's `unstubGlobals`.
 * @param sizeModel - How big each encode should be.
 * @returns The shared encode log and a factory for source canvases filled with given pixels.
 */
export function installFakeCanvas(sizeModel: SizeModel): {
  calls: EncodeCall[]
  createSourceCanvas: (
    width: number,
    height: number,
    pixels: Uint8ClampedArray,
  ) => HTMLCanvasElement
} {
  const calls: EncodeCall[] = []
  vi.stubGlobal('ImageData', FakeImageData)
  vi.stubGlobal('document', {
    createElement: (tagName: string) => {
      if (tagName !== 'canvas') throw new Error(`fake document cannot create <${tagName}>`)
      return new FakeCanvas(sizeModel, calls)
    },
  })
  return {
    calls,
    createSourceCanvas: (width, height, pixels) => {
      const canvas = new FakeCanvas(sizeModel, calls)
      canvas.width = width
      canvas.height = height
      canvas.pixels = new Uint8ClampedArray(pixels)
      return canvas as unknown as HTMLCanvasElement
    },
  }
}

/**
 * Counts distinct channel values (R, G, B — alpha ignored) — a cheap proxy for "image complexity"
 * that drops when pixels are quantised, which is what real encoders reward too.
 * @param pixels - RGBA pixels.
 * @returns Number of distinct 0–255 values seen across colour channels.
 */
export function distinctChannelValues(pixels: Uint8ClampedArray): number {
  const seen = new Set<number>()
  for (let index = 0; index < pixels.length; index++) {
    if (index % 4 !== 3) seen.add(pixels[index])
  }
  return seen.size
}

/**
 * Builds an RGBA horizontal grey gradient with a little deterministic noise, so dithering and
 * quantisation produce visibly different "complexity".
 * @param width - Width in px.
 * @param height - Height in px.
 * @returns RGBA pixel data.
 */
export function gradientPixels(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const offset = (row * width + column) * 4
      const base = Math.round((column / Math.max(1, width - 1)) * 255)
      // Deterministic +-3 jitter per pixel keeps the value count high before quantisation.
      const jitter = ((row * 31 + column * 17) % 7) - 3
      pixels[offset] = base + jitter
      pixels[offset + 1] = base
      pixels[offset + 2] = base - jitter
      pixels[offset + 3] = 255
    }
  }
  return pixels
}
