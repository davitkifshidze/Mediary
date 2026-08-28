import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Clapperboard, UserPlus } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LanguageDropdown } from '@/components/LanguageDropdown'
import { ThemeToggle } from '@/components/ThemeToggle'

/**
 * რეგისტრაცია (F4) — ღიაა, მაგრამ ანგარიში „ცარიელი" იქმნება:
 * მოდულებს მომხმარებელი ცალკე ითხოვს და ადმინი რთავს (იხ. /modules).
 */
export function RegisterPage() {
  const { t } = useTranslation()
  const { register } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    password: '',
    password_confirmation: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    try {
      await register({
        ...form,
        // `name` backend-ზე სავალდებულოა — სახელი+გვარი ან username
        name: [form.first_name, form.last_name].filter(Boolean).join(' ') || form.username,
      })
      navigate('/modules', { replace: true })
    } catch (err) {
      const fe = fieldErrors(err)
      setErrors(fe)
      if (!Object.keys(fe).length) setMessage(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md">
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
          <h1 className="mb-1 text-xl font-semibold tracking-tight">{t('auth.registerTitle')}</h1>
          <p className="mb-5 text-sm text-muted-foreground">{t('auth.registerSubtitle')}</p>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="first_name">{t('auth.firstName')}</Label>
                <Input id="first_name" autoFocus {...field('first_name')} />
                {errors.first_name && <p className="mt-1 text-xs text-destructive">{errors.first_name}</p>}
              </div>
              <div>
                <Label htmlFor="last_name">{t('auth.lastName')}</Label>
                <Input id="last_name" {...field('last_name')} />
                {errors.last_name && <p className="mt-1 text-xs text-destructive">{errors.last_name}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="username">{t('auth.username')}</Label>
              <Input id="username" autoComplete="username" {...field('username')} />
              {errors.username && <p className="mt-1 text-xs text-destructive">{errors.username}</p>}
            </div>

            <div>
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" autoComplete="email" {...field('email')} />
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Input id="password" type="password" autoComplete="new-password" {...field('password')} />
                {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
              </div>
              <div>
                <Label htmlFor="password_confirmation">{t('auth.passwordConfirm')}</Label>
                <Input
                  id="password_confirmation"
                  type="password"
                  autoComplete="new-password"
                  {...field('password_confirmation')}
                />
              </div>
            </div>

            {message && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {message}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              <UserPlus className="size-4" />
              {busy ? t('auth.registering') : t('auth.register')}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {t('auth.hasAccount')}{' '}
            <Link to="/login" className="text-primary hover:underline">
              {t('auth.login')}
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
