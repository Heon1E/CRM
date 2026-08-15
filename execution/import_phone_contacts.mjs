#!/usr/bin/env node
/**
 * 휴대폰 연락처(.vcf / 구글 CSV) → client_contacts 일괄 반영
 *
 * 화면(설정 > 휴대폰 연락처 가져오기)과 **같은 판독기를 쓴다** —
 * `src/utils/contactImport.js`. 결과가 어긋나면 어느 쪽을 믿어야 할지 알 수 없다.
 *
 *   node execution/import_phone_contacts.mjs "<파일>"           # 미리보기
 *   node execution/import_phone_contacts.mjs "<파일>" --apply   # 반영
 *
 * 두 갈래를 넣는다:
 *   1) 회사명이 거래처와 **정확히** 맞는 것
 *   2) 이름·회사가 거래처 이름으로 **시작하는** 것
 *
 * 2번에 '시작한다'는 조건을 건 이유 — 그냥 '들어 있으면'으로 잡으면
 * `영주이앤씨 이정운`이 `주식회사 이앤씨`로 붙는다. 다른 회사다.
 * 걸러진 것은 목록으로 보여주고, 필요하면 화면에서 하나씩 고른다.
 */
import fs from 'node:fs'
import { connect } from './_supabase.mjs'
import {
    parseContacts, matchWithSuggestions, refineContact, companyKey,
} from '../src/utils/contactImport.js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const file = args.find((a) => !a.startsWith('--'))

if (!file) {
    console.error('사용법: node execution/import_phone_contacts.mjs "<연락처.vcf>" [--apply]')
    process.exit(1)
}

const won = (n) => n.toLocaleString('ko-KR')

/**
 * 후보 중 안전한 것만 — 거래처 이름으로 **시작**해야 한다.
 *
 * 회사명 칸과 이름 칸을 **따로** 본다. 이어 붙여서 보면 회사명이 달리 적힌 것이
 * (`한경 TEC` vs 거래처 `한경티이씨주식회사`) 앞을 막아 이름 쪽이 안 보인다.
 */
const isSafeSuggestion = (c) => {
    const key = companyKey(c.clientName)
    if (key.length < 3) return false
    return companyKey(c.org).startsWith(key) || companyKey(c.name).startsWith(key)
}

const main = async () => {
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = parseContacts(raw)
    if (!parsed.length) {
        console.error('연락처를 하나도 읽지 못했습니다. .vcf 또는 구글 주소록 CSV인지 확인하세요.')
        process.exit(1)
    }

    const { supabase } = await connect({ write: apply })

    // 1000행 상한이 있다. 반드시 order + range로 나눠 받는다.
    const clients = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
            .from('clients').select('id,company').is('deleted_at', null)
            .order('id').range(from, from + 999)
        if (error) throw error
        if (!data?.length) break
        clients.push(...data)
        if (data.length < 1000) break
    }

    const { matched, suggested, rest } = matchWithSuggestions(parsed, clients)
    const safe = suggested.filter(isSafeSuggestion)
    const risky = suggested.filter((c) => !isSafeSuggestion(c))

    console.log(`\n파일        : ${file}`)
    console.log(`읽은 연락처 : ${won(parsed.length)}명`)
    console.log(`거래처      : ${won(clients.length)}곳\n`)
    console.log(`  회사명 일치        ${String(matched.length).padStart(5)}명   → 넣는다`)
    console.log(`  후보(이름이 거래처로 시작) ${String(safe.length).padStart(5)}명   → 넣는다`)
    console.log(`  후보(가운데에만 걸림)   ${String(risky.length).padStart(5)}명   → 건너뛴다 (화면에서 고르세요)`)
    console.log(`  단서 없음          ${String(rest.length).padStart(5)}명   → 건너뛴다`)

    if (risky.length) {
        console.log('\n── 건너뛴 후보 (다른 회사일 수 있다) ──')
        risky.slice(0, 40).forEach((c) => console.log(`  ${String(c.name).padEnd(26)} → ${c.clientName}`))
        if (risky.length > 40) console.log(`  … 그 밖 ${risky.length - 40}명`)
    }

    // 거래처가 정해져야 이름을 다듬을 수 있다
    const candidates = [...matched, ...safe].map((c) => ({ ...c, ...refineContact(c, c.clientName) }))

    // 이미 있는 사람은 건드리지 않는다 — 손으로 넣은 것이 더 정확하다
    const ids = [...new Set(candidates.map((c) => c.clientId))]
    const existing = []
    for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
            .from('client_contacts').select('client_id,name').in('client_id', ids.slice(i, i + 200))
        if (error) throw error
        existing.push(...(data || []))
    }
    const has = new Set(existing.map((e) => `${e.client_id}|${String(e.name).trim()}`))
    const hasAny = new Set(existing.map((e) => e.client_id))

    const payload = []
    const seenHere = new Set()
    for (const c of candidates) {
        const key = `${c.clientId}|${String(c.name).trim()}`
        if (has.has(key) || seenHere.has(key)) continue     // 파일 안 중복도 막는다
        seenHere.add(key)
        const first = !hasAny.has(c.clientId)
        hasAny.add(c.clientId)
        payload.push({
            client_id: c.clientId,
            name: c.name || '(이름 없음)',
            department_role: c.title || null,   // 컬럼 이름이 role이 아니다
            phone: c.phone || null,
            email: c.email || null,
            is_primary: first,
        })
    }

    const skipped = candidates.length - payload.length
    console.log(`\n── 넣을 연락처 ──`)
    console.log(`  대상        ${won(candidates.length)}명`)
    console.log(`  이미 있음   ${won(skipped)}명 (건너뜀)`)
    console.log(`  새로 넣음   ${won(payload.length)}명 / 거래처 ${won(new Set(payload.map((p) => p.client_id)).size)}곳`)
    console.log(`  전화번호    ${won(payload.filter((p) => p.phone).length)}명`)
    console.log(`  이메일      ${won(payload.filter((p) => p.email).length)}명`)

    console.log('\n── 표본 15명 ──')
    const byId = new Map(clients.map((c) => [c.id, c.company]))
    payload.slice(0, 15).forEach((p) => console.log(
        `  ${String(byId.get(p.client_id)).padEnd(22)} | ${String(p.name).padEnd(12)} | ${String(p.department_role || '').padEnd(12)} | ${p.phone || ''}`))

    if (!apply) {
        console.log(`\n미리보기입니다. 실제로 넣으려면 --apply 를 붙이세요.`)
        return
    }
    if (!payload.length) { console.log('\n넣을 것이 없습니다.'); return }

    let done = 0
    for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200)
        const { error } = await supabase.from('client_contacts').insert(chunk)
        if (error) throw error
        done += chunk.length
        process.stdout.write(`\r  넣는 중… ${won(done)}/${won(payload.length)}`)
    }
    console.log(`\n\n완료. 연락처 ${won(done)}명을 넣었습니다.`)
}

main().catch((e) => { console.error('\n실패:', e.message); process.exit(1) })
