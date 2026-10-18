import type { ValoApi } from '@shared/types'

declare global {
  interface Window {
    api: ValoApi
  }
}
