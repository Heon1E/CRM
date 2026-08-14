#!/usr/bin/env node
/**
 * IND 프레젠테이션 템플릿(.pptx) 만들기
 *
 *   npm i --no-save pptxgenjs      # 이 저장소의 의존성이 아니다. 만들 때만 받는다.
 *   node execution/make_ppt_template.mjs [출력경로]
 *
 * 회사 e카탈로그(IND_eCatalog_2026.pdf)의 디자인을 슬라이드로 옮긴 것이다.
 * 값의 출처는 `DESIGN.md` 하나다 — 문서·화면·발표자료가 같은 값을 써야
 * 한 회사가 만든 것처럼 보인다.
 *
 * **서체 주의.** pptx에 적어 넣은 글꼴 이름은 여는 사람의 PowerPoint가 그린다.
 * 나눔스퀘어 네오가 안 깔려 있으면 엉뚱한 글꼴로 대체되므로, 기본값은
 * 한국 윈도우에 흔한 `NanumSquare`(네오의 전 세대, 생김새가 거의 같다)로 둔다.
 * 정확히 맞추려면 나눔스퀘어 네오를 설치하고 BRAND.krFont를 'NanumSquare Neo'로 바꾼다.
 */

import pptxgen from 'pptxgenjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSET = (n) => path.join(ROOT, 'brand', 'assets', n)

/** DESIGN.md와 같은 값. pptxgenjs는 '#' 없는 6자리만 받는다. */
const BRAND = {
    green: '007538',
    greenDeep: '005C2B',
    greenSoft: '69AE8E',
    greenPale: 'E6F2EA',
    ink: '3E3A39',
    inkMute: '595757',
    inkFaint: '9FA0A0',
    panel: 'F2F3F3',
    rule: 'DCDDDD',
    white: 'FFFFFF',
    krFont: 'NanumSquare',   // 정확히 맞추려면 'NanumSquare Neo'
    enFont: 'Arial',         // 카탈로그는 Montserrat. 안 깔려 있으면 대체되므로 기본은 Arial.
}

const W = 13.333, H = 7.5          // 16:9
const M = 0.85                     // 좌우 여백 (카탈로그 16mm에 해당하는 비율)

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'
pres.author = '아이앤디 주식회사'
pres.company = '아이앤디 주식회사'
pres.title = 'IND 프레젠테이션 템플릿'

/* 슬라이드 마스터 — 본문 슬라이드의 머리·바닥은 여기서 한 번만 정의한다 */
pres.defineSlideMaster({
    title: 'IND_CONTENT',
    background: { color: BRAND.white },
    objects: [
        { text: {
            text: 'IND  |  PACKAGING SOLUTION',
            options: { x: M, y: 0.30, w: 6, h: 0.25, fontFace: BRAND.enFont, fontSize: 9,
                       color: BRAND.inkFaint, charSpacing: 2, margin: 0 },
        } },
        { line: { x: M, y: 0.62, w: W - M * 2, h: 0, line: { color: BRAND.rule, width: 0.75 } } },
        { line: { x: M, y: H - 0.62, w: W - M * 2, h: 0, line: { color: BRAND.rule, width: 0.75 } } },
        { text: {
            text: '아이앤디 주식회사',
            options: { x: M, y: H - 0.55, w: 5, h: 0.28, fontFace: BRAND.krFont, fontSize: 9,
                       color: BRAND.inkFaint, margin: 0 },
        } },
    ],
    slideNumber: { x: W - M - 0.6, y: H - 0.55, w: 0.6, h: 0.28, align: 'right',
                   fontFace: BRAND.enFont, fontSize: 9, color: BRAND.inkFaint },
})

/** 섹션 제목 — 초록 글씨 + 아래 헤어라인 (카탈로그의 Specifications/Accessories) */
const sectionTitle = (s, text, y = 0.95) => {
    s.addText(text, { x: M, y, w: W - M * 2, h: 0.45, fontFace: BRAND.krFont, fontSize: 26,
                      bold: true, color: BRAND.ink, margin: 0 })
    s.addShape(pres.ShapeType.line, { x: M, y: y + 0.52, w: W - M * 2, h: 0,
                                      line: { color: BRAND.rule, width: 1 } })
}

/** 작은 초록 윗말 — 카탈로그의 'IBC' / 'BF-SERIES' 두 층 구조 */
const eyebrow = (s, text, y) =>
    s.addText(text, { x: M, y, w: 6, h: 0.28, fontFace: BRAND.enFont, fontSize: 11,
                      bold: true, color: BRAND.green, charSpacing: 3, margin: 0 })

