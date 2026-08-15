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

/** 접힌 줄을 이어 붙인다 (다음 줄이 공백/탭으로 시작하면 이어짐) */
export const unfold = (text) =>
    String(text || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')

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
 * 구글 주소록 CSV → 연락처 배열
 * 열 이름이 언어·버전마다 달라서 **뜻으로 찾는다** (Phone 1 - Value / 전화 1 - 값 …)
 */
export const parseGoogleCsv = (text) => {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim())
    if (lines.length < 2) return []
    const head = splitCsvLine(lines[0]).map((h) => h.trim())

    const find = (...pats) => head.findIndex((h) =>
        pats.some((p) => h.toLowerCase().includes(p.toLowerCase())))

    const iName = find('Name', '이름')
    const iGiven = find('Given Name', '이름(');
    const iFamily = find('Family Name', '성')
    const iOrg = find('Organization 1 - Name', 'Organization Name', '조직 1 - 이름', '회사')
    const iTitle = find('Organization 1 - Title', 'Organization Title', '직책')
    const iPhone = find('Phone 1 - Value', '전화 1 - 값', 'Phone')
    const iMail = find('E-mail 1 - Value', '이메일 1 - 값', 'E-mail')

    const out = []
    for (const line of lines.slice(1)) {
        const cols = splitCsvLine(line)
        const at = (i) => (i >= 0 ? (cols[i] || '').trim() : '')
        const name = at(iName) || `${at(iFamily)}${at(iGiven)}`.trim()
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
