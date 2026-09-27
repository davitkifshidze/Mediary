import { describe, expect, it } from 'vitest'
import type { GameLink } from '@/api/games'
import { becomesVideo, storeFromUrl, withUrl } from './gameLinks'

/* `lib/gameLinks.ts` — თამაშის ბმულის მაღაზია ჰოსტიდან (Tasks §22.3) */

describe('storeFromUrl', () => {
  it('ცნობს მაღაზიას ქვედომენითაც', () => {
    expect(storeFromUrl('https://store.steampowered.com/app/1')).toBe('steam')
    expect(storeFromUrl('https://www.gog.com/game/x')).toBe('gog')
    expect(storeFromUrl('https://store.epicgames.com/p/x')).toBe('epic')
    expect(storeFromUrl('https://store.playstation.com/x')).toBe('psn')
  })

  it('მსგავსი სახელი და დაუმთავრებელი მისამართი მაღაზია არ არის', () => {
    expect(storeFromUrl('https://notsteampowered.com/app/1')).toBeNull()
    expect(storeFromUrl('https://example.com')).toBeNull()
    expect(storeFromUrl('store.steampo')).toBeNull()
  })
})

describe('withUrl', () => {
  it('ნაგულისხმევ „სხვას" მაღაზიად აქცევს', () => {
    expect(withUrl({ url: '', kind: 'other' }, 'https://store.steampowered.com/app/1')).toEqual({
      url: 'https://store.steampowered.com/app/1',
      kind: 'store',
      store: 'steam',
    })
  })

  /** ⚠️ „DLC Steam-ზე" DLC რჩება — ორი ღერძის აზრი სწორედ ესაა */
  it('ცხად არჩევანს არ ცვლის', () => {
    expect(withUrl({ url: '', kind: 'dlc' }, 'https://store.steampowered.com/app/1').kind).toBe('dlc')
    expect(withUrl({ url: '', kind: 'store', store: 'gog' }, 'https://store.steampowered.com/app/1').store).toBe('gog')
  })

  it('მაღაზიის რიგს ცარიელ მაღაზიას უვსებს', () => {
    expect(withUrl<GameLink>({ url: '', kind: 'store' }, 'https://www.xbox.com/games/x').store).toBe('xbox')
  })
})

describe('becomesVideo', () => {
  it('YouTube-ის ტრეილერი და Vimeo-ს გზამკვლევი ვიდეოდ იქცევა', () => {
    expect(becomesVideo({ url: 'https://www.youtube.com/watch?v=abc', kind: 'trailer' })).toBe(true)
    expect(becomesVideo({ url: 'https://youtu.be/abc', kind: 'trailer' })).toBe(true)
    expect(becomesVideo({ url: 'https://vimeo.com/123', kind: 'guide' })).toBe(true)
  })

  it('სხვა ჰოსტის ტრეილერი და სხვა ტიპი ბმულად რჩება', () => {
    expect(becomesVideo({ url: 'https://store.steampowered.com/app/1', kind: 'trailer' })).toBe(false)
    expect(becomesVideo({ url: 'https://www.youtube.com/watch?v=abc', kind: 'info' })).toBe(false)
  })
})
