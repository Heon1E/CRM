import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api'
import { supabase } from '../lib/supabase'
import { MapPin, Filter, RefreshCw, Calendar, Navigation, Loader } from 'lucide-react'
import { showSuccess, showError } from '../utils/alert'


const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const HQ_ADDRESS = '경기도 용인시 처인구 백암면 삼백로 367-20'

const containerStyle = {
    width: '100%',
    height: '100%'
}

const defaultCenter = {
    lat: 37.1623, // Approximate center near Yongin
    lng: 127.3688
}

const Map = () => {
    const [map, setMap] = useState(null)
    const [clients, setClients] = useState([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState('all')
    const [selectedClient, setSelectedClient] = useState(null)
    const [hqLocation, setHqLocation] = useState(null)
    const [isSyncing, setIsSyncing] = useState(false)
    const [userLocation, setUserLocation] = useState(null)
    const [locationLoading, setLocationLoading] = useState(false)
    const [locationError, setLocationError] = useState(null)


    // 구글이 인증·결제 문제로 지도를 못 그릴 때 부르는 콜백. 안 잡으면 회색 상자만 남는다.
    /*
     * **구글 지도는 실패해도 조용하다.**
     *
     * 결제(Billing)가 꺼져 있으면 `loadError`가 나지 않는다. 대신 구글이
     * 자기 영어 대화상자("This page can't load Google Maps correctly")를
     * 지도 위에 덮거나, 아예 빈 회색 상자만 남긴다. 화면에는 '31곳을 지도에
     * 표시합니다'라고 적혀 있으니 우리 프로그램이 고장 난 것처럼 보인다.
     *
     * 두 가지를 다 살핀다 — 구글이 부르는 `gm_authFailure`(index.html에서
     * 앱보다 먼저 걸어 둔다. 그만큼 일찍 부른다)와, 구글이 덮어 놓은 문구.
     * 지도를 감추지는 않는다. 흐릿하게라도 뜨면 쓸 수 있기 때문이다.
     */
    const [authFailed, setAuthFailed] = useState(() => !!window.__gmAuthFailed)
    useEffect(() => {
        if (authFailed) return
        /*
         * 구글의 경고 문구는 **간헐적으로만** 뜬다(같은 상태에서 떴다 안 떴다 한다).
         * 그래서 문구로 판단하면 놓친다. **지도가 실제로 그려졌는지**를 본다 —
         * 구글 지도가 정상이면 `.gm-style` 요소가 반드시 생긴다.
         * 8초가 지나도 없으면 못 그린 것이다.
         */
        const t = setInterval(() => {
            if (window.__gmAuthFailed) { setAuthFailed(true); clearInterval(t) }
        }, 500)
        const late = setTimeout(() => {
            if (!document.querySelector('.gm-style')) setAuthFailed(true)
            clearInterval(t)
        }, 8000)
        return () => { clearInterval(t); clearTimeout(late) }
    }, [authFailed])

    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: GOOGLE_API_KEY
    })

    const fetchClients = useCallback(async () => {
        try {
            setLoading(true)

            // 1. Fetch Clients
            const { data: clientsData, error: clientsError } = await supabase
                .from('clients')
                .select('*')

            if (clientsError) throw clientsError

            // 2. Fetch Future Activities (Next Schedules)
            const today = new Date().toISOString().split('T')[0]
            const { data: activitiesData, error: activitiesError } = await supabase
                .from('activities')
                .select('client_id, next_action_date, next_action_detail')
                .gte('next_action_date', today)
                .order('next_action_date', { ascending: true })

            if (activitiesError) throw activitiesError

            // 3. Map activities to clients (earliest future activity first)
            const clientsWithSchedules = (clientsData || []).map(client => {
                const nextActivity = (activitiesData || []).find(a => a.client_id === client.id)
                return {
                    ...client,
                    nextSchedule: nextActivity ? {
                        date: nextActivity.next_action_date,
                        detail: nextActivity.next_action_detail
                    } : null
                }
            })

            setClients(clientsWithSchedules)
        } catch (error) {
            console.error('거래처 데이터 로드 오류:', error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchClients()
    }, [fetchClients])

    // Find HQ Location
    useEffect(() => {
        if (isLoaded && window.google) {
            const geocoder = new window.google.maps.Geocoder()
            geocoder.geocode({ address: HQ_ADDRESS }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    const loc = results[0].geometry.location
                    setHqLocation({ lat: loc.lat(), lng: loc.lng() })
                }
            })
        }
    }, [isLoaded])

    // Batch Geocode Missing Coords
    const handleSyncAddresses = async () => {
        if (!isLoaded || !window.google) return

        setIsSyncing(true)
        const clientsToUpdate = clients.filter(c => c.address && (!c.latitude || !c.longitude))

        if (clientsToUpdate.length === 0) {
            alert('좌표 업데이트가 필요한 거래처가 없습니다.')
            setIsSyncing(false)
            return
        }

        const geocoder = new window.google.maps.Geocoder()
        let updatedCount = 0

        for (const client of clientsToUpdate) {
            await new Promise((resolve) => {
                geocoder.geocode({ address: client.address }, async (results, status) => {
                    if (status === 'OK' && results[0]) {
                        const loc = results[0].geometry.location
                        const { error } = await supabase
                            .from('clients')
                            .update({
                                latitude: loc.lat(),
                                longitude: loc.lng()
                            })
                            .eq('id', client.id)

                        if (!error) updatedCount++
                    }
                    // Google API Rate Limit prevention
                    setTimeout(resolve, 300)
                })
            })
        }

        await fetchClients()
        setIsSyncing(false)
        alert(`${updatedCount}개의 거래처 좌표가 업데이트되었습니다.`)
    }

    // Get Current Location
    const handleGetCurrentLocation = () => {
        if (!navigator.geolocation) {
            setLocationError('이 브라우저는 위치 서비스를 지원하지 않습니다')
            showError('이 브라우저는 위치 서비스를 지원하지 않습니다')
            return
        }

        setLocationLoading(true)
        setLocationError(null)

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords
                const newLocation = { lat: latitude, lng: longitude }
                setUserLocation(newLocation)

                // Center map on user location
                if (map) {
                    map.panTo(newLocation)
                    map.setZoom(14) // Zoom in to show nearby clients
                }

                setLocationLoading(false)
                showSuccess('현재 위치를 찾았습니다')
            },
            (error) => {
                setLocationLoading(false)
                let errorMessage = '위치를 가져올 수 없습니다'

                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = '위치 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해주세요.'
                        break
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = '위치 정보를 사용할 수 없습니다'
                        break
                    case error.TIMEOUT:
                        errorMessage = '위치 요청 시간이 초과되었습니다'
                        break
                }

                setLocationError(errorMessage)
                showError(errorMessage)
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        )
    }


    const onLoad = useCallback(function callback(map) {
        setMap(map)
    }, [])

    const onUnmount = useCallback(function callback(map) {
        setMap(null)
    }, [])

    // 마커 필터링 (Only show clients with valid coords)
    const validClients = useMemo(() => {
        return clients.filter(c => c.latitude && c.longitude)
    }, [clients])

    const filteredClients = useMemo(() => {
        return statusFilter === 'all'
            ? validClients
            : validClients.filter(client => client.status === statusFilter)
    }, [validClients, statusFilter])

    // 지도 범위 조정
    useEffect(() => {
        if (map && isLoaded) {
            const bounds = new window.google.maps.LatLngBounds()

            // Add HQ
            if (hqLocation) {
                bounds.extend(hqLocation)
            }

            // Add Clients
            if (filteredClients.length > 0) {
                filteredClients.forEach(client => {
                    bounds.extend({ lat: client.latitude, lng: client.longitude })
                })
            }

            if (!bounds.isEmpty()) {
                map.fitBounds(bounds)
            }
        }
    }, [map, filteredClients, hqLocation, isLoaded])

    const statusOptions = ['all', '신규', '거래중', '휴면']

    /*
     * **구글 지도는 실패해도 조용하다.** 결제가 꺼져 있거나 키가 막히면
     * `loadError`가 나지 않고 **빈 회색 상자**만 남는다. 화면에는 '31곳을
     * 지도에 표시합니다'라고 적혀 있으니 고장으로 보인다.
     * 구글은 그럴 때 `window.gm_authFailure()`를 부른다. 그걸 잡아 이유를 적는다.
     * (실제로 겪은 것: BillingNotEnabledMapError — 구글 클라우드 결제 미설정)
     */
    if (loadError) return <div className="win" style={{ margin: 12 }}>
        <div className="win-title"><span>거래처 지도</span></div>
        <p style={{ padding: 16, margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            지도를 불러오지 못했습니다. 인터넷 연결과 구글 지도 API 키를 확인하세요.
        </p>
    </div>
    if (!isLoaded) return <div className="p-10 text-gray-500">지도를 불러오는 중...</div>

    return (
        <div className="p-3 md:p-6 bg-oem-bg-app font-['Noto_Sans_KR',sans-serif] text-oem-text-primary mt-[50px] min-h-screen">
            <div className="max-w-[1600px] mx-auto flex flex-col h-[calc(100vh-120px)] space-y-4">

                {/* Page Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-oem-border pb-4">
                    <div>
                        <h1 className="text-xl font-bold text-oem-blue tracking-tight flex items-center gap-2">
                            거래처 지도
                        </h1>
                        <p className="text-[11px] text-oem-text-secondary mt-1 overflow-hidden whitespace-nowrap overflow-ellipsis">
                            {validClients.length > 0
                                ? <>주소 좌표가 등록된 거래처 <b className="text-oem-blue">{validClients.length}곳</b>을 지도에 표시합니다.</>
                                : <>아직 좌표가 등록된 거래처가 없습니다. 거래처 상세에서 주소를 넣으면 지도에 나타납니다.</>}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={handleSyncAddresses}
                            disabled={isSyncing}
                            className="oem-btn-secondary h-8 py-1.5 flex items-center gap-2"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                            {isSyncing ? '좌표 받는 중…' : '주소 좌표 채우기'}
                        </button>

                        <div className="flex items-center gap-2 bg-white border border-oem-border rounded-oem px-3 py-1 h-8">
                            <Filter className="w-3.5 h-3.5 text-oem-text-secondary" />
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="bg-transparent text-[11px] font-bold text-oem-text-primary outline-none uppercase"
                            >
                                {statusOptions.map(status => (
                                    <option key={status} value={status}>
                                        {status === 'all' ? '전체 상태' : status}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Map Context Utility */}
                <div className="oem-panel bg-white shadow-sm overflow-hidden flex-1 flex flex-col border-l-4 border-l-oem-blue">
                    <div className="oem-panel-header shrink-0">
                        <span>지도</span>
                        <div className="flex items-center gap-3 text-[10px] uppercase font-bold text-oem-text-secondary">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-black"></span> 본사</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#d90000]"></span> 거래처</span>
                        </div>
                    </div>

                    {/*
                      구글이 결제 문제로 자기 영어 대화상자를 지도 위에 덮는다.
                      우리 프로그램이 고장 난 것으로 읽히므로 이유를 한국어로 적는다.
                      지도는 그대로 둔다 — 흐릿하게라도 뜨면 쓸 수 있다.
                    */}
                    {authFailed && (
                        <div style={{ margin: '4px 4px 0', padding: '10px 12px', borderRadius: 'var(--radius)',
                                      background: '#fff8e6', border: '1px solid #f0d9a0', fontSize: 12.5, lineHeight: 1.8 }}>
                            <b>구글 지도 결제가 켜져 있지 않습니다.</b> 지도 위에 뜨는 영어 안내
                            (&ldquo;This page can&rsquo;t load Google Maps correctly&rdquo;)는 구글이 띄우는 것입니다.
                            <br />
                            console.cloud.google.com → 결제(Billing) → 결제 계정 연결.
                            지도는 무료 사용량이 있지만 결제 수단 등록은 있어야 합니다.
                            좌표는 이미 <b>{validClients.length}곳</b>에 저장돼 있어 켜는 즉시 보입니다.
                        </div>
                    )}

                    <div className="flex-1 relative m-1 rounded-oem overflow-hidden border border-oem-border shadow-inner">
                        {/* Current Location Button */}
                        <button
                            onClick={handleGetCurrentLocation}
                            disabled={locationLoading}
                            className="absolute top-3 right-3 md:top-4 md:right-4 z-10 bg-white p-2 md:p-3 rounded-full shadow-lg hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
                            aria-label="현재 위치로 이동"
                            title="현재 위치 표시"
                        >
                            {locationLoading ? (
                                <Loader className="w-4 h-4 md:w-5 md:h-5 animate-spin text-blue-600" />
                            ) : (
                                <Navigation className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
                            )}
                        </button>

                        <GoogleMap
                            mapContainerStyle={containerStyle}
                            center={defaultCenter}
                            zoom={10}
                            onLoad={onLoad}
                            onUnmount={onUnmount}
                            options={{
                                streetViewControl: false,
                                mapTypeControl: false,
                                gestureHandling: 'greedy',
                                styles: [
                                    { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#444444' }] },
                                    { featureType: 'landscape', elementType: 'all', stylers: [{ color: '#f2f2f2' }] },
                                    { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },
                                    { featureType: 'road', elementType: 'all', stylers: [{ saturation: -100 }, { lightness: 45 }] },
                                    { featureType: 'water', elementType: 'all', stylers: [{ color: '#0076ce' }, { visibility: 'on' }, { opacity: 0.1 }] }
                                ]
                            }}
                        >
                            {/* HQ Marker */}
                            {hqLocation && (
                                <Marker
                                    position={hqLocation}
                                    title="CORE_OPERATIONS_CENTER"
                                    icon={{
                                        path: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
                                        fillColor: "#000000", // Changed to Black for contrast
                                        fillOpacity: 1,
                                        strokeColor: "#FFFFFF",
                                        strokeWeight: 2,
                                        scale: 2.2,
                                        anchor: new window.google.maps.Point(12, 12),
                                    }}
                                    zIndex={999}
                                />
                            )}

                            {/* User Location Marker */}
                            {userLocation && (
                                <Marker
                                    position={userLocation}
                                    title="내 위치"
                                    icon={{
                                        path: window.google.maps.SymbolPath.CIRCLE,
                                        scale: 10,
                                        fillColor: '#4285F4',
                                        fillOpacity: 1,
                                        strokeColor: '#FFFFFF',
                                        strokeWeight: 3,
                                    }}
                                    zIndex={1000}
                                />
                            )}

                            {/* Client Markers */}
                            {filteredClients.map(client => {
                                const revenue = Number(client.last_year_revenue || 0);
                                // 크기 대폭 축소 (기존 거대 핀 -> 심플한 점)
                                let scale = 5; // 기본 크기 (픽셀 단위 유사)
                                if (revenue > 10000000) scale = 8;
                                else if (revenue > 5000000) scale = 6.5;
                                else if (revenue > 1000000) scale = 5.5;

                                return (
                                    <Marker
                                        key={client.id}
                                        position={{ lat: client.latitude, lng: client.longitude }}
                                        onClick={() => setSelectedClient(client)}
                                        icon={{
                                            // 단순한 원형(Dot) 마커로 변경
                                            path: window.google.maps.SymbolPath.CIRCLE,
                                            fillColor: client.status === '휴면' ? '#9CA3AF' : '#d90000', // Oracle Red for visibility
                                            fillOpacity: 0.9,
                                            strokeColor: '#FFFFFF',
                                            strokeWeight: 1.5,
                                            scale: scale,
                                        }}
                                        zIndex={Math.floor(revenue / 10000)}
                                    />
                                );
                            })}

                            {/* InfoWindow */}
                            {selectedClient && (
                                <InfoWindow
                                    position={{ lat: selectedClient.latitude, lng: selectedClient.longitude }}
                                    onCloseClick={() => setSelectedClient(null)}
                                >
                                    <div className="p-1 min-w-[240px] font-['Noto_Sans_KR',sans-serif]">
                                        <div className="border-b border-oem-border pb-1.5 mb-2">
                                            <h3 className="text-sm font-bold text-oem-blue leading-tight truncate">{selectedClient.company}</h3>
                                            <p className="text-[10px] text-oem-text-secondary mt-0.5 tracking-tighter uppercase font-bold">Client Metadata Record</p>
                                        </div>

                                        <p className="text-[11px] text-oem-text-primary mb-3 font-medium flex items-start gap-1">
                                            <MapPin className="w-3 h-3 text-oem-blue shrink-0 mt-0.5" />
                                            {selectedClient.address}
                                        </p>

                                        {selectedClient.nextSchedule ? (
                                            <div className="bg-oem-bg-header/40 p-2.5 rounded-oem border border-oem-border border-l-4 border-l-oem-blue">
                                                <div className="flex items-center gap-1.5 mb-1.5">
                                                    <Calendar className="w-3 h-3 text-oem-blue" />
                                                    <p className="text-[9px] font-bold text-oem-blue uppercase tracking-widest">
                                                        Next Engagement Scheduled
                                                    </p>
                                                </div>
                                                <p className="text-[12px] font-bold text-oem-text-primary leading-tight mb-1">
                                                    {selectedClient.nextSchedule.detail || 'Context Pending'}
                                                </p>
                                                <div className="text-[10px] text-oem-text-secondary font-bold italic">
                                                    {selectedClient.nextSchedule.date}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between pt-1">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${selectedClient.status === '매출'
                                                    ? 'bg-oem-green/10 text-oem-green border-oem-green/20'
                                                    : 'bg-oem-bg-header text-oem-text-secondary border-oem-border'
                                                    }`}>
                                                    {selectedClient.status?.toUpperCase() || 'UNKNOWN'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </InfoWindow>
                            )}
                        </GoogleMap>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Map
