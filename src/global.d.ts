import type { AppBridge } from '../shared/types'

declare global {
  interface Window {
    hcAgent: AppBridge
  }
}

export {}
