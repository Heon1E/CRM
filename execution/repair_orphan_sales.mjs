/**
 * 거래처가 비어있는 매출('알수없음') 복구 도구
 *
 * 배경:
 *   매출 엑셀 일괄등록에서 신규 업체가 섞여 있을 때 거래처가 자동 생성되지 않아,
 *   매출이 client_id 없이 저장되고 목록에 '알수없음'으로 표시되는 버그가 있었다.
 *   저장 당시 업체명도 기록되지 않아 DB만으로는 원래 업체를 알 수 없다.
 *   다만 날짜/품목/수량/단가는 남아 있으므로 **원본 엑셀과 대조하면 복구할 수 있다.**
 *
 * 사용법:
 *   node execution/repair_orphan_sales.mjs <엑셀파일...>            # 미리보기 (DB 변경 없음)
 *   node execution/repair_orphan_sales.mjs <엑셀파일...> --apply    # 실제 반영
 *   node execution/repair_orphan_sales.mjs "uploads/*.xlsx"         # 여러 파일 한 번에
 *
 *   기본은 미리보기(dry-run)다. --apply를 붙이기 전에는 아무것도 바꾸지 않는다.
 *
 * 매칭 규칙:
 *   1순위: 날짜 + 품목 + 수량 + 단가   (전체의 97%가 이것만으로 유일하게 식별됨)
 *   2순위: 날짜 + 품목 + 총액
 *   후보가 2개 이상이면 자동으로 고르지 않고 '확인 필요'로 분류한다.
 */

import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { connect } from './_supabase.mjs'

// ---------- 설정 ----------
const { supabase } = await connect({ write: process.argv.includes('--apply') })

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const files = args.filter(a => !a.startsWith('--'))

if (files.length === 0) {
    console.error('사용법: node execution/repair_orphan_sales.mjs <엑셀파일...> [--apply]')
    process.exit(1)
}

// ---------- 유틸 (앱의 SalesExcelUpload와 동일한 규칙) ----------
const normalizeKey = (name, { removeCorp = false, removePunct = false } = {}) => {
    if (!name) return ''
    let text = name.toString()
        .replace(/\u200B|\uFEFF/g, '').replace(/\u00A0/g, ' ')
        .replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/㈜/g, '(주)').trim()
    if (removeCorp) text = text.replace(/주식회사|유한회사|합자회사|합명회사|유한|㈜|\(주\)|\(유\)/g, '')
    if (removePunct) text = text.replace(/[\s\(\)\[\]\{\}\-_.·]/g, '')
    else text = text.replace(/\s+/g, '')
    return text.toLowerCase()
}

const buildClientKeys = (name) => {
    const keys = new Set([
        normalizeKey(name),
        normalizeKey(name, { removeCorp: true }),
        normalizeKey(name, { removePunct: true }),
        normalizeKey(name, { removeCorp: true, removePunct: true })
    ])
    return [...keys].filter(Boolean)
}

/**
 * 엑셀의 다양한 날짜 표기를 YYYY-MM-DD로 통일
 * 실제 업로드 파일은 20260122 형태(숫자 8자리)를 쓰므로 이 경우를 먼저 처리해야 한다.
 * (엑셀 시리얼로 잘못 해석하면 엉뚱한 연도가 나온다)
 */
