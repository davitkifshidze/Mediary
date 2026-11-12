import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, SquarePen, Trash2 } from 'lucide-react'
import { deleteGoal, fetchGoals, type Goal } from '@/api/goals'
import { errorMessage } from '@/lib/errors'
import { GoalCard } from '@/components/goals/GoalCard'
import { GoalDialog } from '@/components/goals/GoalDialog'
import { Button } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { QueryErrorState } from '@/components/ui/query-error-state'

/* ============================================================
   **მიზნები** (`/goals`) — სია, დამატება, რედაქტირება, წაშლა.

   ორი ჭრილი: „მიმდინარე" (აქტიური და ჯერ არდაწყებული) და „ისტორია" (გასული
   პერიოდები — შესრულებული და ჩავარდნილი). ერთ მოდულზე რამდენიმე მიზანი შეიძლება.

   ⚠️ ერთი მოთხოვნა ორივე ჭრილს ფარავს — რიცხვები ჩანართებზე მაშინვე ჩანს; მიზანი
   სამასამდეა, ე.ი. გვერდებად დაყოფა არ სჭირდება.
   ⚠️ მიზანი მხოლოდ იმ მოდულზე იქმნება, რომელსაც დასრულების თარიღი აქვს — სიას
   სერვერი აბრუნებს (`modules`); სამაგიდო თამაში მასში არ არის.
   ============================================================ */

type Cut = 'current' | 'history'

export function GoalsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { toast } = useToast()
  const [cut, setCut] = useState<Cut>('current')
  /** `'new'` — დამატება; მიზანი — მისი რედაქტირება */
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)

  const query = useQuery({ queryKey: ['goals'], queryFn: () => fetchGoals() })
  const goals = query.data?.data ?? []
  const modules = query.data?.modules ?? []
  const current = goals.filter((goal) => !goal.past)
  // ისტორია ახლიდან ძველისკენ
  const history = goals.filter((goal) => goal.past).sort((a, b) => b.ends_on.localeCompare(a.ends_on))
  const shown = cut === 'current' ? current : history

  const remove = useMutation({
    mutationFn: (id: number) => deleteGoal(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['goals'] })
      toast({ title: t('goals.deleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const askDelete = async (goal: Goal) => {
    if (await confirm({ title: t('goals.deleteTitle'), description: t('goals.deleteHint'), variant: 'destructive' })) {
      remove.mutate(goal.id)
    }
  }

  const add = (
    <Button onClick={() => setEditing('new')} disabled={modules.length === 0} data-testid="goal-add">
      <Plus className="size-4" />
      {t('goals.add')}
    </Button>
  )

  return (
    <PageContainer>
      <PageHeader tool="goals" title={t('goals.title')} hint={t('goals.hint')} actions={add} />

      {query.isError ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <>
          <div className="mb-4" data-testid="goal-cuts">
            <CutTabs
              layout="inline"
              options={[
                { key: 'current', label: t('goals.cut.current'), count: current.length },
                { key: 'history', label: t('goals.cut.history'), count: history.length },
              ]}
              value={cut}
              onChange={(key) => setCut(key === 'history' ? 'history' : 'current')}
            />
          </div>

          {query.isLoading ? null : shown.length === 0 ? (
            <EmptyState
              kind="list"
              title={t(cut === 'current' ? 'goals.emptyCurrent' : 'goals.emptyHistory')}
              hint={cut === 'current' ? (modules.length === 0 ? t('goals.emptyNoModules') : t('goals.emptyCurrentHint')) : undefined}
              actions={cut === 'current' ? add : undefined}
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="goal-list">
              {shown.map((goal) => (
                <li key={goal.id} className="flex">
                  <div className="flex w-full flex-col [&>article]:flex-1">
                    <GoalCard
                      goal={goal}
                      actions={
                        <>
                          <Button variant="edit" size="sm" onClick={() => setEditing(goal)} data-testid="goal-edit">
                            <SquarePen className="size-3.5" />
                            {t('actions.edit')}
                          </Button>
                          <Button variant="destructiveOutline" size="sm" className="ml-auto" onClick={() => void askDelete(goal)} data-testid="goal-delete">
                            <Trash2 className="size-3.5" />
                            {t('actions.delete')}
                          </Button>
                        </>
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {editing && <GoalDialog goal={editing === 'new' ? null : editing} modules={modules} onClose={() => setEditing(null)} />}
    </PageContainer>
  )
}
