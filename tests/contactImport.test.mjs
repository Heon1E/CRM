/**
 * 휴대폰 연락처 가져오기 회귀 테스트
 *
 * 한글이 깨지는 지점이 두 군데 있다 — QUOTED-PRINTABLE과 접힌 줄.
 * 둘 다 안드로이드 기본 내보내기에서 실제로 나온다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    decodeQuotedPrintable, normalizePhone, unfold, parseVCard,
    splitCsvLine, parseGoogleCsv, parseContacts,
    companyKey, matchContacts,
} from '../src/utils/contactImport.js'

test('QUOTED-PRINTABLE 한글을 읽는다', () => {
    // 안드로이드 기본 내보내기가 이렇게 준다
    assert.equal(decodeQuotedPrintable('=EC=9D=B4=ED=97=8C=EC=9D=BC'), '이헌일')
    assert.equal(decodeQuotedPrintable('=EA=B9=80=EB=B6=80=EC=9E=A5 Kim'), '김부장 Kim')
    assert.equal(decodeQuotedPrintable(''), '')
})

test('줄 끝 =는 이어짐 표시다', () => {
    assert.equal(decodeQuotedPrintable('=EC=9D=B4=\n=ED=97=8C=EC=9D=BC'), '이헌일')
})

test('접힌 줄을 이어 붙인다', () => {
    assert.equal(unfold('TEL:010-1234-\n 5678'), 'TEL:010-1234-5678')
    assert.equal(unfold('A:1\r\nB:2'), 'A:1\nB:2')
})

test('전화번호를 보기 좋게 만든다', () => {
    assert.equal(normalizePhone('01012345678'), '010-1234-5678')
    assert.equal(normalizePhone('010 1234 5678'), '010-1234-5678')
    assert.equal(normalizePhone('+82 10-1234-5678'), '010-1234-5678')
    assert.equal(normalizePhone('0212345678'), '02-1234-5678')
    assert.equal(normalizePhone('021234567'), '02-123-4567')
    assert.equal(normalizePhone('0313349625'), '031-334-9625')
})

test('숫자가 아니면 원본을 지킨다 — 멋대로 고치지 않는다', () => {
    assert.equal(normalizePhone('내선 1234'), '내선 1234')
    assert.equal(normalizePhone(''), '')
})

test('vCard 2.1 + QUOTED-PRINTABLE (안드로이드 기본)', () => {
    const vcf = [
        'BEGIN:VCARD', 'VERSION:2.1',
        'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=EA=B9=80;=EC=97=B0=EA=B5=AC;;;',
        'ORG;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=EC=BC=84=ED=8A=B8=EB=A1=9C=EB=8B=89=EC=8A=A4',
        'TEL;CELL:010-1234-5678', 'EMAIL:kim@example.com',
        'TITLE;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=EB=B6=80=EC=9E=A5',
        'END:VCARD',
    ].join('\r\n')
    const [c] = parseVCard(vcf)
    assert.equal(c.name, '김연구')
    assert.equal(c.org, '켄트로닉스')
    assert.equal(c.phone, '010-1234-5678')
    assert.equal(c.email, 'kim@example.com')
    assert.equal(c.title, '부장')
})

test('vCard 3.0 FN이 있으면 그것을 쓴다', () => {
    const vcf = 'BEGIN:VCARD\nVERSION:3.0\nFN:이준화\nN:이;준화;;;\nORG:켐트로닉스;영업부\nTEL;TYPE=WORK:0212345678\nEND:VCARD'
    const [c] = parseVCard(vcf)
    assert.equal(c.name, '이준화')
    assert.equal(c.org, '켐트로닉스')      // ORG의 부서는 버린다
    assert.equal(c.phone, '02-1234-5678')
})

test('여러 장을 한 파일에서 읽는다', () => {
    const vcf = ['BEGIN:VCARD\nFN:가\nTEL:01011112222\nEND:VCARD',
                 'BEGIN:VCARD\nFN:나\nTEL:01033334444\nEND:VCARD'].join('\n')
    assert.equal(parseVCard(vcf).length, 2)
})

test('이름도 번호도 없으면 버린다', () => {
    assert.equal(parseVCard('BEGIN:VCARD\nVERSION:3.0\nEND:VCARD').length, 0)
})

test('CSV — 따옴표 안의 쉼표를 지킨다', () => {
    assert.deepEqual(splitCsvLine('a,"b,c",d'), ['a', 'b,c', 'd'])
    assert.deepEqual(splitCsvLine('a,"큰 ""따옴표""",c'), ['a', '큰 "따옴표"', 'c'])
})

test('구글 주소록 CSV를 읽는다', () => {
    const csv = [
        'Name,Given Name,Family Name,Organization 1 - Name,Organization 1 - Title,Phone 1 - Value,E-mail 1 - Value',
        '김연구,연구,김,켐트로닉스,부장,010-1234-5678,kim@example.com',
        ',준화,이,켐트로닉스,과장,01098765432,',
    ].join('\n')
    const list = parseGoogleCsv(csv)
    assert.equal(list.length, 2)
    assert.equal(list[0].name, '김연구')
    assert.equal(list[0].title, '부장')
    assert.equal(list[1].name, '이준화')          // Name이 비면 성+이름을 붙인다
    assert.equal(list[1].phone, '010-9876-5432')
})

test('전화가 ::: 로 여러 개 붙어 오면 첫 번째만 쓴다', () => {
    const csv = 'Name,Phone 1 - Value\n김부장,010-1111-2222 ::: 02-333-4444'
    assert.equal(parseGoogleCsv(csv)[0].phone, '010-1111-2222')
})

test('파일 내용을 보고 알아서 고른다', () => {
    assert.equal(parseContacts('BEGIN:VCARD\nFN:가\nTEL:01011112222\nEND:VCARD').length, 1)
    assert.equal(parseContacts('Name,Phone 1 - Value\n가,01011112222').length, 1)
})

test('회사명 비교는 ㈜·공백을 무시한다', () => {
    assert.equal(companyKey('(주)한솔케미칼'), companyKey('한솔케미칼'))
    assert.equal(companyKey('㈜ 한솔 케미칼'), companyKey('주식회사한솔케미칼'))
})

test('회사명이 정확히 맞는 것만 자동으로 붙인다', () => {
    // 비슷한 이름을 자동으로 이어 붙이면 엉뚱한 거래처에 남의 연락처가 들어간다
    const clients = [{ id: 'c1', company: '(주)한솔케미칼' }, { id: 'c2', company: '켐트로닉스' }]
    const { matched, unmatched } = matchContacts([
        { name: '김부장', org: '한솔케미칼' },
        { name: '이과장', org: '한솔케미칼 울산공장' },
        { name: '박차장', org: '' },
    ], clients)
    assert.equal(matched.length, 1)
    assert.equal(matched[0].clientId, 'c1')
    assert.equal(unmatched.length, 2)
    assert.equal(unmatched[1].why, '회사명 없음')
})

test('빈 입력에도 죽지 않는다', () => {
    assert.deepEqual(parseVCard(''), [])
    assert.deepEqual(parseGoogleCsv(''), [])
    assert.deepEqual(matchContacts(null, null).matched, [])
})

/* ── 후보 제안 ─────────────────────────────────────────────────────────── */
import { suggestClient, buildClientKeys, matchWithSuggestions, refineContact, splitTitle } from '../src/utils/contactImport.js'

