/**
 * 보고서·ERP 표기 -> CRM 거래처명 대응표
 *
 * 사람이 손으로 적는 이름은 CRM 등록명과 다르다. 자동 정규화(㈜/공백/괄호 제거)로도
 * 이어지지 않는 조합이 있는데, 그대로 두면 **같은 회사가 거래처로 하나 더 만들어진다.**
 * 실제로 일일업무보고서 반영 때 11곳이 여기에 해당했다.
 * (전에 중복 거래처 9쌍을 손으로 병합한 적이 있다. 같은 일을 반복하지 말 것.)
 *
 * 앱(스크린샷 판독)과 스크립트(엑셀 일괄반영)가 같은 표를 봐야 결과가 어긋나지 않는다.
 *
 * 새 방문처가 '거래처를 찾지 못함'으로 뜨는데 실은 CRM에 있는 곳이면 여기에 추가할 것.
 */
export const CLIENT_ALIASES = {
    '현대산업': '현대산업 주식회사(I)',
    '한국기능성화장품': '(주)한국기능성화장품연구센터',
    '에이치피앤씨': '(주)에이치피앤씨 오송공장',
    '폴린트컴포지트': '폴린트컴포지트코리아 주식회사',
    '안산상사': '안산상사(김현욱)',
    '리안코스메틱': '(주)리안코스메틱스',
    '스타코스': '스타코스(STARCOS)',
    '더가든오브내추럴': '더가든오브내추럴솔루션',
    '부평상회 인천R&D': '부평상회',
    'KCC 전주공장': 'KCC',
    'KP한석유화': '케이피한석유화 주식회사',
    // 주의: '엔켐'은 '아이엔켐텍'과 다른 회사다. 붙이지 말 것.
}

/**
 * 적힌 이름에서 찾아볼 후보들을 넓힌다.
 *   '아모레퍼시픽 (오산)'  -> '아모레퍼시픽', '오산'
 *   'KCC 전주공장'        -> 'KCC'
 */
export const nameCandidates = (raw) => {
    const name = String(raw || '').replace(/\s+/g, ' ').trim()
    if (!name) return []

    const out = [name]
    const alias = CLIENT_ALIASES[name]
    if (alias) out.unshift(alias)

    const paren = name.match(/^(.+?)\s*[(（](.+?)[)）]\s*$/)
    if (paren) { out.push(paren[1].trim()); out.push(paren[2].trim()) }

    // 공장/지점 등 사업장 접미사를 뗀 이름
    out.push(name.replace(/\s*(제\d+)?\s*(공장|지점|사업장|본사|센터|연구소|R&D)\s*$/g, '').trim())

    return [...new Set(out.filter((s) => s && s.length >= 2))]
}

/** 거래처가 아닌 메모성 항목 (일지에 자주 적힌다) */
export const NON_CLIENT_PATTERN = /^(사무실|본사|내근|휴가|출장|교육|회의|기타|-)$/

/** 한 칸에 여러 회사를 몰아 적은 행인지 (예: '성진실업 인지산업 남양화학') */
export const looksLikeMultiCompany = (raw) => {
    const name = String(raw || '').replace(/[(（].*?[)）]/g, ' ').replace(/\s+/g, ' ').trim()
    return name.split(' ').filter((w) => w.length >= 3).length >= 3
}
