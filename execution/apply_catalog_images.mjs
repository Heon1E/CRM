#!/usr/bin/env node
/**
 * 회사 e카탈로그(IND_eCatalog_2026.pdf)에서 뽑아낸 사진을 품목에 붙인다.
 *
 *   node execution/apply_catalog_images.mjs <사진폴더>            # 미리보기 (DB 변경 없음)
 *   node execution/apply_catalog_images.mjs <사진폴더> --apply    # 실제 반영
 *
 * 사진은 Supabase Storage 공개 버킷 `product-images`의 `catalog/` 아래에 올리고,
 * `products.image_url`에 그 주소를 넣는다. 견적서가 이 주소를 그대로 쓴다.
 *
 * **같은 사진을 여러 품목이 함께 쓴다.** IBC 109개가 BF/MF/RF/탱크 사진 몇 장을
 * 나눠 쓰므로, 파일은 한 번만 올리고 주소를 돌려쓴다. 109번 올리면 낭비다.
 *
 * **이미 사진이 있는 품목은 건드리지 않는다.** 손으로 올린 것이 카탈로그보다
 * 정확하다 (실제로 납품한 사양일 수 있다). 덮어쓰려면 `--force`.
 *
 * 사진 파일 자체는 저장소에 넣지 않는다. 카탈로그 PDF에서 다시 뽑을 수 있고,
 * 공개 저장소에 이미지 몇 MB를 얹을 이유가 없다.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const BUCKET = 'product-images'
const PREFIX = 'catalog'

// ---------------------------------------------------------------------------
// 카탈로그 사진 (파일명 → 카탈로그에서의 이름)
// ---------------------------------------------------------------------------
const SHOT = {
    BF: 'p04_00',        // p4  IBC BF-SERIES (150캡 일반형)
    BF_ESD: 'p05_11',    // p5  IBC BF-SERIES [ESD]
    MF: 'p06_19',        // p6  IBC MF-SERIES (225캡 중구경)
    RF: 'p07_27',        // p7  IBC RF-SERIES (430캡 대구경)
    TANK: 'p08_35',      // p8  IBC TANK (프레임 없는 탱크 단품)
    TANK_BLACK: 'p08_36',// p8  IBC TANK Black Color
    BLACK: 'p04_02',     // p4  Optional — Black Color
    TOPCUT: 'p04_04',    // p4  Optional — 상판절개형
    NOVALVE: 'p04_03',   // p4  Optional — 무밸브형

    CAP150: 'p08_38',    // p8  150 CAP
    CAP150AV: 'p08_39',  // p8  150 Airvent CAP
    CAP225AV: 'p08_42',  // p8  225 Airvent CAP
    RCAP: 'p08_43',      // p8  430 / 150 R-CAP

    VALVE_BALL_N2: 'p08_40',   // p8  Ball Valve 노즐형 (2")
    VALVE_BALL_C2: 'p08_41',   // p8  Ball Valve 커플러형 (2")
    VALVE_BFLY_N2: 'p08_44',   // p8  Butterfly Valve 노즐형 (2")
    VALVE_BFLY_N3: 'p08_45',   // p8  Butterfly Valve 노즐형 (3")
    VALVE_BFLY_E3: 'p05_18',   // p5  Butterfly Valve(ESD) 노즐형 (3")

    DRUM_CLOSED: 'p12_69',     // p12 밀폐형 드럼
    DRUM_OPEN: 'p12_70',       // p12 오픈형 드럼
    DRUMCAP_CLOSED: 'p12_71',  // p12 밀폐 캡
    DRUMCAP_OPEN: 'p12_73',    // p12 드럼 캡 (오픈형 검정 뚜껑)
    DRUMCAP_COVER: 'p12_72',   // p12 캡 커버

    JERRY_A: 'p13_74',   // p13 JERRICAN A Type
    JERRY_HB: 'p13_75',  // p13 JERRICAN H / B Type
    JERRY_CAP: 'p13_77', // p13 제리캔 캡
    JERRY_SEC: 'p13_76', // p13 제리캔 보안캡

    FRAME: 'p10_46',     // p10 FRAME
    COUPLER: 'p11_65',   // p11 커플러 어댑터
    NOZZLE2: 'p11_68',   // p11 밸브 노즐 (2")
    NOZZLE3: 'p11_67',   // p11 밸브 노즐 (3")
}

/** 이름이 정확히 일치하는 품목 */
const BY_NAME = {
    // ---- 캡 -------------------------------------------------------------
    '상부캡(150)': SHOT.CAP150,
    '상부캡(에어벤트)': SHOT.CAP150AV,
    '상부캡(225)': SHOT.CAP225AV,
    'R-CAP': SHOT.RCAP,
    '드럼캡': SHOT.DRUMCAP_CLOSED,
    '오픈드럼캡': SHOT.DRUMCAP_OPEN,
    '드럼캡커버': SHOT.DRUMCAP_COVER,
    '제리캔상부캡(일반)B형': SHOT.JERRY_CAP,
    '제리캔상부캡(일반)M형': SHOT.JERRY_CAP,
    '제리캔상부캡(에어벤트)B형': SHOT.JERRY_CAP,
    '제리캔상부캡(에어벤트)M형': SHOT.JERRY_CAP,
    '제리캔 보안캡(덮개형)O형': SHOT.JERRY_SEC,

    // ---- 밸브 -----------------------------------------------------------
    // 카탈로그의 밸브는 2인치(50A) 4종 + 3인치(80A) 2종이다.
    // 3인치는 버터플라이만 있으므로 B=Butterfly, V=Ball로 읽었다.
    // V1/B1 = 노즐형, V2 = 커플러형. (E)는 대전방지(ESD).
    '50V1밸브': SHOT.VALVE_BALL_N2,
    '50V2밸브': SHOT.VALVE_BALL_C2,
    '50B1밸브': SHOT.VALVE_BFLY_N2,
    '80B1밸브': SHOT.VALVE_BFLY_N3,
    '80B1(E)밸브': SHOT.VALVE_BFLY_E3,
    '무밸브': SHOT.NOVALVE,

    // ---- 드럼 · 제리캔 ---------------------------------------------------
    'DRUM-200L(밀폐)청색': SHOT.DRUM_CLOSED,
    'DRUM-200L(오픈)청색': SHOT.DRUM_OPEN,
    '제리캔 20L(A)': SHOT.JERRY_A,
    '제리캔 20L(상품)': SHOT.JERRY_A,
    '제리캔 22L': SHOT.JERRY_A,
    '제리캔 30L': SHOT.JERRY_A,
    '제리캔 20L(H)': SHOT.JERRY_HB,
    '제리캔 30L(H)': SHOT.JERRY_HB,
    '제리캔 20L(B)': SHOT.JERRY_HB,

    // ---- 부품 -----------------------------------------------------------
    '프레임': SHOT.FRAME,
    '밸브연결 커플러': SHOT.COUPLER,
    '자바라(밸브연결파이프)': SHOT.NOZZLE2,
    '자바라(밸브연결파이프)3인치': SHOT.NOZZLE3,
}