/* ═══════════════ 1. 표지 ═══════════════════════════════════════════════ */
{
    const s = pres.addSlide()
    s.background = { color: BRAND.white }
    // 하프톤 점 — 카탈로그 표지의 상징이다. 모서리에만 둔다.
    s.addImage({ path: ASSET('dots_tl.png'), x: -0.6, y: -0.9, w: 4.6, h: 3.9, transparency: 15 })
    s.addImage({ path: ASSET('dots_br.png'), x: W - 4.2, y: H - 2.9, w: 4.6, h: 3.2, transparency: 25 })

    s.addImage({ path: ASSET('ind-logo.png'), x: M, y: 2.15, w: 2.6, h: 1.33 })
    s.addText('품질이 큰 차이를 만듭니다', {
        x: M, y: 3.70, w: 8, h: 0.42, fontFace: BRAND.krFont, fontSize: 15,
        color: BRAND.green, bold: true, margin: 0,
    })
    s.addText('발표 제목을 여기에', {
        x: M, y: 4.35, w: 9.4, h: 0.95, fontFace: BRAND.krFont, fontSize: 40,
        bold: true, color: BRAND.ink, margin: 0,
    })
    s.addText('부제 · 대상 · 목적을 한 줄로', {
        x: M, y: 5.35, w: 9.4, h: 0.42, fontFace: BRAND.krFont, fontSize: 15,
        color: BRAND.inkMute, margin: 0,
    })
    s.addText('2026. 00. 00   |   영업본부', {
        x: M, y: 6.25, w: 6, h: 0.32, fontFace: BRAND.enFont, fontSize: 11,
        color: BRAND.inkFaint, margin: 0,
    })
    s.addNotes('표지. 로고·태그라인은 고정하고 제목/부제/날짜만 바꾼다.')
}

/* ═══════════════ 2. 목차 ═══════════════════════════════════════════════ */
{
    const s = pres.addSlide({ masterName: 'IND_CONTENT' })
    eyebrow(s, 'CONTENTS', 0.85)
    sectionTitle(s, '목차', 1.15)

    const items = [
        ['01', '현황', '지금 어디에 있는가'],
        ['02', '문제', '무엇이 걸림돌인가'],
        ['03', '제안', '무엇을 하자는 것인가'],
        ['04', '기대 효과', '하면 무엇이 달라지는가'],
    ]
    items.forEach(([no, title, sub], i) => {
        const y = 2.25 + i * 1.12
        s.addText(no, { x: M, y, w: 0.85, h: 0.6, fontFace: BRAND.enFont, fontSize: 30,
                        bold: true, color: BRAND.greenSoft, margin: 0 })
        s.addText(title, { x: M + 0.95, y: y + 0.02, w: 4, h: 0.36, fontFace: BRAND.krFont,
                           fontSize: 18, bold: true, color: BRAND.ink, margin: 0 })
        s.addText(sub, { x: M + 0.95, y: y + 0.38, w: 6, h: 0.3, fontFace: BRAND.krFont,
                         fontSize: 12, color: BRAND.inkMute, margin: 0 })
    })
    s.addNotes('목차. 항목 수가 달라지면 y 간격 1.12를 조정한다.')
}

/* ═══════════════ 3. 간지 ═══════════════════════════════════════════════ */
{
    const s = pres.addSlide()
    s.addImage({ path: ASSET('band_green.png'), x: 0, y: 0, w: W, h: H })
    s.addText('01', { x: M, y: 2.5, w: 2, h: 0.8, fontFace: BRAND.enFont, fontSize: 44,
                      bold: true, color: BRAND.white, transparency: 45, margin: 0 })
    s.addText('현황', { x: M, y: 3.35, w: 9, h: 1.0, fontFace: BRAND.krFont, fontSize: 46,
                        bold: true, color: BRAND.white, margin: 0 })
    s.addText('이 장에서 다루는 내용을 한 줄로 적는다', {
        x: M, y: 4.45, w: 9, h: 0.4, fontFace: BRAND.krFont, fontSize: 15,
        color: BRAND.white, transparency: 20, margin: 0,
    })
    s.addNotes('간지. 장이 바뀔 때마다 넣는다. 번호와 제목만 바꾼다.')
}

