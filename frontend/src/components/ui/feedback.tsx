import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LAYER_ALERT } from '@/lib/layers'
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

// ---------- Alert (Tasks §13.1) ----------
/**
 * **ერთღილაკიანი გაფრთხილება** — sweetalert-ის ანალოგი ჩვენი ვიზუალით.
 * შენი სიტყვები: „ამოვარდეს სვალის მსგავსი პოპაპი და გითხრას, რომ მსგავსი
 * უკვე არსებობს". `useConfirm` ყოველთვის ორღილაკიანია („გაუქმება/დადასტურება")
 * და კითხვას სვამს; აქ კითხვა არ არის — მხოლოდ „გასაგებია".
 *
 * ⚠️ **popup-ზე მაღლა** (`LAYER_ALERT`): ის react-select-ის ღია მენიუდან
 * იძახება, რომელიც `z-[100]`-ზეა — `useConfirm`-ის `z-[91]` მის უკან დარჩებოდა.
 */
export interface AlertOptions {
  title: string
  description?: string
  variant?: 'info' | 'warning'
  okText?: string
}

type AlertState = AlertOptions & { resolve: () => void }

const AlertContext = React.createContext<(opts: AlertOptions) => Promise<void>>(() => Promise.resolve())

export function useAlert() {
  return React.useContext(AlertContext)
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
  const { t } = useTranslation()
  const [confirmState, setConfirmState] = React.useState<ConfirmState | null>(null)
  const [alertState, setAlertState] = React.useState<AlertState | null>(null)
  const pendingAlert = React.useRef<AlertState | null>(null)
  const [toasts, setToasts] = React.useState<ToastItem[]>([])

  /** გახსნილი კითხვა — `settle()` მას აქედან იღებს და არა state-ის ასლიდან */
  const pending = React.useRef<ConfirmState | null>(null)

  const confirm = React.useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        const state: ConfirmState = { ...opts, resolve }
        pending.current = state
        setConfirmState(state)
      }),
    [],
  )

  /**
   * ⚠️ **გვერდითი ეფექტი state-updater-ის გარეთაა** (Tasks DEBT-09).
   *
   * ადრე `resolve()` `setConfirmState((cur) => …)`-ის შიგნით იძახებოდა,
   * `main.tsx` კი `<StrictMode>`-შია — ე.ი. dev-ში updater **ორჯერ** გადის.
   * დღეს ეს უვნებელი იყო მხოლოდ იმიტომ, რომ promise-ის `resolve` მეორედ
   * არაფერს აკეთებს; ხვალ იქ მოხვედრილი `toast()` ან მუტაცია ორჯერ
   * შესრულდებოდა — და ზუსტად ის ბაგია, რომელსაც ვერავინ გაიმეორებს.
   *
   * ⚠️ **ref და არა `confirmState`-ის წაკითხვა**: `settle` ღილაკის
   * ჰენდლერშია, ე.ი. state-ის ასლს ხურავს; ref ყოველთვის უკანასკნელს
   * ინახავს და დამოკიდებულებებს არ ამძიმებს.
   */
  const settle = (value: boolean) => {
    const current = pending.current
    pending.current = null
    setConfirmState(null)
    current?.resolve(value)
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

  const alert = React.useCallback(
    (opts: AlertOptions) =>
      new Promise<void>((resolve) => {
        const state: AlertState = { ...opts, resolve }
        pendingAlert.current = state
        setAlertState(state)
      }),
    [],
  )

  // იგივე წესი, რაც `settle()`-ს: გვერდითი ეფექტი state-updater-ის გარეთ, ref-იდან
  const closeAlert = () => {
    const current = pendingAlert.current
    pendingAlert.current = null
    setAlertState(null)
    current?.resolve()
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      <ToastContext.Provider value={toastApi}>
        <AlertContext.Provider value={alert}>{children}</AlertContext.Provider>

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
                      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
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
                  {/* ⚠️ BUG-01 — ნაგულისხმევი ტექსტი **ენის** და არა ქართულ literal-ის:
                      49 `confirm({`-იდან უმეტესობა `cancelText`-ს არ აწვდის, ე.ი.
                      ინგლისურ UI-ში თითქმის ყველა წაშლის დიალოგს „გაუქმება" ეწერა */}
                  <div className="mt-6 flex justify-end gap-2">
                    <Button variant="outline" onClick={() => settle(false)}>
                      {confirmState.cancelText ?? t('confirm.cancel')}
                    </Button>
                    <Button
                      variant={confirmState.variant === 'destructive' ? 'destructive' : 'default'}
                      onClick={() => settle(true)}
                      autoFocus
                    >
                      {confirmState.confirmText ?? t('confirm.confirm')}
                    </Button>
                  </div>
                </>
              )}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        {/* Tasks §13.1 — ერთღილაკიანი გაფრთხილება; popup-ზე მაღლა (`LAYER_ALERT`) */}
        <DialogPrimitive.Root
          open={!!alertState}
          onOpenChange={(open) => {
            if (!open) closeAlert()
          }}
        >
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className={cn('fb-overlay fixed inset-0 bg-black/50 backdrop-blur-sm', LAYER_ALERT)} />
            <DialogPrimitive.Content
              className={cn(
                'fb-content fixed left-1/2 top-1/2 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-6 shadow-xl focus:outline-none',
                LAYER_ALERT,
              )}
              onEscapeKeyDown={closeAlert}
              data-testid="alert-dialog"
            >
              {alertState && (
                <>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-muted">
                      {alertState.variant === 'warning' ? (
                        <AlertTriangle className="size-5 text-[var(--icon-warn)]" />
                      ) : (
                        <Info className="size-5 text-status-watching" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <DialogPrimitive.Title className="font-display text-lg font-semibold tracking-tight">
                        {alertState.title}
                      </DialogPrimitive.Title>
                      {alertState.description && (
                        <DialogPrimitive.Description className="mt-1.5 text-sm text-muted-foreground">
                          {alertState.description}
                        </DialogPrimitive.Description>
                      )}
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end">
                    <Button onClick={closeAlert} autoFocus>
                      {alertState.okText ?? t('alert.ok')}
                    </Button>
                  </div>
                </>
              )}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        {/* Toasts — ⚠️ `--player-w` (Tasks §35): გვერდითა დამკვრელი მარჯვენა
            კიდეზე დგას და შეტყობინება მას არ უნდა ფარავდეს; პანელის გარეშე
            ცვლადი არ არის და `right-4` რჩება. */}
        <div className="pointer-events-none fixed top-4 right-[calc(1rem+var(--player-w,0px))] z-[70] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
          {/* ⚠️ **`dismiss` პირდაპირ და არა `() => dismiss(t.id)`** (Tasks BUG-10):
              ისრიანი ფუნქცია პროვაიდერის **ყოველ** რენდერზე ახალია, ე.ი.
              `ToastCard`-ის ეფექტი ტაიმერს თავიდან აწყობდა ყოველ ახალ toast-ზე,
              ყოველ დახურვაზე და confirm-ის გახსნაზეც. `dismiss` კი
              `useCallback([])`-ია — ე.ი. სტაბილური, და ტაიმერი თითოზე ერთხელ იწერება. */}
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
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

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const { id, duration } = toast

  /* ⚠️ სამივე დამოკიდებულება **უცვლელია ამ ბარათის სიცოცხლეში**: `id` და
     `duration` toast-ის საკუთარი მნიშვნელობებია, `onDismiss` კი სტაბილური
     `useCallback`. ე.ი. ტაიმერი ერთხელ ეშვება — და სწორედ ეს იყო გატეხილი:
     დამოკიდებულება ყოველ რენდერზე იცვლებოდა, ტაიმერი თავიდან იწყებოდა და
     რიგის გაშვებისას ადრეული toast-ები ვადას ვერ აღწევდნენ. ⚠️ ქვედა
     ზოლის CSS-ანიმაცია პირიქით **არ** იწყებოდა თავიდან, ე.ი. ზოლი
     სრულდებოდა და ბარათი რჩებოდა — თვალსაჩინო შეუსაბამობა. */
  React.useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), duration)

    return () => clearTimeout(timer)
  }, [id, duration, onDismiss])

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
          onClick={() => onDismiss(id)}
          aria-label="dismiss"
          className="-mr-1 -mt-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground"
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
