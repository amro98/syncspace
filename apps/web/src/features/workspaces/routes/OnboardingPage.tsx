import type { WorkspaceDetail } from '@syncspace/shared'
import { ArrowRight, MessagesSquare, SquareKanban, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { paths } from '@/app/router/paths'
import { Logo } from '@/components/shared/Logo'
import { FullPageSpinner } from '@/components/shared/Spinner'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/features/auth/components/UserMenu'
import { useSession } from '@/features/auth/hooks'
import { cn } from '@/lib/utils'
import { useWorkspacePrefsStore } from '@/stores/workspace-prefs-store'

import { CreateWorkspaceForm } from '../components/CreateWorkspaceForm'
import { InviteForm } from '../components/InviteForm'
import { useWorkspaces } from '../hooks'

type Step = 'welcome' | 'create' | 'invite'
const STEPS: { id: Step; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'create', label: 'Create workspace' },
  { id: 'invite', label: 'Invite teammates' },
]

function Steps({ current }: { current: Step }) {
  const index = STEPS.findIndex((step) => step.id === current)
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Onboarding progress">
      {STEPS.map((step, i) => (
        <li
          key={step.id}
          aria-current={i === index ? 'step' : undefined}
          className={cn(
            'flex items-center gap-2',
            i <= index ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full border text-[11px] font-medium',
              i <= index && 'border-primary bg-primary text-primary-foreground',
            )}
          >
            {i + 1}
          </span>
          <span className="max-sm:sr-only">{step.label}</span>
          {i < STEPS.length - 1 && <span aria-hidden className="h-px w-6 bg-border" />}
        </li>
      ))}
    </ol>
  )
}

/**
 * First-run flow (and "Create workspace" from the switcher):
 * Welcome -> Create workspace -> optionally invite teammates -> workspace.
 */
export function OnboardingPage() {
  const { data: user } = useSession()
  const workspaces = useWorkspaces()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setLastWorkspaceId = useWorkspacePrefsStore((state) => state.setLastWorkspaceId)

  const [stepOverride, setStep] = useState<Step | null>(null)
  const [created, setCreated] = useState<WorkspaceDetail | null>(null)

  if (workspaces.isPending) return <FullPageSpinner />

  const hasWorkspaces = workspaces.data !== undefined && workspaces.data.length > 0
  const step: Step =
    stepOverride ?? (searchParams.get('step') === 'create' || hasWorkspaces ? 'create' : 'welcome')
  const firstName = user?.name.split(' ')[0] ?? 'there'

  const finish = (workspace: WorkspaceDetail) => {
    void navigate(paths.workspace(workspace.id), { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="flex h-(--topbar-height) items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pt-[6vh] pb-12">
        <div className="flex w-full max-w-lg flex-col gap-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
          <Steps current={step} />

          {step === 'welcome' && (
            <section className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Welcome to SyncSpace, {firstName}
                </h1>
                <p className="text-muted-foreground">
                  Workspaces bring your team’s conversations and work together. Let’s set up your
                  first one.
                </p>
              </div>
              <ul className="flex flex-col gap-3 text-sm">
                <li className="flex gap-3">
                  <MessagesSquare className="mt-0.5 size-4 text-primary" aria-hidden />
                  Channels and direct messages, in real time
                </li>
                <li className="flex gap-3">
                  <SquareKanban className="mt-0.5 size-4 text-primary" aria-hidden />
                  Task boards with assignees, priorities and due dates
                </li>
                <li className="flex gap-3">
                  <Users className="mt-0.5 size-4 text-primary" aria-hidden />
                  Invite teammates as members or admins
                </li>
              </ul>
              <Button
                onClick={() => {
                  setStep('create')
                }}
              >
                Get started <ArrowRight aria-hidden />
              </Button>
            </section>
          )}

          {step === 'create' && (
            <section className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">Create a workspace</h1>
                <p className="text-muted-foreground">
                  Usually your company or team name. You’ll be its owner.
                </p>
              </div>
              <CreateWorkspaceForm
                onCreated={(workspace) => {
                  setLastWorkspaceId(workspace.id)
                  setCreated(workspace)
                  setStep('invite')
                }}
              />
              {hasWorkspaces && (
                <Link
                  to={paths.app()}
                  className="text-center text-sm text-muted-foreground hover:underline"
                >
                  Cancel
                </Link>
              )}
            </section>
          )}

          {step === 'invite' && created && user && (
            <section className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">Invite your teammates</h1>
                <p className="text-muted-foreground">
                  {created.name} is ready. Invite people now, or later from workspace settings.
                </p>
              </div>
              <InviteForm workspaceId={created.id} actor={{ userId: user.id, role: 'OWNER' }} />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="ghost"
                  onClick={() => {
                    finish(created)
                  }}
                >
                  Skip for now
                </Button>
                <Button
                  onClick={() => {
                    finish(created)
                  }}
                >
                  Go to {created.name} <ArrowRight aria-hidden />
                </Button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
