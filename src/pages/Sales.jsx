import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Edit, Download, Plus, Trash2, Search, RefreshCw, FileText } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { supabase, supabaseConfigError } from '../lib/supabase'
import AddSaleModal from '../components/AddSaleModal'
import EditSaleModal from '../components/EditSaleModal'
import { exportSalesToExcel } from '../utils/excelExport'
import { showError, showConfirm, showSuccess } from '../utils/alert'
import { formatKoreanCurrency } from '../utils/formatters'
import { itemSearchPatterns, summarizeItemPrices } from '../utils/itemSearch'

/** 검색 모드에서 한 번에 가져올 최대 건수 */
const SEARCH_LIMIT = 300

const toISO = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
const shiftDate = (iso, days) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toISO(d)
}
const weekdayOf = (iso) => ['일', '월', '화', '수', '목', '금', '토'][new Date(iso + 'T00:00:00').getDay()]
const won = (v) => `${(Number(v) || 0).toLocaleString('ko-KR')}원`

/**
 * 펼친 줄의 품목 — 품목 · 수량 × 단가 = 금액.
 * 표(`dgrid`)를 안에 또 두지 않는다. 모바일 카드 규칙이 안쪽 표에도 걸려
 * 이름표가 겹친다.
 */
const SaleItemsDetail = ({ sale }) => {
  const items = sale.items || []
  if (items.length === 0) return <div className="sale-items-empty">품목 정보가 없습니다</div>
  return (
    <div className="sale-items">
      {items.map((it, i) => (
        <div key={it.id || i} className="sale-item">
          <div className="sale-item-name">{it.item_name || '품목 미지정'}</div>
          <div className="sale-item-calc">
            {(Number(it.quantity) || 0).toLocaleString()} × {won(it.unit_price)}
            <b>{won(it.total_amount)}</b>
          </div>
          {it.notes && it.notes !== sale.notes && <div className="sale-item-note">{it.notes}</div>}
        </div>
      ))}
      {sale.notes && <div className="sale-item-note">메모 · {sale.notes}</div>}
    </div>
  )
}

/**
 * 품목 검색 결과.
 *
 * **맨 위가 답이다** — 거래처별 마지막 단가. 밖에서 "이거 얼마였죠?"에 답하는
 * 화면이라 이력 전체를 훑게 하면 안 된다. 단가는 0원이 아닌 마지막 값이다
 * (0원 줄은 이월·부품·교환이라 가격이 아니다 — `summarizeItemPrices`).
 */
