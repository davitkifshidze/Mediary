import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Globe, Lock, SlidersHorizontal } from 'lucide-react'
import { updateProfile } from '@/api/account'
import { useAuth } from '@/lib/auth'
import { useModules } from '@/lib/modules'
import { errorMessage } from '@/lib/errors'
import { PublicModulesDialog } from '@/components/PublicModulesDialog'
import { VisibilityManager } from '@/components/VisibilityManager'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { ModalShell } from '@/components/ui/modal-shell'
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
  const { t } = useTranslation()
  const { user, setUser } = useAuth()
  const { enabled } = useModules()
  const { toast } = useToast()

  const [busy, setBusy] = useState<string | null>(null)
  /** რომელი ფანჯარაა ღია — `null` არცერთი (Tasks §7.2/§7.3) */
  const [open, setOpen] = useState<'modules' | 'records' | null>(null)

  if (!user) return null

  const isPublic = user.profile_visibility === 'public'
  // მოდულები, რომელთა გასაჯაროებაც საერთოდ შეიძლება (`note` — არასდროს, 16.5)
  const shareable = enabled.filter((m) => m.shareable)
  const publicModules = shareable.filter((m) => m.is_public).length

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

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
        {isPublic ? <Globe className="size-4 text-primary" /> : <Lock className="size-4" />}
        {t('publicProfile.title')}
        <InfoHint info={t('publicProfile.subtitle')} />
      </h2>

      {/* ---------- ფენა 1: თვითონ პროფილი ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            {t('publicProfile.enable')}
            <InfoHint info={t('publicProfile.enableHint')} />
          </div>
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

      {/* ---------- ფენა 2: მოდულები (Tasks §7.2) ----------
          ⚠️ ჩამრთველების სია **მოდალშია**: ბარათზე ის თერთმეტ რიგად იშლებოდა
          და მესამე ფენას ეკრანს ქვემოთ აგდებდა. აქ მხოლოდ შემაჯამებელი
          რიგი და ღილაკი რჩება. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            {t('publicProfile.modules')}
            <InfoHint info={t('publicProfile.modulesHint')} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {shareable.length === 0
              ? t('publicProfile.noShareable')
              : t('publicProfile.modulesCount', { count: publicModules, total: shareable.length })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen('modules')}>
          <SlidersHorizontal className="size-4" />
          {t('publicProfile.manage')}
        </Button>
      </div>

      {/* ---------- ფენა 3: ჩანაწერები (§6.1 → §7.3) ----------
          ⚠️ იგივე მიზეზი: მმართველს ძებნა, მასობრივი ზოლი და გვერდები აქვს,
          ე.ი. ბარათის შიგნით ის ცალკე გვერდად იკითხებოდა. */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            {t('visibility.manageTitle')}
            <InfoHint info={t('visibility.manageHint')} />
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen('records')}>
          <SlidersHorizontal className="size-4" />
          {t('publicProfile.manage')}
        </Button>
      </div>

      {/* ⚠️ ორივე ფანჯარა **ამ კომპონენტის ერთადერთ `return`-შია** — მდგომარეობა
          და პორტალის JSX ერთ ადგილას (`GroupsCut`-ის ცოცხალი ბაგის წესი). */}
      {open === 'modules' && (
        <PublicModulesDialog profilePublic={isPublic} onClose={() => setOpen(null)} />
      )}
      {open === 'records' && (
        <ModalShell title={t('visibility.manageTitle')} onClose={() => setOpen(null)} size="wide">
          <div className="mt-4">
            <VisibilityManager bare />
          </div>
        </ModalShell>
      )}
    </section>
  )
}
