/**
 * 중복 거래처 병합 도구
 *
 * 배경:
 *   같은 회사가 표기 차이로 여러 번 등록되는 일이 있다.
 *   예) '(주)비앤씨화장품' vs '（주）비앤씨화장품'  ← 괄호가 전각/반각
 *   이러면 매출이 두 레코드로 쪼개져 KPI와 매출 집계가 실제보다 낮게 나온다.
 *
 * 사용법:
 *   node execution/merge_duplicate_clients.mjs           # 미리보기 (DB 변경 없음)
 *   node execution/merge_duplicate_clients.mjs --apply   # 실제 병합
 *
 *   기본은 미리보기다. --apply 없이는 아무것도 바꾸지 않는다.
 *
 * 병합 규칙:
 *   - 거래처명을 정규화(㈜/(주)/주식회사/공백/괄호 제거, 전각→반각)해 같으면 중복으로 본다.
 *     앱의 SalesExcelUpload가 쓰는 것과 같은 기준이다.
 *   - 그룹 안에서 '매출 건수가 가장 많은 곳'을 남긴다. 같으면 먼저 만들어진 쪽.
 *   - 나머지의 sales / activities / client_contacts를 남긴 쪽으로 옮기고 삭제한다.
 *   - 되돌릴 수 있도록 실행 내역을 .tmp/merge_clients_<시각>.json에 남긴다.
 */

import fs from 'fs'
import path from 'path'
import { connect } from './_supabase.mjs'

// ---------- 설정 ----------
const loadEnv = () => {
    for (const file of ['.env.local', '.env']) {
        const p = path.resolve(process.cwd(), file)
        if (!fs.existsSync(p)) continue
        const env = Object.fromEntries(
            fs.readFileSync(p, 'utf8').split('\n')
                .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
                .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] })
        )
        if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) return env
    }
    throw new Error('.env.local 또는 .env에서 Supabase 설정을 찾지 못했습니다.')
}

/**
 * clients.id를 참조하는 테이블 목록.
 * 실제 DB를 조회해 확인했다. 새 테이블이 생기면 여기에 추가할 것 —
 * 빠뜨리면 거래처 삭제 시 FK 제약으로 실패하거나(다행) 데이터가 유실된다.
 */
const CLIENT_REF_TABLES = ['sales', 'activities', 'client_contacts', 'weekly_shipment_adjustments']

const env = loadEnv()
const { supabase } = await connect({ write: process.argv.includes('--apply') })
const APPLY = process.argv.includes('--apply')

