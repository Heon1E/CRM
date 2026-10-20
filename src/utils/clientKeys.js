/**
 * 거래처명 맞추기용 키 만들기 (순수 함수)
 *
 * 같은 회사가 자료마다 다르게 적힌다 — `㈜한솔케미칼` · `(주)한솔케미칼` ·
 * `한솔케미칼 주식회사` · `한솔케미칼`. 그대로 비교하면 전부 다른 회사가 되고,
 * 그러면 **같은 회사가 하나 더 만들어진다.**
 *
 * 그래서 이름 하나에서 네 가지 키를 만들어 그중 하나라도 맞으면 같은 곳으로 본다.
 *
 * **여기 하나만 둔다.** 예전에는 `useSalesImport.js`(React를 import한다) 안에
 * 있어서 `execution/` 스크립트가 쓰지 못했고, 그래서 스크립트마다 비슷하지만
 * 다른 규칙을 다시 짰다. 실제로 그 때문에 채권 반영에서 세 곳이 연결되지
 * 않았다 — `clientAliases.js`에 이미 적혀 있는 별칭을 안 보는 규칙이었다.
 * 저장소가 되풀이해 경고하는 것이다: **규칙이 두 벌이면 반드시 갈린다.**
 */

import { nameCandidates } from './clientAliases.js'

export const normalizeKey = (name, { removeCorp = false, removePunct = false } = {}) => {
    if (!name) return ''
    let text = name
        .toString()
        .replace(/​|﻿/g, '') // zero-width chars
        .replace(/ /g, ' ') // nbsp
        .replace(/[（]/g, '(')
        .replace(/[）]/g, ')')
        .replace(/㈜/g, '(주)')
        .trim()

    if (removeCorp) {
        text = text.replace(/주식회사|유한회사|합자회사|합명회사|유한|㈜|\(주\)|\(유\)/g, '')
    }

    if (removePunct) {
        text = text.replace(/[\s\(\)\[\]\{\}\-_.·]/g, '')
    } else {
        text = text.replace(/\s+/g, '')
    }

    return text.toLowerCase()
}

export const buildClientKeys = (name) => {
    const keys = new Set()
    keys.add(normalizeKey(name))
    keys.add(normalizeKey(name, { removeCorp: true }))
    keys.add(normalizeKey(name, { removePunct: true }))
    keys.add(normalizeKey(name, { removeCorp: true, removePunct: true }))
    return Array.from(keys).filter(Boolean)
}

/**
 * 이름으로 거래처를 찾는 함수를 만든다 — **앱의 모든 입력 경로가 이것 하나를 쓴다.**
 *
 * 키만 맞춰 보면(`buildClientKeys`) 별칭표를 못 본다. 그래서 합쳐 둔 거래처가
 * 다음 업로드에서 **새 거래처로 되살아났다** — 2026-08에 `신성물산(주)`를
 * `대달인터내셔널(주)`로 합쳤는데, 2026-10-01 매출 엑셀에 옛 이름이 적혀 있자
 * 매출 업로드가 그것을 못 찾고 새로 만들었다. 같은 실수가 실적표 저장
 * (ErpScreenshotImport·InboxPanel)에도 있었다. 찾는 규칙이 경로마다 따로 있으면
 * 한쪽만 고쳐진다.
 *
 * 후보 순서는 `nameCandidates`를 따른다 — **별칭이 맨 앞**이고, 그다음 적힌 이름,
 * 괄호 안팎, 공장 접미사를 뗀 이름이다.
 *
 * @param {Array<object>} clients
 * @param {{ nameOf?: (c: object) => string }} [opts]
 * @returns {((raw: string) => object|null) & { add: (c: object) => void }}
 *   `add`는 방금 만든 거래처를 다시 조회하지 않고 끼워 넣을 때 쓴다.
 */
export const makeClientFinder = (clients, { nameOf = (c) => c.company } = {}) => {
    const map = new Map()
    const add = (c) => {
        buildClientKeys(nameOf(c)).forEach((k) => { if (!map.has(k)) map.set(k, c) })
    }
    ;(clients || []).forEach(add)

    const find = (raw) => {
        for (const cand of nameCandidates(raw)) {
            const hit = buildClientKeys(cand).map((k) => map.get(k)).find(Boolean)
            if (hit) return hit
        }
        return null
    }
    find.add = add
    return find
}
