/// <reference types="vite/client" />

import type { WatermarkApi } from '../shared/api'

declare global {
  interface Window {
    watermarkApi: WatermarkApi
  }
}

export {}
