/**
 * 같은 거래처·같은 날의 접촉을 한 건으로 합친다.
 *
 * **예전에는 통째로 버렸다.** `applyActivities`가 `(client_id, activity_date)`로
 * 중복을 검사해 "이미 있어 건너뜀"이라고만 하고 끝냈다. 그런데 하루에 같은
 * 사람과 두세 번 통화하는 일은 흔하고(오전에 문의 → 오후에 수량 확정),
 * **뒤의 통화일수록 결론에 가깝다.** 그게 사라지고 있었다.
 *
 * 활동을 날짜별로 여러 건 만들지 않는 이유는 그대로다 —
 * KPI 정기적방문횟수가 활동 건수를 세므로, 한 거래처를 하루에 세 번 통화한
 * 것이 방문 세 번으로 잡히면 안 된다. 그래서 **기록은 합치고 횟수는 따로 적는다.**
 *
 * 합친 결과는 이렇게 생겼다:
 *
 *     [통화 3회]
 *     [담당자] 박경록, 김수현 과장
 *
 *     ■ 1차
 *     ...
 *
 *     ■ 2차
 *     ...
 */

/** '박경록, 김과장' -> ['박경록', '김과장'] (빈 값 제거) */
const splitPersons = (s) =>
    String(s || '').split(/[,·]/).map((x) => x.trim()).filter(Boolean)

/**
 * 이미 저장된 활동 내용을 머리(횟수·담당자)와 몸통으로 가른다.
 * 표시가 없으면 1회짜리로 본다.
 *
 * **줄 단위로 읽는다.** 정규식 하나로 머리 전체를 잡으려 하면 담당자 줄이
 * 있을 때와 없을 때, 뒤에 빈 줄이 있을 때와 없을 때가 전부 달라 조용히 어긋난다.
 */
export function parseActivityDescription(raw) {
    const lines = String(raw ?? '').split(/\r?\n/)
    let i = 0
    let count = 1
    let label = null
    let persons = []

    const m = (lines[i] || '').match(/^\[(통화|접촉)\s*(\d+)\s*회\]\s*$/)
    if (m) { label = m[1]; count = Number(m[2]) || 1; i += 1 }

    const p = (lines[i] || '').match(/^\[담당자\]\s*(.*)$/)
    if (p) { persons = splitPersons(p[1]); i += 1 }

    return { count, label, persons, body: lines.slice(i).join('\n').replace(/^\s+/, '') }
}

/**
 * 기존 활동에 새 접촉을 덧붙인다.
 *
 * @param existing  이미 저장된 description
 * @param incoming  { description, person, kind }
 * @param opts      { existingType }  기존 활동의 유형('전화'|'미팅')
 * @returns { description, count, label, type }
 */
export function mergeActivityDescription(existing, incoming = {}, opts = {}) {
    const prev = parseActivityDescription(existing)
    const addBody = String(incoming.description ?? '').trim()
    const who = String(incoming.person ?? '').trim()

    /*
     * 담당자 줄에 함부로 덧붙이지 않는다. 옛 기록(일일업무보고서에서 온 것)의
     * 이 줄은 자유 서식이라 `유재민 책임 이혜인 책임 [방문목적] 관리` 같은 것이
     * 들어 있다. 거기에 쉼표로 이어 붙이면 `[방문목적] 관리, 박태문 책임`이
     * 되어 읽을 수 없게 된다. **이미 적혀 있거나 줄이 길면 건드리지 않는다** —
     * 그 사람은 아래 차수 머리에 어차피 적힌다.
     */
    const persons = [...prev.persons]
    const line = persons.join(', ')
    // 자유 서식인지 본다 — 대괄호 태그가 섞였거나 한 조각이 지나치게 길면 목록이 아니다
    const messy = line.includes('[') || persons.some((x) => x.length > 15)
    if (who && !messy && !line.includes(who)) {
        splitPersons(who).forEach((x) => { if (!persons.includes(x)) persons.push(x) })
    }

    /*
     * 유형은 **더 무거운 쪽으로 올린다.** 오전에 통화하고 오후에 찾아갔으면
     * 그날은 방문이다 — KPI 정기적방문횟수가 미팅/방문만 세므로, 여기서
     * 전화로 남겨두면 실제로 다녀온 방문이 실적에서 빠진다.
     */
    const incomingKind = incoming.kind === '전화' ? '전화' : '미팅'
    const type = (opts.existingType === '미팅' || incomingKind === '미팅') ? '미팅' : '전화'

    // 둘 다 전화일 때만 '통화'라고 적는다. 섞이면 '접촉'이다.
    const label = type === '전화' ? '통화' : '접촉'
    const count = prev.count + 1

    // 처음 합치는 경우 기존 몸통에 '1차' 머리를 달아 준다
    const prevBody = prev.body.trimEnd()
    const sectioned = /^■\s*\d+차/m.test(prevBody) ? prevBody : `■ 1차\n${prevBody}`

    const head = `[${label} ${count}회]\n`
        + (persons.length ? `[담당자] ${persons.join(', ')}\n` : '')

    // 차수 머리에 그 통화의 상대를 적는다 — 하루에 다른 사람과 통화하는 일도 있다
    const section = who ? `■ ${count}차 · ${who}` : `■ ${count}차`
    const description = `${head}\n${sectioned}\n\n${section}\n${addBody}`.trimEnd()
    return { description, count, label, type }
}
