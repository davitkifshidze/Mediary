import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'

/* ============================================================
   გაზიარების ბმულის QR (Tasks §40.4).

   ⚠️ **`qrcode.react` `lazy`-ია** — `TwoFactorCard`-ის წესი: ბიბლიოთეკა მხოლოდ
   მაშინ იტვირთება, როცა QR მართლა იხატება, და ბიბლიოთეკის/გაზიარების
   გვერდის ნაჭერში არ ჯდება.

   ⚠️ **თეთრ ფონზე ცხადად** — მუქ თემაზე კოდის კონტრასტი იკარგება და კამერა
   მას ვეღარ კითხულობს (`TwoFactorCard`-ის იგივე მიზეზი).
   ============================================================ */

const QRCodeSVG = lazy(() => import('qrcode.react').then((m) => ({ default: m.QRCodeSVG })))

export function ShareQr({ value, size = 168 }: { value: string; size?: number }) {
  return (
    <div className="inline-grid place-items-center rounded-md bg-white p-3">
      <Suspense
        fallback={
          <div className="grid place-items-center" style={{ width: size, height: size }}>
            <Loader2 className="size-5 animate-spin text-neutral-400" />
          </div>
        }
      >
        <QRCodeSVG value={value} size={size} level="M" />
      </Suspense>
    </div>
  )
}
