declare module 'gif.js' {
  interface GIFOptions {
    workers?: number
    quality?: number
    width?: number
    height?: number
    workerScript?: string
    repeat?: number
  }

  interface AddFrameOptions {
    delay?: number
    copy?: boolean
  }

  class GIF {
    constructor(options: GIFOptions)
    addFrame(canvas: HTMLCanvasElement, options?: AddFrameOptions): void
    on(event: 'finished', cb: (blob: Blob) => void): void
    on(event: 'error', cb: (err: Error) => void): void
    render(): void
  }

  export = GIF
}
