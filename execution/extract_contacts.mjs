/**
 * 활동 기록에서 거래처 담당자를 뽑아 연락처로 채운다
 *
 * 거래처 1,148곳 중 연락처가 있는 곳은 28곳뿐이었다. 만나러 가면서 "누구를
 * 찾아야 하지"를 매번 활동 메모를 뒤져 확인해야 했다.
 *
 * 활동 메모에는 `[담당자] 유재민 책임` 형태로 이름과 직급이 남아 있다
 * (일일업무보고서 반영 때 붙인 태그다). 그걸 모아 연락처로 만든다.
 *
 * **전화번호는 뽑을 수 없다.** 활동 메모 225건에 전화번호가 하나도 없다.
 * 이름·직급만 채우고, 번호는 명함 촬영이나 직접 입력으로 채워야 한다.
 *
 * 사용법:
 *   node execution/extract_contacts.mjs           # 미리보기 (DB 변경 없음)
 *   node execution/extract_contacts.mjs --apply   # 실제 반영
 *
 * 이미 연락처가 있는 거래처는 건드리지 않는다 (손으로 넣은 것이 더 정확하다).
 */

import fs from 'fs'
import path from 'path'
import { connect } from './_supabase.mjs'

const { supabase } = await connect({ write: process.argv.includes('--apply') })
const APPLY = process.argv.includes('--apply')

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

/** 직급 목록. 이름과 붙어 나오는 것만 담당자로 인정한다. */
const TITLES = '대표|사장|회장|부회장|전무|상무|이사|본부장|실장|부장|차장|과장|팀장|대리|주임|책임|선임|사원|매니저|기사|소장'

/**
 * `[담당자] ...` 태그에서 '이름 직급' 짝을 모두 뽑는다.
 * 한 칸에 여러 명이 적힌 경우가 있다 ("유재민 책임 이혜인 책임 노수빈 선임").
 *
 * 본문 전체를 훑지 않고 태그 안만 본다. 본문을 훑으면 '앞으로도 대표',
 * '때문에 대표'처럼 문장 조각이 사람 이름으로 잡힌다.
 */
const PAIR = new RegExp(`([가-힣]{2,4})\\s*(${TITLES})`, 'g')

const extractFromTag = (description) => {
    const tag = String(description || '').match(/\[담당자\]\s*([^\[\n]+)/)
    if (!tag) return []
    const out = []
    let m
    PAIR.lastIndex = 0
    while ((m = PAIR.exec(tag[1])) !== null) out.push({ name: m[1], title: m[2] })
    return out
}

// ---------------------------------------------------------------------------
const [clients, activities, contacts] = await Promise.all([
    fetchAll(() => supabase.from('clients').select('id, company').order('company')),
    fetchAll(() => supabase.from('activities').select('client_id, description, activity_date').order('activity_date')),
    fetchAll(() => supabase.from('client_contacts').select('client_id, name').order('client_id')),
])

const nameOf = new Map(clients.map((c) => [c.id, c.company]))
const hasContact = new Set(contacts.map((c) => c.client_id))

console.log('활동 기록에서 담당자 뽑기\n')
console.log(`  거래처 ${clients.length} / 활동 ${activities.length} / 기존 연락처 ${contacts.length}건 (${hasContact.size}곳)\n`)

// 거래처별로 '이름 직급'을 세고, 가장 자주 나온 것을 대표 담당자로 본다
const byClient = new Map()
activities.forEach((a) => {
    if (!a.client_id) return
    extractFromTag(a.description).forEach(({ name, title }) => {
        if (!byClient.has(a.client_id)) byClient.set(a.client_id, new Map())
        const key = `${name}|${title}`
        const m = byClient.get(a.client_id)
        const cur = m.get(key) || { name, title, count: 0, last: '' }
        cur.count += 1
        const d = String(a.activity_date || '').slice(0, 10)
        if (d > cur.last) cur.last = d
        m.set(key, cur)
    })
})

const targets = []
byClient.forEach((people, clientId) => {
    if (hasContact.has(clientId)) return          // 이미 있으면 건드리지 않는다
    const list = [...people.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    if (list.length === 0) return
    targets.push({ clientId, company: nameOf.get(clientId) || '(이름 없음)', people: list })
})

targets.sort((a, b) => b.people[0].count - a.people[0].count)

const totalPeople = targets.reduce((a, t) => a + t.people.length, 0)
console.log(`담당자를 찾은 거래처 : ${byClient.size}곳`)
console.log(`  이미 연락처 있음  : ${byClient.size - targets.length}곳 (건너뜀)`)
console.log(`  새로 넣을 곳      : ${targets.length}곳 / 담당자 ${totalPeople}명`)
console.log('─'.repeat(76))
targets.slice(0, 25).forEach((t) => {
    const who = t.people.map((p) => `${p.name} ${p.title}${p.count > 1 ? `(${p.count}회)` : ''}`).join(', ')
    console.log(`  ${t.company.slice(0, 24).padEnd(26)} ${who}`)
})
if (targets.length > 25) console.log(`  … 외 ${targets.length - 25}곳`)
console.log('─'.repeat(76))
console.log('\n※ 전화번호는 활동 메모에 없어 채울 수 없습니다. 이름·직급만 넣습니다.')

if (!APPLY) {
    console.log('\n※ 미리보기입니다. DB는 전혀 변경되지 않았습니다.')
    console.log('※ 내용이 맞으면 --apply 를 붙여 다시 실행하세요.')
    process.exit(0)
}

const rows = []
targets.forEach((t) => {
    t.people.forEach((p, i) => {
        rows.push({
            client_id: t.clientId,
            name: p.name,
            department_role: p.title,
            // 가장 자주 만난 사람을 대표 담당자로 (거래처 목록에 이 사람이 뜬다)
            is_primary: i === 0,
        })
    })
})

console.log(`\n연락처 ${rows.length}건 등록 중...`)
let done = 0
for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { error } = await supabase.from('client_contacts').insert(chunk)
    if (error) { console.error('실패:', error.message); process.exit(1) }
    done += chunk.length
}
console.log(`완료: ${done}건 (${targets.length}곳)`)
console.log('전화번호는 거래처 화면에서 명함을 찍거나 직접 넣어 주세요.')
