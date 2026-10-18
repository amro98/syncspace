import '@/styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'

import { App } from '@/app/App'
import { routes } from '@/app/router/routes'
import { createQueryClient } from '@/lib/query-client'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

const router = createBrowserRouter(routes)
const queryClient = createQueryClient()

createRoot(rootElement).render(
  <StrictMode>
    <App router={router} queryClient={queryClient} />
  </StrictMode>,
)
