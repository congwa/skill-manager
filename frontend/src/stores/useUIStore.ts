import { create } from 'zustand'
import { isTauri, settingsApi } from '@/lib/tauri-api'

interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

interface UIStore {
  sidebarCollapsed: boolean
  activeModal: string | null
  toasts: Toast[]
  onboardingCompleted: boolean
  toggleSidebar: () => void
  openModal: (id: string) => void
  closeModal: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  completeOnboarding: () => void
  initOnboardingState: () => Promise<void>
}

export const useUIStore = create<UIStore>()((set) => ({
  sidebarCollapsed: false,
  activeModal: null,
  toasts: [],
  onboardingCompleted: true,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
  addToast: (toast) => {
    const id = Date.now().toString()
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  completeOnboarding: () => {
    if (isTauri()) {
      settingsApi.set('onboarding_completed', 'true').catch(console.error)
    }
    set({ onboardingCompleted: true })
  },
  initOnboardingState: async () => {
    try {
      if (isTauri()) {
        const val = await settingsApi.get('onboarding_completed')
        set({ onboardingCompleted: val === 'true' })
      }
    } catch (e) {
      console.error('initOnboardingState error:', e)
    }
  },
}))
