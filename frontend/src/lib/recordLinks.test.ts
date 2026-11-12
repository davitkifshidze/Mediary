import { describe, expect, it } from 'vitest'
import { recordListPath, recordOpenPath } from '@/lib/recordLinks'

/* ============================================================
   **ჩანაწერის მისამართი მისსავე მოდულში** — გალერეის ბარათის „ჩანაწერის გახსნა" და
   „მოდულში ჩვენება", ვიდეოს წყაროს ბმული.

   ⚠️ მოწმდება სამივე წესი: საკუთარი გვერდი (ფილმი, მსახიობი), id-ით გახსნა (ბუკმარკი,
   კურსი, ვიდეო, პირადი მოდული) და სათაურის ძებნა იქ, სადაც პირდაპირი ბმული არ არსებობს.
   ============================================================ */

describe('recordOpenPath', () => {
  it('opens media on its own page and an actor on the actor page', () => {
    expect(recordOpenPath({ kind: 'movie', id: 12, title: 'Dune' }, '/movies')).toBe('/movies/12')
    expect(recordOpenPath({ kind: 'actor', id: 5, title: 'Zendaya' }, undefined)).toBe('/actors/5')
  })

  it('opens by id where the page reads ?open=', () => {
    expect(recordOpenPath({ kind: 'bookmark', id: 32, title: 'Tokyo House' }, '/bookmarks')).toBe('/bookmarks?open=32')
    expect(recordOpenPath({ kind: 'course', id: 14, title: 'Laravel' }, '/courses')).toBe('/courses?open=14')
    expect(recordOpenPath({ kind: 'c5-recipes', id: 3, title: 'Soup' }, '/m/recipes')).toBe('/m/recipes?open=3')
  })

  it('falls back to the title search and gives up without a route or a title', () => {
    expect(recordOpenPath({ kind: 'place', id: 1, title: 'ტოკიო ჰაუსი' }, '/places')).toBe(`/places?q=${encodeURIComponent('ტოკიო ჰაუსი')}`)
    expect(recordOpenPath({ kind: 'place', id: 1, title: null }, '/places')).toBeNull()
    expect(recordOpenPath({ kind: 'movie', id: 12, title: 'Dune' }, undefined)).toBeNull()
  })
})

describe('recordListPath', () => {
  it('narrows the module list to the record by its title', () => {
    expect(recordListPath({ kind: 'movie', id: 12, title: 'Dune' }, '/movies')).toBe('/movies?q=Dune')
    expect(recordListPath({ kind: 'actor', id: 5, title: 'Zendaya' }, '/x')).toBeNull()
    expect(recordListPath({ kind: 'book', id: 2, title: null }, '/books')).toBeNull()
  })
})
