import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { jsonResponse, mockFetch, renderRoute } from '@/test/render'

const healthy = () =>
  Promise.resolve(jsonResponse({ status: 'ok', uptime: 1, timestamp: new Date().toISOString() }))

describe('App', () => {
  it('redirects / to the app shell', async () => {
    mockFetch(healthy)
    const { router } = renderRoute('/')

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/app')
  })

  it('renders the app shell landmarks and reaches the API through the client', async () => {
    const fetchMock = mockFetch(healthy)
    renderRoute('/app')

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(await screen.findByText('API online')).toBeInTheDocument()

    const [url] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://localhost:4000/health')
  })

  it('shows the API as offline when the health check fails', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    renderRoute('/app')

    expect(await screen.findByText('API offline')).toBeInTheDocument()
  })

  it('resolves nested workspace routes with their params', async () => {
    mockFetch(healthy)
    renderRoute('/app/workspaces/w1/channel/c1')

    const heading = await screen.findByRole('heading', { name: 'Channel' })
    const section = heading.closest('section')!
    expect(within(section).getByText('w1')).toBeInTheDocument()
    expect(within(section).getByText('c1')).toBeInTheDocument()
  })

  it('renders auth routes outside the app shell', () => {
    renderRoute('/login')

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
  })

  it('renders the not-found page for unknown routes', () => {
    renderRoute('/nope')

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('opens and closes the mobile navigation drawer', async () => {
    mockFetch(healthy)
    const user = userEvent.setup()
    renderRoute('/app')

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()
  })

  it('cycles and applies the theme preference', async () => {
    const user = userEvent.setup()
    renderRoute('/login')

    await user.click(screen.getByRole('button', { name: /Switch to light/ }))
    await user.click(screen.getByRole('button', { name: /Switch to dark/ }))

    expect(document.documentElement).toHaveClass('dark')
  })
})
