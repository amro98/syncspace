import { PASSWORD_RULES } from '@syncspace/shared'
import { Check, Circle } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Live checklist driven by the same rules the API enforces. */
export function PasswordChecklist({ id, password }: { id: string; password: string }) {
  return (
    <ul id={id} className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password)
        return (
          <li
            key={rule.id}
            className={cn(
              'flex items-center gap-1.5',
              met ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {met ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Circle className="size-3" aria-hidden />
            )}
            <span>
              {rule.label}
              <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