/* ═══════════════ 4. 지표 세 개 ═════════════════════════════════════════ */
{
    const s = pres.addSlide({ masterName: 'IND_CONTENT' })
    eyebrow(s, 'KEY FIGURES', 0.85)
    sectionTitle(s, '숫자로 보는 현황', 1.15)

    const stats = [
        ['125.2억', '2025년 매출', '전년 대비 +8.3%'],
        ['1,148곳', '거래처', '올해 신규 5곳'],
        ['99.9%', 'ERP 대사 일치율', '2024-12 ~ 2026-05'],
    ]
    const cw = (W - M * 2 - 0.6) / 3
    stats.forEach(([big, label, sub], i) => {
        const x = M + i * (cw + 0.3)
        s.addShape(pres.ShapeType.roundRect, {
            x, y: 2.15, w: cw, h: 2.95, rectRadius: 0.08,
            fill: { color: i === 0 ? BRAND.greenPale : BRAND.panel },
            line: { color: BRAND.rule, width: 0.75 },
        })
        s.addText(big, { x: x + 0.3, y: 2.62, w: cw - 0.6, h: 0.9, fontFace: BRAND.krFont,
                         fontSize: 38, bold: true, color: BRAND.green, margin: 0 })
        s.addText(label, { x: x + 0.3, y: 3.72, w: cw - 0.6, h: 0.34, fontFace: BRAND.krFont,
                           fontSize: 14, bold: true, color: BRAND.ink, margin: 0 })
        s.addText(sub, { x: x + 0.3, y: 4.10, w: cw - 0.6, h: 0.34, fontFace: BRAND.krFont,
                         fontSize: 11.5, color: BRAND.inkMute, margin: 0 })
    })
    s.addText('※ 숫자는 CRM 기준이며 부가세를 뺀 공급가액이다.', {
        x: M, y: 5.45, w: 9, h: 0.3, fontFace: BRAND.krFont, fontSize: 11,
        color: BRAND.inkFaint, margin: 0,
    })
    s.addNotes('큰 숫자 세 개. 첫 칸만 연초록으로 눌러 시선을 준다.')
}

/* ═══════════════ 5. 두 단 (글 + 그림) ═══════════════════════════════════ */
{
    const s = pres.addSlide({ masterName: 'IND_CONTENT' })
    eyebrow(s, 'PROPOSAL', 0.85)
    sectionTitle(s, '무엇을 하자는 것인가', 1.15)

    const colW = (W - M * 2 - 0.7) / 2
    s.addText([
        { text: '첫 번째 요점을 한 문장으로 적는다.', options: { bullet: true, breakLine: true } },
        { text: '두 번째 요점. 근거가 되는 숫자를 함께 둔다.', options: { bullet: true, breakLine: true } },
        { text: '세 번째 요점. 길면 두 줄까지만.', options: { bullet: true, breakLine: true } },
        { text: '네 번째 요점.', options: { bullet: true } },
    ], {
        x: M, y: 2.12, w: colW, h: 3.1, fontFace: BRAND.krFont, fontSize: 15,
        color: BRAND.ink, lineSpacingMultiple: 1.15, paraSpaceAfter: 10, margin: 0,
    })
    s.addShape(pres.ShapeType.roundRect, {
        x: M + colW + 0.7, y: 2.12, w: colW, h: 3.9, rectRadius: 0.08,
        fill: { color: BRAND.panel }, line: { color: BRAND.rule, width: 0.75 },
    })
    s.addText('사진 · 도표 자리', {
        x: M + colW + 0.7, y: 3.87, w: colW, h: 0.4, align: 'center',
        fontFace: BRAND.krFont, fontSize: 13, color: BRAND.inkFaint, margin: 0,
    })
    s.addNotes('왼쪽 글, 오른쪽 그림. 회색 칸에 사진을 올려 바꾼다.')
}

/* ═══════════════ 6. 표 ════════════════════════════════════════════════ */
{
    const s = pres.addSlide({ masterName: 'IND_CONTENT' })
    eyebrow(s, 'COMPARISON', 0.85)
    sectionTitle(s, '비교표', 1.15)

    const head = ['구분', '아이앤디 IBC', '타사 IBC', '200L 드럼']
    const rows = [
        ['적재 가능 수량(EA)', '20', '18', '80'],
        ['총 적재 용량(L)', '20,000', '18,000', '16,000'],
        ['공간 효율', '★★★★★', '★★★★', '★★★'],
        ['적재 안정성', '우수', '우수', '보통'],
        ['운송 효율', '높음', '보통', '상대적으로 낮음'],
    ]
    const body = [
        head.map((h) => ({
            text: h,
            options: { fill: { color: BRAND.green }, color: BRAND.white, bold: true,
                       align: 'center', fontSize: 13 },
        })),
        ...rows.map((r, i) => r.map((c, j) => ({
            text: c,
            options: {
                fill: { color: i % 2 ? BRAND.panel : BRAND.white },
                color: j === 1 ? BRAND.green : BRAND.ink,
                bold: j === 1, align: j === 0 ? 'left' : 'center', fontSize: 12.5,
            },
        }))),
    ]
    s.addTable(body, {
        x: M, y: 2.12, w: W - M * 2, colW: [3.3, 2.85, 2.7, 2.78],
        rowH: 0.55, fontFace: BRAND.krFont, valign: 'middle',
        border: { type: 'solid', color: BRAND.rule, pt: 0.75 },
        margin: [4, 8, 4, 8],
    })
    s.addText('칸마다 검은 실선을 두르지 않는다. 머리줄만 초록으로 눌러 준다.', {
        x: M, y: 5.75, w: 9, h: 0.3, fontFace: BRAND.krFont, fontSize: 11,
        color: BRAND.inkFaint, margin: 0,
    })
    s.addNotes('카탈로그 p3 적재용량 비교표와 같은 형식.')
}

