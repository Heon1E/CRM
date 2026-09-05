/**
 * 이름이 겹치는 담당자 합치기 — **한쪽이 비어 있을 때만.**
 *
 * `merge_duplicate_contacts.mjs`는 **전화번호**로 같은 사람을 가린다. 그런데
 * 번호가 아예 없는 쪽은 그 방법으로 못 잡는다. 실제로 이렇게 남아 있었다:
 *
 *   (주)아모레퍼시픽  "뷰티 제조팀 유태훈"(010-9279-2359)  +  "유태훈"(번호없음)
 *
 * 활동 메모의 `[담당자] 유태훈 과장`에서 뽑은 것(번호 없음)과 휴대폰에서
 * 가져온 것(팀명이 앞에 붙고 번호 있음)이 같은 사람인데 따로 서 있다.
 * 거래처 상세를 열면 **8명이 뜨는데 실제로는 4명**이었다.
 *
 * ## 양쪽에 번호가 있으면 합치지 않는다
 *
 * 이게 핵심이다. 실측에서 걸린 9건 중 3건이 그랬다:
 *
 *   KCC        "구매팀 노가영"(02-3480-5975)  +  "노가영"(010-9890-9690)
 *   미원화학    "구매팀 최유미"(031-479-9237)  +  "최유미"(010-6742-2062)
 *   국도화학    "본사 한우진 …"(010-3805-9030) +  "구매팀"(010-5208-0912)
 *
 * 앞의 둘은 **사무실 번호와 휴대폰**이다. 합치면 하나를 잃는다.
 * 마지막은 아예 다른 사람이다('구매팀'은 부서 대표번호). 전부 그대로 둔다.
 *
 * ## 이름은 짧은 쪽을 쓴다
 *
 * 번호를 가진 쪽의 이름이 `뷰티 제조팀 유태훈`처럼 팀명을 달고 있다.
 * 사람을 찾는 칸이므로 `유태훈`이 낫다. **행은 번호 가진 쪽을 남기고
 * 이름만 짧은 쪽 것을 쓴다.**
 *
 * ## 대표는 나중에 세운다
 *
 * 거래처당 대표는 하나라는 유니크 제약(`idx_single_primary_contact`)이 있다.
 * 지운 표시(`deleted_at`)만으로는 인덱스가 풀리지 않으므로, **진 쪽의 대표
 * 표시를 먼저 내리고** 그 다음에 이긴 쪽을 세운다.
 *
 * ```bash
 * node execution/merge_contacts_by_name.mjs           # 미리보기 (DB 변경 없음)
 * node execution/merge_contacts_by_name.mjs --apply   # 반영
 * ```
 */
import { connect } from './_supabase.mjs'

const APPLY = process.argv.includes('--apply')

/** 공백을 지운 이름 (같은 이름인지 볼 때만 쓴다) */
const strip = (s) => String(s ?? '').replace(/\s+/g, '')

/**
 * 짧은 이름이 긴 이름 **안에 낱말로** 들어 있는가.
 *
 * 처음에는 `endsWith`로 봤는데 `뷰티제조팀 김충성 프로`를 놓쳤다 — 이름 뒤에도
 * 직급이 붙기 때문이다. 그렇다고 그냥 포함(`includes`)으로 보면 `이정`이
 * `이정은` 안에 들어 있어 **다른 사람이 합쳐진다.** 낱말 단위로 본다.
 */
const tokens = (s) => String(s ?? '').split(/\s+/).map((t) => t.trim()).filter(Boolean)
const containsAsWords = (shortName, longName) => {
    const a = tokens(shortName), b = tokens(longName)
    if (!a.length || a.length >= b.length) return false
    return a.every((t) => b.includes(t))
}

/**
 * 이름만 있고 사람으로 볼 수 없는 것들. 이런 쪽이 남으면 목록이 못 쓰게 된다.
 * (`[담당자] 이상성 상무`를 잘못 끊어 `상무` 하나가 담당자로 들어와 있었다.)
 */
const NOT_A_NAME = /^(상무|전무|사장|대표|부장|차장|과장|대리|주임|사원|팀장|실장|본부장|이사|담당|담당자|구매|구매팀|생산|생산팀|영업|영업팀|자재|자재팀|품질|공장|본사)$/

const fetchAll = async (sb, table, cols) => {
    const out = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from(table).select(cols).order('id').range(from, from + 999)
        if (error) throw new Error(`${table}: ${error.message}`)
        out.push(...data)
        if (data.length < 1000) break
    }
    return out
}

