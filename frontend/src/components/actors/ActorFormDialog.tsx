import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { ACTORS_KEY, createActor, updateActor, type ActorInput, type SavedActor } from '@/api/actors'
import { searchCastMembers, type CastCandidate, type CastSearchResult } from '@/api/cast'
import type { Actor } from '@/api/media'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Chip, ChipRow } from '@/components/ui/chip'
import { DatePicker } from '@/components/ui/date-picker'
import { useToast } from '@/components/ui/feedback'
import { FORM_TEXT_ROWS, FormField, FormSection } from '@/components/ui/form-layout'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import {
  QuickFill,
  QuickFillCandidate,
  QuickFillMessage,
  QuickFillResults,
  QuickFillSearch,
} from '@/components/ui/quick-fill'
import { Textarea } from '@/components/ui/textarea'
import { PosterUploader } from '@/components/PosterUploader'

/* ============================================================
   **ახალი მსახიობი და ხელით შექმნილის რედაქტირება.**

   ორი გზა ერთ ფანჯარაში: ზემოთ ძებნა (ჯერ ბიბლიოთეკა, მერე TMDB — იგივე
   `/cast/search`, რაც ჩანაწერზე მიბმას აქვს) და ქვემოთ ხელით შევსება.
   ⚠️ **TMDB-ის პირი საერთოა** (ფოტო TMDB-დან, კვოტის გარეშე), **ხელით
   შექმნილი — შენია**: მხოლოდ შენ ხედავ, ფოტო კი შენს კვოტაშია.

   ⚠️ **დუბლი არ იქმნება** — სერვერი იმავე სახელს ან TMDB-ის პირს არსებულ
   მსახიობზე აბრუნებს (`existing`), და გვერდი მასზე გადადის.
   ============================================================ */

type Gender = 0 | 1 | 2

