import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { i18nReady } from './i18n'
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
const app = (
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
  </StrictMode>
)

/* ⚠️ **მაუნთი ლოკალის ჩატვირთვას ელოდება (Tasks PERF-08).** ბუნდლში მხოლოდ
   ქართულია, ინგლისური კი ცალკე chunk-ია — ლოდინის გარეშე ინგლისურენოვანი
   პირველ კადრში **გასაღებებს** დაინახავდა. ქართულზე ლოდინი არაფერს უდრის
   (ბუნდლი უკვე აქაა), ე.ი. ფასი მხოლოდ მეორე ენას აქვს.

   ⚠️ ჩავარდნაზეც ვხატავთ: ლოკალის fetch-ის ჩავარდნა თარგმანს ართმევს,
   მაგრამ თეთრი ეკრანი უარესი პასუხია. */
void i18nReady.finally(() => {
  createRoot(document.getElementById('root')!).render(app)
})
