import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { updateGame, type Game, type GameGenre, type GameMode, type GamePlatform } from '@/api/games'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { errorMessage } from '@/lib/errors'
import { genreColor, MODE_META, PLATFORM_META, tileStyle, tintStyle } from '@/lib/gameMeta'
import { useContentLang } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { InfoHint } from '@/components/ui/info-hint'
import { useToast } from '@/components/ui/feedback'
import { ModuleIcon } from '@/components/ModuleIcon'

/* ============================================================
   **პლატფორმები · რეჟიმები · ჟანრები — ბარათებად და ჩიპებად** (Tasks §24.2).

   ⚠️ **ბარათი დეტალშია, ჩიპი — სიაში**: ორივე ერთი რუკიდან იკითხავს ფერსა
   და აიქონს (`lib/gameMeta.ts`, ჟანრზე — ლექსიკონის `color`/`icon`), ე.ი. სია და
   დეტალი ერთსა და იმავეს ხატავენ. რეჟიმები აქამდე **არსად არ ჩანდა** —
   არც დეტალში, არც სიაში.

   ⚠️ **„ჩემი პლატფორმა“ ბარათზე დაჭერით ინიშნება** (§6.9): სავსე ფონი + ✓,
   `PATCH /games/{id}` `my_platform`-ით; მეორედ დაჭერა ხსნის. ფორმიდან ეს ველი
   წინა პარტიაში მოიხსნა — დეტალი ერთადერთი ადგილია.
   ============================================================ */

export function MetaCard({
  icon,
  label,
  color,
  selected,
  onClick,
  title,
}: {
  icon: ReactNode
  label: string
  color: string | null
  /** სავსე ფონი + ✓ („ჩემი პლატფორმა“) */
  selected?: boolean
  onClick?: () => void
  title?: string
}) {
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      aria-pressed={onClick ? !!selected : undefined}
      data-testid="meta-card"
      className={cn(
        'flex items-center gap-2.5 rounded-md border p-2.5 text-left text-sm transition-colors',
        !color && 'border-border bg-secondary/40 text-foreground',
        onClick && 'cursor-pointer hover:brightness-95',
      )}
      style={tintStyle(color, selected)}
    >
      <span
        className={cn('grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4', !color && 'bg-muted text-muted-foreground')}
        style={selected ? { backgroundColor: 'rgb(255 255 255 / 0.2)', color: '#fff' } : tileStyle(color)}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {selected && <Check className="size-4 shrink-0" />}
    </Tag>
  )
}

export function MetaSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        {title}
        {hint && <InfoHint info={hint} />}
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </section>
  )
}

/** დეტალის სამი სექცია — პლატფორმები („ჩემი“ დაჭერით), რეჟიმები, ჟანრები */
export function GameMetaSections({ game }: { game: Game }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()

  const pick = useMutation({
    mutationFn: (platform: GamePlatform | null) => updateGame(game.id, { my_platform: platform }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['games'] }),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const genres = game.genres ?? []

  return (
    <div className="space-y-5" data-testid="game-meta">
      {game.platforms.length > 0 && (
        <MetaSection title={t('games.platformsTitle')} hint={t('games.myPlatformHint')}>
          {game.platforms.map((p) => {
            const look = PLATFORM_META[p]
            const Icon = look.icon
            const mine = p === game.my_platform
            return (
              <MetaCard
                key={p}
                icon={<Icon />}
                label={t(`games.platforms.${p}`)}
                color={look.color}
                selected={mine}
                title={t(mine ? 'games.myPlatformUnset' : 'games.myPlatformSet')}
                onClick={() => (pick.isPending ? undefined : pick.mutate(mine ? null : p))}
              />
            )
          })}
        </MetaSection>
      )}

      {game.modes.length > 0 && (
        <MetaSection title={t('games.modesTitle')}>
          {game.modes.map((m) => {
            const look = MODE_META[m]
            const Icon = look.icon
            return <MetaCard key={m} icon={<Icon />} label={t(`games.modes.${m}`)} color={look.color} />
          })}
        </MetaSection>
      )}

      {genres.length > 0 && (
        <MetaSection title={t('games.genresTitle')}>
          {genres.map((genre) => (
            <MetaCard
              key={genre.id}
              icon={<ModuleIcon name={genre.icon} />}
              label={dictionaryName(genre, lang)}
              color={genreColor(genre)}
            />
          ))}
        </MetaSection>
      )}
    </div>
  )
}

/* ---------- სიის პატარა ჩიპები — იგივე ფერებით ---------- */

function MetaChip({ icon, label, color, strong }: { icon: ReactNode; label: string; color: string | null; strong?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] [&_svg]:size-3',
        !color && 'border-transparent bg-secondary text-muted-foreground',
        strong && 'font-medium',
      )}
      style={tintStyle(color, strong)}
    >
      {icon}
      {label}
    </span>
  )
}

export function GenreChip({ genre }: { genre: GameGenre }) {
  const { i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  return <MetaChip icon={<ModuleIcon name={genre.icon} />} label={dictionaryName(genre, lang)} color={genreColor(genre)} />
}

export function PlatformChip({ platform, mine }: { platform: GamePlatform; mine?: boolean }) {
  const { t } = useTranslation()
  const Icon = PLATFORM_META[platform].icon
  return <MetaChip icon={<Icon />} label={t(`games.platforms.${platform}`)} color={PLATFORM_META[platform].color} strong={mine} />
}

export function ModeChip({ mode }: { mode: GameMode }) {
  const { t } = useTranslation()
  const Icon = MODE_META[mode].icon
  return <MetaChip icon={<Icon />} label={t(`games.modes.${mode}`)} color={MODE_META[mode].color} />
}
