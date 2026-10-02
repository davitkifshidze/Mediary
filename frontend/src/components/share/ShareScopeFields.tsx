import { useTranslation } from 'react-i18next'
import { Globe2 } from 'lucide-react'
import type { Genre } from '@/api/types'
import type { ShareDomainKey, ShareDomainSpec, ShareScopeMode } from '@/api/shareLinks'
import { emptyMediaIds } from '@/lib/media'
import { statusName, useStatuses } from '@/lib/statuses'
import { useContentLang } from '@/lib/settings'
import { RadioGroup } from '@/components/ui/radio-group'
import { ScopeRow } from '@/components/ui/scope-row'
import { Chip, ChipRow } from '@/components/ui/chip'
import { Checkbox } from '@/components/ui/checkbox'
import { GenreSelect } from '@/components/GenreSelect'
import { MediaRecordPicker } from '@/components/MediaRecordPicker'
import { ModuleIcon } from '@/components/ModuleIcon'
import { MODULE_ACCENT_FALLBACK, modAccent, moduleName } from '@/lib/modules'
import type { ModuleInfo } from '@/api/account'

/* ============================================================
   **ერთი სექციის ფარგლები** გაზიარების ბმულის ფანჯარაში (Tasks §40.3).

   ⚠️ **რეჟიმები ერთმანეთს გამორიცხავს** — შენი ჩამონათვალი „ან"-ებითაა
   (ყველა · სტატუსი · რჩეულები · ჟანრი · კონკრეტული), და `RadioGroup` +
   `ScopeRow` სწორედ ამ სემანტიკას აქვს: თითო ვარიანტი თავის ქვე-ფორმას შლის.
   „მხოლოდ საჯაროები" კი **ცალკე ჩამრთველია**, რომელიც ნებისმიერ რეჟიმს
   ავიწროებს („ჩემი საჯარო საშინელებათა ფილმები" ერთი არჩევანია და არა ორი).
   ============================================================ */

export function ShareScopeFields({
  domain,
  module,
  spec,
  genres,
  count,
  onChange,
}: {
  domain: ShareDomainKey
  module: ModuleInfo | undefined
  spec: ShareDomainSpec
  genres: Genre[]
  /** ცოცხალი რიცხვი — `GET /share-links/preview` */
  count?: { total: number; private: number }
  onChange: (next: ShareDomainSpec) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const statuses = useStatuses(domain).data ?? []

  const patch = (next: Partial<ShareDomainSpec>) => onChange({ ...spec, ...next })

  const toggleStatus = (key: string) => {
    const current = spec.statuses ?? []
    patch({ statuses: current.includes(key) ? current.filter((k) => k !== key) : [...current, key] })
  }

  return (
    <div className="rounded-lg border border-border p-3" style={modAccent(module?.color) ?? MODULE_ACCENT_FALLBACK}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid size-7 place-items-center rounded-md bg-[var(--mod-soft)]">
          <ModuleIcon name={module?.icon ?? 'Film'} className="size-4 text-[var(--mod)]" />
        </span>
        <span className="font-medium">{module ? moduleName(module, i18n.language) : domain}</span>
        {count && (
          <span className="text-xs text-muted-foreground">
            {t('share.domainCount', { count: count.total })}
            {count.private > 0 && ` · ${t('share.domainPrivate', { count: count.private })}`}
          </span>
        )}
      </div>

      <RadioGroup
        value={spec.scope}
        onValueChange={(v) => patch({ scope: v as ShareScopeMode })}
        className="gap-2"
      >
        <ScopeRow value="all" active={spec.scope} label={t('share.scope.all')} />

        <ScopeRow value="status" active={spec.scope} label={t('share.scope.status')}>
          <ChipRow>
            {statuses.map((s) => (
              <Chip key={s.key} active={(spec.statuses ?? []).includes(s.key)} onClick={() => toggleStatus(s.key)}>
                {statusName(s, lang)}
              </Chip>
            ))}
          </ChipRow>
        </ScopeRow>

        <ScopeRow value="favorite" active={spec.scope} label={t('share.scope.favorite')} />

        <ScopeRow value="genre" active={spec.scope} label={t('share.scope.genre')}>
          <GenreSelect genres={genres} value={spec.genres ?? []} onChange={(next) => patch({ genres: next })} />
          {/* ⚠️ „ყველა ერთდროულად" სამ ჟანრზე ხშირად ცარიელ სიას იძლევა */}
          <ChipRow className="mt-2">
            {(['any', 'all'] as const).map((mode) => (
              <Chip
                key={mode}
                active={(spec.genre_mode ?? 'any') === mode}
                onClick={() => patch({ genre_mode: mode })}
              >
                {t(`gallery.genreMode.${mode}`)}
              </Chip>
            ))}
          </ChipRow>
        </ScopeRow>

        <ScopeRow value="ids" active={spec.scope} label={t('share.scope.ids')}>
          <MediaRecordPicker
            types={[domain]}
            ids={{ ...emptyMediaIds(), [domain]: spec.ids ?? [] }}
            onChange={(_, next) => patch({ ids: next })}
            enabled={spec.scope === 'ids'}
          />
        </ScopeRow>
      </RadioGroup>

      <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm">
        <Checkbox
          checked={!!spec.public_only}
          onCheckedChange={(v) => patch({ public_only: v === true })}
          className="mt-0.5"
        />
        <span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Globe2 className="size-3.5" />
            {t('share.publicOnly')}
          </span>
          <span className="block text-xs text-muted-foreground">{t('share.publicOnlyHint')}</span>
        </span>
      </label>
    </div>
  )
}
