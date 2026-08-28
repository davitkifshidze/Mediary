import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './i18n'
import App from './App.tsx'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import { QueueProvider } from '@/components/ui/queue'
import { AuthProvider } from '@/lib/auth'
import { SettingsProvider } from '@/lib/settings'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

// AuthProvider ყველაზე გარეთაა — პარამეტრები per-user იტვირთება (I7/E1)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettingsProvider>
          <FeedbackProvider>
            <QueueProvider>
              <TooltipProvider delayDuration={0}>
                <App />
              </TooltipProvider>
            </QueueProvider>
          </FeedbackProvider>
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