export function ActorFormDialog({
  actor,
  onClose,
  onSaved,
}: {
  /** რედაქტირება — მხოლოდ ჩემ მიერ ხელით შექმნილი */
  actor?: Actor | null
  onClose: () => void
  onSaved: (saved: SavedActor) => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const editing = !!actor

  const [name, setName] = useState(actor?.name ?? '')
  const [nameKa, setNameKa] = useState(actor?.name_ka ?? '')
  const [gender, setGender] = useState<Gender>(((actor?.gender ?? 0) as Gender) || 0)
  const [birthday, setBirthday] = useState<string | null>(actor?.birthday ?? null)
  const [deathday, setDeathday] = useState<string | null>(actor?.deathday ?? null)
  const [place, setPlace] = useState(actor?.place_of_birth ?? '')
  const [biography, setBiography] = useState(actor?.biography ?? '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(actor?.photo ?? null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CastSearchResult | null>(null)

  // ⚠️ არჩეული ფაილის `blob:` წინასწარი ხედი ხელით თავისუფლდება
  useEffect(() => {
    if (!photo) return
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  const done = (saved: SavedActor) => {
    qc.invalidateQueries({ queryKey: [ACTORS_KEY] })
    qc.invalidateQueries({ queryKey: ['actor', String(saved.actor.id)] })
    toast({
      title: saved.existing ? t('actors.form.existing') : t(editing ? 'actors.form.updated' : 'actors.form.created'),
      variant: saved.existing ? 'info' : 'success',
    })
    onSaved(saved)
  }

  const fail = (e: unknown) => {
    setErrors(fieldErrors(e))
    toast({ title: errorMessage(e), variant: 'error' })
  }

  const search = useMutation({
    mutationFn: () => searchCastMembers(query.trim()),
    onSuccess: setResults,
    onError: fail,
  })

  /* ბიბლიოთეკაში უკვე მყოფი — ახალი არ იქმნება, გვერდი მასზე გადადის;
     TMDB-ის პირი — საერთო ლექსიკონში შემოდის */
  const pick = useMutation({
    mutationFn: (candidate: CastCandidate) =>
      candidate.source === 'local' && candidate.id
        ? Promise.resolve<SavedActor>({ actor: { id: candidate.id, name: candidate.name, name_ka: candidate.name_ka, photo: candidate.photo, tags: [] }, existing: true })
        : createActor({ tmdb_person_id: candidate.tmdb_person_id ?? undefined, name: candidate.name }),
    onSuccess: done,
    onError: fail,
  })

  const save = useMutation({
    mutationFn: () => {
      const input: ActorInput = {
        name: name.trim(),
        name_ka: nameKa.trim(),
        gender: gender || null,
        birthday,
        deathday,
        place_of_birth: place.trim(),
        biography: biography.trim(),
        ...(photo ? { photo } : {}),
        ...(editing && removePhoto && !photo ? { remove_photo: true } : {}),
      }

      return actor ? updateActor(actor.id, input) : createActor(input)
    },
    onSuccess: done,
    onError: fail,
  })

  const busy = save.isPending || pick.isPending

  return (
    <ModalShell title={t(editing ? 'actors.form.editTitle' : 'actors.form.title')} onClose={onClose} size="wide">
      {!editing && (
        <QuickFill title={t('actors.form.findTitle')} hint={t('actors.form.findHint')} htmlFor="actor-find" icon={<Search className="size-4" />}>
          <QuickFillSearch
            id="actor-find"
            value={query}
            onChange={setQuery}
            onSearch={() => query.trim().length >= 2 && search.mutate()}
            busy={search.isPending}
            placeholder={t('cast.searchPlaceholder')}
            buttonLabel={t('cast.search')}
            autoFocus
          />
          {results?.tmdb === null && <QuickFillMessage tone="info">{t('cast.tmdbMissingKey')}</QuickFillMessage>}
          {results?.tmdb === false && <QuickFillMessage tone="warn">{t('cast.tmdbOffline')}</QuickFillMessage>}
          {results && results.items.length === 0 && <QuickFillMessage>{t('cast.noResults')}</QuickFillMessage>}
          {results && results.items.length > 0 && (
            <QuickFillResults>
              {results.items.map((candidate) => (
                <QuickFillCandidate
                  key={`${candidate.source}:${candidate.id ?? candidate.tmdb_person_id}`}
                  image={candidate.photo}
                  shape="poster"
                  title={candidate.name_ka ? `${candidate.name_ka} · ${candidate.name}` : candidate.name}
                  meta={[candidate.source === 'local' ? t('cast.groupLibrary') : t('cast.groupTmdb'), candidate.known_for].filter(Boolean).join(' · ')}
                  onPick={() => pick.mutate(candidate)}
                  disabled={busy}
                />
              ))}
            </QuickFillResults>
          )}
        </QuickFill>
      )}

      {/* ფოტოს ჩარჩო `MediaRow`-ზე (სვეტი 160 px, სიმაღლე — ველებისა); ველები
          ფორმის 12-სვეტიან ბადეზე ზომებით (ადრე ბადეში ჩადგმული მეორე ბადე ერთ სვეტში იკუმშებოდა) */}
      <FormSection
        title={editing ? undefined : t('actors.form.manualTitle')}
        hint={editing ? undefined : t('actors.form.manualHint')}
        mediaVariant="poster"
        media={
          <PosterUploader
            preview={preview}
            onSelect={(file) => {
              setPhoto(file)
              setRemovePhoto(false)
            }}
            onClear={() => {
              setPhoto(null)
              setPreview(null)
              setRemovePhoto(true)
            }}
            hint={t('actors.form.photoHint')}
            fill
          />
        }
      >
        <FormField size="half" label={t('cast.nameEn')} htmlFor="actor-name" error={errors.name} required>
          <Input id="actor-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('cast.namePlaceholderEn')} />
        </FormField>
        <FormField size="half" label={t('cast.nameKa')} htmlFor="actor-name-ka" error={errors.name_ka}>
          <Input id="actor-name-ka" value={nameKa} onChange={(e) => setNameKa(e.target.value)} placeholder={t('cast.namePlaceholderKa')} />
        </FormField>

        <FormField label={t('cast.gender')}>
          <ChipRow>
            {([0, 1, 2] as const).map((value) => (
              <Chip key={value} active={gender === value} onClick={() => setGender(value)}>
                {value === 0 ? t('cast.genderUnknown') : t(value === 1 ? 'gallery.cast.female' : 'gallery.cast.male')}
              </Chip>
            ))}
          </ChipRow>
        </FormField>

        <FormField size="half" label={t('actors.form.birthday')} htmlFor="actor-birthday" error={errors.birthday}>
          <DatePicker id="actor-birthday" value={birthday} onChange={setBirthday} />
        </FormField>
        <FormField size="half" label={t('actors.form.deathday')} htmlFor="actor-deathday" error={errors.deathday}>
          <DatePicker id="actor-deathday" value={deathday} onChange={setDeathday} />
        </FormField>

        <FormField label={t('actors.form.placeOfBirth')} htmlFor="actor-place">
          <Input id="actor-place" value={place} onChange={(e) => setPlace(e.target.value)} />
        </FormField>
        <FormField label={t('actors.form.biography')} htmlFor="actor-bio" error={errors.biography}>
          <Textarea id="actor-bio" rows={FORM_TEXT_ROWS} value={biography} onChange={(e) => setBiography(e.target.value)} />
        </FormField>
      </FormSection>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button onClick={() => save.mutate()} disabled={busy || !name.trim()}>
          {t(editing ? 'actions.save' : 'actors.form.create')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