const normalizeDate = (v) => {
    if (v == null || v === '') return ''
    const text = v.toString().trim()

    // 1) YYYYMMDD (숫자 8자리) - 이 프로젝트의 실제 양식
    const ymd = text.match(/^(\d{4})(\d{2})(\d{2})$/)
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`

    // 2) 구분자가 있는 형식: 2026-01-22, 2026/1/22, 2026.1.22 등
    const sep = text.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
    if (sep) return `${sep[1]}-${sep[2].padStart(2, '0')}-${sep[3].padStart(2, '0')}`

    // 3) 엑셀 시리얼 날짜 (셀 서식이 '날짜'인 경우)
    if (typeof v === 'number' && v > 0 && v < 100000) {
        const d = XLSX.SSF.parse_date_code(v)
        if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    }

    return text
}

const parseNumber = (value, unit = 1) => {
    if (value === null || value === undefined || value === '') return 0
    if (typeof value === 'number') return value * unit
    let text = value.toString().trim()
    let multiplier = 1
    if (text.includes('만원')) { multiplier = 10000; text = text.replace(/만원/g, '') }
    else if (text.includes('만')) { multiplier = 10000; text = text.replace(/만/g, '') }
    text = text.replace(/[,\s]/g, '').replace(/[^\d.-]/g, '')
    const parsed = parseFloat(text)
    return Number.isNaN(parsed) ? 0 : parsed * multiplier * unit
}

const pick = (row, names) => {
    for (const n of names) if (row[n] !== undefined && row[n] !== '') return row[n]
    return ''
}

const fetchAll = async (build, pageSize = 1000) => {
    let from = 0, out = []
    while (true) {
        const { data, error } = await build().range(from, from + pageSize - 1)
        if (error) throw error
        out = out.concat(data || [])
        if (!data || data.length < pageSize) break
        from += pageSize
    }
    return out
}

// ---------- 1. 엑셀 읽기 ----------
const excelRows = []
for (const file of files) {
    if (!fs.existsSync(file)) {
        console.error(`파일을 찾을 수 없습니다: ${file}`)
        process.exit(1)
    }
    const wb = XLSX.readFile(file, { codepage: 65001 })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(sheet, { raw: true, defval: '' })

    json.forEach((row, i) => {
        const saleDate = normalizeDate(pick(row, ['날짜', '판매날짜', '매출일', 'date', 'sale_date', 'Date', 'DATE']))
        const clientName = pick(row, ['거래처', '거래처명', '회사명', 'client', 'clientName', 'Client', 'Company']).toString().trim()
        const itemName = pick(row, ['품목명', '제품명', 'item', 'item_name', 'product_name', 'Item', 'Product']).toString().trim()
        const quantity = parseNumber(pick(row, ['수량', 'quantity', 'Quantity'])) || 1
        const manPrice = pick(row, ['단가(만원)', '단가(만)', '단가_만원', '단가_만'])
        const unitPrice = manPrice !== ''
            ? parseNumber(manPrice, 10000)
            : parseNumber(pick(row, ['단가(원)', '단가', 'unit_price', 'price', 'Price', 'UnitPrice']))

        if (!saleDate || !clientName) return
        excelRows.push({
            source: `${path.basename(file)}:${i + 2}`,
            saleDate, clientName, itemName, quantity, unitPrice,
            totalAmount: quantity * unitPrice,
            used: false
        })
    })
}
console.log(`엑셀 ${files.length}개 파일에서 ${excelRows.length}행을 읽었습니다.`)

// ---------- 2. 고아 매출 + 거래처 목록 조회 ----------
const orphans = await fetchAll(() => supabase.from('sales').select('*').is('client_id', null))
const clients = await fetchAll(() => supabase.from('clients').select('id, company'))
console.log(`거래처가 비어있는 매출: ${orphans.length}건 / 등록된 거래처: ${clients.length}개\n`)

if (orphans.length === 0) {
    console.log('복구할 대상이 없습니다.')
    process.exit(0)
}

const clientMap = new Map()
clients.forEach(c => buildClientKeys(c.company).forEach(k => { if (!clientMap.has(k)) clientMap.set(k, c) }))

// ---------- 3. 매칭 ----------
const k1 = (d, item, qty, price) => `${d}|${(item || '').trim()}|${Number(qty) || 0}|${Number(price) || 0}`
const k2 = (d, item, total) => `${d}|${(item || '').trim()}|T${Number(total) || 0}`

const byK1 = new Map(), byK2 = new Map()
const pushTo = (map, key, val) => {
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(val)
}
excelRows.forEach(r => {
    pushTo(byK1, k1(r.saleDate, r.itemName, r.quantity, r.unitPrice), r)
    pushTo(byK2, k2(r.saleDate, r.itemName, r.totalAmount), r)
})

const resolved = []      // { orphan, clientName, existingClient|null, via }
const ambiguous = []
const unmatched = []

for (const o of orphans) {
    const key1 = k1(o.sale_date, o.item_name, o.quantity, o.unit_price)
    const key2 = k2(o.sale_date, o.item_name, o.total_amount)

    let candidates = (byK1.get(key1) || []).filter(r => !r.used)
    let via = '날짜+품목+수량+단가'
    if (candidates.length === 0) {
        candidates = (byK2.get(key2) || []).filter(r => !r.used)
        via = '날짜+품목+총액'
    }

    if (candidates.length === 0) { unmatched.push(o); continue }

    // 후보가 여럿이어도 업체명이 모두 같으면 문제되지 않는다
    const distinctNames = [...new Set(candidates.map(c => normalizeKey(c.clientName, { removeCorp: true, removePunct: true })))]
    if (distinctNames.length > 1) { ambiguous.push({ orphan: o, candidates }); continue }

    const chosen = candidates[0]
    chosen.used = true
    const existing = buildClientKeys(chosen.clientName).map(k => clientMap.get(k)).find(Boolean) || null
    resolved.push({ orphan: o, clientName: chosen.clientName, existingClient: existing, via, source: chosen.source })
}

// ---------- 4. 결과 요약 ----------
const toCreateByKey = new Map()
resolved.filter(r => !r.existingClient).forEach(r => {
    const key = normalizeKey(r.clientName, { removeCorp: true, removePunct: true })
    if (key && !toCreateByKey.has(key)) toCreateByKey.set(key, r.clientName)
})

console.log('─'.repeat(70))
console.log(`복구 가능        : ${resolved.length}건`)
console.log(`  ├ 기존 거래처   : ${resolved.filter(r => r.existingClient).length}건`)
console.log(`  └ 신규 거래처   : ${resolved.filter(r => !r.existingClient).length}건 (거래처 ${toCreateByKey.size}개 생성 필요)`)
console.log(`확인 필요        : ${ambiguous.length}건 (엑셀에 같은 조건의 서로 다른 업체가 있음)`)
console.log(`엑셀에서 못 찾음 : ${unmatched.length}건`)
console.log('─'.repeat(70))

if (toCreateByKey.size > 0) {
    console.log('\n[신규로 생성될 거래처]')
    ;[...toCreateByKey.values()].forEach(n => console.log('  +', n))
}

const byClient = {}
resolved.forEach(r => {
    // 표기 흔들림은 실제로 생성될 이름 하나로 합쳐서 보여준다
    const name = r.existingClient
        ? r.existingClient.company
        : (toCreateByKey.get(normalizeKey(r.clientName, { removeCorp: true, removePunct: true })) || r.clientName)
    byClient[name] = (byClient[name] || 0) + 1
})
console.log('\n[거래처별 복구 건수]')
Object.entries(byClient).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => console.log(`  ${n}: ${c}건`))

if (ambiguous.length > 0) {
    console.log('\n[확인 필요 - 자동 복구하지 않음]')
    ambiguous.forEach(({ orphan, candidates }) => {
        console.log(`  ${orphan.sale_date} ${orphan.item_name} ${orphan.quantity}개 @${orphan.unit_price}`)
        console.log(`    후보 업체: ${[...new Set(candidates.map(c => c.clientName))].join(' / ')}`)
    })
}

if (unmatched.length > 0) {
    console.log('\n[엑셀에서 찾지 못한 매출 - 해당 날짜의 엑셀이 없을 수 있음]')
    const byDate = {}
    unmatched.forEach(o => { byDate[o.sale_date] = (byDate[o.sale_date] || 0) + 1 })
    Object.entries(byDate).sort().forEach(([d, c]) => console.log(`  ${d}: ${c}건`))
}

// ---------- 5. 반영 ----------
if (!APPLY) {
    console.log('\n※ 미리보기 모드입니다. DB는 전혀 변경되지 않았습니다.')
    console.log('※ 위 내용이 맞으면 같은 명령에 --apply 를 붙여 다시 실행하세요.')
    process.exit(0)
}

console.log('\n실제 반영을 시작합니다...')

// 5-1. 신규 거래처 생성
const createdMap = new Map()
if (toCreateByKey.size > 0) {
    const names = [...toCreateByKey.values()]
    const { data, error } = await supabase.from('clients').insert(names.map(company => ({ company }))).select()
    if (error) {
        console.error('거래처 생성 실패:', error.message)
        process.exit(1)
    }
    data.forEach(c => buildClientKeys(c.company).forEach(k => createdMap.set(k, c)))
    console.log(`  거래처 ${data.length}개 생성 완료`)
}

// 5-2. 매출의 거래처 연결
let ok = 0, fail = 0
for (const r of resolved) {
    const client = r.existingClient
        || buildClientKeys(r.clientName).map(k => createdMap.get(k)).find(Boolean)
    if (!client) { fail++; continue }

    const { error } = await supabase
        .from('sales')
        .update({ client_id: client.id, client_name: client.company })
        .eq('id', r.orphan.id)

    if (error) { console.error(`  실패 (${r.orphan.id}):`, error.message); fail++ }
    else ok++
}

console.log(`\n완료: ${ok}건 복구, ${fail}건 실패`)
if (ambiguous.length + unmatched.length > 0) {
    console.log(`남은 '알수없음' 매출: ${ambiguous.length + unmatched.length}건 (수동 확인 필요)`)
}
