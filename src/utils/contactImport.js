/**
 * 휴대폰 연락처 가져오기 — vCard(.vcf) · 구글 주소록 CSV
 *
 * 거래처 1,150곳 중 연락처가 있는 곳이 71곳뿐인데, 정작 사람의 휴대폰에는
 * 다 들어 있다. 옮길 방법이 없어서 못 쓰고 있었을 뿐이다.
 *
 * **한글이 깨지는 지점이 두 군데 있다. 둘 다 실제로 겪는다:**
 *
 *   1. 안드로이드 기본 내보내기는 대개 **vCard 2.1 + QUOTED-PRINTABLE**이다.
 *      `N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=EC=9D=B4=ED=97=8C=EC=9D=BC`
 *      이걸 그대로 읽으면 이름이 `=EC=9D=B4…`로 나온다.
 *   2. 줄이 75자를 넘으면 **접혀서** 다음 줄이 공백/탭으로 시작한다.
 *      이어 붙이지 않으면 값이 잘린다.
 *
 * 파서는 순수 함수로 둔다 — 화면에서 파싱하면 이런 규칙을 테스트할 수 없다.
 */

/* ── 공통 ──────────────────────────────────────────────────────────────── */

/** `=EC=9D=B4` → 실제 글자. UTF-8 바이트로 모아서 한 번에 디코딩해야 한다. */
export const decodeQuotedPrintable = (s) => {
    if (!s) return ''
    // 줄 끝의 `=`는 '다음 줄에 이어짐' 표시다
    const joined = String(s).replace(/=\r?\n/g, '')
    const bytes = []
    for (let i = 0; i < joined.length; i++) {
        if (joined[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
            bytes.push(parseInt(joined.slice(i + 1, i + 3), 16))
            i += 2
        } else {
            // ASCII 구간은 그대로
            for (const b of new TextEncoder().encode(joined[i])) bytes.push(b)
        }
    }
    try {
        return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
    } catch {
        return joined
    }
}

/** 전화번호를 010-1234-5678 꼴로. 숫자가 아니면 원본을 돌려준다. */
export const normalizePhone = (raw) => {
    if (!raw) return ''
    // 글자가 섞여 있으면 전화번호가 아니라 메모다 ('내선 1234', 'FAX 02-…').
    // 숫자만 남기면 '내선'이 사라져 무슨 번호인지 알 수 없게 된다.
    if (/[A-Za-z가-힣]/.test(String(raw))) return String(raw).trim()
    let s = String(raw).replace(/[^\d+]/g, '')
    if (s.startsWith('+82')) s = '0' + s.slice(3)
    else if (s.startsWith('82') && s.length > 10) s = '0' + s.slice(2)
    if (!/^\d+$/.test(s)) return String(raw).trim()
    if (s.length === 11) return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
    if (s.length === 10) {
        return s.startsWith('02')
            ? `${s.slice(0, 2)}-${s.slice(2, 6)}-${s.slice(6)}`
            : `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`
    }
    if (s.length === 9 && s.startsWith('02')) return `${s.slice(0, 2)}-${s.slice(2, 5)}-${s.slice(5)}`
    return s
}

/* ── vCard ─────────────────────────────────────────────────────────────── */

/**
 * 접힌 줄을 이어 붙인다. **두 가지가 서로 다르다. 둘 다 처리해야 한다.**
 *
 *   vCard 3.0 접힘 — 다음 줄이 **공백/탭으로 시작**한다.
 *   vCard 2.1 QP  — 줄 끝이 `=`이고 다음 줄이 **공백 없이** 이어진다.
 *
 * 뒤쪽을 놓치면 이어지는 줄에 콜론이 없어 통째로 버려지고, 값이 UTF-8
 * 한 글자 중간에서 잘린다 (실제로 `범우화학공업 강�=` 로 나왔다).
 *
 * `=`로 끝나는 줄을 무조건 잇지는 않는다 — BASE64 사진의 패딩(`==`)도
 * `=`로 끝난다. **그 줄이 QUOTED-PRINTABLE이라고 밝힌 경우에만** 잇는다.
 */
export const unfold = (text) => {
    const src = String(text || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
    const out = []
    let qp = false                      // 지금 QP 값 안에서 이어지는 중인가
    for (const line of src.split('\n')) {
        const isQpHeader = /^[^:]*;[^:]*ENCODING=QUOTED-PRINTABLE/i.test(line)
        if (qp) {
            // 줄 끝의 `=`는 '이어짐' 표시일 뿐이므로 떼고 붙인다.
            // 남겨 두면 `=EC=` + `=9D` = `=EC==9D`가 되어 디코더가 어긋난다.
            out[out.length - 1] = out[out.length - 1].slice(0, -1) + line
        } else {
            out.push(line)
            qp = isQpHeader
        }
        if (qp) qp = out[out.length - 1].endsWith('=')   // 줄 끝 `=` = 아직 안 끝났다
    }
    return out.join('\n')
}

/**
 * `.vcf` 한 덩어리 → 연락처 배열
 * @returns `[{ name, phone, email, org, title }]`
 */
export const parseVCard = (text) => {
    const out = []
    const body = unfold(text)
    const cards = body.split(/BEGIN:VCARD/i).slice(1)

    for (const card of cards) {
        const c = { name: '', phone: '', email: '', org: '', title: '' }
        for (const line of card.split('\n')) {
            const colon = line.indexOf(':')
            if (colon < 0) continue
            const left = line.slice(0, colon)
            let value = line.slice(colon + 1).trim()
            if (!value) continue

            const parts = left.split(';')
            const key = parts[0].replace(/^item\d+\./i, '').toUpperCase()
            const params = parts.slice(1).map((p) => p.toUpperCase())
            if (params.some((p) => p.includes('QUOTED-PRINTABLE'))) value = decodeQuotedPrintable(value)

            switch (key) {
                case 'FN':
                    c.name = c.name || value
                    break
                case 'N': {
                    // N:성;이름;;; — 한국 이름은 붙여 쓴다
                    if (c.name) break
                    const [family = '', given = ''] = value.split(';')
                    c.name = `${family}${given}`.trim() || value.replace(/;/g, '').trim()
                    break
                }
                case 'TEL':
                    if (!c.phone) c.phone = normalizePhone(value)
                    break
                case 'EMAIL':
                    if (!c.email) c.email = value
                    break
                case 'ORG':
                    if (!c.org) c.org = value.split(';')[0].trim()
                    break
                case 'TITLE':
                    if (!c.title) c.title = value
                    break
                default:
                    break
            }
        }
        if (c.name || c.phone) out.push(c)
    }
    return out
}

/* ── 구글 주소록 CSV ───────────────────────────────────────────────────── */

/** 따옴표 안의 쉼표·줄바꿈을 지키며 CSV 한 줄을 자른다 */
export const splitCsvLine = (line) => {
    const out = []
    let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (q) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
            else if (ch === '"') q = false
            else cur += ch
        } else if (ch === '"') q = true
        else if (ch === ',') { out.push(cur); cur = '' }
        else cur += ch
    }
    out.push(cur)
    return out
}

