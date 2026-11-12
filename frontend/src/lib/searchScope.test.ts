import { beforeEach, describe, expect, it } from 'vitest'
import { readScope, rememberScope, scopeOf, toggleScope } from '@/lib/searchScope'

describe('ძებნის არეალი', () => {
  beforeEach(() => window.localStorage.clear())

  it('არჩევანი ბრაუზერს ახსოვს', () => {
    expect(readScope()).toEqual([])

    rememberScope(['movie', 'series'])

    expect(readScope()).toEqual(['movie', 'series'])
  })

  it('გაფუჭებული ჩანაწერი ცარიელ არეალად იკითხება', () => {
    window.localStorage.setItem('search-scope.domains', '{"movie":true')
    expect(readScope()).toEqual([])

    window.localStorage.setItem('search-scope.domains', '["movie", 7, null]')
    expect(readScope()).toEqual(['movie'])
  })

  it('მისამართი დამახსოვრებულზე ძლიერია', () => {
    expect(scopeOf('book', ['movie'], ['movie', 'book'])).toEqual(['book'])
    expect(scopeOf(null, ['movie'], ['movie', 'book'])).toEqual(['movie'])
    expect(scopeOf('movie,book', [], ['movie', 'book', 'song'])).toEqual(['movie', 'book'])
  })

  it('უცნობი დომენი იჭრება, სიის მოსვლამდე კი — არა', () => {
    expect(scopeOf('movie,game', [], ['movie', 'book'])).toEqual(['movie'])
    expect(scopeOf('movie,game', [], null)).toEqual(['movie', 'game'])
  })

  it('ყველა ცალ-ცალკე მონიშნული „ყველაა"', () => {
    expect(scopeOf('movie,book', [], ['movie', 'book'])).toEqual([])
  })

  it('ჩიპი ირთვება და ითიშება', () => {
    expect(toggleScope([], 'movie')).toEqual(['movie'])
    expect(toggleScope(['movie'], 'book')).toEqual(['movie', 'book'])
    expect(toggleScope(['movie', 'book'], 'movie')).toEqual(['book'])
    expect(toggleScope(['movie'], 'movie')).toEqual([])
  })
})
