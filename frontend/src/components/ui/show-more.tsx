import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ============================================================
   „მეტის ჩვენება" — სიის ბოლოს ერთი ზოლი ცხრავე მოდულზე.

   ⚠️ **რიცხვი ღილაკზე მნიშვნელოვანია.** უბრალო „მეტის ჩვენება" არ
   პასუხობს იმას, რაც ამ ეკრანზე ყველაზე ხშირად იკითხება — *ეს ყველაფერია
   თუ არა?* ამიტომ აქ ყოველთვის წერია „ნაჩვენებია N / M-დან", მაშინაც კი,
   როცა ღილაკი აღარაა (სია სრულად ჩამოვიდა).

   ⚠️ **უსასრულო სქროლი განზრახ არაა.** ფილტრის პანელი და გაზიარებადი
   მისამართი (`?view=&genre=…`) ამ სექციების საფუძველია — სქროლზე მიბმული
   ჩატვირთვა კი ბრაუზერის „უკან"-ს და პოზიციის აღდგენას ტეხს.
   ============================================================ */

export function ShowMore({
  shown,
  total,
  onMore,
  loading,
  className,
}: {
  shown: number
  total: number
  onMore: () => void
  loading?: boolean
  className?: string
}) {
  const { t } = useTranslation()

  // ცარიელ სიაზე ამ ზოლს საქმე არ აქვს — იქ `EmptyState` დგას
  if (shown === 0) return null

  const hasMore = shown < total

  return (
    <div className={cn('mt-6 flex flex-col items-center gap-2', className)}>
      <p className="text-sm text-muted-foreground">{t('list.shown', { shown, total })}</p>

      {hasMore && (
        <Button variant="outline" onClick={onMore} disabled={loading}>
          {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
          {t('list.showMore')}
        </Button>
      )}
    </div>
  )
}
