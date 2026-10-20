/**
 * 지정한 거래처를 하나로 합친다 (이름이 달라 자동 감지가 안 되는 경우)
 *
 * `merge_duplicate_clients.mjs`는 이름 정규화로 같은 곳을 찾아낸다. 그런데
 * '윌스플로켐 / 주식회사 윌슨플로켐'처럼 **글자가 실제로 다른** 중복은 못 잡는다.
 * 이런 건 사람이 알려줘야 하고, 그걸 여기에 적는다.
 *
 * 합치면 매출과 활동이 한 곳에 모인다. 갈려 있으면 영업 코치가 같은 회사를
 * '매출 0인 신규'와 '거래 중인 기존'으로 따로 세어 판단이 어긋난다.
 *
 * 사용법:
 *   node execution/merge_clients_manual.mjs           # 미리보기 (DB 변경 없음)
 *   node execution/merge_clients_manual.mjs --apply   # 실제 병합
 */

import fs from 'fs'
import path from 'path'
import { connect } from './_supabase.mjs'

/**
 * 합칠 목록. keep = 남길 거래처, remove = 없앨 거래처 (이름 그대로 적는다).
 * 사용자가 알려준 사실이다. 새로 알게 되면 여기에 추가할 것.
 */
const MERGES = [
    { keep: '주식회사 윌슨플로켐', remove: '윌스플로켐', why: '같은 회사. 윌스플로켐은 오기' },
    { keep: '진영IBC (최은성)', remove: '진영IBC', why: '같은 회사. 담당자명이 붙은 쪽이 정식' },
    { keep: '대달인터내셔널(주)', remove: '신성물산(주)', why: '같은 회사 (대달산업·신성물산으로도 불림)' },
]

/**
 * clients.id를 참조하는 테이블.
 * 빠뜨리면 삭제가 FK로 막히거나(다행) 데이터가 끊긴다. 새 테이블이 생기면 추가할 것.
 */
const CLIENT_REF_TABLES = [
    'sales', 'activities', 'client_contacts', 'weekly_shipment_adjustments',
    'receivables', 'schedules',
]

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

/*
 * **휴지통에 든 것은 빼고, `id`로 정렬한다.** (`merge_duplicate_clients.mjs`와 같은 규칙)
 * - 지운 거래처를 넣으면 이름이 같은 지운 행을 '남길 쪽'으로 집을 수 있다.
 * - `company`는 유일하지 않아 1,000행 경계에서 한 곳이 빠지거나 겹친다.
 */
const clients = await fetchAll(() => supabase.from('clients').select('*').is('deleted_at', null).order('id'))
const byName = new Map(clients.map((c) => [c.company.trim(), c]))

console.log('거래처 병합\n')

const plans = []
for (const m of MERGES) {
    const keep = byName.get(m.keep)
    const remove = byName.get(m.remove)
    if (!keep) { console.log(`  [건너뜀] 남길 거래처를 못 찾음: ${m.keep}`); continue }
    if (!remove) { console.log(`  [건너뜀] 없앨 거래처를 못 찾음: ${m.remove} (이미 합쳐졌을 수 있음)`); continue }
    if (keep.id === remove.id) { console.log(`  [건너뜀] 같은 행: ${m.keep}`); continue }

    const counts = {}
    for (const t of CLIENT_REF_TABLES) {
        const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true }).eq('client_id', remove.id)
        counts[t] = error ? `조회불가(${error.code})` : (count || 0)
    }
    plans.push({ ...m, keep, remove, counts })
}

if (plans.length === 0) {
    console.log('\n합칠 것이 없습니다.')
    process.exit(0)
}

console.log('─'.repeat(78))
plans.forEach((p) => {
    console.log(`  '${p.remove.company}' -> '${p.keep.company}'`)
    console.log(`     사유: ${p.why}`)
    console.log(`     옮길 것: ${Object.entries(p.counts).map(([t, n]) => `${t} ${n}`).join(' / ')}`)
})
console.log('─'.repeat(78))

if (!APPLY) {
    console.log('\n※ 미리보기입니다. DB는 전혀 변경되지 않았습니다.')
    console.log('※ 내용이 맞으면 --apply 를 붙여 다시 실행하세요.')
    process.exit(0)
}

for (const p of plans) {
    console.log(`\n'${p.remove.company}' -> '${p.keep.company}'`)

    for (const t of CLIENT_REF_TABLES) {
        if (typeof p.counts[t] !== 'number' || p.counts[t] === 0) continue
        const { error } = await supabase.from(t).update({ client_id: p.keep.id }).eq('client_id', p.remove.id)
        if (error) { console.error(`  ${t} 이관 실패: ${error.message}`); process.exit(1) }
        console.log(`  ${t} ${p.counts[t]}건 이관`)
    }

    // 남길 쪽에 담당자가 비어 있으면 없앨 쪽 값을 물려받는다
    if (!p.keep.sales_rep && p.remove.sales_rep) {
        await supabase.from('clients').update({ sales_rep: p.remove.sales_rep }).eq('id', p.keep.id)
        console.log(`  담당 '${p.remove.sales_rep}' 승계`)
    }

    // 지우기 전에 남은 참조가 없는지 다시 확인한다 (있으면 데이터가 사라진다)
    let leftover = 0
    for (const t of CLIENT_REF_TABLES) {
        const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true }).eq('client_id', p.remove.id)
        if (!error) leftover += (count || 0)
    }
    if (leftover > 0) {
        console.error(`  남은 참조 ${leftover}건 — 안전을 위해 삭제하지 않습니다.`)
        continue
    }

    /*
     * **지우기는 '표시'다** (저장소 규칙). 예전에는 `.delete()`로 진짜 지웠다 —
     * `merge_duplicate_clients.mjs`는 2026-09에 고쳤는데 이 파일만 남아 있었다.
     * 딸린 자료는 위에서 다 옮겼으므로 잃을 것은 없지만, 합치기를 잘못 판단했을 때
     * 설정 > 휴지통에서 되살릴 길이 남는다.
     */
    const { error } = await supabase.from('clients')
        .update({ deleted_at: new Date().toISOString() }).eq('id', p.remove.id)
    if (error) { console.error(`  지움 표시 실패: ${error.message}`); continue }
    console.log(`  '${p.remove.company}' 지움 표시 완료 (휴지통)`)
}

const after = await fetchAll(() => supabase.from('clients').select('id').is('deleted_at', null).order('id'))
console.log(`\n완료. 거래처 ${clients.length} -> ${after.length}곳`)
