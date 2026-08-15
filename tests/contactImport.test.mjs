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