/**
 * IBC 모델명으로 사진을 고른다.
 *
 * 모델명 규칙: `BF-A,50V1H(검)I중/소`
 *   BF/MF/RF = 투입구 캡 (150 / 225 / 430)
 *   50/80    = 밸브 구경 2" / 3",  B=버터플라이 V=볼,  (E)=대전방지
 *   검       = Black Color,  (상판)=상판절개형,  탱크=프레임 없는 탱크 단품
 *
 * **판정 순서가 곧 우선순위다.** 탱크는 프레임이 아예 없어 생김새가 가장 다르므로
 * 맨 앞에 둔다. 색은 그 다음이다 (검정은 사진에서 바로 구분된다).
 */
const pickIbc = (name) => {
    if (/부표/.test(name)) return null            // 부표는 IBC가 아니다 — 카탈로그에 없다
    if (/탱크/.test(name)) return /검/.test(name) ? SHOT.TANK_BLACK : SHOT.TANK
    if (/^MF-/.test(name)) return SHOT.MF
    if (/^RF-/.test(name)) return SHOT.RF
    if (/\(상판\)/.test(name)) return SHOT.TOPCUT
    if (/검/.test(name)) return SHOT.BLACK
    if (/\(E\)/.test(name)) return SHOT.BF_ESD
    return SHOT.BF
}

const shotFor = (p) => BY_NAME[p.name] ?? (p.type === 'IBC' ? pickIbc(p.name) : null)

