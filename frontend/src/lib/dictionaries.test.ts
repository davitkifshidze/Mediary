import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

import bookmarks from '@/pages/BookmarksPage.tsx?raw'
import customModule from '@/pages/CustomModulePage.tsx?raw'
import videos from '@/pages/VideosPage.tsx?raw'
import places from '@/pages/PlacesPage.tsx?raw'
import songs from '@/pages/SongsPage.tsx?raw'
import movieForm from '@/pages/MovieFormPage.tsx?raw'
import courseForm from '@/components/CourseForm.tsx?raw'
import noteForm from '@/components/NoteForm.tsx?raw'
import bookForm from '@/components/BookForm.tsx?raw'
import boardGameForm from '@/components/BoardGameForm.tsx?raw'
import gameForm from '@/components/GameForm.tsx?raw'
import personalUpload from '@/components/personal/PersonalUploadDialog.tsx?raw'
import personalMove from '@/components/personal/PersonalMoveDialog.tsx?raw'
import albumPicker from '@/components/gallery/AlbumPicker.tsx?raw'

/* ============================================================
   **ფორმის „+" იმავე ფანჯარას ხსნის, რასაც კლასიფიკატორების გვერდი.**

   ⚠️ მოწმდება რეესტრი: `useDictionaryAdd` ლექსიკონის **საკუთარ** `dialog`-ს
   აბრუნებს (იგივე ფუნქცია, რასაც `/dictionaries` იძახებს — ე.ი. იგივე
   endpoint და იგივე ქეში, ახალი მნიშვნელობა იმ გვერდზეც ჩანს) და შენახულ
   ერთეულს ფორმის მნიშვნელობად აქცევს: ჩვეულებრივ `id`, სტატუსზე — გასაღები.
   ყოველი ლექსიკონის ფანჯარა `onSaved`-ს იღებს — თორემ „შენახვისთანავე
   არჩეულია" ერთ-ერთზე ჩუმად არ იმუშავებდა.

   ⚠️ ფორმები სათითაოდ წყაროდან მოწმდება: თითოს ველი საერთო კომპონენტზე დგას
   და სწორ ლექსიკონს ეკითხება; ხელით დაწერილი „+" (`setNewCategory`) აღარსად
   რჩება.
   ============================================================ */

const modules = vi.hoisted(() => ({
  off: new Set<string>(),
  custom: [] as unknown[],
}))

vi.mock('@/lib/modules', () => ({
  useModules: () => ({ customModules: modules.custom, has: (key: string) => !modules.off.has(key) }),
}))

const { DICTIONARIES, customDictionaries, useDictionaryAdd, useStatusAdd } = await import('./dictionaries')

type Saved = (saved: Record<string, unknown>) => void
const propsOf = (node: unknown) => (node as ReactElement<{ onClose: () => void; onSaved: Saved }>).props

