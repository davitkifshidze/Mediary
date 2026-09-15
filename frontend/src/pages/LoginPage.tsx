import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Clapperboard, LogIn } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { fieldErrors, errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/secret-input'
import { Label } from '@/components/ui/label'
import { LanguageDropdown } from '@/components/LanguageDropdown'
import { ThemeToggle } from '@/components/ThemeToggle'

/** ავტორიზაციის გვერდი (F4) — email ან username + პაროლი */
export function LoginPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ login: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    try {
      await login({ login: form.login, password: form.password, remember: true })
      navigate(from, { replace: true })
    } catch (err) {
      const fe = fieldErrors(err)
      setErrors(fe)
      if (!Object.keys(fe).length) setMessage(errorMessage(err, t('auth.failed')))
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
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h1 className="mb-1 text-xl font-semibold tracking-tight">{t('auth.loginTitle')}</h1>
          <p className="mb-5 text-sm text-muted-foreground">{t('auth.loginSubtitle')}</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="login">{t('auth.loginField')}</Label>
              <Input
                id="login"
                autoFocus
                autoComplete="username"
                value={form.login}
                onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
              />
              {errors.login && <p className="mt-1 text-xs text-destructive">{errors.login}</p>}
            </div>

            <div>
              <Label htmlFor="password">{t('auth.password')}</Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
               
                value={form.password}
                onChange={(value) => setForm((f) => ({ ...f, password: value }))}
              />
              {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
            </div>

            {message && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {message}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              <LogIn className="size-4" />
              {busy ? t('auth.loggingIn') : t('auth.login')}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-primary hover:text-primary/70">
              {t('auth.register')}
            </Link>
          </p>
        </div>

        <div className="mt-5">
          <LanguageDropdown />
        </div>
      </div>
    </div>
  )
}
