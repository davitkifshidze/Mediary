import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ============================================================
   Feedback — ერთიანი confirm დიალოგი + toast სისტემა
   useConfirm() → Promise<boolean>;  useToast() → { toast, dismiss }
   ============================================================ */

// ---------- Confirm ----------
export interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
}

type ConfirmState = ConfirmOptions & { resolve: (v: boolean) => void }

const ConfirmContext = React.createContext<(opts: ConfirmOptions) => Promise<boolean>>(
  () => Promise.resolve(false),
)

export function useConfirm() {
  return React.useContext(ConfirmContext)
}

// ---------- Toast ----------
export type ToastVariant = 'info' | 'success' | 'error'

export interface ToastOptions {
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

interface ToastItem extends Required<Omit<ToastOptions, 'description'>> {
  id: number
  description?: string
}

interface ToastApi {
  toast: (opts: ToastOptions) => number
  dismiss: (id: number) => void
}

const ToastContext = React.createContext<ToastApi>({ toast: () => 0, dismiss: () => {} })

export function useToast() {
  return React.useContext(ToastContext)
}

// ---------- Provider ----------
let nextToastId = 1

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = React.useState<ConfirmState | null>(null)
  const [toasts, setToasts] = React.useState<ToastItem[]>([])

  const confirm = React.useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ ...opts, resolve })
      }),
    [],
  )

  const settle = (value: boolean) => {
    setConfirmState((cur) => {
      cur?.resolve(value)
      return null
    })
  }

  const dismiss = React.useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback((opts: ToastOptions) => {
    const id = nextToastId++
    const item: ToastItem = {
      id,
      title: opts.title,
      description: opts.description,
      variant: opts.variant ?? 'info',
      duration: opts.duration ?? 4000,
    }
    setToasts((cur) => [...cur, item])
    return id
  }, [])

  const toastApi = React.useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ConfirmContext.Provider value={confirm}>
      <ToastContext.Provider value={toastApi}>
        {children}

        {/* Confirm dialog */}
        <DialogPrimitive.Root
          open={!!confirmState}
          onOpenChange={(open) => {
            if (!open) settle(false)
          }}
        >
          <DialogPrimitive.Portal>
            {/* z-index სხვა დიალოგებზე (z-60/61) და queue-ს ტოსტზე (z-70) მაღლა —
                დადასტურება მოდალის შიგნიდანაც იძახება (მაგ. ჟანრის ჩანაწერების მართვა) */}
            <DialogPrimitive.Overlay className="fb-overlay fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm" />
            <DialogPrimitive.Content
              className="fb-content fixed left-1/2 top-1/2 z-[91] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-6 shadow-xl focus:outline-none"
              onEscapeKeyDown={() => settle(false)}
            >
              {confirmState && (
                <>
                  <div className="flex items-start gap-3">
                    {confirmState.variant === 'destructive' && (
                      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
                        <AlertTriangle className="size-5" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <DialogPrimitive.Title className="font-display text-lg font-semibold tracking-tight">
                        {confirmState.title}
                      </DialogPrimitive.Title>
                      {confirmState.description && (
                        <DialogPrimitive.Description className="mt-1.5 text-sm text-muted-foreground">
                          {confirmState.description}
                        </DialogPrimitive.Description>
                      )}
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <Button variant="outline" onClick={() => settle(false)}>
                      {confirmState.cancelText ?? 'გაუქმება'}
                    </Button>
                    <Button
                      variant={confirmState.variant === 'destructive' ? 'destructive' : 'default'}
                      onClick={() => settle(true)}
                      autoFocus
                    >
                      {confirmState.confirmText ?? 'დადასტურება'}
                    </Button>
                  </div>
                </>
              )}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        {/* Toasts */}
        <div className="pointer-events-none fixed top-4 right-4 z-[70] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>
      </ToastContext.Provider>
    </ConfirmContext.Provider>
  )
}

const TOAST_STYLES: Record<ToastVariant, { bar: string; icon: React.ReactNode }> = {
  info: { bar: 'bg-status-watching', icon: <Info className="size-5 text-status-watching" /> },
  success: { bar: 'bg-status-watched', icon: <CheckCircle2 className="size-5 text-status-watched" /> },
  error: { bar: 'bg-destructive', icon: <XCircle className="size-5 text-destructive" /> },
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  React.useEffect(() => {
    const id = setTimeout(onDismiss, toast.duration)
    return () => clearTimeout(id)
  }, [toast.duration, onDismiss])

  const s = TOAST_STYLES[toast.variant]

  return (
    <div className="fb-toast pointer-events-auto overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 shrink-0">{s.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{toast.title}</p>
          {toast.description && (
            <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{toast.description}</p>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="dismiss"
          className="-mr-1 -mt-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="h-1 w-full bg-border/40">
        <div
          className={cn('h-full', s.bar)}
          style={{ animation: `toast-timer ${toast.duration}ms linear forwards` }}
        />
      </div>
    </div>
  )
}
