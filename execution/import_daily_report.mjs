/**
 * 일일업무보고서(.xls) -> CRM 활동 기록 반영
 *
 * 회사 양식은 시트 하나가 하루다. 각 시트에 방문/미팅 기록과 '금일 영업 계획'이 들어 있다.
 * 여기서는 **실제로 다녀온 기록만** 활동으로 옮긴다. 영업 계획은 아직 일어나지 않은 일이고,
 * 다음 날 시트에 방문 기록으로 다시 나오므로 같이 넣으면 이중 계상된다.
 *
 * 활동 건수는 KPI '정기적방문횟수'(연 240건 계획)의 근거가 되므로 부풀리면 안 된다.
 *
 * 중복 방지: (거래처, 날짜)가 같은 활동이 이미 있으면 건너뛴다.
 *            같은 보고서를 다시 올려도 활동이 늘지 않는다.
 *
 * 사용법:
 *   node execution/import_daily_report.mjs <파일.xls>            # 미리보기 (DB 변경 없음)
 *   node execution/import_daily_report.mjs <파일.xls> --apply    # 실제 반영
 *   node execution/import_daily_report.mjs <파일.xls> --apply --create-clients
 *        CRM에 없는 방문처를 거래처(잠재고객)로 함께 등록한다
 *
 * 기본은 미리보기다. --apply 없이는 아무것도 바꾸지 않는다.
 */

import xlsx from 'xlsx'
import fs from 'fs'
import path from 'path'
import { connect } from './_supabase.mjs'

// ---------------------------------------------------------------------------
// 환경
// ---------------------------------------------------------------------------
const { supabase } = await connect({ write: process.argv.includes('--apply') })

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const CREATE_CLIENTS = args.includes('--create-clients')
const files = args.filter((a) => !a.startsWith('--'))

if (files.length === 0) {
    console.error('사용법: node execution/import_daily_report.mjs <일일업무보고서.xls> [--apply] [--create-clients]')
    process.exit(1)
}

const fetchAll = async (build, pageSize = 1000) => {
    let from = 0, out = []
    for (;;) {
        const { data, error } = await build().range(from, from + pageSize - 1)
        if (error) throw error
        out = out.concat(data || [])
        if (!data || data.length < pageSize) break
        from += pageSize
    }
    return out
}

// ---------------------------------------------------------------------------
// 거래처명 정규화 (앱의 buildClientKeys와 같은 기준이어야 한다)
// ---------------------------------------------------------------------------
const normalizeKey = (name, { removeCorp = false, removePunct = false } = {}) => {
    if (!name) return ''
    let t = String(name)
        .replace(/​|﻿/g, '').replace(/ /g, ' ')
        .replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/㈜/g, '(주)').trim()
    if (removeCorp) t = t.replace(/주식회사|유한회사|합자회사|합명회사|유한|㈜|\(주\)|\(유\)/g, '')
    t = removePunct ? t.replace(/[\s()[\]{}\-_.·]/g, '') : t.replace(/\s+/g, '')
    return t.toLowerCase()
}
const buildClientKeys = (name) => [...new Set([
    normalizeKey(name),
    normalizeKey(name, { removeCorp: true }),
    normalizeKey(name, { removePunct: true }),
    normalizeKey(name, { removeCorp: true, removePunct: true })
])].filter(Boolean)

/**
 * 보고서에 적힌 이름은 자유롭게 쓰인다. 매칭 후보를 넓게 만든다.
 *   '아모레퍼시픽 (오산)'   -> '아모레퍼시픽', '오산'
 *   'KCC 전주공장'         -> 'KCC'
 *   '한이물산 (제이비산업)'  -> '한이물산', '제이비산업'
 */
const nameCandidates = (raw) => {
    const name = String(raw || '').replace(/\s+/g, ' ').trim()
    const out = [name]

    const paren = name.match(/^(.+?)\s*[(（](.+?)[)）]\s*$/)
    if (paren) { out.push(paren[1].trim()); out.push(paren[2].trim()) }

    // 공장/지점/사업장 접미사 제거
    out.push(name.replace(/\s*(제\d+)?\s*(공장|지점|사업장|본사|센터|연구소|R&D)\s*$/g, '').trim())

    return [...new Set(out.filter((s) => s && s.length >= 2))]
}

