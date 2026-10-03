import { describe, expect, it } from 'vitest'
import { decodePolyline } from '@/lib/polyline'

/* Tasks §30 — Google-ის საცნობარო მაგალითი (precision 5) და ცარიელი სტრიქონი */
describe('decodePolyline', () => {
  it('decodes the reference example', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ])
  })

  it('returns nothing for an empty string', () => {
    expect(decodePolyline('')).toEqual([])
  })
})