// ---------- 정규화 (앱과 동일 기준) ----------
const normalizeKey = (name) => {
    if (!name) return ''
    return name.toString()
        .replace(/​|﻿/g, '')
        .replace(/ /g, ' ')
        .replace(/[（]/g, '(')
        .replace(/[）]/g, ')')
        .replace(/㈜/g, '(주)')
        .replace(/주식회사|유한회사|합자회사|합명회사|유한|\(주\)|\(유\)/g, '')
        .replace(/[\s()[\]{}\-_.·]/g, '')
        .toLowerCase()
        .trim()
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

const won = (v) => Math.round((Number(v) || 0) / 10000).toLocaleString('ko-KR') + '만원'

// ---------- 1. 조회 ----------
const clients = await fetchAll(() => supabase.from('clients').select('id, company, created_at, sales_rep').order('id'))
const sales = await fetchAll(() => supabase.from('sales').select('id, client_id, total_amount').order('id'))
const activities = await fetchAll(() => supabase.from('activities').select('id, client_id').order('id'))
const contacts = await fetchAll(() => supabase.from('client_contacts').select('id, client_id').order('id'))

const stats = {}
sales.forEach(s => {
    const e = stats[s.client_id] || (stats[s.client_id] = { sales: 0, revenue: 0, activities: 0, contacts: 0 })
    e.sales++
    e.revenue += Number(s.total_amount) || 0
})
activities.forEach(a => {
    const e = stats[a.client_id] || (stats[a.client_id] = { sales: 0, revenue: 0, activities: 0, contacts: 0 })
    e.activities++
})
contacts.forEach(c => {
    const e = stats[c.client_id] || (stats[c.client_id] = { sales: 0, revenue: 0, activities: 0, contacts: 0 })
    e.contacts++
})
const statOf = (id) => stats[id] || { sales: 0, revenue: 0, activities: 0, contacts: 0 }

// ---------- 2. 중복 그룹 찾기 ----------
const groups = new Map()
clients.forEach(c => {
    const key = normalizeKey(c.company)
    if (!key) return
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(c)
})

const duplicates = [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => {
        // 매출 건수가 많은 쪽을 남긴다. 같으면 먼저 만들어진 쪽.
        const sorted = [...list].sort((a, b) => {
            const d = statOf(b.id).sales - statOf(a.id).sales
            if (d !== 0) return d
            return new Date(a.created_at || 0) - new Date(b.created_at || 0)
        })
        return { key, keeper: sorted[0], losers: sorted.slice(1) }
    })

console.log(`전체 거래처 ${clients.length}개 / 중복 그룹 ${duplicates.length}개\n`)

if (duplicates.length === 0) {
    console.log('중복된 거래처가 없습니다.')
    process.exit(0)
}

// ---------- 3. 미리보기 ----------
let moveSales = 0, moveActs = 0, moveContacts = 0, deleteCount = 0

console.log('─'.repeat(78))
duplicates.forEach(({ keeper, losers }) => {
    const ks = statOf(keeper.id)
    console.log(`남김  ${keeper.company}`)
    console.log(`        매출 ${ks.sales}건 ${won(ks.revenue)} · 활동 ${ks.activities} · 담당자 ${ks.contacts}`)
    losers.forEach(l => {
        const s = statOf(l.id)
        moveSales += s.sales; moveActs += s.activities; moveContacts += s.contacts; deleteCount++
        console.log(`  흡수  ${l.company}`)
        console.log(`        매출 ${s.sales}건 ${won(s.revenue)} · 활동 ${s.activities} · 담당자 ${s.contacts}`)
    })
    const total = [keeper, ...losers].reduce((sum, c) => sum + statOf(c.id).revenue, 0)
    console.log(`  → 병합 후 매출 ${won(total)}`)
    console.log('─'.repeat(78))
})

console.log(`\n요약: 거래처 ${deleteCount}개 삭제 / 매출 ${moveSales}건 · 활동 ${moveActs}건 · 담당자 ${moveContacts}건 이관`)

if (!APPLY) {
    console.log('\n※ 미리보기입니다. DB는 전혀 변경되지 않았습니다.')
    console.log('※ 내용이 맞으면 --apply 를 붙여 다시 실행하세요.')
    process.exit(0)
}

// ---------- 4. 반영 ----------
console.log('\n실제 병합을 시작합니다...')

const log = { startedAt: new Date().toISOString(), merges: [] }
let ok = 0, fail = 0

for (const { keeper, losers } of duplicates) {
    for (const loser of losers) {
        const record = { keptId: keeper.id, keptName: keeper.company, removedId: loser.id, removedName: loser.company }
        try {
            // client_contacts에는 '거래처당 대표 담당자 1명' 유니크 제약이 걸려 있다.
            // 양쪽 모두 대표가 있으면 그대로 옮길 때 충돌하므로, 흡수되는 쪽을 먼저 일반 담당자로 내린다.
            const { error: demoteErr } = await supabase
                .from('client_contacts')
                .update({ is_primary: false })
                .eq('client_id', loser.id)
                .eq('is_primary', true)
            if (demoteErr) throw new Error(`대표 담당자 해제 실패: ${demoteErr.message}`)

            for (const table of CLIENT_REF_TABLES) {
                const { error } = await supabase.from(table).update({ client_id: keeper.id }).eq('client_id', loser.id)
                if (error) throw new Error(`${table} 이관 실패: ${error.message}`)
            }

            // [중요] sales가 ON DELETE CASCADE라, 이관이 조용히 실패한 상태에서
            // 거래처를 지우면 매출까지 함께 삭제된다.
            // RLS 등으로 update가 0행만 반영되고 에러는 안 나는 경우가 있으므로
            // 삭제 전에 남은 행이 없는지 반드시 확인한다.
            for (const table of CLIENT_REF_TABLES) {
                const { count, error } = await supabase
                    .from(table)
                    .select('id', { count: 'exact', head: true })
                    .eq('client_id', loser.id)
                if (error) throw new Error(`${table} 잔여 확인 실패: ${error.message}`)
                if (count > 0) throw new Error(`${table}에 ${count}건이 남아 있어 삭제를 중단합니다 (이관 실패)`)
            }

            const { error: delErr } = await supabase.from('clients').delete().eq('id', loser.id)
            if (delErr) throw new Error(`거래처 삭제 실패: ${delErr.message}`)

            record.status = 'ok'
            ok++
            console.log(`  ✓ ${loser.company} → ${keeper.company}`)
        } catch (e) {
            record.status = 'failed'
            record.error = e.message
            fail++
            console.error(`  ✗ ${loser.company}: ${e.message}`)
        }
        log.merges.push(record)
    }
}

// 되돌릴 때 참고할 수 있도록 실행 내역을 남긴다
try {
    const dir = path.resolve(process.cwd(), '.tmp')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `merge_clients_${Date.now()}.json`)
    fs.writeFileSync(file, JSON.stringify(log, null, 2))
    console.log(`\n실행 내역: ${file}`)
} catch (e) {
    console.warn('실행 내역 저장 실패:', e.message)
}

console.log(`\n완료: ${ok}건 병합, ${fail}건 실패`)