/**
 * 열 이름으로 자리를 찾는다.
 *
 * **정확히 일치하는 것을 먼저 찾는다.** 부분 일치만 쓰면 실제 파일에서 어긋난다:
 *   `Phone` 으로 찾으면 → `Phonetic First Name` 이 먼저 걸린다
 *   `E-mail` 로 찾으면  → `E-mail 1 - Label` 이 `E-mail 1 - Value` 보다 앞에 있다
 * 둘 다 구글 주소록 최신 내보내기(36열)에서 실제로 나온다.
 */
export const findColumn = (head, candidates) => {
    const norm = (h) => String(h || '').trim().toLowerCase()
    const cols = head.map(norm)
    // 1) 정확히 같은 이름
    for (const c of candidates) {
        const i = cols.indexOf(norm(c))
        if (i >= 0) return i
    }
    // 2) 부분 일치 — 단 'label' 열은 값이 아니라 이름표라 건너뛴다
    for (const c of candidates) {
        const i = cols.findIndex((h) => h.includes(norm(c)) && !h.endsWith('label'))
        if (i >= 0) return i
    }
    return -1
}

/**
 * 구글 주소록 CSV → 연락처 배열
 *
 * 열 이름이 버전·언어마다 다르다. 최신(36열)은 `First Name`·`Organization Name`,
 * 예전은 `Given Name`·`Organization 1 - Name`이다. 둘 다 받는다.
 */
