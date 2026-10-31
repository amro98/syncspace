import type { ReactNode } from 'react'

/** Content of the centered auth card (the card frame itself comes from AuthLayout). */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6 p-6 sm:p-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </header>
      {children}
      {footer && <footer className="text-center text-sm text-muted-foreground">{footer}</footer>}
    </div>
  )
}

export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null
  return (
    <p id={id} className="text-xs text-danger">
      {message}
    </p>
  )
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
