import { Eye, EyeOff } from 'lucide-react'
import { type ComponentProps, useState } from 'react'

import { Input } from '@/components/ui/input'

/**
 * Password input with a show/hide toggle. Keeps `name` and `autoComplete`
 * from the caller so password managers can save and fill it.
 */
export function PasswordInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-10" />
      <button
        type="button"
        onClick={() => {
          setVisible((value) => !value)
        }}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  )
}
