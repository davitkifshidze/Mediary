import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { TOOL_SECTIONS, toolAccent } from '@/lib/toolSections'

/* ============================================================
   პროფილის ბმული „ექსპორტ & იმპორტი"-ზე (Tasks §31.3).

   ⚠️ **ბმულია და არა მეორე ფორმა.** ექსპორტი აქ იდგა (`DataExportCard`) და
   ახლა თავის სექციაშია; ორი ადგილი, სადაც ერთი და იგივე კეთდება, ორ
   სხვადასხვა ქცევად დაიწყებდა ცხოვრებას — ერთს ახალი ფორმატი ემატებოდა,
   მეორეს არა.

   ⚠️ **საცავის ბლოკის ქვემოთაა** იმავე მიზეზით, რითაც ექსპორტი იდგა:
   ზემოთ ატვირთული ფაილებია, აქ — „როგორ წავიღო ან შემოვიტანო ჩემი
   ბიბლიოთეკა". ფერი და ხატულა სექციისაა (`lib/toolSections.ts`), ე.ი.
   ბმული და მენიუს რიგი ერთნაირად იხატება.
   ============================================================ */

export function TransferLink() {
  const { t } = useTranslation()
  const Icon = TOOL_SECTIONS.transfer.icon

  return (
    <Link
      to="/transfer"
      style={toolAccent('transfer')}
      className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-[var(--mod)]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)]">
        <Icon className="size-5 text-[var(--mod)]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-lg font-semibold">{t('transfer.title')}</span>
        <span className="block truncate text-sm text-muted-foreground">{t('transfer.profileLink')}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
