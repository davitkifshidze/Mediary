import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import type { PlaceMapProps } from '@/components/PlaceMap'
import { cn } from '@/lib/utils'

/* ============================================================
   **რუკის ლეიზი საზღვარი** (Tasks §30.2).

   ⚠️ Leaflet მხოლოდ აქედან იტვირთება (`import()`), ე.ი. ბანდლში ცალკე
   ჩანკია და ადგილების გარეთ არასდროს მოდის. `MapFrame` — ჩარჩო, სკელეტი
   ჩატვირთვისას და `isolate`: Leaflet-ის შიდა z-index-ები (400…1000) ჩარჩოს
   გარეთ არ გადის და მოდალის სხვა ფენებს არ ეხება (`lib/layers.ts`-ის წესი).
   ============================================================ */

const PlaceMap = lazy(() => import('@/components/PlaceMap'))

export function MapFrame({ className, ...props }: PlaceMapProps) {
  return (
    <div className={cn('relative isolate z-0 overflow-hidden rounded-xl border border-border bg-muted', className)} data-testid="map-frame">
      <Suspense fallback={<div className="size-full animate-pulse" data-testid="map-loading" />}>
        <PlaceMap {...props} className="size-full" />
      </Suspense>
    </div>
  )
}

/**
 * **ფორმის რუკა — მარკერის გადათრევით/დაწკაპუნებით კოორდინატის დაზუსტება** (§30.2).
 * ⚠️ რუკა მხოლოდ მაშინ, როცა ორივე რიცხვი დგას — ცარიელ ფორმაზე ცენტრი არ არსებობს.
 */
export function FormMapPick({ lat, lng, onPick }: { lat: string; lng: string; onPick: (lat: number, lng: number) => void }) {
  const { t } = useTranslation()
  const a = Number(lat)
  const b = Number(lng)
  const ready = lat !== '' && lng !== '' && Number.isFinite(a) && Number.isFinite(b)

  if (!ready) {
    return <p className="mt-2 text-xs text-muted-foreground">{t('places.route.mapNeedsCoords')}</p>
  }

  return (
    <div className="mt-2" data-testid="form-map">
      <MapFrame center={[a, b]} draggable onMove={onPick} zoom={15} className="h-56" />
      <p className="mt-1 text-xs text-muted-foreground">{t('places.route.dragHint')}</p>
    </div>
  )
}