// ---------------------------------------------------------------------------
const main = async () => {
    const args = process.argv.slice(2)
    const apply = args.includes('--apply')
    const force = args.includes('--force')
    const dir = args.find((a) => !a.startsWith('--'))

    if (!dir) {
        console.error('사용법: node execution/apply_catalog_images.mjs <사진폴더> [--apply] [--force]')
        process.exit(1)
    }
    if (!fs.existsSync(dir)) {
        console.error(`폴더가 없습니다: ${dir}`)
        process.exit(1)
    }

    const env = {}
    for (const f of ['.env.local', '.env']) {
        if (!fs.existsSync(f)) continue
        for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
            const s = line.trim()
            if (!s || s.startsWith('#')) continue
            const i = s.indexOf('=')
            if (i > 0 && !(s.slice(0, i) in env)) env[s.slice(0, i)] = s.slice(i + 1).replace(/^["']|["']$/g, '')
        }
    }
    const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

    const { data: products, error } = await sb
        .from('products').select('id,name,type,image_url').order('name').limit(2000)
    if (error) { console.error('품목을 읽지 못했습니다:', error.message); process.exit(1) }

    // 1) 어떤 품목에 어떤 사진을 붙일지 정한다
    const plan = []
    const skipped = []
    for (const p of products) {
        const shot = shotFor(p)
        if (!shot) { skipped.push({ ...p, why: '카탈로그에 사진 없음' }); continue }
        if (p.image_url && !force) { skipped.push({ ...p, why: '이미 사진 있음' }); continue }
        if (!fs.existsSync(path.join(dir, `${shot}.jpg`))) {
            skipped.push({ ...p, why: `사진 파일 없음 (${shot}.jpg)` }); continue
        }
        plan.push({ ...p, shot })
    }

    const shots = [...new Set(plan.map((r) => r.shot))].sort()

    console.log(`\n품목 ${products.length}개 / 붙일 것 ${plan.length}개 / 사진 ${shots.length}장`)
    console.log('─'.repeat(70))
    for (const s of shots) {
        const rows = plan.filter((r) => r.shot === s)
        const label = Object.entries(SHOT).find(([, v]) => v === s)?.[0] ?? s
        console.log(`\n  ${label.padEnd(15)} ${s}   ${rows.length}개`)
        console.log('    ' + rows.slice(0, 8).map((r) => r.name).join(' · ')
            + (rows.length > 8 ? ` … 외 ${rows.length - 8}개` : ''))
    }

    const noPhoto = skipped.filter((s) => s.why === '카탈로그에 사진 없음')
    if (noPhoto.length) {
        console.log(`\n─ 사진 없는 품목 ${noPhoto.length}개 (직접 찍어 올려야 합니다)`)
        console.log('    ' + noPhoto.map((s) => s.name).join(' · '))
    }
    const had = skipped.filter((s) => s.why === '이미 사진 있음')
    if (had.length) console.log(`\n─ 이미 사진이 있어 건너뜀: ${had.length}개 (덮어쓰려면 --force)`)

    if (!apply) {
        console.log('\n미리보기입니다. 실제로 반영하려면 --apply 를 붙이세요.')
        return
    }

    // 2) 사진을 한 번씩만 올린다 (109개 품목이 몇 장을 나눠 쓴다)
    console.log('\n사진 올리는 중…')
    const urlOf = {}
    for (const s of shots) {
        const body = fs.readFileSync(path.join(dir, `${s}.jpg`))
        const key = `${PREFIX}/${s}.jpg`
        const { error: upErr } = await sb.storage.from(BUCKET)
            .upload(key, body, { contentType: 'image/jpeg', upsert: true })
        if (upErr) { console.error(`  ✗ ${s}: ${upErr.message}`); continue }
        urlOf[s] = sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl
        console.log(`  ✓ ${s}  ${Math.round(body.length / 1024)}KB`)
    }

    // 3) 품목에 주소를 붙인다
    console.log('\n품목에 붙이는 중…')
    let done = 0, fail = 0
    for (const r of plan) {
        const url = urlOf[r.shot]
        if (!url) { fail++; continue }
        const { error: e } = await sb.from('products').update({ image_url: url }).eq('id', r.id)
        if (e) { console.error(`  ✗ ${r.name}: ${e.message}`); fail++ } else done++
    }
    console.log(`\n반영 완료 — ${done}개 품목에 사진이 붙었습니다.${fail ? ` (실패 ${fail}개)` : ''}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
