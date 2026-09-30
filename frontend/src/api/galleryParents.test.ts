import { describe, expect, it } from 'vitest'
import type { ModuleInfo } from '@/api/account'
import { galleryParentsOf } from '@/api/gallery'
import { domainModule } from '@/api/publicProfile'

/* ============================================================
   **პირადი მოდული გალერეის მშობელია (Tasks §37.4).**

   ⚠️ ერთი სია ორ ადგილს კვებავს — ბიბლიოთეკის ჭრილის ტაბებს და ფოტოს
   გადატანის ფანჯარას. აქ შეცდომა ჩუმია: პირადი მოდული ერთგან გამოჩნდება,
   მეორეგან — არა, ე.ი. ფოტოს ჩანაწერზე გადაიტან და მერე ვერ იპოვი.
   ============================================================ */

const mod = (key: string, extra: Partial<ModuleInfo> = {}) => ({ key, ...extra }) as ModuleInfo

describe('galleryParentsOf', () => {
  it('keeps the base order and appends the personal modules', () => {
    const enabled = [mod('c5-recipes', { is_custom: true }), mod('game'), mod('movie'), mod('song')]

    expect(galleryParentsOf(enabled).map((p) => p.key)).toEqual(['movie', 'game', 'c5-recipes'])
  })

  it('draws only what is enabled', () => {
    // სიმღერა გალერეის მშობელი აღარ არის (Tasks §11); გამორთული მოდული სიაში არ ხვდება
    expect(galleryParentsOf([mod('song'), mod('note')])).toEqual([])
  })

  it('recognises a personal module by its key as well as by the flag', () => {
    expect(galleryParentsOf([mod('c12-gadgets')]).map((p) => p.key)).toEqual(['c12-gadgets'])
  })
})

describe('domainModule', () => {
  it('maps a personal module onto itself and a playlist onto songs', () => {
    expect(domainModule('c5-recipes')).toBe('c5-recipes')
    expect(domainModule('playlist')).toBe('song')
    expect(domainModule('gallery_album')).toBe('gallery')
  })
})