/**
 * 보고서 표기 -> CRM 거래처명 수동 대응표.
 *
 * 자동 정규화로는 이어지지 않는 조합들이다. 이 표가 없으면 같은 회사가
 * 거래처로 새로 하나 더 만들어진다(전에 중복 거래처 9쌍을 병합한 적이 있다).
 * 새 방문처가 '미매칭'으로 뜨는데 실은 CRM에 있는 곳이면 여기에 추가할 것.
 *
 * [주의] 앱에도 같은 표가 `src/utils/clientAliases.js`에 있다. 스크립트는 Node에서
 * 도므로 앱 모듈을 직접 못 읽는다. **한쪽을 고치면 다른 쪽도 함께 고칠 것.**
 */
const ALIASES = {
    '현대산업': '현대산업 주식회사(I)',
    '한국기능성화장품': '(주)한국기능성화장품연구센터',
    '에이치피앤씨': '(주)에이치피앤씨 오송공장',
    '폴린트컴포지트': '폴린트컴포지트코리아 주식회사',
    '안산상사': '안산상사(김현욱)',
    '리안코스메틱': '(주)리안코스메틱스',
    '스타코스': '스타코스(STARCOS)',
    '더가든오브내추럴': '더가든오브내추럴솔루션',
    '부평상회 인천R&D': '부평상회',
    'KCC 전주공장': 'KCC',
    'KP한석유화': '케이피한석유화 주식회사',
    // 아래는 사용자가 알려준 사실 (2026-08 병합 완료)
    '윌스플로켐': '주식회사 윌슨플로켐',
    '윌슨플로켐': '주식회사 윌슨플로켐',
    '진영IBC': '진영IBC (최은성)',
    '대달산업': '대달인터내셔널(주)',
    '신성물산': '대달인터내셔널(주)',
    '신성물산(주)': '대달인터내셔널(주)',
    // 주의: '엔켐'은 '아이엔켐텍'과 다른 회사다. 붙이지 말 것.
}

/** 여러 회사를 한 칸에 몰아 적은 행인지 (예: '성진실업 인지산업 남양화학') */
const looksLikeMultiCompany = (raw) => {
    const name = String(raw || '').replace(/[(（].*?[)）]/g, ' ').replace(/\s+/g, ' ').trim()
    return name.split(' ').filter((w) => w.length >= 3).length >= 3
}

/** 거래처가 아닌 메모성 항목 */
const NON_CLIENT = /^(사무실|본사|내근|휴가|출장|교육|회의|기타)$/

// ---------------------------------------------------------------------------
// 보고서 파싱
// ---------------------------------------------------------------------------
const T = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