const CLIENTS = [
    { id: 'c1', company: '남양화학' },
    { id: 'c2', company: '(주)피유시스' },
    { id: 'c3', company: 'KCC' },
]

test('이름에 회사가 들어 있으면 후보로 올린다', () => {
    const keys = buildClientKeys(CLIENTS)
    assert.equal(suggestClient({ name: '남양화학 장부장' }, keys).clientId, 'c1')
    assert.equal(suggestClient({ name: '피유시스 우민서 팀장' }, keys).clientId, 'c2')
    assert.equal(suggestClient({ name: '김철수' }, keys), null)
})

test('두 글자 회사명은 아무 데나 걸리므로 제안하지 않는다', () => {
    const keys = buildClientKeys([{ id: 'x', company: '한솔' }])
    // '한솔'은 두 글자라 건너뛴다 — '김한솔'이라는 사람 이름에도 걸린다
    assert.equal(suggestClient({ name: '김한솔' }, keys), null)
})

test('길게 맞는 쪽을 고른다', () => {
    const keys = buildClientKeys([{ id: 'a', company: '피유시스' }, { id: 'b', company: '(주)피유시스코리아' }])
    assert.equal(suggestClient({ name: '피유시스코리아 김부장' }, keys).clientId, 'b')
})

test('후보는 자동 반영이 아니다 — exact가 false다', () => {
    const keys = buildClientKeys(CLIENTS)
    assert.equal(suggestClient({ name: 'KCC 텍스 광주' }, keys).exact, false)
})

