import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import type { MovieListItem } from '@/api/types'
import { movieTitle } from '@/lib/display'
import { mediaLockBase } from '@/lib/locks'
import type { MediaType } from '@/lib/media'
import { useContentLang } from '@/lib/settings'
import { RecordUnlockDialog } from '@/components/locks/RecordLock'
import { RecordView } from '@/components/RecordView'

/* ============================================================
   **დამალული ფილმის/სერიალის/ანიმეს ბარათი (Tasks §35.5, Q9).**

   ჩანს მხოლოდ ფილტრში „ჩაკეტილები": სათაური და ბოქლომი — სერვერი პოსტერს,
   აღწერას, სტატუსს და დანარჩენს საერთოდ არ აგზავნის (`lockedCard()`).
   დაჭერა გახსნის ფანჯარას ხსნის; გახსნის შემდეგ სია ჩვეულებრივ ბარათს ხატავს.
   ============================================================ */

export function MediaLockedCard({ movie, type }: { movie: MovieListItem; type: MediaType }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const [unlocking, setUnlocking] = useState(false)
  const title = movieTitle(movie, lang)

  return (
    <>
      <button type="button" onClick={() => setUnlocking(true)} className="group block w-full cursor-pointer text-left" data-testid="media-locked-card">
        <div className="grid aspect-[2/3] place-items-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border transition group-hover:ring-foreground/30">
          <span className="flex flex-col items-center gap-2 text-xs">
            <Lock className="size-8" />
            {t('lock.badgeLocked')}
          </span>
        </div>
        <h3 className="mt-2.5 font-display text-[15px] font-medium leading-snug">{title}</h3>
      </button>
      {unlocking && <UnlockDialog movie={movie} type={type} title={title} onClose={() => setUnlocking(false)} />}
    </>
  )
}

/** Tasks §45 — იგივე სტრიქონების ხედში: ბოქლომი ფოტოს ადგილას, სათაური, „ჩაკეტილი"; ზოლი და მენიუ არ აქვს */
export function MediaLockedRow({ movie, type }: { movie: MovieListItem; type: MediaType }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const [unlocking, setUnlocking] = useState(false)
  const title = movieTitle(movie, lang)

  return (
    <>
      <RecordView
        title={title}
        onOpen={() => setUnlocking(true)}
        openLabel={t('lock.badgeLocked')}
        shape="poster"
        placeholder={<Lock className="size-5" />}
        meta={<span>{t('lock.badgeLocked')}</span>}
        actions={[]}
        bar={null}
        testId="media-locked-row"
      />
      {unlocking && <UnlockDialog movie={movie} type={type} title={title} onClose={() => setUnlocking(false)} />}
    </>
  )
}

function UnlockDialog({ movie, type, title, onClose }: { movie: MovieListItem; type: MediaType; title: string; onClose: () => void }) {
  const qc = useQueryClient()

  return (
    <RecordUnlockDialog
      base={mediaLockBase(type, movie.id)}
      record={{
        id: movie.id,
        name: title,
        locked: true,
        unlocked: false,
        lock_hint: movie.lock_hint ?? null,
        unlock_blocked_until: movie.unlock_blocked_until ?? null,
      }}
      onChanged={() => qc.invalidateQueries({ queryKey: [type] })}
      onClose={onClose}
    />
  )
}