describe('useDictionaryAdd', () => {
  it('opens the dictionary’s own dialog and hands the saved id to the form', () => {
    const def = DICTIONARIES.find((d) => d.key === 'course-categories')!
    const close = vi.fn()
    const pick = vi.fn()

    const node = useDictionaryAdd('course-categories')!(close, pick) as ReactElement
    const pageNode = def.dialog(null, close) as ReactElement

    // იგივე კომპონენტი, რასაც კლასიფიკატორების გვერდი ხსნის — ახალი ერთეულისთვის
    expect(node.type).toBe(pageNode.type)
    expect((node.props as { category: unknown }).category).toBeNull()

    propsOf(node).onSaved({ id: 7, name_ka: 'ახალი' })
    expect(pick).toHaveBeenCalledWith('7')

    propsOf(node).onClose()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('hands a status over by its key — the forms store the key, not the id', () => {
    const pick = vi.fn()
    const node = useStatusAdd('bookmark')!(() => {}, pick)

    propsOf(node).onSaved({ id: 31, key: 'later' })
    expect(pick).toHaveBeenCalledWith('later')
    expect((propsOf(node) as unknown as { domain: string }).domain).toBe('bookmark')
  })

  it('offers nothing when the module is off or the dictionary is unknown', () => {
    modules.off.add('place')
    expect(useDictionaryAdd('place-categories')).toBeUndefined()
    modules.off.clear()

    expect(useDictionaryAdd('place-categories')).toBeTypeOf('function')
    expect(useDictionaryAdd('no-such-dictionary')).toBeUndefined()
    expect(useDictionaryAdd(null)).toBeUndefined()
    expect(useStatusAdd(null)).toBeUndefined()
  })

  it('finds the dictionaries of a private module', () => {
    modules.custom = [
      { key: 'c1-recipes', route_base: '/c/c1-recipes', is_custom: true, definition: { classification: 'category', statuses: 'default' } },
    ]
    const keys = customDictionaries(modules.custom as never).map((d) => d.key)
    expect(keys).toEqual(['c1-recipes-statuses', 'c1-recipes-categories'])

    const pick = vi.fn()
    propsOf(useDictionaryAdd('c1-recipes-categories')!(() => {}, pick)).onSaved({ id: 4 })
    propsOf(useStatusAdd('c1-recipes' as never)!(() => {}, pick)).onSaved({ id: 9, key: 'done' })
    expect(pick.mock.calls).toEqual([['4'], ['done']])
    modules.custom = []
  })

  it('every dictionary dialog reports what it saved', () => {
    const custom = customDictionaries([
      { key: 'c1-x', route_base: '/c/c1-x', is_custom: true, definition: { classification: 'genre', statuses: 'default' } },
    ] as never)

    for (const def of [...DICTIONARIES, ...custom]) {
      const onSaved = vi.fn()
      expect(propsOf(def.dialog(null, () => {}, onSaved)).onSaved, def.key).toBe(onSaved)
    }
  })
})

describe('the forms use the shared add', () => {
  const FORMS: [name: string, source: string, expected: string[]][] = [
    ['bookmark', bookmarks, ["useDictionaryAdd('bookmark-categories')", "useStatusAdd('bookmark')", 'dialog={addCategory}', 'dialog={addStatus}']],
    ['private module', customModule, ['useDictionaryAdd(`${module.key}-categories`)', 'useStatusAdd(moduleKey)', 'dialog={addCategory}', 'dialog={addStatus}']],
    ['note', noteForm, ["useDictionaryAdd('note-categories')", "useStatusAdd('note')", 'dialog={addCategory}', 'dialog={addStatus}']],
    ['video', videos, ["useDictionaryAdd('video-types')", "useStatusAdd('video')", 'dialog={addType}', 'dialog={addStatus}', 'dialog={addCourse}', '<CourseForm']],
    ['course', courseForm, ["useDictionaryAdd('course-categories')", 'dialog={addCategory}']],
    ['place', places, ["useDictionaryAdd('place-categories')", 'dialog={addCategory}']],
    ['movie · series · anime', movieForm, ['useInlineAdd(useStatusAdd(type)', '<AddChip onClick={statusAdd.open}', '{statusAdd.node}']],
    ['song', songs, ["useInlineAdd(useDictionaryAdd('song-genres')", '<AddChip onClick={genreAdd.open}', '<PlaylistDialog playlist={null}', '<AddButton label={t(\'playlists.add\')}']],
    ['game', gameForm, ["useInlineAdd(useDictionaryAdd('game-genres')", '<AddChip onClick={genreAdd.open}']],
    ['book', bookForm, ["useDictionaryAdd('book-genres')", 'dialog={addGenre}']],
    ['board game', boardGameForm, ["useDictionaryAdd('board-game-genres')", 'dialog={addGenre}']],
    ['personal upload', personalUpload, ['dialog={addPerson}', 'dialog={addAlbum(']],
    ['personal move', personalMove, ['dialog={addPerson}', 'dialog={addAlbum(']],
    ['gallery album picker', albumPicker, ["<AddChip", "label={t('gallery.albumNew')}"]],
  ]

  it.each(FORMS)('%s', (_name, source, expected) => {
    for (const piece of expected) expect(source).toContain(piece)
  })

  it('no form keeps a hand-written “new value” dialog state', () => {
    for (const [name, source] of FORMS) {
      expect(source, name).not.toMatch(/\bsetNew(Category|Genre|Type|Status)\(/)
    }
  })
})