/* ── vCard 2.1 QP 소프트 개행 ──────────────────────────────────────────── */

test('QP는 =로 끝나고 공백 없이 다음 줄로 이어진다 (실제 업무폰 파일)', () => {
    // 접힘(다음 줄 공백 시작)과 다르다. 이걸 놓치면 이어지는 줄이 통째로 버려져
    // 이름이 UTF-8 한 글자 중간에서 잘린다 — '범우화학공업 강<?>=' 로 나왔었다.
    const vcf = [
        'BEGIN:VCARD', 'VERSION:2.1',
        'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=EC=97=94=EC=97=90=EC=9D=B4=EC=B9=98=EC=BC=80=EB=AF=B8=EC=B9=BC=20=EC=',
        '=9D=B4=EC=9C=A4=EA=B2=BD=20=EA=B3=BC=EC=9E=A5',
        'TEL;CELL:01028541159', 'END:VCARD',
    ].join('\r\n')
    const [c] = parseVCard(vcf)
    assert.equal(c.name, '엔에이치케미칼 이윤경 과장')
})

test('BASE64 사진의 == 패딩을 QP로 오해하지 않는다', () => {
    const vcf = ['BEGIN:VCARD', 'VERSION:2.1', 'FN:김부장',
        'PHOTO;ENCODING=BASE64:AAAA==', 'TEL:01011112222', 'END:VCARD'].join('\r\n')
    const [c] = parseVCard(vcf)
    assert.equal(c.name, '김부장')
    assert.equal(c.phone, '010-1111-2222')
})

/* ── 사람 이름만 남기기 ────────────────────────────────────────────────── */

test('이름 앞의 회사명을 뗀다 — 그 거래처와 겹치는 만큼만', () => {
    const r = refineContact({ name: '범우화학공업 강병국 팀장', title: '' }, '범우화학공업(주)')
    assert.deepEqual(r, { name: '강병국', title: '팀장' })
})

test('(주)·유한회사는 건너뛰고 이어서 본다', () => {
    assert.equal(refineContact({ name: '유한회사 에코 고강호 대표' }, '(유)에코').name, '고강호')
    assert.equal(refineContact({ name: '동희(주) 채병길 이사' }, '동희주식회사').name, '채병길')
})

test('거래처와 상관없는 말은 지우지 않는다', () => {
    // '여수'는 금호피앤비화학의 일부가 아니다 — 공장 구분이므로 남긴다
    assert.equal(refineContact({ name: '금호피앤비 여수 구자성 전무' }, '금호피앤비화학(주)').name, '여수 구자성')
    // 엉뚱한 거래처를 골랐을 때 이름을 깎아 먹으면 안 된다
    assert.equal(refineContact({ name: '김철수 부장' }, '전혀다른회사').name, '김철수')
})

test('vCard의 직급이 있으면 그것을 쓴다 (이름 끝에서 짐작하지 않는다)', () => {
    const r = refineContact({ name: '코센트 고병국 부장', title: '차장' }, '(주)코센트')
    assert.deepEqual(r, { name: '고병국', title: '차장' })
})

test('직급이 아닌 끝말은 떼지 않는다', () => {
    assert.deepEqual(splitTitle('김진만 주임 이천공장'), { name: '김진만 주임 이천공장', title: '' })
    assert.deepEqual(splitTitle('김철수'), { name: '김철수', title: '' })
})

test('정확 일치 / 후보 / 단서 없음을 나눈다', () => {
    const r = matchWithSuggestions([
        { name: '김부장', org: '남양화학' },      // 정확
        { name: '피유시스 우민서', org: '' },      // 후보
        { name: '이모씨', org: '' },              // 단서 없음
    ], CLIENTS)
    assert.equal(r.matched.length, 1)
    assert.equal(r.suggested.length, 1)
    assert.equal(r.rest.length, 1)
})
