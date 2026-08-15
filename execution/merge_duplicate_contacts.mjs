#!/usr/bin/env node
/**
 * 같은 사람이 여러 건으로 남은 연락처를 합친다. **기준은 전화번호다.**
 *
 *   node execution/merge_duplicate_contacts.mjs           # 미리보기
 *   node execution/merge_duplicate_contacts.mjs --apply   # 반영
 *
 * 처음 연락할 때는 상대가 누구인지 모른 채 번호만 저장한다(`발주담당`).
 * 명함을 주고받은 뒤 이름·직급·이메일을 적어 다시 저장하면 두 건이 된다.
 * 이름으로 묶으면 못 잡는다 — 이름이 달라서 두 건이 된 것이기 때문이다.
 *
 * **거래처가 다르면 합치지 않는다.** 같은 번호라도 회사를 옮겼거나 거래처가
 * 중복 등록된 것일 수 있다. 사람이 볼 수 있게 목록으로만 보여준다.
 *
 * 지우는 것은 `deleted_at` 표시다(휴지통). 잘못 합쳐도 되돌릴 수 있다.
 */
import { connect } from './_supabase.mjs'
import { phoneKey, mergeContacts, contactScore } from '../src/utils/contactImport.js'

const apply = process.argv.includes('--apply')

const main = async () => {
    const { supabase } = await connect({ write: apply })

    const rows = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
            .from('client_contacts').select('*').is('deleted_at', null)
            .order('id').range(from, from + 999)
        if (error) throw error
        if (!data?.length) break
        rows.push(...data)
        if (data.length < 1000) break
    }

    const ids = [...new Set(rows.map((r) => r.client_id))]
    const clients = []
    for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from('clients').select('id,company').in('id', ids.slice(i, i + 200))
        clients.push(...(data || []))
    }
    const nameOf = new Map(clients.map((c) => [c.id, c.company]))

    // 거래처 + 번호로 묶는다
    const groups = new Map()
    for (const r of rows) {
        const k = phoneKey(r.phone)
        if (!k) continue
        const key = `${r.client_id}|${k}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(r)
    }

    // 거래처가 다른데 번호가 같은 것 — 합치지 않고 알리기만 한다
    const across = new Map()
    for (const r of rows) {
        const k = phoneKey(r.phone)
        if (!k) continue
        if (!across.has(k)) across.set(k, [])
        across.get(k).push(r)
    }

    const dups = [...groups.values()].filter((g) => g.length > 1)
    console.log(`\n연락처        : ${rows.length}명 (번호 있음 ${rows.filter((r) => phoneKey(r.phone)).length})`)
    console.log(`합칠 묶음     : ${dups.length}개 / ${dups.reduce((s, g) => s + g.length, 0)}행`)

    const plan = []
    for (const g of dups) {
        const company = nameOf.get(g[0].client_id) || ''
        const win = mergeContacts(g, company)
        const losers = g.filter((r) => r.id !== win.id)
        plan.push({ company, win, losers, before: g })
    }

    console.log('\n── 합치는 내용 ──')
    for (const p of plan) {
        console.log(`\n  [${p.company}] ${p.win.phone}`)
        for (const r of p.before) {
            const mark = r.id === p.win.id ? '남김' : '지움'
            console.log(`    ${mark}  ${String(r.name).padEnd(18)}| ${String(r.department_role || '-').padEnd(16)}| ${r.email || '-'}   (점수 ${contactScore(r, p.company)})`)
        }
        const changed = []
        if ((p.win.department_role || null) !== (p.before.find((r) => r.id === p.win.id).department_role || null)) changed.push(`직급 → ${p.win.department_role}`)
        if ((p.win.email || null) !== (p.before.find((r) => r.id === p.win.id).email || null)) changed.push(`이메일 → ${p.win.email}`)
        if (changed.length) console.log(`    합침: ${changed.join(' , ')}`)
    }

    const crossed = [...across.entries()].filter(([, v]) => new Set(v.map((r) => r.client_id)).size > 1)
    if (crossed.length) {
        console.log('\n── 번호는 같은데 거래처가 다르다 (합치지 않음) ──')
        for (const [k, v] of crossed) {
            console.log(`  ${k}`)
            v.forEach((r) => console.log(`    [${nameOf.get(r.client_id)}] ${r.name}`))
        }
        console.log('  회사를 옮겼거나 거래처가 중복 등록된 것일 수 있습니다. 화면에서 확인하세요.')
    }

    if (!apply) { console.log('\n미리보기입니다. 실제로 합치려면 --apply 를 붙이세요.'); return }
    if (!plan.length) { console.log('\n합칠 것이 없습니다.'); return }

    let merged = 0, removed = 0
    for (const p of plan) {
        // **진 쪽을 먼저 내린다.** 거래처당 대표는 하나뿐이라는 유니크 제약이
        // 있어서(`idx_single_primary_contact`), 이긴 쪽을 먼저 대표로 세우면
        // 아직 대표인 진 쪽과 부딪혀 통째로 실패한다. 지운 표시만으로는
        // 제약이 풀리지 않으므로 is_primary도 함께 내려야 한다.
        for (const r of p.losers) {
            const { error: e2 } = await supabase.from('client_contacts')
                .update({ is_primary: false, deleted_at: new Date().toISOString() })  // 휴지통 — 되돌릴 수 있다
                .eq('id', r.id)
            if (e2) throw e2
            removed++
        }
        const { error: e1 } = await supabase.from('client_contacts').update({
            department_role: p.win.department_role,
            email: p.win.email,
            is_primary: p.win.is_primary,
        }).eq('id', p.win.id)
        if (e1) throw e1
        merged++
    }
    console.log(`\n완료. ${merged}명으로 합치고 ${removed}건을 휴지통으로 보냈습니다.`)
}

main().catch((e) => { console.error('\n실패:', e.message); process.exit(1) })
