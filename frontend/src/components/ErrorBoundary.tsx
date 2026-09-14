import { Component, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

/* ============================================================
   მარშრუტების შეცდომის ზღვარი (ეტაპი 3).

   ⚠️ **რატომ არსებობს.** გვერდები `lazy()`-ა (წინა ნაკრების §4), ე.ი. ჩანქის
   ჩატვირთვის ჩავარდნა (ძველი დეპლოი, გაწყვეტილი ქსელი) ან რენდერის შეცდომა
   მთელ ხეს ხსნიდა და **თეთრი ეკრანი** რჩებოდა — მიზეზი მხოლოდ კონსოლში
   ჩანდა. ეს `CLAUDE.md`-ში სწორედ ასე ეწერა: „პირველი გასაკეთებელი".

   ⚠️ **მისამართის შეცვლაზე თვითონ იწმინდება** (`resetKey`). ზღვარი
   „დამახსოვრებულ" შეცდომას ინახავს, ე.ი. სხვა სექციაზე გადასვლის შემდეგაც
   შეცდომის ეკრანი დარჩებოდა და აპლიკაცია ჩაკეტილად გამოიყურებოდა.

   ⚠️ **ხატვა ცალკე, ფუნქციურ კომპონენტშია** — კლასს hook არ შეუძლია, ხოლო
   წარწერები `t()`-დან უნდა მოდიოდეს (და არა ხელით ჩაწერილი ტექსტიდან).
   ============================================================ */

interface Props {
  children: ReactNode
  /** ამის შეცვლა შეცდომას ასუფთავებს — მარშრუტის მისამართი */
  resetKey?: string
}

interface State {
  error: Error | null
  /** ბოლო დანახული `resetKey` — შედარება მდგომარეობაშივე ხდება */
  key?: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  /**
   * ⚠️ გასუფთავება `getDerivedStateFromProps`-შია და არა
   * `componentDidUpdate`-ში: მეორეს `setState` მეორე რენდერს იწვევს (და
   * lint-იც სამართლიანად აფრთხილებს) — აქ კი შეცდომა **იმავე** რენდერზე ცვივა.
   */
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey === state.key) return null

    return state.error ? { error: null, key: props.resetKey } : { key: props.resetKey }
  }

  render() {
    if (!this.state.error) return this.props.children

    return <RouteError error={this.state.error} onRetry={() => this.setState({ error: null })} />
  }
}

function RouteError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <EmptyState
      icon={<AlertTriangle className="size-6 text-destructive" />}
      title={t('boundary.title')}
      hint={
        <>
          {t('boundary.hint')}
          {/* ⚠️ ნამდვილი ტექსტი ეკრანზევე წერია: „რაღაც წავიდა ვერ" კონსოლის
              გახსნას მაინც მოითხოვდა, ე.ი. მიზეზი ისევ დამალული იქნებოდა */}
          <span className="mt-2 block break-words font-mono text-[11px] text-muted-foreground/80">
            {error.message}
          </span>
        </>
      }
      actions={
        <>
          <Button type="button" onClick={onRetry}>
            <RotateCw className="size-4" />
            {t('boundary.retry')}
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            {t('boundary.reload')}
          </Button>
        </>
      }
    />
  )
}
