/**
 * 후속조치 — "언제 다시 연락할지"를 챙기는 장치
 *
 * 활동을 남길 때 `next_action_date`(다음 조치일)를 적을 수 있는데, 그걸 어디서도
 * 보여주지 않아 아무도 쓰지 않았다(225건 중 7건). 분석이 아무리 좋아도
 * **다음 행동을 잊지 않게 하는 장치**가 없으면 놓친다. 그 루프를 여기서 만든다.
 *
 * 완료 판정에 별도 컬럼을 두지 않는다:
 *   기한일 이후에 그 거래처와 접촉한 기록이 있으면 처리된 것으로 본다.
 * 체크박스를 하나 더 만들면 그것도 안 누르게 된다. 이미 남기는 활동 기록으로 판단한다.
 */

const DAY = 86_400_000

/** Date -> 'YYYY-MM-DD' (로컬 기준. toISOString은 UTC라 하루 밀린다) */
export const ymd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * 아직 처리되지 않은 후속조치를 뽑는다.
 *
 * @param {Array} activities - { client_id, activity_date, next_action_date, next_action_detail, ... }
 * @param {Object} opts
 * @param {string} opts.today       - 'YYYY-MM-DD'
 * @param {Map|Object} opts.names   - clientId -> 거래처명
 * @param {number} opts.aheadDays   - 며칠 앞까지 볼지 (기본 7)
 * @returns {{ overdue: [], today: [], upcoming: [] }}
 */
export const openFollowUps = (activities = [], { today, names = new Map(), aheadDays = 7 } = {}) => {
    const todayStr = today || ymd(new Date())
    const limit = ymd(new Date(new Date(`${todayStr}T00:00:00`).getTime() + aheadDays * DAY))

    // 거래처별로 '접촉한 날'을 모아 둔다 (완료 판정에 쓴다)
    const contactDates = new Map()
    activities.forEach((a) => {
        const id = a.client_id || a.clientId
        const d = String(a.activity_date || a.date || '').slice(0, 10)
        if (!id || !d) return
        if (!contactDates.has(id)) contactDates.set(id, [])
        contactDates.get(id).push(d)
    })

    const nameOf = (id) =>
        (names instanceof Map ? names.get(id) : names?.[id]) || ''

    const out = { overdue: [], today: [], upcoming: [] }

    activities.forEach((a) => {
        const due = String(a.next_action_date || '').slice(0, 10)
        if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return

        const id = a.client_id || a.clientId
        if (!id) return

        // 기한일 이후에 접촉했으면 처리된 것으로 본다
        const contacted = (contactDates.get(id) || []).some((d) => d >= due)
        if (contacted) return

        const row = {
            id: a.id,
            clientId: id,
            clientName: nameOf(id),
            due,
            detail: String(a.next_action_detail || '').trim(),
            setOn: String(a.activity_date || a.date || '').slice(0, 10),
            daysLate: Math.round((new Date(`${todayStr}T00:00:00`) - new Date(`${due}T00:00:00`)) / DAY),
        }

        if (due < todayStr) out.overdue.push(row)
        else if (due === todayStr) out.today.push(row)
        else if (due <= limit) out.upcoming.push(row)
    })

    // 오래 밀린 것부터
    out.overdue.sort((a, b) => a.due.localeCompare(b.due))
    out.today.sort((a, b) => a.clientName.localeCompare(b.clientName, 'ko'))
    out.upcoming.sort((a, b) => a.due.localeCompare(b.due))
    return out
}

/** 한 줄 요약 (텔레그램·화면 공용) */
export const followUpLine = (r) =>
    `${r.clientName}${r.detail ? ` — ${r.detail}` : ''}`
