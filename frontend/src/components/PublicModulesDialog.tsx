import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { updateModuleSettings, type ModuleInfo } from '@/api/account'
import { PUBLIC_BLOCK_DEFAULTS, PUBLIC_BLOCKS, PUBLIC_BLOCKS_SETTING, type PublicBlock } from '@/api/guestRecord'
import { setModulePublic } from '@/api/publicProfile'
import { SHARE_DOMAINS, type ShareDomainKey } from '@/api/shareLinks'
import { shareBlocks, shareMeta } from '@/lib/shareLinks'
import { MODULE_ACCENT_FALLBACK, modAccent, moduleName, useModules } from '@/lib/modules'
import { errorMessage } from '@/lib/errors'
import { ModuleIcon } from '@/components/ModuleIcon'
import { ModalShell } from '@/components/ui/modal-shell'
import { Switch } from '@/components/ui/switch'
import { Chip, ChipRow } from '@/components/ui/chip'
import { InfoHint } from '@/components/ui/info-hint'
import { useToast } from '@/components/ui/feedback'
import { EmptyState } from '@/components/ui/empty-state'

/* ============================================================
   **ფენა 2 — რომელი მოდული ჩანს საჯარო პროფილზე.**

   შენი სიტყვები: „რომელი მოდულები ჩანს — გვერდზე ღილაკი ჰქონდეს მარჯვნივ
   და მოდალი გამოდიოდეს".

   ⚠️ **წესი, რომელიც გადმოტანისას არ უნდა დაიკარგოს: სანამ თვითონ
   პროფილი პირადია, ეს გადამრთველები მკვდარია.** ბარათზე ის `disabled`-ით
   ჩანდა — მოდალში იგივე `disabled` ახსნის გარეშე „რატომ არ მუშაობს"-ად
   წაიკითხებოდა, ამიტომ ფანჯარა **ხმამაღლა ამბობს** მიზეზს.

   ⚠️ **ხატულა და ფერი მოდულისაა** (`modules.color` + `ModuleIcon`) — იგივე,
   რასაც საიდბარი და გვერდის სათაური ხატავს. ფერი inline `style`-ით მიდის
   (`modAccent()`): Tailwind hex-იდან კლასს **ვერ** ააგებს.

   ⚠️ **საჯარო მოდულს თავისი ბლოკები აქვს** — რა ჩანს ჩანაწერის შიდა გვერდზე
   (`/u/:username/:domain/:id`): გალერეა · მსახიობები · თრეილერი · ჩემი ქულა · სტატუსი.
   ინახება მოდულის პარამეტრებში (`public_blocks`), ყოველთვის **მთელი ნაკრები** —
   პარამეტრების შერწყმა ზედა დონისაა და ნაწილობრივი ობიექტი დანარჩენს წაშლიდა.
   ჩიპი მხოლოდ იმ ბლოკზე იხატება, რომელიც მოდულს საერთოდ აქვს.
   ============================================================ */

/** რომელი ბლოკი აქვს ამ მოდულს საერთოდ — `RecordPage::build()`-ის წესი */
function blocksOf(module: string): PublicBlock[] {
  const domain = SHARE_DOMAINS.find((d) => d !== 'playlist' && shareMeta(d).module === module) as ShareDomainKey | undefined

  if (!domain) return []

  const has = shareBlocks(domain)
  const meta = shareMeta(domain)

  return PUBLIC_BLOCKS.filter((block) =>
    block === 'rating' ? meta.personalRating : block === 'status' ? meta.status !== null : has[block],
  )
}

/** შენახული ბლოკები ნაგულისხმევზე დადებული */
function savedBlocks(module: ModuleInfo): Record<PublicBlock, boolean> {
  const saved = (module.user_settings?.[PUBLIC_BLOCKS_SETTING] ?? {}) as Partial<Record<PublicBlock, boolean>>

  return { ...PUBLIC_BLOCK_DEFAULTS, ...saved }
}

export function PublicModulesDialog({
  profilePublic,
  onClose,
}: {
  /** ფენა 1 — პროფილი თვითონ ღიაა თუ არა */
  profilePublic: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { enabled } = useModules()
  const { toast } = useToast()
  const qc = useQueryClient()

  const [busy, setBusy] = useState<string | null>(null)

  // მოდულები, რომელთა გასაჯაროებაც საერთოდ შეიძლება (`note` — არასდროს)
  const shareable = enabled.filter((m) => m.shareable)

  const toggle = async (key: string, next: boolean) => {
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

  const toggleBlock = async (module: ModuleInfo, block: PublicBlock) => {
    const current = savedBlocks(module)
    setBusy(module.key)
    try {
      await updateModuleSettings(module.key, { [PUBLIC_BLOCKS_SETTING]: { ...current, [block]: !current[block] } })
      await qc.invalidateQueries({ queryKey: ['modules'] })
    } catch (err) {
      toast({ title: errorMessage(err), variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <ModalShell title={t('publicProfile.modules')} onClose={onClose} hint={t('publicProfile.modulesHint')}>
      <div className="mt-4 space-y-3">

        {!profilePublic && (
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {t('publicProfile.profilePrivateNotice')}
          </p>
        )}

        {shareable.length === 0 ? (
          <EmptyState size="line" className="py-3" title={t('publicProfile.noShareable')} />
        ) : (
          <ul>
            {shareable.map((m) => (
              <li
                key={m.key}
                className="border-b border-border py-3 last:border-b-0"
                style={modAccent(m.color) ?? MODULE_ACCENT_FALLBACK}
                data-testid={`public-module-${m.key}`}
              >
               <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)]">
                    <ModuleIcon name={m.icon} className="size-4 text-[var(--mod)]" />
                  </span>
                  <span className="min-w-0 truncate text-sm">{moduleName(m, i18n.language)}</span>
                </span>
                <Switch
                  size="lg"
                  checked={!!m.is_public}
                  disabled={!profilePublic || busy === m.key}
                  onCheckedChange={(v) => toggle(m.key, v)}
                  aria-label={moduleName(m, i18n.language)}
                />
               </div>
                {/* ჩანაწერის შიდა გვერდის ბლოკები — მხოლოდ საჯარო მოდულზე */}
                {m.is_public && blocksOf(m.key).length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-10">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {t('publicProfile.blocks')}
                      <InfoHint info={t('publicProfile.blocksHint')} />
                    </span>
                    <ChipRow>
                      {blocksOf(m.key).map((block) => (
                        <Chip
                          key={block}
                          check
                          active={savedBlocks(m)[block]}
                          disabled={!profilePublic || busy === m.key}
                          onClick={() => toggleBlock(m, block)}
                        >
                          {t(`recordShare.blocks.${block}`)}
                        </Chip>
                      ))}
                    </ChipRow>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  )
}
