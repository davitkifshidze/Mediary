import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './i18n'
import App from './App.tsx'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import { QueueProvider } from '@/components/ui/queue'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>
        <QueueProvider>
          <TooltipProvider delayDuration={0}>
            <App />
          </TooltipProvider>
        </QueueProvider>
      </FeedbackProvider>
    </QueryClientProvider>
  </StrictMode>,
)
