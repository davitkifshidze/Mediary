import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/i18n'

/* ============================================================
   რეგრესია: **არსებული შეხსენების ჩასწორება მეორეს არ ქმნის** (ეტაპი 7).

   ⚠️ ზუსტად ის შემთხვევა, რომელიც აღიწერა: შეხსენებას ამატებ, მერე მისი
   ჩასწორება ვერსად ჩანს და კვლავ „დამატებას" აჭერ — ე.ი. ერთ ჩანაწერზე ორი
   შეხსენება. backend-ის ტესტი მხოლოდ იმას ამბობს, რომ `PATCH` განაახლებს;
   **რომელ endpoint-ს დაუძახებს UI** — ეს მხოლოდ კომპონენტის ნამდვილი
   მიმაგრებით ითქმება, ამიტომ არსებობს ეს ფაილი (`GroupsCut.test.ts`-ის
   პრეცედენტი: ბიბლიოთეკა არ ემატება, ფაილი `.ts`-ია).

   მეორე შემოწმება ისევე უხილავია სხვა ხერხისთვის: **ჯერ შეუნახავ ჩანაწერზე**
   (`noteId === null`) ბლოკმა არც ველები უნდა აჩვენოს და არც რექვესთი გაუშვას.
   ============================================================ */

/* ⚠️ `vi.mock`-ის ფაბრიკა **ზემოთ აიწევა**, ე.ი. ჩვეულებრივ `const`-ს ვერ
   დაინახავს (TDZ). `vi.hoisted` სწორედ ამისთვისაა — შუალედური λ-ები კი
   `tsc`-ს არგუმენტების ტიპს უკარგავდა. */
const mocks = vi.hoisted(() => ({
  fetchNoteReminders: vi.fn(),
  createNoteReminder: vi.fn(),
  updateNoteReminder: vi.fn(),
}))

vi.mock('@/api/notes', async (original) => ({
  ...(await original<typeof import('@/api/notes')>()),
  ...mocks,
}))

const reminder = {
  id: 42,
  note_entry_id: 5,
  mode: 'daily' as const,
  remind_at: null,
  interval_minutes: null,
  times_of_day: ['09:00'],
  weekdays: [] as number[],
  days_of_month: [] as number[],
  month: null,
  repeat_count: null,
  starts_at: null,
  ends_at: null,
  timezone: 'Asia/Tbilisi',
  channels: ['browser' as const],
  is_active: true,
  // ⚠️ მომავალში — რომ ბარათმა **აქტიური** მდგომარეობა დახატოს
  // („N საათში" + აბსოლუტური თარიღი), და არა „აღარ ისვრის"
  next_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  last_sent_at: null,
  sent_count: 0,
}

const { fetchNoteReminders, createNoteReminder, updateNoteReminder } = mocks

fetchNoteReminders.mockResolvedValue([reminder])
createNoteReminder.mockResolvedValue(reminder)
updateNoteReminder.mockResolvedValue(reminder)

// React 19-ის `act()` ამ დროშას ითხოვს, თორემ ეფექტებს არ ატარებს
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

async function render(node: ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, node)))
  })

  // ⚠️ ერთი `act` არ კმარა: react-query-ის პასუხი მომდევნო tick-ზე ჯდება
  await flush()

  return container
}

async function mount(noteId: number | null) {
  const { NoteReminders } = await import('@/components/NoteReminders')

  return render(h(NoteReminders, { noteId }))
}

/** ღილაკი მხოლოდ ღილაკია — ფანჯარას მშობელი ხატავს (2026-09-14) */
const opened = vi.fn()

async function mountButton(note: { id: number; title: string; reminders_count?: number } | null) {
  const { NoteRemindersButton } = await import('@/components/NoteRemindersDialog')

  // ⚠️ `NoteEntry`-ის სრული ობიექტი აქ არ სჭირდება — ღილაკი მხოლოდ სამ ველს კითხულობს
  return render(h(NoteRemindersButton, { note: note as never, onOpen: opened }))
}

/** ფანჯარა ცალკე იდგმება — ზუსტად ისე, როგორც მშობელი აკეთებს */
async function mountDialog(note: { id: number; title: string }) {
  const { NoteRemindersDialog } = await import('@/components/NoteRemindersDialog')

  return render(h(NoteRemindersDialog, { note: note as never, onClose: () => {} }))
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** ტექსტის მიხედვით ღილაკის პოვნა — `@testing-library`-ის გარეშე */
function button(scope: ParentNode, text: string) {
  return [...scope.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text))
}

