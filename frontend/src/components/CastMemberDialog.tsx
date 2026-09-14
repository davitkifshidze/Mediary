import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Loader2, Search, UserPlus, UserRound } from 'lucide-react'
import {
  attachCastMember,
  searchCastMembers,
  type AttachCastInput,
  type CastCandidate,
} from '@/api/cast'
import { errorMessage } from '@/lib/errors'
import type { MediaType } from '@/lib/media'
import { Button } from '@/components/ui/button'
import { Chip, ChipRow } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { StepSection } from '@/components/ui/step-section'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   მსახიობის დამატება ჩანაწერზე (ეტაპი 1, 2026-09-13).

   შენი მოთხოვნა: „ფილმზე რამდენიმე მსახიობია შიდა სიაში, მაგრამ არა
   ყველა — უნდა შეგეძლოს დაამატო".

   ⚠️ **სამი გზა, ერთი დიალოგი.** ბიბლიოთეკაში უკვე ნაცნობი ადამიანი ·
   TMDB-ის ძებნა · სრულიად ხელით შეყვანა. სამი ცალკე ფორმა ერთსა და იმავე
   კითხვას („ვინ?") სამჯერ დასვამდა.

   ⚠️ **ხელით შეყვანა არ არის „უკიდურესი ზომა" — ის ქართული ჩანაწერის
   ნორმალური გზაა**: TMDB-ის `/search/person` მხოლოდ ლათინურს პასუხობს,
   ე.ი. „ნინო ქასრაძე" იქ 0 შედეგია. ამიტომ ველები ყოველთვის ხელმისაწვდომია
   და არა „ვერაფერი მოიძებნა"-ს შემდეგ დამალული.

   ⚠️ **ძებნა მხოლოდ ცხად დაჭერაზე** — აკრეფისას არა. ლექსიკონის ნაწილი
   უფასოა, TMDB-ისა კი გარე გამოძახებაა და ყოველ ასოზე გაშვება მას
   ტყუილად დახარჯავდა (იგივე წესი, რაც ვებძებნის დიალოგს აქვს).
   ============================================================ */

export function CastMemberDialog({
  type,
  recordId,
  onClose,
  onAdded,
}: {
  type: MediaType
  recordId: number
  onClose: () => void
  onAdded?: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()

  const [query, setQuery] = useState('')
  const [items, setItems] = useState<CastCandidate[]>([])
  const [tmdbOk, setTmdbOk] = useState<boolean | null | undefined>(undefined)
  const [searched, setSearched] = useState(false)

  /** არჩეული კანდიდატი (ან `manual`, როცა ხელით ივსება) */
  const [picked, setPicked] = useState<CastCandidate | null>(null)
  const [manual, setManual] = useState(false)
  const [nameEn, setNameEn] = useState('')
  const [nameKa, setNameKa] = useState('')
  const [gender, setGender] = useState<number>(0)
  const [character, setCharacter] = useState('')

  const search = useMutation({
    mutationFn: () => searchCastMembers(query.trim(), { type, id: recordId }),
    onSuccess: (res) => {
      setItems(res.items)
      setTmdbOk(res.tmdb)
      setSearched(true)
      setPicked(null)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const add = useMutation({
    mutationFn: (input: AttachCastInput) => attachCastMember(type, recordId, input),
    onSuccess: (member) => {
      qc.invalidateQueries({ queryKey: [type] })
      qc.invalidateQueries({ queryKey: ['actor'] })
      toast({ title: t('cast.added', { name: member.name_ka || member.name }), variant: 'success' })
      onAdded?.()
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const pick = (c: CastCandidate) => {
    if (c.attached) return
    setManual(false)
    setPicked(c)
    // ხელით ველები კანდიდატით ივსება — ქართული სახელი მაინც ხელით იწერება
    setNameEn(c.name)
    setNameKa(c.name_ka ?? '')
  }

  const startManual = () => {
    setManual(true)
    setPicked(null)
    setNameEn(query.trim())
    setNameKa('')
  }

  const canSave = manual
    ? nameEn.trim() !== '' || nameKa.trim() !== ''
    : picked !== null

  const submit = () => {
    if (manual) {
      add.mutate({
        name: nameEn.trim() || nameKa.trim(),
        name_ka: nameKa.trim() || undefined,
        gender: gender || undefined,
        character: character.trim() || undefined,
      })
      return
    }
    if (!picked) return
    add.mutate({
      cast_member_id: picked.id ?? undefined,
      tmdb_person_id: picked.id ? undefined : (picked.tmdb_person_id ?? undefined),
      name: picked.name || undefined,
      name_ka: nameKa.trim() || undefined,
      character: character.trim() || undefined,
    })
  }

  const local = items.filter((i) => i.source === 'local')
  const remote = items.filter((i) => i.source === 'tmdb')

  return (
    <ModalShell title={t('cast.addTitle')} onClose={onClose} wide>
      <div className="mt-5 space-y-3">
        {/* ---------- 1. ვის ვეძებთ ---------- */}
        <StepSection step={1} title={t('cast.stepSearch')} hint={t('cast.stepSearchHint')}>
          <div className="flex gap-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('cast.searchPlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (query.trim().length >= 2) search.mutate()
                }
              }}
            />
            <Button
              type="button"
              onClick={() => search.mutate()}
              disabled={query.trim().length < 2 || search.isPending}
            >
              {search.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {t('cast.search')}
            </Button>
          </div>
        </StepSection>

        {/* ---------- 2. შედეგები ---------- */}
        <StepSection
          step={2}
          title={t('cast.stepPick')}
          hint={t('cast.stepPickHint')}
          action={
            <Button type="button" variant="outline" size="sm" onClick={startManual}>
              <UserPlus className="size-4" />
              {t('cast.manualAdd')}
            </Button>
          }
        >
          {/* ⚠️ „TMDB არ გვიპასუხა" ≠ „TMDB-მ ვერაფერი იპოვა" — ორი სხვადასხვა ამბავი */}
          {searched && tmdbOk === false && (
            <p className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {t('cast.tmdbOffline')}
            </p>
          )}
          {searched && tmdbOk === null && (
            <p className="mb-3 text-xs text-muted-foreground">{t('cast.tmdbMissingKey')}</p>
          )}

          {!searched ? (
            <p className="text-sm text-muted-foreground">{t('cast.notSearchedYet')}</p>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<UserRound className="size-6" />}
              title={t('cast.noResults')}
              hint={t('cast.noResultsHint')}
              actions={
                <Button type="button" variant="outline" size="sm" onClick={startManual}>
                  <UserPlus className="size-4" />
                  {t('cast.manualAdd')}
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              {local.length > 0 && (
                <CandidateGroup
                  title={t('cast.groupLibrary')}
                  items={local}
                  picked={picked}
                  onPick={pick}
                />
              )}
              {remote.length > 0 && (
                <CandidateGroup
                  title={t('cast.groupTmdb')}
                  items={remote}
                  picked={picked}
                  onPick={pick}
                />
              )}
            </div>
          )}
        </StepSection>

        {/* ---------- 3. დეტალები ---------- */}
        {(picked || manual) && (
          <StepSection step={3} title={t('cast.stepDetails')} hint={t('cast.stepDetailsHint')}>
            <div className="grid gap-3 sm:grid-cols-2">
              {manual && (
                <>
                  <div>
                    <Label htmlFor="cast-name">{t('cast.nameEn')}</Label>
                    <Input
                      id="cast-name"
                      value={nameEn}
                      onChange={(e) => setNameEn(e.target.value)}
                      placeholder="Nino Kasradze"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cast-name-ka">{t('cast.nameKa')}</Label>
                    <Input
                      id="cast-name-ka"
                      value={nameKa}
                      onChange={(e) => setNameKa(e.target.value)}
                      placeholder="ნინო ქასრაძე"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{t('cast.gender')}</Label>
                    <ChipRow className="mt-1.5">
                      {[
                        { value: 0, label: t('cast.genderUnknown') },
                        { value: 1, label: t('gallery.cast.female') },
                        { value: 2, label: t('gallery.cast.male') },
                      ].map((g) => (
                        <Chip
                          key={g.value}
                          active={gender === g.value}
                          onClick={() => setGender(g.value)}
                        >
                          {g.label}
                        </Chip>
                      ))}
                    </ChipRow>
                  </div>
                </>
              )}

              {!manual && (
                <div>
                  <Label htmlFor="cast-name-ka-2">{t('cast.nameKa')}</Label>
                  <Input
                    id="cast-name-ka-2"
                    value={nameKa}
                    onChange={(e) => setNameKa(e.target.value)}
                    placeholder={picked?.name ?? ''}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="cast-character">{t('cast.character')}</Label>
                <Input
                  id="cast-character"
                  value={character}
                  onChange={(e) => setCharacter(e.target.value)}
                  placeholder={t('cast.characterPlaceholder')}
                />
              </div>
            </div>
          </StepSection>
        )}
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button type="button" onClick={submit} disabled={!canSave || add.isPending}>
          {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {t('cast.add')}
        </Button>
      </div>
    </ModalShell>
  )
}

/** ერთი ჯგუფი — „ბიბლიოთეკაში უკვე არის" ან „TMDB" */
function CandidateGroup({
  title,
  items,
  picked,
  onPick,
}: {
  title: string
  items: CastCandidate[]
  picked: CastCandidate | null
  onPick: (c: CastCandidate) => void
}) {
  const { t } = useTranslation()

  return (
    <div>
      <h4 className="mb-2 text-xs font-medium text-muted-foreground">
        {title} · {items.length}
      </h4>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((c) => {
          const key = `${c.source}-${c.id ?? c.tmdb_person_id}`
          const active =
            picked?.source === c.source &&
            picked?.id === c.id &&
            picked?.tmdb_person_id === c.tmdb_person_id

          return (
            <li key={key}>
              <button
                type="button"
                disabled={c.attached}
                onClick={() => onPick(c)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors',
                  c.attached
                    ? 'cursor-not-allowed border-border opacity-60'
                    : 'cursor-pointer hover:border-primary/40',
                  active ? 'border-primary bg-secondary' : 'border-border',
                )}
              >
                {c.photo ? (
                  <img
                    src={c.photo}
                    alt=""
                    loading="lazy"
                    className="size-10 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <UserRound className="size-4" />
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {c.name_ka || c.name}
                  </span>
                  {c.name_ka && c.name !== c.name_ka && (
                    <span className="block truncate text-xs text-muted-foreground">{c.name}</span>
                  )}
                  {c.known_for && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.known_for}
                    </span>
                  )}
                </span>

                {c.attached && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {t('cast.alreadyAttached')}
                  </span>
                )}
                {active && <Check className="size-4 shrink-0 text-primary" />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
