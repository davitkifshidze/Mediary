import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, ScrollText } from 'lucide-react'
import { fetchAuditRules, saveAuditRules } from '@/api/audit'
import { AuditRulesMatrix } from '@/components/audit/AuditRulesMatrix'
import { useAuth } from '@/lib/auth'
import { changes, choose, toDraft, type RuleChoice, type RuleDraft } from '@/lib/auditRules'
import { errorMessage } from '@/lib/errors'
import { CountBadge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, type TabItem } from '@/components/ui/tabs'

/* ============================================================
   **„ჟურნალის წესები"** — `/audit/rules`, მხოლოდ მთავარი ადმინი.

   რა იწერება ჟურნალში — ოთხ დონეზე, უფრო კონკრეტული იმარჯვებს:
   მომხმარებელი + მოდული → მომხმარებელი → მოდული → გლობალური. ორი ჩანართი
   ერთსა და იმავე მატრიცას ხატავს: „ყველასთვის" (გლობალური და მოდულის დონე)
   და „მომხმარებელზე" (არჩეული ანგარიშის დონეები).

   ⚠️ **ცხადი „შენახვა"** (პარამეტრების წესი): უჯრა მყისიერად არაფერს წერს —
   რამდენიმე უჯრის შეცვლა ერთი შენახვაა, და ჩანართის ან მომხმარებლის შეცვლა
   მონახაზს არ კარგავს. იგზავნება მხოლოდ შეცვლილი უჯრები.
   ⚠️ შენახვის შემდეგ `/auth/me` თავიდან იკითხება — SPA მაშინვე წყვეტს ან
   იწყებს დაჭერებისა და გვერდების გაგზავნას.
   ============================================================ */

type RulesScope = 'all' | 'user'

export function AuditRulesPage() {
  const { t } = useTranslation()
  const { user: me } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [scope, setScope] = useState<RulesScope>('all')
  const [userId, setUserId] = useState<number | null>(null)

  const { data } = useQuery({
    queryKey: ['audit-rules'],
    queryFn: fetchAuditRules,
    enabled: !!me?.is_super_admin,
  })

  const saved = useMemo(() => toDraft(data?.rules ?? []), [data])
  const [draft, setDraft] = useState<RuleDraft>({})

  useEffect(() => {
    setDraft(saved)
  }, [saved])

  const pending = useMemo(() => changes(saved, draft), [saved, draft])

  const save = useMutation({
    mutationFn: () => saveAuditRules(pending),
    onSuccess: (next) => {
      qc.setQueryData(['audit-rules'], next)
      qc.invalidateQueries({ queryKey: ['me'] })
      toast({ title: t('audit.rules.saved'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (!me?.is_super_admin) {
    return (
      <PageContainer>
        <EmptyState title={t('roles.noAccess')} />
      </PageContainer>
    )
  }

  const scopes: TabItem<RulesScope>[] = [
    { value: 'all', label: t('audit.rules.scopes.all') },
    { value: 'user', label: t('audit.rules.scopes.user') },
  ]

  const target = scope === 'user' ? userId : null

  const onChoose = (kind: string, module: string | null, choice: RuleChoice) =>
    setDraft((current) => choose(current, kind, module, target, choice))

  return (
    <PageContainer>
      <PageHeader
        tool="audit"
        title={t('audit.rules.title')}
        hint={<InfoHint wide info={t('audit.rules.hint')} />}
        actions={
          <>
            <Link to="/audit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <ScrollText className="size-3.5" />
              {t('audit.title')}
            </Link>
            <Button size="sm" onClick={() => save.mutate()} disabled={pending.length === 0 || save.isPending} data-testid="audit-rules-save">
              <Save className="size-3.5" />
              {t('actions.save')}
              <CountBadge count={pending.length} />
            </Button>
          </>
        }
      />

      <Tabs items={scopes} value={scope} onChange={setScope} className="mb-5" />

      {scope === 'user' && (
        <div className="mb-4 max-w-sm space-y-1.5">
          <Label htmlFor="audit-rules-user">{t('audit.filters.user')}</Label>
          <Select value={userId ? String(userId) : ''} onValueChange={(v) => setUserId(Number(v))}>
            <SelectTrigger id="audit-rules-user">
              <SelectValue placeholder={t('audit.rules.pickUser')} />
            </SelectTrigger>
            <SelectContent>
              {data?.users.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name} · {u.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {scope === 'user' && userId === null ? (
        <EmptyState size="compact" title={t('audit.rules.pickUser')} />
      ) : (
        data && <AuditRulesMatrix data={data} saved={saved} draft={draft} userId={target} onChoose={onChoose} />
      )}
    </PageContainer>
  )
}