/* ═══════════════ 7. 차트 ══════════════════════════════════════════════ */
{
    const s = pres.addSlide({ masterName: 'IND_CONTENT' })
    eyebrow(s, 'TREND', 0.85)
    sectionTitle(s, '매출 추이', 1.15)

    s.addChart(pres.ChartType.bar, [{
        name: '매출(억원)',
        labels: ['2023', '2024', '2025', '2026(예상)'],
        values: [87.9, 115.6, 125.2, 153.2],
    }], {
        x: M, y: 2.05, w: 7.6, h: 4.05,
        barDir: 'col', barGapWidthPct: 55,
        chartColors: [BRAND.green],
        showTitle: false, showLegend: false,
        showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.0',
        dataLabelFontFace: BRAND.enFont, dataLabelFontSize: 11, dataLabelColor: BRAND.ink,
        catAxisLabelFontFace: BRAND.enFont, catAxisLabelFontSize: 11, catAxisLabelColor: BRAND.inkMute,
        valAxisLabelFontFace: BRAND.enFont, valAxisLabelFontSize: 10, valAxisLabelColor: BRAND.inkFaint,
        valGridLine: { color: BRAND.rule, size: 0.75 },
        catGridLine: { style: 'none' },
        valAxisMaxVal: 180,
    })
    s.addShape(pres.ShapeType.roundRect, {
        x: M + 7.9, y: 2.05, w: W - M * 2 - 7.9, h: 1.7, rectRadius: 0.08,
        fill: { color: BRAND.greenPale },
    })
    s.addText('3년 연속\n두 자리 성장', {
        x: M + 8.2, y: 2.38, w: 2.4, h: 1.1, fontFace: BRAND.krFont, fontSize: 17,
        bold: true, color: BRAND.green, margin: 0, lineSpacingMultiple: 1.2,
    })
    s.addText('2023년 87.9억에서 2026년 예상 153.2억으로\n연평균 20% 늘었다.', {
        x: M + 7.9, y: 4.0, w: W - M * 2 - 7.9, h: 1.4, fontFace: BRAND.krFont,
        fontSize: 12.5, color: BRAND.ink, margin: 0, lineSpacingMultiple: 1.25,
    })
    s.addNotes('막대는 브랜드 초록 한 색으로. 여러 색을 쓰면 카탈로그와 어긋난다.')
}

/* ═══════════════ 8. 마무리 ════════════════════════════════════════════ */
{
    const s = pres.addSlide()
    s.background = { color: BRAND.white }
    s.addImage({ path: ASSET('dots_br.png'), x: W - 4.6, y: H - 3.1, w: 5.0, h: 3.4, transparency: 30 })

    s.addText('감사합니다', {
        x: M, y: 2.5, w: 8, h: 0.95, fontFace: BRAND.krFont, fontSize: 40,
        bold: true, color: BRAND.ink, margin: 0,
    })
    s.addShape(pres.ShapeType.line, { x: M, y: 3.95, w: 5.4, h: 0,
                                      line: { color: BRAND.rule, width: 1 } })
    s.addImage({ path: ASSET('ind-logo.png'), x: M, y: 4.25, w: 1.75, h: 0.9 })
    s.addText([
        { text: '아이앤디 주식회사', options: { bold: true, breakLine: true } },
        { text: '경기도 용인시 처인구 백암면 삼백로 367-20', options: { breakLine: true } },
        { text: 'Tel 031-334-9625, 031-335-9625   Fax 031-339-9625', options: { breakLine: true } },
        { text: 'E-mail idibc@daum.net   ·   www.idibc.kr', options: {} },
    ], {
        x: M, y: 5.35, w: 8, h: 1.2, fontFace: BRAND.krFont, fontSize: 12,
        color: BRAND.inkMute, lineSpacingMultiple: 1.35, margin: 0,
    })
    s.addNotes('마무리. 카탈로그 뒷표지와 같은 형식이다.')
}

const out = process.argv[2] || path.join(ROOT, 'brand', 'IND_프레젠테이션_템플릿.pptx')
fs.mkdirSync(path.dirname(out), { recursive: true })
await pres.writeFile({ fileName: out })
console.log('만들었습니다:', out)
