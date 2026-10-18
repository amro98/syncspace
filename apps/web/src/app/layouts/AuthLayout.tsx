import { Outlet } from 'react-router'

import { Logo } from '@/components/shared/Logo'
import { ThemeToggle } from '@/components/shared/ThemeToggle'

/** Centered, unauthenticated layout for sign-in / registration. */
export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="flex h-(--topbar-height) items-center justify-between px-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[10vh] pb-12">
        <div className="w-full max-w-sm rounded-xl border bg-card text-card-foreground shadow-sm">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
