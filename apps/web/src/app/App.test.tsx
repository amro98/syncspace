import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ids, mockApi, renderRoute, signedInRoutes, signedOutRoutes } from '@/test/render'

const workspacePath = `/app/workspaces/${ids.workspace}`

describe('App shell', () => {
  it('shows a loading state, never protected UI, while the session bootstraps', () => {
    mockApi(signedInRoutes())
    renderRoute(workspacePath)

    expect(screen.getByText('Loading SyncSpace')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
  })

  it('renders the workspace shell with switcher, navigation and live status', async () => {
    mockApi(signedInRoutes())
    renderRoute(workspacePath)

    expect(await screen.findByRole('heading', { name: 'Acme Inc.' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Switch workspace/ })).toBeInTheDocument()
    // The socket connects and the workspace room join is acknowledged.
    expect(await screen.findByText('Live')).toBeInTheDocument()
  })

  it('opens and closes the mobile navigation drawer', async () => {
    mockApi(signedInRoutes())
    const user = userEvent.setup()
    renderRoute(workspacePath)
    await screen.findByRole('heading', { name: 'Acme Inc.' })

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()
  })

  it('cycles and applies the theme preference', async () => {
    mockApi(signedOutRoutes)
    const user = userEvent.setup()
    renderRoute('/login')
    await screen.findByRole('heading', { name: 'Sign in to SyncSpace' })

    await user.click(screen.getByRole('button', { name: /Switch to light/ }))
    await user.click(screen.getByRole('button', { name: /Switch to dark/ }))

    expect(document.documentElement).toHaveClass('dark')
  })

  it('renders the not-found page for unknown routes', () => {
    mockApi(signedOutRoutes)
    renderRoute('/nope')

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
