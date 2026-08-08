/**
 * 내가 활동한 거래처를 내 담당으로 지정한다
 *
 * 미팅하고 통화한 곳은 당연히 내 담당이다. 그런데 신규·복원 영업 대상은
 * 거래처에 담당자가 비어 있는 경우가 많아, sales_rep만 보는 화면에서는
 * **정작 공들이는 곳이 통째로 사라진다.**
 *   - 영업 코치가 못 잡는다
 *   - KPI 정기적방문횟수에서 그 방문이 빠진다 (담당 거래처만 세므로)
 *
 * 그래서 활동 기록을 근거로 담당을 채운다.
 *
 * 규칙:
 *   - `activities.user_name` 이 있으면 그 사람을 담당으로 (누가 다녀왔는지 명확)
 *   - user_name 이 비어 있으면 --rep 로 지정한 사람을 쓴다
 *   - **이미 담당이 있는 거래처는 건드리지 않는다** (남의 거래처를 뺏으면 안 된다)
 *
 * 사용법:
 *   node execution/assign_rep_from_activities.mjs --rep 이헌일            # 미리보기
 *   node execution/assign_rep_from_activities.mjs --rep 이헌일 --apply    # 반영
 *
 * 기본은 미리보기다. --apply 없이는 아무것도 바꾸지 않는다.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const loadEnv = () => {
    for (const file of ['.env.local', '.env']) {
        const p = path.resolve(process.cwd(), file)
        if (!fs.existsSync(p)) continue
        const env = Object.fromEntries(
            fs.readFileSync(p, 'utf8').split('\n')
                .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
                .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] })
        )
        if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) return env
    }
    throw new Error('.env.local 또는 .env에서 Supabase 설정을 찾지 못했습니다.')
}

const env = loadEnv()
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const repIdx = args.indexOf('--rep')
const DEFAULT_REP = repIdx !== -1 ? args[repIdx + 1] : null

if (!DEFAULT_REP) {
    console.error('사용법: node execution/assign_rep_from_activities.mjs --rep <이름> [--apply]')
    process.exit(1)
}

const fetchAll = async (build, ps = 1000) => {
    let from = 0, out = []
    for (;;) {
        const { data, error } = await build().range(from, from + ps - 1)
        if (error) throw error
        out = out.concat(data || [])
        if (!data || data.length < ps) break
        from += ps
    }
    return out
}

const [clients, activities, sales] = await Promise.all([
    fetchAll(() => supabase.from('clients').select('id, company, sales_rep').order('id')),
    fetchAll(() => supabase.from('activities').select('client_id, user_name, activity_date').order('id')),
    fetchAll(() => supabase.from('sales').select('client_id, total_amount').order('id'))
])

console.log(`거래처 ${clients.length} / 활동 ${activities.length}\n`)

// 거래처별로 '누가 다녀왔는지' 모은다
const repByClient = new Map()
activities.forEach((a) => {
    if (!a.client_id) return
    const rep = (a.user_name || '').trim() || DEFAULT_REP
    if (!repByClient.has(a.client_id)) repByClient.set(a.client_id, new Map())
    const m = repByClient.get(a.client_id)
    m.set(rep, (m.get(rep) || 0) + 1)
})

const revenue = new Map()
sales.forEach((s) => {
    if (!s.client_id) return
    revenue.set(s.client_id, (revenue.get(s.client_id) || 0) + (Number(s.total_amount) || 0))
})

const byId = new Map(clients.map((c) => [c.id, c]))
const targets = []
const skipped = []

repByClient.forEach((reps, clientId) => {
    const c = byId.get(clientId)
    if (!c) return
    if (c.sales_rep) { skipped.push(c); return }   // 이미 담당이 있으면 건드리지 않는다

    // 가장 많이 다녀온 사람을 담당으로
    const rep = [...reps.entries()].sort((a, b) => b[1] - a[1])[0][0]
    targets.push({ id: c.id, company: c.company, rep, visits: [...reps.values()].reduce((a, b) => a + b, 0), revenue: revenue.get(c.id) || 0 })
})

targets.sort((a, b) => b.revenue - a.revenue)

console.log(`활동이 있는 거래처 ${repByClient.size}곳`)
console.log(`  이미 담당 지정됨 : ${skipped.length}곳 (건드리지 않음)`)
console.log(`  담당을 채울 곳   : ${targets.length}곳`)
console.log('─'.repeat(76))
targets.forEach((t) =>
    console.log(`  ${t.company.slice(0, 26).padEnd(28)} -> ${t.rep}   방문 ${String(t.visits).padStart(2)}회 · 매출 ${(t.revenue / 10000).toLocaleString('ko-KR')}만원`)
)
console.log('─'.repeat(76))

const byRep = {}
targets.forEach((t) => { byRep[t.rep] = (byRep[t.rep] || 0) + 1 })
console.log('  담당별:', Object.entries(byRep).map(([k, v]) => `${k} ${v}곳`).join(' / '))

const after = clients.filter((c) => c.sales_rep === DEFAULT_REP).length + (byRep[DEFAULT_REP] || 0)
console.log(`\n  ${DEFAULT_REP} 담당 거래처: ${clients.filter((c) => c.sales_rep === DEFAULT_REP).length}곳 -> ${after}곳`)

if (!APPLY) {
    console.log('\n※ 미리보기입니다. DB는 전혀 변경되지 않았습니다.')
    console.log('※ 내용이 맞으면 --apply 를 붙여 다시 실행하세요.')
    process.exit(0)
}

if (targets.length === 0) {
    console.log('\n채울 것이 없습니다.')
    process.exit(0)
}

console.log('\n반영 중...')
let done = 0
for (const [rep, list] of Object.entries(
    targets.reduce((m, t) => { (m[t.rep] = m[t.rep] || []).push(t.id); return m }, {})
)) {
    for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100)
        const { error } = await supabase.from('clients').update({ sales_rep: rep }).in('id', chunk)
        if (error) { console.error('실패:', error.message); process.exit(1) }
        done += chunk.length
    }
}
console.log(`완료: ${done}곳에 담당을 지정했습니다.`)
