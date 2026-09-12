import { describe, expect, it } from 'vitest'
import { embedCommand, embedEventFrom, embedHandshake, isAllowedEmbed, playableEmbedSrc } from './embed'

/* ============================================================
   `lib/embed.ts` — ბმულის allowlist და სამი პლეერის მოვლენების დეკოდერი.

   ⚠️ ეს ფაილი **უსაფრთხოებისაა**: `isAllowedEmbed()` წყვეტს, რა ჩაიდგმება
   `<iframe>`-ად. `tsc` მას ვერ ამოწმებს — ტიპი ორივე მხარეს `string`-ია.
   ============================================================ */

describe('isAllowedEmbed', () => {
  it('იღებს მხოლოდ სამივე ცნობილ ჰოსტს https-ზე', () => {
    expect(isAllowedEmbed('https://www.youtube-nocookie.com/embed/abc')).toBe(true)
    expect(isAllowedEmbed('https://player.vimeo.com/video/123')).toBe(true)
    expect(isAllowedEmbed('https://geo.dailymotion.com/player.html?video=x')).toBe(true)
  })

  it('http-ს არ იღებს — ჩადგმული ფრეიმი გვერდს აჭრელებს', () => {
    expect(isAllowedEmbed('http://player.vimeo.com/video/123')).toBe(false)
  })

  it('უცხო ჰოსტს არ იღებს, მათ შორის ქვედომენს და მსგავს სახელს', () => {
    expect(isAllowedEmbed('https://evil.com/embed/abc')).toBe(false)
    // ⚠️ ზუსტი ჰოსტი და არა „მთავრდება ამით": ეს ის შემთხვევაა, სადაც
    // `endsWith` შემოწმება უცხო დომენს შემოუშვებდა
    expect(isAllowedEmbed('https://player.vimeo.com.evil.com/video/1')).toBe(false)
    expect(isAllowedEmbed('https://youtube-nocookie.com/embed/abc')).toBe(false)
  })

  it('ნაგვს და ცარიელს false-ით პასუხობს და არ ტყდება', () => {
    expect(isAllowedEmbed(null)).toBe(false)
    expect(isAllowedEmbed(undefined)).toBe(false)
    expect(isAllowedEmbed('')).toBe(false)
    expect(isAllowedEmbed('არა ბმული')).toBe(false)
    expect(isAllowedEmbed('javascript:alert(1)')).toBe(false)
  })
})

describe('playableEmbedSrc', () => {
  it('YouTube-ს `enablejsapi`-სა და `origin`-ს უმატებს', () => {
    // ⚠️ ორივე სავალდებულოა: მათ გარეშე ფრეიმი postMessage-ს არც აგზავნის
    // და არც იღებს, ე.ი. ავტომატური გადასვლა ჩუმად ითიშება
    const src = playableEmbedSrc('https://www.youtube-nocookie.com/embed/abc', 'youtube')
    const url = new URL(src as string)

    expect(url.searchParams.get('enablejsapi')).toBe('1')
    expect(url.searchParams.get('autoplay')).toBe('1')
    expect(url.searchParams.get('origin')).toBe(window.location.origin)
  })

  it('არადაშვებულ ბმულს `null`-ით აბრუნებს და არა „როგორც არის"', () => {
    expect(playableEmbedSrc('https://evil.com/embed/abc', 'youtube')).toBeNull()
    expect(playableEmbedSrc(null, 'youtube')).toBeNull()
  })

  it('ბმულის საკუთარ პარამეტრებს ინახავს', () => {
    const src = playableEmbedSrc('https://player.vimeo.com/video/9?h=secret', 'vimeo')

    expect(new URL(src as string).searchParams.get('h')).toBe('secret')
  })
})

describe('embedEventFrom', () => {
  it('YouTube-ის რიცხვით მდგომარეობას შლის', () => {
    expect(embedEventFrom({ event: 'infoDelivery', info: { playerState: 0 } })).toBe('ended')
    expect(embedEventFrom({ event: 'infoDelivery', info: { playerState: 1 } })).toBe('playing')
    expect(embedEventFrom({ event: 'infoDelivery', info: { playerState: 2 } })).toBe('paused')
  })

  it('Vimeo-სა და Dailymotion-ის სახელიან მოვლენებს ერთსა და იმავეზე აჰყავს', () => {
    expect(embedEventFrom({ event: 'ended' })).toBe('ended')
    expect(embedEventFrom({ event: 'video_end' })).toBe('ended')
    expect(embedEventFrom({ event: 'play' })).toBe('playing')
    expect(embedEventFrom({ event: 'pause' })).toBe('paused')
  })

  it('JSON სტრიქონსაც კითხულობს — YouTube ზუსტად ასე აგზავნის', () => {
    expect(embedEventFrom(JSON.stringify({ event: 'infoDelivery', info: { playerState: 0 } }))).toBe('ended')
  })

  it('უცნობს `null`-ით პასუხობს — `timeupdate` წამში ათჯერ მოდის', () => {
    expect(embedEventFrom({ event: 'timeupdate' })).toBeNull()
    expect(embedEventFrom(null)).toBeNull()
    expect(embedEventFrom('არა json')).toBeNull()
    expect(embedEventFrom({ event: 'infoDelivery', info: { playerState: 'ended' } })).toBeNull()
  })
})

describe('embedHandshake / embedCommand', () => {
  it('ყოველ პლატფორმას თავისი ხელის ჩამორთმევა აქვს', () => {
    expect(embedHandshake('youtube').length).toBeGreaterThan(0)
    expect(embedHandshake('vimeo').length).toBeGreaterThan(0)
  })

  it('`other`-ს დასაკრავი არაფერი აქვს', () => {
    expect(embedHandshake('other')).toEqual([])
    expect(embedCommand('other', 'play')).toBeNull()
  })
})
