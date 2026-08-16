/**
 * 카카오 지도 SDK 불러오기
 *
 * **구글 지도를 카카오로 바꾼 이유는 돈이다.**
 * 구글 지도는 무료 사용량이 있어도 **결제 수단 등록이 있어야** 켜진다
 * (안 하면 `BillingNotEnabledMapError`로 빈 회색 상자만 남는다).
 * 네이버(NCP)도 콘솔 가입 시 결제 수단을 요구한다.
 *
 * 카카오는 **첫 번째 앱에 무료 쿼터가 그냥 붙는다** — 카드 없이 쓴다.
 *   지도 SDK        300,000건/일
 *   주소 → 좌표     100,000건/일
 * 거래처가 1,150곳이고 지도는 가끔 여는 화면이라 근처에도 못 간다.
 *
 * 덤으로 **한국 주소를 더 잘 찾는다.** 이 앱은 이미 카카오 우편번호
 * 서비스(`postcode.v2.js`)를 쓰고 있어 계정도 같은 것을 쓴다.
 *
 * 좌표는 그대로 쓴다 — 구글로 받아 둔 31곳의 위경도는 WGS84이고
 * 카카오도 같은 기준이라 옮길 것이 없다.
 */

const SDK_ID = 'kakao-maps-sdk'

let loading = null

/** `.env`에 `VITE_KAKAO_MAP_KEY`가 있는가 */
export const kakaoKey = () => import.meta.env.VITE_KAKAO_MAP_KEY || ''

/**
 * SDK를 한 번만 불러온다. 이미 있으면 그대로 돌려준다.
 * @returns `window.kakao.maps`
 */
export const loadKakaoMaps = () => {
    if (window.kakao?.maps?.services) return Promise.resolve(window.kakao.maps)
    if (loading) return loading

    const key = kakaoKey()
    if (!key) return Promise.reject(new Error('NO_KEY'))

    loading = new Promise((resolve, reject) => {
        const done = () => {
            // autoload=false 로 받았으므로 직접 켠다. 이걸 빼면 kakao.maps가 비어 있다.
            window.kakao.maps.load(() => resolve(window.kakao.maps))
        }

        const already = document.getElementById(SDK_ID)
        if (already) { already.addEventListener('load', done); return }

        const el = document.createElement('script')
        el.id = SDK_ID
        el.async = true
        // `libraries=services` 가 있어야 주소→좌표(Geocoder)를 쓸 수 있다
        el.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&libraries=services&autoload=false`
        el.onload = done
        el.onerror = () => reject(new Error('LOAD_FAILED'))
        document.head.appendChild(el)
    })
    return loading
}

/**
 * 주소 한 건을 좌표로. 못 찾으면 `null`.
 *
 * 카카오는 도로명·지번을 다 받지만 **건물명이 섞이면 못 찾는다**
 * (`아이앤디 경기도 용인시…` 같은 형태). 주소만 넘길 것.
 */
export const geocodeAddress = (maps, address) =>
    new Promise((resolve) => {
        if (!address) { resolve(null); return }
        new maps.services.Geocoder().addressSearch(String(address).trim(), (result, status) => {
            if (status === maps.services.Status.OK && result?.[0]) {
                resolve({ lat: Number(result[0].y), lng: Number(result[0].x) })
            } else {
                resolve(null)
            }
        })
    })