const parseSheetDate = (cell, sheetName) => {
    const s = T(cell)
    let m = s.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/)
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`
    m = sheetName.match(/^(\d{2})(\d{2})(\d{2})$/)
    if (m) return `20${m[1]}-${m[2]}-${m[3]}`
    // 'MMDD'만 있는 시트는 연도를 알 수 없다. 파일에서 확인된 연도를 넘겨받아 쓴다.
    return null
}

const parseReport = (file) => {
    const wb = xlsx.readFile(file)
    const visits = []
    let fallbackYear = null

    // 1차: 연도가 명시된 시트에서 기준 연도를 찾는다
    for (const name of wb.SheetNames) {
        const A = xlsx.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' })
        const d = parseSheetDate(A[2]?.[1], name)
        if (d) { fallbackYear = Number(d.slice(0, 4)); break }
    }

    for (const sheet of wb.SheetNames) {
        const A = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: false, defval: '' })
        let date = parseSheetDate(A[2]?.[1], sheet)
        if (!date) {
            const m = sheet.match(/^(\d{2})(\d{2})$/)
            if (m && fallbackYear) date = `${fallbackYear}-${m[1]}-${m[2]}`
        }
        if (!date) { console.warn(`  [건너뜀] 시트 '${sheet}': 날짜를 알 수 없음`); continue }

        const rep = T(A[2]?.[4])
        let inPlan = false

        for (let r = 5; r < A.length; r++) {
            const row = A[r] || []
            const c0 = T(row[0])
            if (/금일 영업 계획/.test(c0)) { inPlan = true; continue }  // 계획은 반영하지 않는다
            if (inPlan || !c0 || c0 === '거래처명') continue

            const timeRow = A[r + 1] || []
            const purposes = [T(row[3]) && '관리', T(row[4]) && '신규', T(row[5]) && '기타'].filter(Boolean)

            visits.push({
                sheet, date, rep,
                client: c0.replace(/\s+/g, ' ').trim(),
                person: T(row[2]),
                purpose: purposes.join('+') || '',
                time: T(timeRow[2]),
                body: String(row[6] ?? '').trim()
            })
        }
    }
    return visits
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------
console.log('일일업무보고서 -> 활동 반영\n')

let visits = []
for (const f of files) {
    if (!fs.existsSync(f)) { console.error(`파일 없음: ${f}`); process.exit(1) }
    const v = parseReport(f)
    console.log(`  ${path.basename(f)} -> 방문/미팅 ${v.length}건`)
    visits = visits.concat(v)
}

if (visits.length === 0) { console.error('읽어낸 기록이 없습니다.'); process.exit(1) }

const dates = [...new Set(visits.map((v) => v.date))].sort()
console.log(`  기간 ${dates[0]} ~ ${dates[dates.length - 1]} (${dates.length}일)`)
console.log(`  작성자 ${[...new Set(visits.map((v) => v.rep).filter(Boolean))].join(', ')}\n`)

const REP_NAME = [...new Set(visits.map((v) => v.rep).filter(Boolean))][0] || null

// 거래처 매칭
const clients = await fetchAll(() => supabase.from('clients').select('id, company').order('company'))
const clientMap = new Map()
clients.forEach((c) => buildClientKeys(c.company).forEach((k) => { if (!clientMap.has(k)) clientMap.set(k, c) }))

const findClient = (raw) => {
    const alias = ALIASES[String(raw || '').replace(/\s+/g, ' ').trim()]
    if (alias) {
        const hit = buildClientKeys(alias).map((k) => clientMap.get(k)).find(Boolean)
        if (hit) return hit
    }
    for (const cand of nameCandidates(raw)) {
        const hit = buildClientKeys(cand).map((k) => clientMap.get(k)).find(Boolean)
        if (hit) return hit
    }
    return null
}

const matched = [], unmatchedNames = new Map(), skipped = []
visits.forEach((v) => {
    if (NON_CLIENT.test(v.client)) { skipped.push({ ...v, why: '거래처가 아닌 항목' }); return }
    if (looksLikeMultiCompany(v.client)) { skipped.push({ ...v, why: '여러 회사가 한 칸에 적힘' }); return }
    const c = findClient(v.client)
    if (c) matched.push({ ...v, clientId: c.id, clientCompany: c.company })
    else {
        if (!unmatchedNames.has(v.client)) unmatchedNames.set(v.client, [])
        unmatchedNames.get(v.client).push(v)
    }
})

console.log('거래처 매칭')
console.log('─'.repeat(74))
console.log(`  CRM 거래처와 연결됨   : ${matched.length}건 (${new Set(matched.map((m) => m.clientId)).size}개 업체)`)
console.log(`  CRM에 없는 방문처     : ${[...unmatchedNames.values()].flat().length}건 (${unmatchedNames.size}개 업체)`)
console.log(`  건너뜀                : ${skipped.length}건`)
console.log('─'.repeat(74))

if (unmatchedNames.size > 0) {
    console.log(`\n  [CRM에 없는 방문처] ${CREATE_CLIENTS ? '-> 거래처로 등록합니다' : '-> 이대로면 반영되지 않습니다 (--create-clients 로 등록)'}`)
    ;[...unmatchedNames.entries()].sort((a, b) => b[1].length - a[1].length)
        .forEach(([n, list]) => console.log(`    ${n.padEnd(28)} ${list.length}건`))
}
if (skipped.length > 0) {
    console.log('\n  [건너뛴 항목]')
    const bySkip = {}
    skipped.forEach((s) => { (bySkip[s.client] = bySkip[s.client] || { n: 0, why: s.why }).n++ })
    Object.entries(bySkip).forEach(([n, v]) => console.log(`    ${n.slice(0, 40).padEnd(42)} ${v.n}건  (${v.why})`))
}

// 신규 거래처 등록
let createdClients = []
if (CREATE_CLIENTS && unmatchedNames.size > 0) {
    if (APPLY) {
        console.log(`\n신규 거래처 ${unmatchedNames.size}개 등록 중...`)
        // 방문만 있고 매출은 없는 곳이므로 '잠재고객'으로 넣는다.
        // sales_rep을 채워야 KPI '정기적방문횟수'가 이 방문을 센다
        // (KPIWidget이 담당 거래처의 활동만 집계한다).
        // clients 테이블에 notes 컬럼은 없다. 실제로 있는 컬럼만 넣을 것.
        const payload = [...unmatchedNames.keys()].map((company) => ({
            company,
            status: '잠재고객',
            sales_rep: REP_NAME
        }))
        for (let i = 0; i < payload.length; i += 50) {
            const chunk = payload.slice(i, i + 50)
            const { data, error } = await supabase.from('clients').insert(chunk).select('id, company')
            if (error) { console.error('  거래처 등록 실패:', error.message); process.exit(1) }
            createdClients = createdClients.concat(data || [])
        }
        createdClients.forEach((c) => buildClientKeys(c.company).forEach((k) => { if (!clientMap.has(k)) clientMap.set(k, c) }))
        console.log(`  ${createdClients.length}개 등록 완료`)
    }
    // 매칭 목록에 편입 (미리보기에서도 건수를 정확히 보여주기 위해)
    ;[...unmatchedNames.entries()].forEach(([name, list]) => {
        const c = APPLY ? findClient(name) : { id: `(신규:${name})`, company: name }
        if (c) list.forEach((v) => matched.push({ ...v, clientId: c.id, clientCompany: c.company }))
    })
}

// 중복 검사
const existing = await fetchAll(() =>
    supabase.from('activities').select('id, client_id, activity_date').order('id')
)
const existingKeys = new Set(existing.map((a) => `${a.client_id}|${a.activity_date}`))
console.log(`\n기존 활동 ${existing.length}건과 대조`)

const toInsert = [], duplicates = []
const seen = new Set()
matched.forEach((m) => {
    const key = `${m.clientId}|${m.date}`
    if (existingKeys.has(key) || seen.has(key)) { duplicates.push(m); return }
    seen.add(key)
    toInsert.push(m)
})

console.log('─'.repeat(74))
console.log(`  이미 등록되어 있음    : ${duplicates.length}건 (건너뜀)`)
console.log(`  새로 등록할 활동      : ${toInsert.length}건`)
console.log('─'.repeat(74))

const byYear = {}
toInsert.forEach((t) => { byYear[t.date.slice(0, 4)] = (byYear[t.date.slice(0, 4)] || 0) + 1 })
console.log(`  연도별: ${Object.entries(byYear).map(([y, n]) => `${y}년 ${n}건`).join(' / ')}`)

const existing2026 = existing.filter((a) => String(a.activity_date || '').startsWith('2026')).length
console.log(`\n  2026년 활동: 현재 ${existing2026}건 -> 반영 후 ${existing2026 + (byYear['2026'] || 0)}건`)
console.log('  (KPI 정기적방문횟수 계획은 연 240건)')

console.log('\n  [등록될 활동 샘플]')
toInsert.slice(0, 6).forEach((t) =>
    console.log(`    ${t.date} ${String(t.clientCompany).slice(0, 18).padEnd(20)} [${t.time === '유선' ? '전화' : '미팅'}] ${t.body.replace(/\s+/g, ' ').slice(0, 46)}...`)
)

if (!APPLY) {
    console.log('\n※ 미리보기입니다. DB는 전혀 변경되지 않았습니다.')
    console.log('※ 내용이 맞으면 --apply 를 붙여 다시 실행하세요.')
    if (unmatchedNames.size > 0 && !CREATE_CLIENTS) {
        console.log('※ CRM에 없는 방문처도 함께 넣으려면 --create-clients 를 추가하세요.')
    }
    process.exit(0)
}

// 반영
console.log('\n활동 등록 중...')
const rows = toInsert.map((t) => ({
    client_id: t.clientId,
    // 거래처 연결이 깨졌을 때 업체명을 되찾을 단서. sales 테이블과 같은 이유로 함께 남긴다.
    client_name: t.clientCompany,
    activity_date: t.date,
    // '유선'은 방문이 아니다. KPI 정기적방문횟수는 미팅/방문만 세므로 구분해서 넣는다.
    type: t.time === '유선' ? '전화' : '미팅',
    activity_time: /^[0-9]{1,2}:[0-9]{2}$/.test(t.time) ? t.time : null,
    user_name: t.rep || null,
    status: '완료',
    description:
        [t.person ? `[담당자] ${t.person}` : '', t.purpose ? `[방문목적] ${t.purpose}` : '']
            .filter(Boolean).join(' ') + (t.body ? `\n${t.body}` : '')
}))

let inserted = 0
const errors = []
for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { error } = await supabase.from('activities').insert(chunk)
    if (error) { errors.push(error.message); continue }
    inserted += chunk.length
    console.log(`  ${inserted}/${rows.length}`)
}

console.log(`\n완료: 활동 ${inserted}건 등록`)
if (createdClients.length) console.log(`      거래처 ${createdClients.length}개 신규 등록`)
if (errors.length) console.error(`오류 ${errors.length}건:\n  ${errors.join('\n  ')}`)