export const parseGoogleCsv = (text) => {
    const lines = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim())
    if (lines.length < 2) return []
    const head = splitCsvLine(lines[0]).map((h) => h.trim())

    const iFirst = findColumn(head, ['First Name', 'Given Name', '이름'])
    const iLast = findColumn(head, ['Last Name', 'Family Name', '성'])
    const iFileAs = findColumn(head, ['File As', 'Name'])
    const iOrg = findColumn(head, ['Organization Name', 'Organization 1 - Name', '조직 1 - 이름', '회사'])
    const iTitle = findColumn(head, ['Organization Title', 'Organization 1 - Title', '직책'])
    const iPhone = findColumn(head, ['Phone 1 - Value', '전화 1 - 값'])
    const iMail = findColumn(head, ['E-mail 1 - Value', '이메일 1 - 값'])

    const out = []
    for (const line of lines.slice(1)) {
        const cols = splitCsvLine(line)
        const at = (i) => (i >= 0 ? (cols[i] || '').trim() : '')

        // 한국 이름은 성+이름을 붙인다. 전체가 First에 들어 있으면 Last가 비어
        // 그대로 나오고, 나뉘어 있으면 '김'+'연구' = '김연구'가 된다.
        const name = `${at(iLast)}${at(iFirst)}`.trim() || at(iFileAs)
        const phone = normalizePhone(at(iPhone).split(':::')[0])
        if (!name && !phone) continue
        out.push({
            name,
            phone,
            email: at(iMail).split(':::')[0],
            org: at(iOrg),
            title: at(iTitle),
        })
    }
    return out
}

/** 파일 내용을 보고 알아서 고른다 */
export const parseContacts = (text) =>
    /BEGIN:VCARD/i.test(text) ? parseVCard(text) : parseGoogleCsv(text)

/* ── 거래처 맞추기 ─────────────────────────────────────────────────────── */

/** ㈜·(주)·주식회사·공백·괄호를 걷어낸 비교용 키 (매출 업로드와 같은 규칙) */
export const companyKey = (s) =>
    String(s || '')
        .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, '')
        .replace(/[\s()·,.\-]/g, '')
        .toLowerCase()

/**
 * 연락처의 회사명으로 거래처를 찾는다.
 * @param clients `[{ id, company }]`
 * @returns `Map<정규화된 회사명, client>`
 */
export const buildCompanyIndex = (clients) => {
    const m = new Map()
    for (const c of clients || []) {
        const k = companyKey(c.company)
        if (k && !m.has(k)) m.set(k, c)
    }
    return m
}

/**
 * 가져온 연락처를 거래처에 붙인다.
 *
 * **회사명이 정확히 맞는 것만 자동으로 붙인다.** 비슷한 이름을 자동으로
 * 이어 붙이면 엉뚱한 거래처에 남의 연락처가 들어간다 — 되돌리기 어렵다.
 * 못 맞춘 것은 사람이 고르게 남긴다.
 */
export const matchContacts = (contacts, clients) => {
    const index = buildCompanyIndex(clients)
    const matched = []
    const unmatched = []
    for (const c of contacts || []) {
        if (!c.org) { unmatched.push({ ...c, why: '회사명 없음' }); continue }
        const hit = index.get(companyKey(c.org))
        if (hit) matched.push({ ...c, clientId: hit.id, clientName: hit.company })
        else unmatched.push({ ...c, why: '거래처를 찾지 못함' })
    }
    return { matched, unmatched }
}

/**
 * 거래처 후보 제안 — **자동으로 붙이지 않는다.**
 *
 * 실제 휴대폰 연락처를 보면 회사명 칸이 대개 비어 있고(1,099명 중 996명),
 * 회사명이 있어도 거래처가 아닌 경우가 많다(노무법인·특허사무소·유니폼 등).
 * 대신 이름에 회사가 들어가는 습관이 있다 — `남양화학 장부장`, `인지산업 사장`.
 *
 * 그래서 이름·회사명 어디든 거래처 이름이 들어 있으면 **후보로만** 올린다.
 * 자동 반영은 위험하다: `와이파인텍 김창수`가 `파인텍`으로 잡히는데 다른
 * 회사일 수 있다. 사람이 보고 정한다.
 */
