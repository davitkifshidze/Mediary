import { describe, expect, it } from 'vitest'
import { readLayout } from '@/lib/recordLayout'

/* ============================================================
   **ხედი თითო მოდულზე**.

   ⚠️ შენახვა/აღდგენა თვითონ `useRecordLayout`-ის ტესტშია (`view-toggle.test.ts`)
   და სამ გვერდზე მონტირებით (ბუკმარკი, ვიდეო, ფილმი); აქ — **მიერთება ყველა
   მოდულზე**: თითო გვერდი ხედს **თავისი** მოდულის გასაღებით ინახავს (ორ
   მოდულს ერთი ხედი რომ არ ჰქონდეს) და ნაგულისხმევად ახლანდელ ხედს იღებს
   (სანამ არ გადართავ, არაფერი იცვლება). ფლეილისტებს სიმღერის მოდულში თავისი
   გასაღები აქვს — სიმღერების ხედს არ ეხება.
   ============================================================ */

const PAGES = import.meta.glob<string>('../pages/*Page.tsx', { query: '?raw', import: 'default', eager: true })

const WIRING: Record<string, string> = {
  BookmarksPage: "useRecordLayout('bookmark', 'rows')",
  NotesPage: "useRecordLayout('note', 'rows')",
  BooksPage: "useRecordLayout('book', 'rows')",
  BoardGamesPage: "useRecordLayout('board_game', 'rows')",
  GamesPage: "useRecordLayout('game', 'rows')",
  SongsPage: "useRecordLayout('song', 'rows')",
  CoursesPage: "useRecordLayout('course', 'rows')",
  PlacesPage: "useRecordLayout('place', 'rows')",
  CustomModulePage: "useRecordLayout(module.key, 'rows')",
  PlaylistsPage: "useRecordLayout('song', 'rows', 'playlist_view')",
  VideosPage: "useRecordLayout('video', 'cards')",
  LibraryPage: "useRecordLayout(type, 'cards')",
}

describe('every module list has the view toggle', () => {
  it.each(Object.entries(WIRING))('%s saves its view on its own module with the current default', (page, call) => {
    const source = PAGES[`../pages/${page}.tsx`]

    expect(source).toBeDefined()
    expect(source).toContain(call)
    expect(source).toContain('<ViewToggle value={layout} onChange={setLayout} />')
  })

  it('tables stay tables (log, users, trash)', () => {
    for (const page of ['AuditPage', 'UsersPage', 'TrashPage']) {
      expect(PAGES[`../pages/${page}.tsx`]).not.toContain('useRecordLayout(')
    }
  })
})

describe('readLayout', () => {
  it('takes a known saved value and falls back on anything else', () => {
    expect(readLayout({ view: 'grid' }, 'view', 'rows')).toBe('grid')
    expect(readLayout({ view: 'tiles' }, 'view', 'rows')).toBe('rows')
    expect(readLayout({ view: 3 }, 'view', 'cards')).toBe('cards')
    expect(readLayout(undefined, 'view', 'cards')).toBe('cards')
    // ფლეილისტის გასაღები სიმღერის ხედს არ ეხება
    expect(readLayout({ view: 'grid', playlist_view: 'cards' }, 'playlist_view', 'rows')).toBe('cards')
  })
})
