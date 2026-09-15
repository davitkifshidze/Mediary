import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Globe, Lock } from 'lucide-react'
import { updateProfile } from '@/api/account'
import { setModulePublic } from '@/api/publicProfile'
import { useAuth } from '@/lib/auth'
import { useModules, moduleName } from '@/lib/modules'
import { errorMessage } from '@/lib/errors'
import { VisibilityManager } from '@/components/VisibilityManager'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   „საჯარო პროფილი" — `/profile`-ის ბარათი (Tasks §16.1).

   ორივე ზედა ფენა ერთ ადგილასაა განზრახ: „ვინ მხედავს" და „რას ხედავს"
   ერთი გადაწყვეტილებაა და მოდულების გვერდზე გატანა მას გაფანტავდა.
   §6.1-ის შემდეგ **მესამე ფენაც აქვეა** (`VisibilityManager`) — ჩანაწერის
   გვერდიდან გადამრთველი მოხსნილია, რომ ერთი ფაქტი ორ ადგილას არ იმართებოდეს.

   ⚠️ ორივე გადამრთველი **მაშინვე ინახება** (და არა „შენახვა" ღილაკით):
   ხილვადობა უსაფრთხოების პარამეტრია და შეუნახავი მდგომარეობა აქ სახიფათო
   გაუგებრობაა — user-ს ეგონება, რომ დახურა, სინამდვილეში კი ღიაა.
   ============================================================ */

export function PublicProfileCard() {
  const { t, i18n } = useTranslation()
  const { user, setUser } = useAuth()
  const { enabled } = useModules()
  const { toast } = useToast()
  const qc = useQueryClient()

  const [busy, setBusy] = useState<string | null>(null)

  if (!user) return null

  const isPublic = user.profile_visibility === 'public'
  // მოდულები, რომელთა გასაჯაროებაც საერთოდ შეიძლება (`note` — არასდროს, 16.5)
  const shareable = enabled.filter((m) => m.shareable)

  const toggleProfile = async (next: boolean) => {
    setBusy('profile')
    try {
      const fd = new FormData()
      fd.append('profile_visibility', next ? 'public' : 'private')
      setUser(await updateProfile(fd))
      toast({
        title: next ? t('publicProfile.turnedOn') : t('publicProfile.turnedOff'),
        variant: 'success',
      })
    } catch (err) {
      toast({ title: errorMessage(err), variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const toggleModule = async (key: string, next: boolean) => {
    setBusy(key)
    try {
      await setModulePublic(key, next)
      // `is_public` `GET /modules`-იდან მოდის — სია უნდა გადმოიკითხოს
      await qc.invalidateQueries({ queryKey: ['modules'] })
    } catch (err) {
      toast({ title: errorMessage(err), variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
        {isPublic ? <Globe className="size-4 text-primary" /> : <Lock className="size-4" />}
        {t('publicProfile.title')}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('publicProfile.subtitle')}</p>

      {/* ---------- ფენა 1: თვითონ პროფილი ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{t('publicProfile.enable')}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('publicProfile.enableHint')}</p>
        </div>
        <Switch
          checked={isPublic}
          disabled={busy === 'profile'}
          onCheckedChange={toggleProfile}
          aria-label={t('publicProfile.enable')}
        />
      </div>

      {/* ბმული მხოლოდ მაშინ, როცა მართლა იხსნება */}
      {isPublic && user.username && (
        <div className="flex items-center justify-between gap-3 border-b border-border py-3.5">
          <div className="min-w-0 flex-1 text-sm font-medium">{t('publicProfile.link')}</div>
          <Link
            to={`/u/${user.username}`}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm text-primary hover:text-primary/70"
          >
            /u/{user.username}
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      )}

      {/* ---------- ფენა 2: მოდულები ---------- */}
      <div className="pt-4">
        <div className="text-sm font-medium">{t('publicProfile.modules')}</div>
        <p className="mt-0.5 mb-1 text-xs text-muted-foreground">
          {t('publicProfile.modulesHint')}
        </p>

        {shareable.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">{t('publicProfile.noShareable')}</p>
        ) : (
          shareable.map((m) => (
            <div
              key={m.key}
              className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {moduleName(m, i18n.language)}
              </span>
              <Switch
                checked={!!m.is_public}
                disabled={!isPublic || busy === m.key}
                onCheckedChange={(v) => toggleModule(m.key, v)}
                aria-label={moduleName(m, i18n.language)}
              />
            </div>
          ))
        )}
      </div>

      {/* ---------- ფენა 3: ჩანაწერები (§6.1) ----------
          ⚠️ ადრე აქ მხოლოდ მინიშნება იდო („გახსენი ჩანაწერი და იქ ნახავ
          გადამრთველს"). ახლა მესამე ფენაც აქვეა, ე.ი. ხილვადობა **ერთ
          ადგილას** იმართება და ჩანაწერის გვერდზე გადამრთველი აღარაა. */}
      <VisibilityManager />
    </section>
  )
}
