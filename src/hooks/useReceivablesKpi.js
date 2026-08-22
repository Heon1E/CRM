import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { summarizeReceivables, ledgerAge } from '../utils/receivablesLedger'

/**
 * KPI 채권관리에 쓸 연체 건수를 **가장 최근 대장에서 직접 읽는다.**
 *
 * 예전에는 KPI 카드가 "채권관리는 CRM에 자료가 없어 자동 계산되지 않습니다"라고
 * 말했다. 채권관리 화면(`/receivables`)과 `receivables` 표가 생기기 전에 쓴
 * 문구인데 그대로 남아 있었다. **지금은 자료가 있다** — 108곳이 들어 있고
 * 연체 금액·경과월까지 계산돼 있다.
 *
 * 그동안은 사람이 채권관리 화면에서 'KPI에 N건 저장' 단추를 눌러야 반영됐다.
 * 그런데 화면이 "자료가 없다"고 말하고 있었으니 아무도 누르지 않았고,
 * 가중치 5점짜리 항목이 계속 '미입력'으로 남아 총점이 95점 기준으로 계산됐다.
 *
 * **손으로 넣은 값이 있으면 그쪽이 이긴다.** 대장에 안 잡히는 사정(합의된
 * 연장 등)을 사람이 반영할 수 있어야 한다. 영업 코치의 보정과 같은 규칙이다.
 *
 * **어느 달 기준인지 함께 돌려준다.** 대장은 월 스냅샷이라, 몇 달 전 것을
 * 그대로 보여주면 조용히 낡은 숫자가 된다. 화면에 기준월을 적어 두면
 * 사람이 오래된 것을 알아본다.
 *
 * 조회는 한 달치(100곳 남짓)뿐이다. 표가 없거나(마이그레이션 전) 읽지 못하면
 * `null`을 돌려주고, KPI는 예전처럼 '미입력'으로 둔다 — 화면이 죽지 않는다.
 */
/** 같은 사유로 콘솔을 채우지 않는다 — 대시보드를 열 때마다 반복되기 때문이다 */
let warned = false
const warnOnce = (what, err) => {
    if (warned) return
    warned = true
    console.warn(`[useReceivablesKpi] ${what}:`, err?.message || err)
}

export const useReceivablesKpi = () => {
    const [state, setState] = useState(null)

    useEffect(() => {
        let alive = true
        const run = async () => {
            try {
                // 가장 최근 기준월 하나
                const { data: latest, error: e1 } = await supabase
                    .from('receivables')
                    .select('base_month')
                    .order('base_month', { ascending: false })
                    .limit(1)
                if (e1) return warnOnce('기준월을 읽지 못했습니다', e1)
                if (!latest?.length) return   // 대장을 아직 안 올렸다 — 정상이다
                const month = latest[0].base_month

                /*
                 * `excluded`는 나중에 추가된 칸이다(receivables_exclusions.sql).
                 * 없는 DB에서도 나머지는 읽혀야 하므로, 없다고 하면 그 칸만 빼고
                 * 다시 받는다. **조회는 새로 짓는다** — 한 번 보낸 빌더를 다시
                 * `await` 해도 요청이 나가지 않는다(DataContext에서 겪은 것).
                 */
                const pick = (cols) => supabase.from('receivables').select(cols).eq('base_month', month)
                let { data: rows, error: e2 } = await pick('balance, overdue_amount, aging_months, excluded')
                if (e2 && (e2.code === '42703' || /excluded/.test(e2.message || ''))) {
                    ;({ data: rows, error: e2 } = await pick('balance, overdue_amount, aging_months'))
                }
                if (e2) return warnOnce('대장을 읽지 못했습니다', e2)
                if (!rows) return

                /*
                 * **낡은 대장의 숫자는 내보내지 않는다.** 대장은 월 스냅샷이라
                 * 두 달 이상 벌어지면 이미 갚은 곳이 아직 밀린 것처럼 보이고,
                 * 새로 밀린 곳은 아예 안 보인다. 그런 숫자를 '참고'라며 보여주면
                 * 그걸 근거로 전화를 걸게 된다. 대신 갱신을 요청한다.
                 */
                const age = ledgerAge(month)
                if (alive) setState({ month, ...age, ...summarizeReceivables(rows) })
            } catch (e) {
                /* 채권 자료를 못 읽어도 KPI 나머지는 그대로 보여야 한다.
                   다만 **조용히 삼키지는 않는다** — 왜 '대장 없음'으로 보이는지
                   알 수 없으면 고칠 수가 없다. */
                warnOnce('예상치 못한 오류', e)
            }
        }
        run()
        return () => { alive = false }
    }, [])

    return state
}

export default useReceivablesKpi
