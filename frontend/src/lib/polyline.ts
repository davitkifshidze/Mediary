/* ============================================================
   **Polyline-ის გაშლა** (Tasks §30) — Google-ის encoded polyline ალგორითმი,
   precision 5: ზუსტად ის, რასაც OSRM `geometries=polyline`-ით აბრუნებს და
   რაც `place_routes.geometry`-ში ინახება.

   ⚠️ **გაშლა კლიენტშია და არა სერვერზე**: სერვერი სტრიქონს როგორც არის
   ინახავს (კომპაქტურია — ათასწერტილიანი მარშრუტი რამდენიმე KB-ია), Leaflet-ს
   კი `[lat, lng]` წყვილები უნდა. ბიბლიოთეკა არ ემატება — ალგორითმი ოცი ხაზია.
   ============================================================ */

export type LatLng = [number, number]

export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision
  const points: LatLng[] = []
  let index = 0
  let lat = 0
  let lng = 0

  const next = () => {
    let result = 0
    let shift = 0
    let byte: number

    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20 && index <= encoded.length)

    return result & 1 ? ~(result >> 1) : result >> 1
  }

  while (index < encoded.length) {
    lat += next()
    lng += next()
    points.push([lat / factor, lng / factor])
  }

  return points
}
