import { create } from 'zustand'

export interface Toast {
  id: number
  tone: 'error' | 'success' | 'info'
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (tone: Toast['tone'], message: string) => void
  dismiss: (id: number) => void
}

const MAX_VISIBLE = 3
let nextId = 1

/**
 * Transient feedback for actions whose result is not visible where the user
 * acted (e.g. a drag that was rolled back). Inline errors stay inline: forms,
 * the composer and panels report their own failures. Identical messages are
 * not stacked, so a burst of failures cannot flood the screen.
 */
export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (tone, message) => {
    set((state) => {
      if (state.toasts.some((toast) => toast.message === message)) return state
      const toast = { id: nextId++, tone, message }
      return { toasts: [...state.toasts, toast].slice(-MAX_VISIBLE) }
    })
  },
  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },
}))

export const toast = {
  error: (message: string) => {
    useToastStore.getState().push('error', message)
  },
  success: (message: string) => {
    useToastStore.getState().push('success', message)
  },
  info: (message: string) => {
    useToastStore.getState().push('info', message)
  },
}
