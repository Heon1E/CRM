import { supabase } from '../lib/supabase'

/**
 * 견적서 ↔ 영업 기회 잇기
 *
 * **이중 입력이 파이프라인이 죽는 가장 큰 이유다.** 견적서를 만들고 나서
 * 파이프라인에 같은 내용을 또 넣으라고 하면 아무도 안 넣는다. 그러면 보드가
 * 비어 있고, 비어 있으니 안 보게 되고, 안 보니 더 안 넣는다.
 *
 * 그래서 **견적을 내면 '제안' 단계 기회가 자동으로 잡힌다.** 견적 하나에
 * 기회 하나(`deals.quote_id`)로 묶는다.
 *
 * 견적 상태가 바뀌면 단계도 따라간다:
 *   발송/작성중 → 제안 (이미 더 진행된 단계면 건드리지 않는다)
 *   수주        → 수주
 *   실패/취소    → 실패
 *
 * **더 진행된 단계를 뒤로 끌어내리지 않는다.** 견적을 낸 뒤 협상으로 옮겨
 * 뒀는데 견적서를 한 번 고쳤다고 '제안'으로 돌아가면 손으로 옮긴 일이 헛수고가
 * 된다. 앞으로만 민다.
 */

const ORDER = ['리드', '접촉', '제안', '샘플', '협상']

/** 견적 상태 → 기회 단계 */
const stageFor = (quoteStatus) => {
    if (quoteStatus === '수주') return '수주'
    if (quoteStatus === '실패' || quoteStatus === '취소') return '실패'
    return '제안'
}

const missing = (e) =>
    e && (e.code === 'PGRST205' || e.code === '42P01'
        || /does not exist|could not find the table/i.test(e.message || ''))

/**
 * 견적서를 저장한 뒤 부른다.
 *
 * @returns `{ created, updated, skipped }` — 화면에 알려 줄 말을 고르는 데 쓴다.
 *          `deals` 표가 없으면(마이그레이션 전) 조용히 `skipped`.
 */
export const syncQuoteToDeal = async (quote) => {
    if (!quote?.id) return { skipped: true }

    const target = stageFor(quote.status)
    const amount = Number(quote.subtotal) || 0   // 기회 금액은 공급가액 기준 (부가세 제외)

    try {
        const { data: existing, error } = await supabase
            .from('deals').select('id,stage').eq('quote_id', quote.id).is('deleted_at', null).maybeSingle()
        if (error) {
            if (missing(error)) return { skipped: true }
            throw error
        }

        if (existing) {
            const patch = { amount, client_name: quote.client_name, client_id: quote.client_id || null }
            // 앞으로만 민다. 뒤로 끌어내리지 않는다.
            const cur = ORDER.indexOf(existing.stage)
            const next = ORDER.indexOf(target)
            const closing = target === '수주' || target === '실패'
            if (closing || (next >= 0 && cur >= 0 && next > cur) || cur < 0) patch.stage = target
            const { error: upErr } = await supabase.from('deals').update(patch).eq('id', existing.id)
            if (upErr) throw upErr
            return { updated: true, stage: patch.stage || existing.stage }
        }

        const { error: insErr } = await supabase.from('deals').insert([{
            client_id: quote.client_id || null,
            client_name: quote.client_name,
            title: `견적 ${quote.quote_no}`,
            stage: target,
            amount,
            expected_close: quote.quote_date
                ? new Date(new Date(quote.quote_date).getTime() + (Number(quote.valid_days) || 30) * 86400000)
                    .toISOString().slice(0, 10)
                : null,
            owner: quote.sales_rep || null,
            quote_id: quote.id,
            notes: quote.notes || null,
        }])
        if (insErr) {
            if (missing(insErr)) return { skipped: true }
            throw insErr
        }
        return { created: true, stage: target }
    } catch (e) {
        // **기회를 못 만들어도 견적서 저장은 성공이다.** 부수적인 일이 본업을 막으면 안 된다.
        console.warn('[파이프라인] 기회를 잇지 못했습니다:', e.message)
        return { skipped: true, error: e.message }
    }
}

/** 영업 코치에서 곧장 기회를 만든다 */
export const createDealFromCoach = async ({ clientId, clientName, title, amount, owner, note }) => {
    const { error } = await supabase.from('deals').insert([{
        client_id: clientId || null,
        client_name: clientName,
        title: title || '영업 기회',
        stage: '접촉',           // 코치가 잡아 준 곳은 이미 얘기가 오간 곳이다
        amount: Number(amount) || 0,
        owner: owner || null,
        notes: note || null,
    }])
    if (error) throw error
}

export default syncQuoteToDeal