export const suggestClient = (contact, clientKeys) => {
    const hay = companyKey(`${contact.org || ''} ${contact.name || ''}`)
    if (!hay) return null
    let best = null
    for (const c of clientKeys) {
        // 두 글자 회사명은 아무 데나 걸린다. 세 글자부터 본다.
        if (c.key.length < 3) continue
        if (!hay.includes(c.key)) continue
        if (!best || c.key.length > best.key.length) best = c   // 길게 맞는 쪽이 더 정확하다
    }
    return best ? { clientId: best.id, clientName: best.company, exact: false } : null
}

/** 거래처 이름을 비교하기 좋게 미리 접어 둔다 */
export const buildClientKeys = (clients) =>
    (clients || [])
        .map((c) => ({ id: c.id, company: c.company, key: companyKey(c.company) }))
        .filter((c) => c.key)

/* ── 사람 이름만 남기기 ────────────────────────────────────────────────── */

/**
 * 업무용 휴대폰은 이름 칸에 **회사·사람·직급을 한 줄로** 적는다.
 * `범우화학공업 강병국 팀장`, `금호피앤비 여수 구자성 전무(공장장)`.
 *
 * 거래처 밑에 넣을 때 회사명이 또 붙어 있으면 `범우화학공업 > 범우화학공업
 * 강병국`이 되어 읽기 나쁘다. 그래서 **그 거래처 이름과 겹치는 앞부분만**
 * 걷어낸다 — 아무 말이나 지우지 않는다.
 */
const TITLE_WORDS = [
    '회장', '부회장', '대표이사', '대표', '사장', '부사장', '전무', '상무', '이사', '고문',
    '본부장', '공장장', '센터장', '연구소장', '소장', '실장', '부문장', '단장', '지점장', '점장',
    '팀장', '파트장', '부장', '차장', '과장', '대리', '주임', '사원', '반장', '조장',
    '수석', '책임', '선임', '연구원', '기사', '매니저', '국장', '처장', '차장님',
]

/** 마지막 토막이 직급이면 떼어낸다 (`전무(공장장)` 처럼 괄호가 붙어도 잡는다) */
export const splitTitle = (name) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
    if (parts.length < 2) return { name: String(name || '').trim(), title: '' }
    const last = parts[parts.length - 1]
    const bare = last.replace(/[()[\]/·,]/g, '')
    const hit = TITLE_WORDS.some((w) => bare.startsWith(w) || bare.endsWith(w))
    if (!hit) return { name: parts.join(' '), title: '' }
    return { name: parts.slice(0, -1).join(' '), title: last }
}

/**
 * 연락처를 거래처에 넣기 좋게 다듬는다.
 * @param clientName 붙일 거래처 이름 — **이것과 겹치는 앞부분만** 지운다
 * @returns `{ name, title }`
 */
export const refineContact = (contact, clientName) => {
    const ckey = companyKey(clientName)
    let parts = String(contact?.name || '').trim().split(/\s+/).filter(Boolean)

    // 앞에서부터 회사명을 먹어 들어간다. 거래처 이름을 벗어나면 거기서 멈춘다.
    let eaten = ''
    while (parts.length > 1) {
        const k = companyKey(parts[0])
        // `유한회사`·`주식회사`·`(주)`는 companyKey가 통째로 걷어내 빈 문자가 된다.
        // 여기서 멈추면 `유한회사 에코 고강호`가 그대로 남는다 — 지나친다.
        if (!k) { parts = parts.slice(1); continue }
        if (!ckey.startsWith(eaten + k)) break
        eaten += k
        parts = parts.slice(1)
    }

    const { name, title } = splitTitle(parts.join(' '))
    return {
        name: name || String(contact?.name || '').trim(),
        title: contact?.title || title || '',
    }
}

/**
 * 자동 매칭 + 후보 제안을 한 번에.
 * @returns `{ matched, suggested, rest }`
 *   matched   회사명이 정확히 맞음 — 바로 넣어도 된다
 *   suggested 이름·회사에 거래처가 들어 있음 — **사람이 확인해야 한다**
 *   rest      단서 없음
 */
export const matchWithSuggestions = (contacts, clients) => {
    const { matched, unmatched } = matchContacts(contacts, clients)
    const keys = buildClientKeys(clients)
    const suggested = []
    const rest = []
    for (const c of unmatched) {
        const s = suggestClient(c, keys)
        if (s) suggested.push({ ...c, ...s })
        else rest.push(c)
    }
    return { matched, suggested, rest }
}
