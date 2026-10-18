import { Link } from 'react-router'

import { buttonVariants } from '@/components/ui/button'

import { paths } from './paths'

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-muted-foreground">
        The page you are looking for does not exist or has moved.
      </p>
      <Link to={paths.app()} className={buttonVariants({ variant: 'outline' })}>
        Back to SyncSpace
      </Link>
    </main>
  )
}
