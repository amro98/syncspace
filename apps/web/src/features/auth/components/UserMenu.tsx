import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router'

import { paths } from '@/app/router/paths'
import { Avatar } from '@/components/shared/Avatar'
import { Popover } from '@/components/shared/Popover'

import { useLogout, useSession } from '../hooks'

export function UserMenu() {
  const { data: user } = useSession()
  const logout = useLogout()
  const navigate = useNavigate()
  if (!user) return null

  return (
    <Popover
      label={`Account menu for ${user.name}`}
      align="end"
      triggerClassName="rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      trigger={<Avatar name={user.name} src={user.avatarUrl} />}
    >
      <div className="flex items-center gap-3 px-2 py-2">
        <Avatar name={user.name} src={user.avatarUrl} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        disabled={logout.isPending}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
        onClick={() => {
          logout.mutate(undefined, {
            onSettled: () => void navigate(paths.login(), { replace: true }),
          })
        }}
      >
        <LogOut className="size-4" aria-hidden />
        Sign out
      </button>
    </Popover>
  )
}