const main = async () => {
    const { supabase: sb } = await connect({ write: APPLY })

    const contacts = (await fetchAll(sb, 'client_contacts',
        'id, client_id, name, department_role, phone, email, is_primary, deleted_at'))
        .filter((c) => !c.deleted_at)
    const clients = await fetchAll(sb, 'clients', 'id, company, deleted_at')
    const companyOf = new Map(clients.map((c) => [c.id, c.company]))

    const byClient = new Map()
    contacts.forEach((c) => {
        if (!byClient.has(c.client_id)) byClient.set(c.client_id, [])
        byClient.get(c.client_id).push(c)
    })

    const plans = []     // 합칠 것
    const kept = []      // 일부러 두는 것 (양쪽에 번호가 있다)

    for (const [clientId, list] of byClient) {
        for (const long of list) {
            for (const short of list) {
                if (long.id === short.id) continue
                if (strip(short.name).length < 2 || strip(short.name) === strip(long.name)) continue
                if (!containsAsWords(short.name, long.name)) continue

                const label = `${companyOf.get(clientId) || '?'} : "${long.name}"(${long.phone || '번호없음'}) ⊃ "${short.name}"(${short.phone || '번호없음'})`

                // **양쪽에 번호가 있으면 손대지 않는다.** 사무실과 휴대폰이거나
                // 아예 다른 사람이다. 어느 쪽이든 합치면 번호 하나를 잃는다.
                if (short.phone && long.phone && strip(short.phone) !== strip(long.phone)) {
                    kept.push(label); continue
                }
                // 이메일도 마찬가지
                if (short.email && long.email && short.email !== long.email) {
                    kept.push(label); continue
                }

                // 번호를 가진 쪽이 남는다. 둘 다 없으면 긴 쪽(정보가 많다)이 남는다.
                const winner = short.phone ? short : long
                const loser = winner.id === short.id ? long : short
                // 이름은 짧은 쪽 것을 쓴다 — 단, 사람 이름이 아닌 조각은 빼고.
                const betterName = NOT_A_NAME.test(strip(short.name)) ? winner.name : short.name

                plans.push({
                    clientId, label, winner, loser,
                    patch: {
                        name: betterName,
                        // 빈 칸은 진 쪽에서 채운다 — 나중에 적은 것이 아깝다
                        department_role: winner.department_role || loser.department_role || null,
                        phone: winner.phone || loser.phone || null,
                        email: winner.email || loser.email || null,
                    },
                    becomePrimary: Boolean(winner.is_primary || loser.is_primary),
                })
            }
        }
    }

    // 같은 짝이 양방향으로 두 번 잡히지 않게
    const seen = new Set()
    const unique = plans.filter((p) => {
        const key = [p.winner.id, p.loser.id].sort().join('|')
        if (seen.has(key)) return false
        seen.add(key); return true
    })

    console.log(`연락처 ${contacts.length}명 — 합칠 짝 ${unique.length}건, 그대로 둘 것 ${kept.length}건\n`)
    unique.forEach((p) => {
        console.log(`합침  ${p.label}`)
        console.log(`      -> "${p.patch.name}" ${p.patch.department_role || ''} ${p.patch.phone || '번호없음'} ${p.patch.email || ''}${p.becomePrimary ? ' · 대표' : ''}`)
    })
    if (kept.length) {
        console.log('\n그대로 둠 (양쪽에 번호가 있어 합치면 하나를 잃는다):')
        kept.forEach((k) => console.log('  ', k))
    }

    if (!APPLY) { console.log('\n미리보기입니다. --apply 를 붙이면 반영합니다.'); return }

    for (const p of unique) {
        // 1) 진 쪽의 대표 표시를 먼저 내린다 (유니크 제약이 지운 행도 본다)
        await sb.from('client_contacts').update({ is_primary: false }).eq('id', p.loser.id)
        // 2) 진 쪽을 지운 표시
        await sb.from('client_contacts').update({ deleted_at: new Date().toISOString() }).eq('id', p.loser.id)
        // 3) 이긴 쪽을 채우고 필요하면 대표로
        const { error } = await sb.from('client_contacts')
            .update({ ...p.patch, is_primary: p.becomePrimary }).eq('id', p.winner.id)
        if (error) console.log('  실패:', p.label, error.message)
    }
    console.log(`\n${unique.length}건 반영했습니다.`)
}

main().catch((e) => { console.error(e.message); process.exit(1) })