const ItemSearchResults = ({ loading, term, summary, rows, onPickDate }) => {
  if (loading) {
    return <div className="grid-scroll" style={{ padding: '24px', color: 'var(--text-muted)' }}>불러오는 중...</div>
  }
  if (rows.length === 0) {
    return (
      <div className="grid-scroll" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
        <FileText className="w-6 h-6 mx-auto mb-1" style={{ opacity: .4 }} />
        ‘{term}’ 이(가) 들어간 품목의 매출이 없습니다 — 낱말을 줄여 보세요 (예: BF-50, 150 캡)
      </div>
    )
  }
  return (
    <div className="grid-scroll flex-1" style={{ minHeight: '320px' }}>
      <div className="item-search-head">거래처별 마지막 단가 <span>{summary.length}가지</span></div>
      <table className="dgrid">
        <thead>
          <tr>
            <th style={{ width: '190px' }}>거래처</th>
            <th>품목</th>
            <th style={{ width: '112px' }}>마지막 단가</th>
            <th style={{ width: '96px' }}>단가 날짜</th>
            <th style={{ width: '96px' }}>최근 거래</th>
            <th style={{ width: '56px' }}>건수</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((g) => (
            <tr key={g.key}>
              <td style={{ fontWeight: 600 }}>{g.clientName}</td>
              <td>{g.itemName}</td>
              <td className="num"><b>{g.price ? won(g.price) : '0원'}</b></td>
              <td className="dt">{g.priceDate || '-'}</td>
              <td className="dt">{g.lastDate}</td>
              <td className="num">{g.count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="item-search-head">이력 <span>최근 순 {rows.length}건</span></div>
      <table className="dgrid">
        <thead>
          <tr>
            <th style={{ width: '190px' }}>거래처</th>
            <th style={{ width: '104px' }}>날짜</th>
            <th>품목</th>
            <th style={{ width: '60px' }}>수량</th>
            <th style={{ width: '104px' }}>단가</th>
            <th style={{ width: '112px' }}>금액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>{r.clientName}</td>
              <td className="dt">
                <button className="rowbtn" style={{ fontFamily: 'var(--font-data)', padding: '0 4px' }}
                  onClick={() => onPickDate(r.sale_date)} title="이 날짜의 매출 보기">
                  {r.sale_date}
                </button>
              </td>
              <td>{r.item_name}{r.notes && <span style={{ color: 'var(--text-muted)' }}> · {r.notes}</span>}</td>
              <td className="num">{(Number(r.quantity) || 0).toLocaleString()}</td>
              <td className="num">{(Number(r.unit_price) || 0).toLocaleString()}</td>
              <td className="num">{(Number(r.total_amount) || 0).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const Sales = () => {
  const {
    clients,
    deleteSale,
    processGroupedSales,
    ensureSalesDetail,
    salesDetailReady
  } = useData()

  /*
   * 품목·수량·단가는 첫 화면에서 받지 않는다 (대시보드가 안 쓰기 때문에).
   * 이 화면은 품목을 보여주므로 열릴 때 마저 받는다. — DataContext 참고.
   */
  useEffect(() => { ensureSalesDetail() }, [ensureSalesDetail])

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingSale, setEditingSale] = useState(null)

  // 하루 단위로 본다. 하루 평균 15건이라 한 화면에 들어간다.
  const [viewDate, setViewDate] = useState(toISO(new Date()))
  /*
   * 고른 줄. **툴바의 '수정(F4)'이 언제나 localSales[0] — 그 날의 첫 줄을
   * 열고 있었다.** 세 번째 줄을 고치려고 눌러도 첫 줄이 열리고, 그대로
   * 저장하면 엉뚱한 매출이 바뀐다. 키 처리기보다 위에 둬야 F4가 이 값을 본다.
   */
  const [pickedId, setPickedId] = useState(null)
  const [localSales, setLocalSales] = useState([])
  const [localLoading, setLocalLoading] = useState(true)
  const picked = useMemo(() => localSales.find((r) => r.id === pickedId) || null, [localSales, pickedId])
  const [totalCount, setTotalCount] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  /*
   * 무엇으로 찾나 — 거래처 / 품목.
   * 품목 검색은 밖에서 "이거 얼마였죠?"에 답하려고 있다. 그래서 결과를 묶지 않고
   * 한 줄씩(단가가 보이게) 받고, 거래처별 마지막 단가를 맨 위에 둔다.
   */
  const [searchField, setSearchField] = useState('client')
  const [itemRows, setItemRows] = useState([])
  /*
   * 펼친 줄. **품목을 보려고 '수정'을 누르지 않아도 된다.** 예전에는 내역을
   * 보려면 수정을 눌러야 했고, 그 편집 창이 표 맨 아래에 붙어 폰에서는 한참
   * 내려가야 보였다. 폰은 입력보다 조회에 쓰는 화면이다.
   */
  const [expandedId, setExpandedId] = useState(null)
  // 하단 스트립: viewDate 앞뒤로 5일치 건수/합계
  const [strip, setStrip] = useState([])

  const isSearchMode = Boolean(searchTerm)
  const isItemSearch = isSearchMode && searchField === 'item'

  // 전체 건수 (상태줄 표시용)
  useEffect(() => {
    supabase.from('sales').select('*', { count: 'exact', head: true })
      .then(({ count }) => setTotalCount(count || 0))
  }, [])

  const mapRows = useCallback((data) => {
    const mapped = (data || []).map(sale => {
      const clientCompany = sale.clients?.company
        || clients.find(c => c.id === (sale.client_id || sale.clientId))?.company
        || '알 수 없음'
      return { ...sale, clientName: clientCompany }
    })
    return processGroupedSales(mapped)
  }, [clients, processGroupedSales])

  // 하루치 조회 — 페이지 나누지 않고 그 날 전체를 가져온다
  const fetchDay = useCallback(async (date) => {
    try {
      setLocalLoading(true)
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('sale_date', date)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })

      if (error) throw error
      setLocalSales(mapRows(data))
    } catch (error) {
      console.error('매출 데이터 로드 오류:', error)
      showError(supabaseConfigError
        ? `서버 연결 설정이 누락되었습니다 (${supabaseConfigError}). 배포 환경변수를 확인해 주세요.`
        : '매출 데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLocalLoading(false)
    }
  }, [mapRows])

  // 검색 모드 — 날짜 제한을 풀고 전 기간에서 찾는다
  const fetchSearch = useCallback(async (term) => {
    try {
      setLocalLoading(true)
      const { data, error } = await supabase
        .from('sales')
        .select('*, clients!inner(company)')
        .ilike('clients.company', `%${term}%`)
        .order('sale_date', { ascending: false })
        .order('id', { ascending: true })
        .limit(SEARCH_LIMIT)

      if (error) throw error
      setLocalSales(mapRows(data))
    } catch (error) {
      console.error('매출 검색 오류:', error)
      showError('검색 중 오류가 발생했습니다.')
    } finally {
      setLocalLoading(false)
    }
  }, [mapRows])

  /*
   * 품목으로 찾기 — 전 기간, 한 줄씩. 거래처별로 묶지 않는다(단가가 줄마다 다르다).
   * 낱말마다 따로 건다: `150 캡`이 `150캡`을, `BF 50`이 `BF-50V1H`를 찾는다.
   * 휴지통에 든 매출(지운 거래처에 딸린 것)은 뺀다 — 가격을 물을 때 답이 아니다.
   */
  const fetchItemSearch = useCallback(async (term) => {
    const patterns = itemSearchPatterns(term)
    if (patterns.length === 0) { setItemRows([]); setLocalLoading(false); return }
    try {
      setLocalLoading(true)
      let q = supabase
        .from('sales')
        .select('id, sale_date, client_id, item_name, quantity, unit_price, total_amount, notes, clients(company)')
      patterns.forEach((p) => { q = q.ilike('item_name', p) })
      const { data, error } = await q
        .is('deleted_at', null)
        .order('sale_date', { ascending: false })
        .order('id', { ascending: true })
        .limit(SEARCH_LIMIT)

      if (error) throw error
      setItemRows((data || []).map((r) => ({
        ...r,
        clientName: r.clients?.company
          || clients.find((c) => c.id === r.client_id)?.company
          || '알 수 없음',
      })))
    } catch (error) {
      console.error('품목 검색 오류:', error)
      showError('검색 중 오류가 발생했습니다.')
    } finally {
      setLocalLoading(false)
    }
  }, [clients])

  // 하단 5일 스트립 (viewDate 기준 앞뒤 2일)
  const fetchStrip = useCallback(async (center) => {
    const days = [-2, -1, 0, 1, 2].map(n => shiftDate(center, n))
    const { data, error } = await supabase
      .from('sales')
      .select('sale_date, total_amount')
      .gte('sale_date', days[0])
      .lte('sale_date', days[4])
    if (error) return
    const agg = {}
    ;(data || []).forEach(s => {
      const e = agg[s.sale_date] || (agg[s.sale_date] = { rows: 0, amt: 0 })
      e.rows++
      e.amt += Number(s.total_amount) || 0
    })
    setStrip(days.map(d => ({ date: d, rows: agg[d]?.rows || 0, amt: agg[d]?.amt || 0 })))
  }, [])

  const fetchData = useCallback(() => {
    if (isItemSearch) fetchItemSearch(searchTerm)
    else if (isSearchMode) fetchSearch(searchTerm)
    else { fetchDay(viewDate); fetchStrip(viewDate) }
  }, [isItemSearch, isSearchMode, searchTerm, viewDate, fetchItemSearch, fetchSearch, fetchDay, fetchStrip])

  /**
   * 매출이 있는 이전/다음 날로 이동한다.
   * 일요일·공휴일은 매출이 없어 그냥 하루씩 넘기면 빈 화면을 자주 만난다.
   * (최근 30일 중 7일이 빈 날)
   */
  const jumpDay = useCallback(async (direction) => {
    const q = supabase.from('sales').select('sale_date')
    const { data, error } = direction > 0
      ? await q.gt('sale_date', viewDate).order('sale_date', { ascending: true }).limit(1)
      : await q.lt('sale_date', viewDate).order('sale_date', { ascending: false }).limit(1)

    if (error || !data || data.length === 0) {
      showError(direction > 0 ? '이후에 매출이 있는 날이 없습니다.' : '이전에 매출이 있는 날이 없습니다.')
      return
    }
    setViewDate(data[0].sale_date)
  }, [viewDate])

  const goToday = () => setViewDate(toISO(new Date()))

  // Initial & Search/Page Change Load
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 단축키 — 데스크톱 업무 프로그램처럼 손이 키보드에 머무르게 한다
  useEffect(() => {
    const onKey = (e) => {
      // 입력 중에는 F키만 받는다 (글자 입력을 방해하지 않기 위해)
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)

      if (e.key === 'F2') { e.preventDefault(); setIsAddModalOpen(true) }
      else if (e.key === 'F5') { e.preventDefault(); fetchData() }
      else if (e.key === 'Escape' && !typing) { setEditingSale(null); setIsAddModalOpen(false) }
      else if (e.key === 'F4') {
        e.preventDefault()
        // 고른 줄이 없으면 아무 일도 하지 않는다. 첫 줄을 여는 것보다 낫다 —
        // 엉뚱한 줄이 열린 줄 모르고 저장하면 다른 매출이 바뀐다.
        if (picked) setEditingSale(picked)
      }
      // 날짜 이동은 입력 중이 아닐 때만 (날짜칸에서 방향키를 쓰기 때문)
      else if (e.key === 'ArrowLeft' && !typing && !isSearchMode) { e.preventDefault(); jumpDay(-1) }
      else if (e.key === 'ArrowRight' && !typing && !isSearchMode) { e.preventDefault(); jumpDay(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fetchData, jumpDay, isSearchMode, picked])


  /* 날짜나 검색이 바뀌면 고른 줄을 푼다 — 다른 날의 줄이 골라진 채로 남으면
     '수정'이 화면에 없는 줄을 연다. */
  useEffect(() => { setPickedId(null); setExpandedId(null) }, [viewDate, searchTerm, searchField])

  /* 줄을 누르면 고르고, 품목을 펼친다(다시 누르면 접는다). */
  const handleRowClick = (id) => {
    setPickedId(id)
    setExpandedId((cur) => (cur === id ? null : id))
  }

  const handleSearchChange = (e) => {
    setSearchInput(e.target.value)
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') setSearchTerm(searchInput)
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearchTerm('')
  }

  const handleRefresh = () => {
    fetchData()
  }

  const handleEdit = (sale) => {
    setEditingSale(sale)
  }

  const handleDelete = async (sale) => {
    const confirmed = await showConfirm(
      '이 매출 내역이 영구적으로 삭제됩니다.',
      '정말 삭제하시겠습니까? (연결된 제품 정보는 유지됩니다)',
      '삭제',
      '취소'
    )

    if (confirmed) {
      try {
        await deleteSale(sale.id)
        await showSuccess('매출 내역이 삭제되었습니다.')
        fetchData()
      } catch (error) {
        console.error('매출 삭제 오류:', error)
        await showError('삭제 중 오류가 발생했습니다.')
      }
    }
  }

  // 선택된 행 (키보드 이동용)
  const selectedId = editingSale?.id || pickedId || null
  const pageSum = isItemSearch
    ? itemRows.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0)
    : localSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0)
  const priceSummary = useMemo(() => (isItemSearch ? summarizeItemPrices(itemRows) : []), [isItemSearch, itemRows])
  // 한 행은 '같은 거래처·같은 날짜'의 매출을 묶은 것이라, 행 수와 원본 건수가 다르다.
  const rawCount = localSales.reduce((n, s) => n + (s.items?.length || 1), 0)

  return (
    <div className="bg-oem-bg-app p-2 md:p-4">
      <div className="max-w-[1600px] mx-auto">
        <div className="win flex flex-col">

          {/* 타이틀바 */}
          <div className="win-title">
            <span className="flex items-baseline gap-3">
              매출 관리
              <span className="meta">
                전체 {totalCount.toLocaleString()}건 ·{' '}
                {isSearchMode ? `검색: ${searchTerm}` : `${viewDate} (${weekdayOf(viewDate)})`}
              </span>
            </span>
          </div>

          {/* 툴바 */}
          <div className="toolbar">
            <button className="tb-btn primary" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> 신규 <kbd>F2</kbd>
            </button>
            <button className="tb-btn" disabled={!picked}
              title={picked ? `${picked.clientName} 수정` : '고칠 줄을 먼저 누르세요'}
              onClick={() => picked && handleEdit(picked)}>
              <Edit className="w-3.5 h-3.5" /> 수정 <kbd>F4</kbd>
            </button>
            <span className="tb-sep" />
            <button className="tb-btn" onClick={handleRefresh}>
              <RefreshCw className={`w-3.5 h-3.5 ${localLoading ? 'animate-spin' : ''}`} /> 새로고침 <kbd>F5</kbd>
            </button>
            <span className="tb-sep" />
            <button className="tb-btn" onClick={() => exportSalesToExcel(localSales)}>
              <Download className="w-3.5 h-3.5" /> 엑셀 내리기
            </button>
          </div>

          {/* 날짜 이동 / 검색 */}
          <div className="filterbar">
            {!isSearchMode && (
              <>
                <button className="tb-btn" onClick={() => jumpDay(-1)} title="이전 매출일 (←)">◀ 이전</button>
                <input
                  type="date"
                  value={viewDate}
                  onChange={(e) => e.target.value && setViewDate(e.target.value)}
                  style={{ width: '150px' }}
                  aria-label="조회 날짜"
                />
                <span style={{ color: 'var(--text-muted)' }}>({weekdayOf(viewDate)})</span>
                <button className="tb-btn" onClick={() => jumpDay(1)} title="다음 매출일 (→)">다음 ▶</button>
                <button className="tb-btn" onClick={goToday}>오늘</button>
                <span className="tb-sep" />
              </>
            )}

            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value)}
              aria-label="검색 기준"
              style={{ width: '88px' }}
            >
              <option value="client">거래처</option>
              <option value="item">품목</option>
            </select>
            <input
              id="sales-q"
              type="search"
              enterKeyHint="search"
              placeholder={searchField === 'item' ? '품목명 (예: BF-50, 150 캡)' : '거래처명 — 전 기간'}
              value={searchInput}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              style={{ width: '160px' }}
            />
            <button className="tb-btn" onClick={() => setSearchTerm(searchInput)}>
              <Search className="w-3.5 h-3.5" /> 조회 <kbd>Enter</kbd>
            </button>
            {isSearchMode && (
              <button className="tb-btn" onClick={clearSearch}>날짜 보기로</button>
            )}

            <span className="flex-1" />
            <span>
              {isItemSearch ? '찾은 매출 합계' : isSearchMode ? '검색 합계' : '이 날 합계'}{' '}
              <b style={{ fontFamily: 'var(--font-data)', fontSize: '14px', color: 'var(--text-primary)' }}>
                {formatKoreanCurrency(pageSum)}
              </b>
            </span>
          </div>

          {/* 품목 검색 — 거래처별 마지막 단가가 먼저, 줄별 이력은 그 아래 */}
          {isItemSearch && (
            <ItemSearchResults
              loading={localLoading}
              term={searchTerm}
              summary={priceSummary}
              rows={itemRows}
              onPickDate={(d) => { clearSearch(); setSearchField('client'); setViewDate(d) }}
            />
          )}

          {/* 데이터 그리드 — 폰에서도 같은 화면을 쓰고, 좁으면 가로로 민다 */}
          {!isItemSearch && (
          <div className="grid-scroll flex-1" style={{ minHeight: '320px' }}>
            <table className="dgrid">
              <thead>
                <tr>
                  <th style={{ width: '48px' }}>번호</th>
                  <th style={{ width: '96px' }}>날짜</th>
                  <th style={{ width: '190px' }}>거래처</th>
                  <th>품목</th>
                  <th style={{ width: '60px' }}>수량</th>
                  <th style={{ width: '104px' }}>금액</th>
                  <th style={{ width: '86px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {localLoading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan="7" style={{ color: 'var(--text-muted)' }}>
                        {i === 0 ? '불러오는 중...' : ' '}
                      </td>
                    </tr>
                  ))
                ) : localSales.length > 0 ? (
                  localSales.map((sale, index) => {
                    const qty = sale.items?.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0) || 0
                    const open = expandedId === sale.id
                    return (
                      <React.Fragment key={sale.id}>
                      <tr
                        className={`row-expandable ${selectedId === sale.id ? 'is-selected' : ''} ${open ? 'is-open' : ''}`}
                        onClick={() => handleRowClick(sale.id)}
                        onDoubleClick={() => handleEdit(sale)}
                        aria-expanded={open}
                      >
                        <td className="seq">{index + 1}</td>
                        <td className="dt">
                          {isSearchMode && sale.date ? (
                            <button
                              className="rowbtn"
                              style={{ fontFamily: 'var(--font-data)', padding: '0 4px' }}
                              onClick={() => { clearSearch(); setViewDate(sale.date.split('T')[0]) }}
                              title="이 날짜로 이동"
                            >
                              {sale.date.split('T')[0]}
                            </button>
                          ) : (sale.date ? sale.date.split('T')[0] : '-')}
                        </td>
                        <td style={{ fontWeight: 600 }}>{sale.clientName}</td>
                        <td style={{ maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          title={sale.displayItemName || ''}>
                          {sale.displayItemName || '품목 미지정'}
                          {sale.notes && <span style={{ color: 'var(--text-muted)' }}> · {sale.notes}</span>}
                        </td>
                        <td className="num">{qty.toLocaleString()}</td>
                        <td className="num">{(sale.totalAmount || 0).toLocaleString()}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button className="rowbtn" onClick={(e) => { e.stopPropagation(); handleEdit(sale) }}>수정</button>
                          <button className="rowbtn danger" onClick={(e) => { e.stopPropagation(); handleDelete(sale) }}>삭제</button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="row-detail">
                          <td colSpan="7">
                            <SaleItemsDetail sale={sale} />
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      <FileText className="w-6 h-6 mx-auto mb-1" style={{ opacity: .4 }} />
                      {isSearchMode
                        ? '검색 결과가 없습니다'
                        : `${viewDate} (${weekdayOf(viewDate)}) 매출이 없습니다 — ← → 로 매출이 있는 날로 이동합니다`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}

          {/* 편집 영역 — 목록을 가리지 않고 화면에 붙는다 */}
          <AddSaleModal
            docked
            isOpen={isAddModalOpen}
            onClose={() => { setIsAddModalOpen(false); fetchData() }}
          />
          <EditSaleModal
            docked
            isOpen={editingSale !== null}
            onClose={() => { setEditingSale(null); fetchData() }}
            saleGroup={editingSale}
          />

          {/* 하단 5일 스트립 — 앞뒤로 어느 날에 매출이 있는지 한눈에 */}
          {!isSearchMode && (
            <div style={{
              borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)',
              display: 'flex', gap: '6px', padding: '6px 8px', overflowX: 'auto'
            }}>
              {strip.map(d => {
                const active = d.date === viewDate
                return (
                  <button
                    key={d.date}
                    onClick={() => setViewDate(d.date)}
                    style={{
                      flex: '1 1 0', minWidth: '112px', textAlign: 'left', cursor: 'pointer',
                      padding: '5px 8px', borderRadius: 'var(--radius)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'var(--accent-subtle)' : 'var(--bg-card)',
                      color: d.rows === 0 ? 'var(--text-muted)' : 'var(--text-primary)'
                    }}
                  >
                    <div style={{ fontFamily: 'var(--font-data)', fontSize: '12px', fontWeight: active ? 700 : 400 }}>
                      {d.date.slice(5)} ({weekdayOf(d.date)})
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {d.rows === 0 ? '매출 없음' : `${d.rows}건 · ${formatKoreanCurrency(d.amt)}`}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* 상태줄 */}
          <div className="statusbar">
            <span><span className="dot" style={{ background: localLoading ? 'var(--warning)' : 'var(--success)' }} />
              {localLoading ? '조회 중' : '준비됨'}</span>
            <span>
              {isItemSearch
                ? `품목 검색 ${itemRows.length}건 · 거래처·품목 ${priceSummary.length}가지 (최대 ${SEARCH_LIMIT}건)`
                : isSearchMode
                ? `검색 결과 ${localSales.length}행 (매출 ${rawCount}건, 최대 ${SEARCH_LIMIT}건)`
                : `${viewDate} — 표시 ${localSales.length}행 (매출 ${rawCount}건)`}
              {' / '}전체 {totalCount.toLocaleString()}건
            </span>
            {searchTerm && <span>필터: {searchTerm}</span>}
            <span className="flex-1" />
            <span className="hint">
              <kbd>←</kbd><kbd>→</kbd> 날짜 이동 · <kbd>F2</kbd> 신규 · <kbd>F5</kbd> 새로고침 · <kbd>Esc</kbd> 닫기 · 행을 누르면 품목 펼침 · 더블클릭으로 수정
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Sales