describe('NoteReminders', () => {
  it('რიგზე დაჭერა რედაქტირებას ხსნის და შენახვა **არსებულს** ანახლებს', async () => {
    const node = await mount(5)

    // რიგი მთლიანად ღილაკია (და არა მხოლოდ ფანქარი)
    const row = button(node, '09:00')
    expect(row, 'შეხსენების რიგი უნდა დაიხატოს').toBeTruthy()

    await act(async () => row!.click())
    await flush()

    // სათაური ცხადად ამბობს, რომ ვასწორებ და არ ვქმნი
    expect(node.textContent).toContain('შეხსენების რედაქტირება')

    const save = button(node, 'შენახვა')
    expect(save, 'რედაქტირებისას ღილაკი „შენახვაა"').toBeTruthy()

    await act(async () => save!.click())
    await flush()

    expect(updateNoteReminder).toHaveBeenCalledTimes(1)
    expect(updateNoteReminder.mock.calls[0][0]).toBe(42)
    // ⚠️ სწორედ ესაა ხარვეზი: ჩასწორება მეორე შეხსენებას არ ქმნის
    expect(createNoteReminder).not.toHaveBeenCalled()
  })

  it('გაუქმება სიაში აბრუნებს და არაფერს ინახავს', async () => {
    const node = await mount(5)

    await act(async () => button(node, '09:00')!.click())
    await flush()
    expect(node.textContent).toContain('შეხსენების რედაქტირება')

    await act(async () => button(node, 'გაუქმება')!.click())
    await flush()

    // ⚠️ რედაქტორი დაიხურა და **სია დაბრუნდა** — ორეკრანიანი ქცევა (ეტაპი 11)
    expect(node.textContent).not.toContain('შეხსენების რედაქტირება')
    expect(node.textContent).toContain('აქტიური')
    expect(button(node, '09:00'), 'ბარათი ისევ ადგილზეა').toBeTruthy()
    expect(updateNoteReminder).not.toHaveBeenCalled()
    expect(createNoteReminder).not.toHaveBeenCalled()
  })

  /* ⚠️ ვიზუალის ის ნაწილი, რომელიც ტიპებით არ იჭერს თავს: ბარათი უნდა
     ამბობდეს **რამდენ ხანში** გაისვრის და არა მხოლოდ აბსოლუტურ თარიღს —
     სწორედ ეს იყო ძველ ერთხაზიან სიაში „·"-ებში ჩამარხული. */
  it('აქტიური ბარათი შემდეგ გასროლას ფარდობით დროსაც აჩვენებს', async () => {
    const node = await mount(5)

    expect(node.textContent).toContain('საათში')
    // რედაქტორი ნაგულისხმევად **დახურულია** — ეკრანი სიაა
    expect(node.textContent).not.toContain('შეხსენების რედაქტირება')
    expect(node.textContent).not.toContain('ახალი შეხსენება')
  })

  it('ჯერ შეუნახავ ჩანაწერზე მინიშნებაა და რექვესთი არ მიდის', async () => {
    const node = await mount(null)

    expect(node.textContent).toContain('ჯერ შეინახე')
    expect(node.querySelectorAll('button').length).toBe(0)
    expect(fetchNoteReminders).not.toHaveBeenCalled()
  })
})

/* ეტაპი 11 — ღილაკი და მისი ფანჯარა. ⚠️ იმავე გაკვეთილს იმაგრებს, რაც
   `GroupsCut.test.ts`-ს: state და პორტალის JSX **ერთ კომპონენტშია**,
   თორემ დაჭერა მდგომარეობას შეცვლიდა და ეკრანზე არაფერი მოხდებოდა. */
describe('NoteRemindersButton', () => {
  const note = { id: 5, title: 'პასპორტის განახლება', reminders_count: 2 }

  it('ღილაკი მრიცხველს ზედმეტი რექვესთის გარეშე აჩვენებს და მშობელს ატყობინებს', async () => {
    const node = await mountButton(note)

    expect(node.textContent).toContain('შეხსენებები')
    // მრიცხველი სიიდან მოდის — ზედმეტი რექვესთის გარეშე
    expect(node.textContent).toContain('2')
    expect(fetchNoteReminders).not.toHaveBeenCalled()

    /* ⚠️ ღილაკი **ფანჯარას აღარ ხატავს**: ის მოდალის შიგნიდან იხსნება და
       მშობელმა თავი უნდა დამალოს, ე.ი. მდგომარეობა მშობელს უჭირავს. */
    await act(async () => node.querySelector('button')!.click())
    await flush()

    expect(opened).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('ჯერ შეუნახავ ჩანაწერზე ღილაკი გამორთულია და მიზეზიც წერია', async () => {
    const node = await mountButton(null)

    expect(node.querySelector('button')!.disabled).toBe(true)
    expect(node.textContent).toContain('ჯერ შეინახე')
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  /** ⚠️ „ცალკე, მაგრამ ბმით": ფანჯარა ამბობს, **რას** ეხება */
  it('ფანჯარაში ჩანაწერის სახელი და მისი შეხსენებები წერია', async () => {
    await mountDialog(note)

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog, 'ფანჯარა უნდა დაიხატოს').toBeTruthy()
    expect(dialog!.textContent).toContain('პასპორტის განახლება')
    expect(dialog!.textContent).toContain('09:00')
  })
})
