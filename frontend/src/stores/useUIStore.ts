import { create } from 'zustand'
import { settingsApi } from '@/lib/tauri-api'

interface UIStore {
  onboardingCompleted: boolean
  completeOnboarding: () => void
  initOnboardingState: () => Promise<void>
}

export const useUIStore = create<UIStore>()((set) => ({
  onboardingCompleted: true,
  completeOnboarding: () => {
    console.log('[UIStore] completeOnboarding')
    settingsApi.set('onboarding_completed', 'true').catch((e) => console.error('[UIStore] completeOnboarding 失败:', e))
    set({ onboardingCompleted: true })
  },
  initOnboardingState: async () => {
    console.log('[UIStore] initOnboardingState 开始')
    try {
      const val = await settingsApi.get('onboarding_completed')
      console.log(`[UIStore] initOnboardingState: onboarding_completed = ${val}`)
      set({ onboardingCompleted: val === 'true' })
    } catch (e) {
      console.error('[UIStore] initOnboardingState 失败:', e)
    }
  },
}))
