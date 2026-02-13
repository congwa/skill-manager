import { create } from 'zustand'

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
  completeOnboarding: () => set({ onboardingCompleted: true }),
}))
