import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, Search, Star } from 'lucide-react'
import { fetchPersonalAlbums, fetchPersonalSummary, PERSONAL_KEY } from '@/api/personal'
import { CutTabs } from '@/components/ui/cut-tabs'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { PersonalAlbumCards } from '@/components/personal/PersonalAlbumCards'
import { PersonalMediaGrid } from '@/components/personal/PersonalMediaGrid'

/* ============================================================
   **„სქრინშოტები"** — ცალკე სივრცე საკუთარი ალბომებით (მაგ. „საინფორმაციო",
   „პაროლები").

   ⚠️ **„ყველა"-ში, პიროვნებებსა და ალბომებში არ ერევა**: პაროლების სქრინშოტი ოჯახის
   ფოტოებს შორის შემთხვევით არ უნდა გამოჩნდეს. იქ მხოლოდ „ყველა"-ს ფილტრი
   „სქრინშოტები" აჩვენებს — მონიშვნისას.

   ⚠️ **იგივე ბადე და იგივე ალბომის ბარათები** (`PersonalMediaGrid`, `PersonalAlbumCards`):
   ატვირთვა, გადატანა, წარწერა, რჩეული და ჩაკეტვა ზუსტად ისეა, როგორც ფოტოებზე —
   სქრინშოტი იგივე ჩანაწერია ნიშნით და არა მეორე ცხრილი.

   ზემოთ ალბომები (რჩეულები თავში), ქვემოთ ყველა სქრინშოტი ქვეფილტრით
   „ყველა · რჩეული" და ძებნით წარწერაში.
   ============================================================ */

type Filter = 'all' | 'favorite'

export function PersonalScreenshotsCut() {
  const { t } = useTranslation()
  // ძებნის შედეგიდან მოსული (`?q=`) — წარწერით სქრინშოტი მაშინვე იფილტრება
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [filter, setFilter] = useState<Filter>('all')

  const albumsQ = useQuery({
    queryKey: [PERSONAL_KEY, 'albums', { screenshots: true }],
    queryFn: () => fetchPersonalAlbums({ screenshots: true }),
  })
  const summary = useQuery({ queryKey: [PERSONAL_KEY, 'summary'], queryFn: fetchPersonalSummary }).data
  const albums = (albumsQ.data ?? []).filter((album) => filter !== 'favorite' || album.is_favorite)

  return (
    <section data-testid="personal-screenshots">
      {albums.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            {t('personal.screenshots.albums')}
            <InfoHint info={t('personal.screenshots.albumsHint')} />
          </h2>
          <PersonalAlbumCards albums={albums} showOwner={false} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="personal-screenshots-toolbar">
        <CutTabs
          layout="inline"
          size="sm"
          options={[
            { key: 'all', label: t('personal.kind.all'), icon: LayoutGrid, count: summary?.screenshots },
            { key: 'favorite', label: t('filter.favorite'), icon: Star, color: 'var(--favorite)' },
          ]}
          value={filter}
          onChange={(key) => setFilter(key as Filter)}
        />
        <div className="relative ml-auto w-56 max-w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('personal.media.search')}
            aria-label={t('personal.media.search')}
            className="h-9 pl-9"
          />
        </div>
      </div>

      <PersonalMediaGrid
        filters={{ screenshots: 'only', favorite: filter === 'favorite' || undefined, q: q.trim() || undefined, sort: 'added' }}
        space="screenshots"
        emptyText={t('personal.screenshots.empty')}
        emptyHint={t('personal.screenshots.emptyHint')}
      />
    </section>
  )
}
