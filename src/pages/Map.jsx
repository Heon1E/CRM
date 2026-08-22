import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { MapPin, Filter, RefreshCw, Calendar, Navigation, Loader, X } from 'lucide-react'
import { showSuccess, showError } from '../utils/alert'
import { loadKakaoMaps, geocodeAddress, kakaoKey } from '../utils/kakaoMap'
import { todayYmd } from '../utils/day'

/**
 * 거래처 지도 — 카카오
 *
 * 구글에서 옮겨 왔다. 이유는 `src/utils/kakaoMap.js` 머리말에 적었다
 * (구글·네이버는 무료 사용량이 있어도 **결제 수단 등록**을 요구한다).
 * 저장된 좌표는 그대로 쓴다 — 둘 다 WGS84다.
 */

const HQ_ADDRESS = '경기도 용인시 처인구 백암면 삼백로 367-20'
const DEFAULT_CENTER = { lat: 37.1623, lng: 127.3688 }   // 용인 근처

const Map = () => {
    const mapBoxRef = useRef(null)
    const mapRef = useRef(null)
    const overlaysRef = useRef([])

    const [maps, setMaps] = useState(null)
    const [sdkError, setSdkError] = useState(null)
    const [clients, setClients] = useState([])
    const [statusFilter, setStatusFilter] = useState('all')
    const [selectedClient, setSelectedClient] = useState(null)
    const [hqLocation, setHqLocation] = useState(null)
    const [isSyncing, setIsSyncing] = useState(false)
    const [userLocation, setUserLocation] = useState(null)
    const [locationLoading, setLocationLoading] = useState(false)

    /* ── SDK ──────────────────────────────────────────────────────────── */
    useEffect(() => {
        let alive = true
        loadKakaoMaps()
            .then((m) => { if (alive) setMaps(m) })
            .catch((e) => { if (alive) setSdkError(e.message) })
        return () => { alive = false }
    }, [])

    /* ── 데이터 ───────────────────────────────────────────────────────── */
    const fetchClients = useCallback(async () => {
        try {
            const { data: clientsData, error } = await supabase
                .from('clients').select('*').is('deleted_at', null)
            if (error) throw error

            // 앞으로의 약속(다음 조치일)을 거래처에 붙인다 — 지도에서 바로 보이게
            const today = todayYmd()
            const { data: acts } = await supabase
                .from('activities')
                .select('client_id, next_action_date, next_action_detail')
                .gte('next_action_date', today)
                .order('next_action_date', { ascending: true })

            setClients((clientsData || []).map((c) => {
                const next = (acts || []).find((a) => a.client_id === c.id)
                return {
                    ...c,
                    nextSchedule: next
                        ? { date: next.next_action_date, detail: next.next_action_detail }
                        : null,
                }
            }))
        } catch (e) {
            console.error('거래처 데이터 로드 오류:', e)
        }
    }, [])

    useEffect(() => { fetchClients() }, [fetchClients])

    const validClients = useMemo(
        () => clients.filter((c) => c.latitude && c.longitude), [clients])

    const filteredClients = useMemo(
        () => (statusFilter === 'all' ? validClients : validClients.filter((c) => c.status === statusFilter)),
        [validClients, statusFilter])

    /* ── 지도 만들기 ──────────────────────────────────────────────────── */
    useEffect(() => {
        if (!maps || !mapBoxRef.current || mapRef.current) return
        mapRef.current = new maps.Map(mapBoxRef.current, {
            center: new maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
            level: 12,
        })
    }, [maps])

    // 본사 위치
    useEffect(() => {
        if (!maps || hqLocation) return
        geocodeAddress(maps, HQ_ADDRESS).then((p) => { if (p) setHqLocation(p) })
    }, [maps, hqLocation])

    /* ── 마커 ─────────────────────────────────────────────────────────── */
    //
    // 카카오의 기본 마커는 큰 압정 모양이라 31곳이 겹치면 지도가 안 보인다.
    // 매출 규모에 따라 크기가 달라지는 **점**으로 그린다 (구글에서 쓰던 방식과 같다).
    // CustomOverlay를 쓰면 이미지 파일 없이 CSS로 그릴 수 있다.
    useEffect(() => {
        const map = mapRef.current
        if (!maps || !map) return

        overlaysRef.current.forEach((o) => o.setMap(null))
        overlaysRef.current = []

        const dot = (color, px, ring) => {
            const el = document.createElement('div')
            el.style.cssText = `width:${px}px;height:${px}px;border-radius:50%;background:${color};`
                + `border:${ring}px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer;`
            return el
        }

        const add = (pos, el, z) => {
            const ov = new maps.CustomOverlay({
                position: new maps.LatLng(pos.lat, pos.lng),
                content: el, yAnchor: 0.5, xAnchor: 0.5, zIndex: z,
            })
            ov.setMap(map)
            overlaysRef.current.push(ov)
        }

        if (hqLocation) {
            const el = dot('#111827', 16, 3)
            el.title = '본사'
            add(hqLocation, el, 9999)
        }
        if (userLocation) {
            const el = dot('#2563eb', 14, 3)
            el.title = '내 위치'
            add(userLocation, el, 10000)
        }

        filteredClients.forEach((c) => {
            const rev = Number(c.last_year_revenue || 0)
            const px = rev > 100_000_000 ? 18 : rev > 50_000_000 ? 15 : rev > 10_000_000 ? 12 : 9
            const el = dot(c.status === '휴면' ? '#9ca3af' : '#d90000', px, 2)
            el.title = c.company
            el.addEventListener('click', () => setSelectedClient(c))
            add({ lat: c.latitude, lng: c.longitude }, el, Math.floor(rev / 10000))
        })

        // 보이는 범위를 마커에 맞춘다
        if (filteredClients.length || hqLocation) {
            const b = new maps.LatLngBounds()
            if (hqLocation) b.extend(new maps.LatLng(hqLocation.lat, hqLocation.lng))
            filteredClients.forEach((c) => b.extend(new maps.LatLng(c.latitude, c.longitude)))
            map.setBounds(b)
        }
    }, [maps, filteredClients, hqLocation, userLocation])

    /* ── 주소 → 좌표 채우기 ───────────────────────────────────────────── */
    const handleSyncAddresses = async () => {
        if (!maps) return
        const todo = clients.filter((c) => c.address && (!c.latitude || !c.longitude))
        if (todo.length === 0) { await showSuccess('좌표를 채울 거래처가 없습니다.'); return }

        setIsSyncing(true)
        let done = 0, failed = 0
        for (const c of todo) {
            const p = await geocodeAddress(maps, c.address)
            if (p) {
                const { error } = await supabase.from('clients')
                    .update({ latitude: p.lat, longitude: p.lng }).eq('id', c.id)
                if (!error) done++; else failed++
            } else {
                failed++
            }
            // 하루 10만 건이라 여유가 크지만, 몰아치면 순간 제한에 걸린다
            await new Promise((r) => setTimeout(r, 120))
        }
        await fetchClients()
        setIsSyncing(false)
        await showSuccess(`좌표 ${done}곳을 채웠습니다.${failed ? ` (${failed}곳은 주소로 찾지 못했습니다)` : ''}`)
    }

    /* ── 내 위치 ──────────────────────────────────────────────────────── */
    const handleGetCurrentLocation = () => {
        if (!navigator.geolocation) { showError('이 브라우저는 위치 서비스를 지원하지 않습니다.'); return }
        setLocationLoading(true)
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                setUserLocation(p)
                if (mapRef.current && maps) {
                    mapRef.current.setCenter(new maps.LatLng(p.lat, p.lng))
                    mapRef.current.setLevel(6)
                }
                setLocationLoading(false)
                showSuccess('현재 위치를 찾았습니다.')
            },
            (err) => {
                setLocationLoading(false)
                showError(err.code === err.PERMISSION_DENIED
                    ? '위치 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.'
                    : '위치를 가져올 수 없습니다.')
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
    }

    /* ── 키가 없을 때 ─────────────────────────────────────────────────── */
    if (!kakaoKey() || sdkError === 'NO_KEY') {
        return (
            <div className="win" style={{ margin: 12 }}>
                <div className="win-title"><span>거래처 지도</span></div>
                <div style={{ padding: 16, fontSize: 13, lineHeight: 1.95, color: 'var(--text-secondary)' }}>
                    <b style={{ color: 'var(--text-primary)' }}>카카오 지도 키가 없습니다.</b><br />
                    카드 등록 없이 무료로 받을 수 있습니다 (지도 30만 건/일, 주소→좌표 10만 건/일).
                    <ol style={{ margin: '8px 0 10px', paddingLeft: 18 }}>
                        <li><b>developers.kakao.com</b> 로그인 → 내 애플리케이션 → 애플리케이션 추가</li>
                        <li>앱 설정 → <b>플랫폼</b> → Web 등록:
                            <code> http://localhost:5173 </code>와 배포 주소를 모두 넣습니다</li>
                        <li>앱 키에서 <b>JavaScript 키</b>를 복사</li>
                        <li><code>.env</code>에 <code>VITE_KAKAO_MAP_KEY=복사한값</code> 추가 후 dev 서버 재시작</li>
                        <li>배포에도 쓰려면 Vercel 환경변수에 같은 이름으로 추가</li>
                    </ol>
                    좌표는 이미 <b>{validClients.length}곳</b>에 저장돼 있어 키만 넣으면 바로 보입니다.
                </div>
            </div>
        )
    }

    if (sdkError) {
        return (
            <div className="win" style={{ margin: 12 }}>
                <div className="win-title"><span>거래처 지도</span></div>
                <p style={{ padding: 16, margin: 0, fontSize: 13, lineHeight: 1.9, color: 'var(--text-secondary)' }}>
                    카카오 지도를 불러오지 못했습니다.<br />
                    카카오 개발자 사이트의 <b>플랫폼 → Web</b>에 지금 주소
                    (<code>{window.location.origin}</code>)가 등록돼 있는지 확인해 주세요.
                    등록되지 않은 주소에서는 키가 거부됩니다.
                </p>
            </div>
        )
    }

    const statusOptions = ['all', '신규', '거래중', '휴면']

    return (
        <div className="p-3 md:p-6 bg-oem-bg-app text-oem-text-primary mt-[50px] min-h-screen">
            <div className="max-w-[1600px] mx-auto flex flex-col h-[calc(100vh-120px)] space-y-4">

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-oem-border pb-4">
                    <div>
                        <h1 className="text-xl font-bold text-oem-blue tracking-tight">거래처 지도</h1>
                        <p className="text-xs text-oem-text-secondary mt-1">
                            {validClients.length > 0
                                ? <>주소 좌표가 등록된 거래처 <b className="text-oem-blue">{validClients.length}곳</b>을 지도에 표시합니다.</>
                                : <>아직 좌표가 등록된 거래처가 없습니다. 아래 <b>주소 좌표 채우기</b>를 누르면 주소로 찾아 넣습니다.</>}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={handleSyncAddresses} disabled={isSyncing || !maps}
                            className="oem-btn-secondary h-8 py-1.5 flex items-center gap-2">
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                            {isSyncing ? '좌표 받는 중…' : '주소 좌표 채우기'}
                        </button>

                        <div className="flex items-center gap-2 bg-white border border-oem-border rounded-oem px-3 py-1 h-8">
                            <Filter className="w-3.5 h-3.5 text-oem-text-secondary" />
                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                                className="bg-transparent text-xs font-bold text-oem-text-primary outline-none">
                                {statusOptions.map((s) => (
                                    <option key={s} value={s}>{s === 'all' ? '전체 상태' : s}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="oem-panel bg-white shadow-sm overflow-hidden flex-1 flex flex-col border-l-4 border-l-oem-blue">
                    <div className="oem-panel-header shrink-0">
                        <span>지도</span>
                        <div className="flex items-center gap-3 text-xs font-bold text-oem-text-secondary">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-black" /> 본사</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#d90000]" /> 거래처</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#9ca3af]" /> 휴면</span>
                        </div>
                    </div>

                    <div className="flex-1 relative m-1 rounded-oem overflow-hidden border border-oem-border shadow-inner">
                        <button onClick={handleGetCurrentLocation} disabled={locationLoading}
                            className="absolute top-3 right-3 z-10 bg-white p-3 rounded-full shadow-lg hover:bg-gray-50 border border-gray-200 disabled:opacity-50"
                            title="현재 위치 표시" aria-label="현재 위치로 이동">
                            {locationLoading
                                ? <Loader className="w-5 h-5 animate-spin text-oem-blue" />
                                : <Navigation className="w-5 h-5 text-oem-blue" />}
                        </button>

                        <div ref={mapBoxRef} style={{ width: '100%', height: '100%' }} />

                        {!maps && (
                            <div className="absolute inset-0 flex items-center justify-center text-oem-text-secondary text-sm">
                                지도를 불러오는 중…
                            </div>
                        )}

                        {/*
                          카카오의 InfoWindow는 HTML 문자열을 넣어야 해서 거래처 이름에
                          따옴표나 꺾쇠가 있으면 깨진다. React 카드로 띄운다.
                        */}
                        {selectedClient && (
                            <div className="absolute left-3 bottom-3 z-10 w-[280px] bg-white rounded-oem shadow-xl border border-oem-border p-3">
                                <div className="flex items-start justify-between gap-2 border-b border-oem-border pb-2 mb-2">
                                    <h3 className="text-sm font-bold text-oem-blue leading-tight">{selectedClient.company}</h3>
                                    <button className="rowbtn" onClick={() => setSelectedClient(null)} title="닫기">
                                        <X size={13} />
                                    </button>
                                </div>

                                <p className="text-xs text-oem-text-primary mb-2 flex items-start gap-1">
                                    <MapPin className="w-3.5 h-3.5 text-oem-blue shrink-0 mt-0.5" />
                                    {selectedClient.address || '주소 없음'}
                                </p>

                                {selectedClient.nextSchedule ? (
                                    <div className="bg-oem-bg-header/40 p-2.5 rounded-oem border border-oem-border border-l-4 border-l-oem-blue">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <Calendar className="w-3.5 h-3.5 text-oem-blue" />
                                            <span className="text-xs font-bold text-oem-blue">다음에 하기로 한 것</span>
                                        </div>
                                        <p className="text-xs font-bold text-oem-text-primary leading-snug">
                                            {selectedClient.nextSchedule.detail || '내용 없음'}
                                        </p>
                                        <div className="text-xs text-oem-text-secondary mt-1">
                                            {selectedClient.nextSchedule.date}
                                        </div>
                                    </div>
                                ) : (
                                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-oem-bg-header text-oem-text-secondary border border-oem-border">
                                        {selectedClient.status || '상태 없음'}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Map
