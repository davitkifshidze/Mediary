import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Clapperboard, Loader2, ShieldAlert } from 'lucide-react'
import { fetchResetTarget, submitReset, type ResetTarget } from '@/api/account'
import { errorMessage, fieldErrors, isApiCode } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/secret-input'
import { LanguageDropdown } from '@/components/LanguageDropdown'
import { ThemeToggle } from '@/components/ThemeToggle'

/**
 * **ადმინის ერთჯერადი აღდგენის ბმული (FEAT-16) — `/reset/:token`.**
 *
 * ⚠️ **`Protected`-ის გარეთაა განზრახ** (საჯარო პროფილის იგივე მიზეზი):
 * ბმულით შემოსული ადამიანი სწორედ იმიტომ მოვიდა, რომ ვერ შედის.
 *
 * ⚠️ **ვადაგასული ბმული ცალკე ეკრანია და არა ველის ქვეშ დაწერილი შეცდომა.**
 * ფორმის შევსებას აზრი არ აქვს, თუ ის მაინც 410-ს დააბრუნებს — და შემდეგი
 * ნაბიჯიც სხვაა: ადმინს ახალი უნდა სთხოვო.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation()
  const { token = '' } = useParams()
  const navigate = useNavigate()

  const [target, setTarget] = useState<ResetTarget | null>(null)
  const [expired, setExpired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ password: '', password_confirmation: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true

    fetchResetTarget(token)
      .then((r) => alive && setTarget(r))
      .catch(() => alive && setExpired(true))
      .finally(() => alive && setLoading(false))

    return () => {
      alive = false
    }
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    try {
      await submitReset(token, form.password, form.password_confirmation)
      setDone(true)
    } catch (err) {
      /* ⚠️ 410 შუა გზაზეც შეიძლება მოვიდეს: ბმულს ვადა სწორედ ფორმის
         შევსებისას გაუვიდა, ან ადმინმა ახალი გასცა. მაშინ ველების შეცდომა
         აზრს კარგავს — ეკრანი იცვლება. */
      if (isApiCode(err, 'reset_link_expired')) {
        setExpired(true)
        return
      }
      const fe = fieldErrors(err)
      setErrors(fe)
      if (!Object.keys(fe).length) setMessage(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
              <Clapperboard className="size-5" />
            </span>
            <span className="font-display text-2xl font-semibold leading-none tracking-tight">
              {t('app.title')}
            </span>
          </div>
          <ThemeToggle />
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          {loading ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">{t('reset.checking')}</p>
            </div>
          ) : expired ? (
            <>
              <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
                <ShieldAlert className="size-5 text-destructive" />
                {t('reset.expiredTitle')}
              </h1>
              <p className="mb-5 text-sm text-muted-foreground">{t('reset.expiredHint')}</p>
              <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
                {t('reset.toLogin')}
              </Button>
            </>
          ) : done ? (
            <>
              <h1 className="mb-1 text-xl font-semibold tracking-tight">{t('reset.title')}</h1>
              <p className="mb-5 text-sm text-muted-foreground">{t('reset.done')}</p>
              <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
                {t('reset.toLogin')}
              </Button>
            </>
          ) : (
            <>
              <h1 className="mb-1 text-xl font-semibold tracking-tight">{t('reset.title')}</h1>
              <p className="mb-5 text-sm text-muted-foreground">{t('reset.subtitle')}</p>

              <p className="mb-5 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t('reset.forAccount')}: </span>
                <span className="font-medium">{target?.display_name}</span>
              </p>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label htmlFor="reset-password">{t('profile.newPassword')}</Label>
                  <PasswordInput
                    id="reset-password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(value) => setForm((f) => ({ ...f, password: value }))}
                  />
                  {errors.password && (
                    <p className="mt-1 text-xs text-destructive">{errors.password}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="reset-confirm">{t('auth.passwordConfirm')}</Label>
                  <PasswordInput
                    id="reset-confirm"
                    autoComplete="new-password"
                    value={form.password_confirmation}
                    onChange={(value) =>
                      setForm((f) => ({ ...f, password_confirmation: value }))
                    }
                  />
                </div>

                {message && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {message}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {t('reset.submit')}
                </Button>
              </form>

              <p className="mt-5 text-center text-sm text-muted-foreground">
                <Link to="/login" className="text-primary hover:text-primary/70">
                  {t('reset.toLogin')}
                </Link>
              </p>
            </>
          )}
        </div>

        <div className="mt-5">
          <LanguageDropdown />
        </div>
      </div>
    </div>
  )
}
