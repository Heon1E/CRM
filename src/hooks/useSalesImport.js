/**
 * 매출 일괄 반영 파이프라인 (엑셀 / ERP 스크린샷 공용)
 *
 * 원래 이 로직은 SalesExcelUpload.jsx 안에만 있었다. 스크린샷 입력이 생기면서
 * 저장 경로를 하나 더 만들면 안 되기에 여기로 뽑았다.
 * **매출을 쓰는 경로는 이 훅 하나뿐이어야 한다.** 2026-08-05에 대사를 우회한
 * 경로로 2,835건이 중복 등록된 적이 있다. 새 입력 수단이 생겨도 반드시 여기를 거칠 것.
 *
 * 처리 순서 (순서 자체가 중요하다):
 *   1. 거래처명 퍼지 매칭
 *   2. 미매칭 업체를 **한 번에** 먼저 생성   <- 날짜별 저장 루프보다 앞이어야 한다
 *   3. 끝내 확정 못한 행은 저장하지 않고 사용자에게 알림
 *   4. 엑셀에 등장하는 날짜의 기존 매출만 조회
 *   5. 대사(reconcileSales)
 *   6. 미리보기 -> 사용자 승인
 *   7. 반영 (삭제 -> 수정 -> 등록)
 */

import { useState, useCallback } from 'react'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabase'
import { showError, showWarning, showInfo, showHtmlConfirm } from '../utils/alert'
import { reconcileSales } from '../utils/salesReconciler'

export const normalizeKey = (name, { removeCorp = false, removePunct = false } = {}) => {
    if (!name) return ''
    let text = name
        .toString()
        .replace(/\u200B|\uFEFF/g, '') // zero-width chars
        .replace(/\u00A0/g, ' ') // nbsp
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

export const fetchAllRows = async (buildQuery, pageSize = 1000) => {
    let from = 0
    let results = []

    for (;;) {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1)
        if (error) throw error
        results = results.concat(data || [])
        if (!data || data.length < pageSize) break
        from += pageSize
    }

    return results
}

const won = (v) => Number(v || 0).toLocaleString('ko-KR') + '원'

export function useSalesImport() {
    const {
        registerMissingProductsFromSales,
        registerMissingClients,
        applySalesReconciliation
    } = useData()

    const [isImporting, setIsImporting] = useState(false)
    const [progress, setProgress] = useState({ current: 0, total: 0, stage: '' })

    const reset = useCallback(() => {
        setIsImporting(false)
        setProgress({ current: 0, total: 0, stage: '' })
    }, [])

    /**
     * @param {Array} rows - { clientName, sale_date, item_name, quantity, unitPrice, notes }
     * @param {Object} opts
     * @param {string} opts.sourceLabel - 미리보기 제목에 붙일 출처 ('엑셀' / 'ERP 화면' 등)
     * @returns {Promise<{ ok: boolean, reason?: string, stats?: object, applyResult?: object, message?: string }>}
     */
    const importSalesRows = useCallback(async (rows, { sourceLabel = '' } = {}) => {
        if (!rows || rows.length === 0) {
            await showWarning('반영할 매출 데이터가 없습니다.')
            return { ok: false, reason: 'empty' }
        }

        setIsImporting(true)

        try {
            // ---- 1. 거래처 매칭 ----
            setProgress({ current: 0, total: 0, stage: '거래처 목록 불러오는 중' })

            const fetchedClients = await fetchAllRows(() =>
                supabase.from('clients').select('id, company').order('company')
            )

            const clientMap = new Map()
            ;(fetchedClients || []).forEach((c) => {
                buildClientKeys(c.company).forEach((key) => {
                    if (!clientMap.has(key)) clientMap.set(key, c)
                })
            })

            setProgress({ current: 0, total: rows.length, stage: '거래처 매칭 중' })

            let validatedSales = []
            rows.forEach((sale) => {
                if (!sale.clientName || String(sale.clientName).trim() === '') return

                const client = buildClientKeys(sale.clientName).map((k) => clientMap.get(k)).find(Boolean)
                const quantity = Number(sale.quantity) || 0
                const unitPrice = Number(sale.unitPrice) || 0

                validatedSales.push({
                    clientId: client ? client.id : null,
                    clientName: String(sale.clientName).trim(),
                    sale_date: sale.sale_date,
                    item_name: sale.item_name,
                    quantity,
                    unitPrice,
                    // 총액은 항상 수량×단가로 다시 계산한다. 스크린샷 판독은
                    // 합계 칸을 잘못 읽을 수 있는데, 그러면 대사가 어긋난다.
                    totalAmount: quantity * unitPrice,
                    notes: sale.notes
                })
            })

            if (validatedSales.length === 0) {
                await showWarning('거래처명이 있는 행이 하나도 없습니다.')
                return { ok: false, reason: 'no-client-name' }
            }

            // ---- 2. 미매칭 거래처를 한 번에 먼저 생성 ----
            // 이 단계를 건너뛰면 매출이 client_id 없이 저장되어 '알수없음'으로 남는다.
            // 날짜별 저장 루프보다 앞에서 처리해야 같은 업체가 여러 날짜에 나와도
            // 거래처가 중복 생성되지 않는다.
            const createdClientNames = []
            const unresolvedRows = validatedSales.filter((s) => !s.clientId)

            if (unresolvedRows.length > 0) {
                setProgress({ current: 0, total: unresolvedRows.length, stage: '신규 거래처 등록 중' })

                // 같은 업체의 표기 흔들림을 하나로 묶어 중복 생성을 막는다.
                // ('주식회사한국' / '(주)한국' / '한국' -> 모두 하나)
                const newNameByKey = new Map()
                unresolvedRows.forEach((s) => {
                    const key = normalizeKey(s.clientName, { removeCorp: true, removePunct: true })
                    if (key && !newNameByKey.has(key)) newNameByKey.set(key, s.clientName)
                })

                try {
                    const created = await registerMissingClients(Array.from(newNameByKey.values()))
                    created.forEach((c) => {
                        createdClientNames.push(c.company)
                        buildClientKeys(c.company).forEach((key) => {
                            if (!clientMap.has(key)) clientMap.set(key, c)
                        })
                    })
                } catch (clientError) {
                    console.error('신규 거래처 자동 등록 실패:', clientError)
                }

                validatedSales.forEach((s) => {
                    if (s.clientId) return
                    const match = buildClientKeys(s.clientName).map((k) => clientMap.get(k)).find(Boolean)
                    if (match) s.clientId = match.id
                })
            }

            // ---- 3. 끝내 확정 못한 행은 저장하지 않는다 ----
            const orphanRows = validatedSales.filter((s) => !s.clientId)
            if (orphanRows.length > 0) {
                const orphanNames = [...new Set(orphanRows.map((s) => s.clientName))]
                await showWarning(
                    `다음 거래처를 등록하지 못해 매출 ${orphanRows.length}건을 건너뜁니다:\n` +
                    `${orphanNames.join(', ')}\n\n` +
                    `거래처를 직접 추가한 뒤 다시 시도해 주세요.`
                )
                validatedSales = validatedSales.filter((s) => s.clientId)
            }

            if (validatedSales.length === 0) return { ok: false, reason: 'no-client-id' }

            // ---- 4. 대상 날짜의 기존 매출만 조회 ----
            const targetDates = [...new Set(validatedSales.map((s) => s.sale_date).filter(Boolean))]
            if (targetDates.length === 0) {
                await showWarning('유효한 날짜가 없습니다.')
                return { ok: false, reason: 'no-date' }
            }

            setProgress({ current: 0, total: targetDates.length, stage: '기존 매출 조회 중' })
            let existingSales = []
            try {
                existingSales = await fetchAllRows(() =>
                    supabase
                        .from('sales')
                        .select('*')
                        // 정렬이 없으면 .range() 페이지 사이에서 행이 중복/누락된다.
                        // 대사 결과가 통째로 틀어지므로 반드시 지정할 것.
                        .order('id', { ascending: true })
                        .in('sale_date', targetDates)
                )
            } catch (error) {
                console.error('기존 매출 데이터 조회 오류:', error)
                await showError('기존 매출 데이터를 불러오는 중 오류가 발생했습니다.')
                return { ok: false, reason: 'fetch-failed' }
            }

            // ---- 5. 대사 ----
            setProgress({ current: 0, total: validatedSales.length, stage: '기존 데이터와 대조 중' })
            const plan = reconcileSales(validatedSales, existingSales || [])
            const { stats } = plan

            if (stats.insert + stats.update + stats.delete === 0) {
                await showInfo(
                    `이미 모두 등록된 데이터입니다. 변경할 내용이 없습니다.\n(대조한 매출 ${stats.unchanged}건)`,
                    '변경 사항 없음'
                )
                return { ok: true, stats, applyResult: { inserted: 0, updated: 0, deleted: 0, errors: [] } }
            }

            // ---- 6. 미리보기 -> 승인 ----
            const diff = stats.amountAfter - stats.amountBefore
            const diffText = diff === 0
                ? '변동 없음'
                : `${diff > 0 ? '+' : '-'}${Number(Math.abs(diff)).toLocaleString('ko-KR')}원`

            const deleteSample = plan.toDelete.slice(0, 5).map((r) =>
                `<li>${r.sale_date} · ${r.item_name || '(품목없음)'} · ${won(r.total_amount)}${r.client_id ? '' : ' <b>(거래처 없음)</b>'}</li>`
            ).join('')
            const updateSample = plan.toUpdate.slice(0, 5).map((u) =>
                `<li>${u.db.sale_date} · ${u.db.item_name || '(품목없음)'} — ${u.changes.map((c) => `${c.field} ${Number(c.before).toLocaleString('ko-KR')} → <b>${Number(c.after).toLocaleString('ko-KR')}</b>`).join(', ')}</li>`
            ).join('')

            const previewHtml = `
        <div style="text-align:left">
          <p style="margin:0 0 10px"><b>대상 기간:</b> ${plan.targetDates[0]} ~ ${plan.targetDates[plan.targetDates.length - 1]} (${plan.targetDates.length}개 날짜)</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px">
            <tr><td style="padding:5px 0">그대로 유지</td><td style="text-align:right"><b>${stats.unchanged}건</b></td></tr>
            <tr><td style="padding:5px 0;color:#007538">신규 등록</td><td style="text-align:right;color:#007538"><b>${stats.insert}건</b></td></tr>
            <tr><td style="padding:5px 0;color:#ca8a04">금액·수량 수정</td><td style="text-align:right;color:#ca8a04"><b>${stats.update}건</b></td></tr>
            <tr><td style="padding:5px 0;color:#dc2626">삭제</td><td style="text-align:right;color:#dc2626"><b>${stats.delete}건</b></td></tr>
          </table>
          <p style="margin:0 0 10px;padding:8px;background:#f8fafc;border-radius:6px">
            해당 기간 매출: ${won(stats.amountBefore)} → <b>${won(stats.amountAfter)}</b> (${diffText})
          </p>
          ${updateSample ? `<p style="margin:10px 0 4px"><b>수정될 항목</b>${stats.update > 5 ? ` (${stats.update}건 중 5건)` : ''}</p><ul style="margin:0;padding-left:18px;font-size:12px">${updateSample}</ul>` : ''}
          ${deleteSample ? `<p style="margin:10px 0 4px;color:#dc2626"><b>삭제될 항목</b>${stats.delete > 5 ? ` (${stats.delete}건 중 5건)` : ''}</p><ul style="margin:0;padding-left:18px;font-size:12px">${deleteSample}</ul>` : ''}
          ${stats.delete > 0 ? `<p style="margin:12px 0 0;font-size:12px;color:#dc2626">※ 삭제는 되돌릴 수 없습니다. 자료가 이 기간 전체를 담고 있는지 확인해 주세요.</p>` : ''}
        </div>
      `

            const title = sourceLabel ? `${sourceLabel} — 반영할 내용을 확인해 주세요` : '반영할 내용을 확인해 주세요'
            const approved = await showHtmlConfirm(previewHtml, title, '반영하기', '취소')
            if (!approved) return { ok: false, reason: 'cancelled', stats }

            // ---- 7. 반영 ----
            const applyResult = await applySalesReconciliation(plan, (p) => {
                setProgress({ current: p.current, total: p.total, stage: p.stage })
            })

            let message =
                `신규 ${applyResult.inserted}건 · 수정 ${applyResult.updated}건 · 삭제 ${applyResult.deleted}건 · 유지 ${stats.unchanged}건`
            if (createdClientNames.length > 0) {
                message += `\n\n신규 거래처 ${createdClientNames.length}개를 자동 등록했습니다:\n${createdClientNames.join(', ')}\n(담당자·연락처는 거래처 화면에서 보완해 주세요)`
            }

            // 품목 마스터 동기화 (연결 누락 보정)
            if (applyResult.inserted > 0 || stats.unchanged > 0) {
                try {
                    if (registerMissingProductsFromSales) {
                        setProgress((prev) => ({ ...prev, stage: '품목 동기화 및 매출 연결 중...' }))
                        await registerMissingProductsFromSales()
                    }
                } catch (syncError) {
                    console.error('자동 품목 동기화 실패:', syncError)
                    ;(applyResult.errors = applyResult.errors || []).push(
                        `데이터는 저장되었으나 품목 연결에 실패했습니다: ${syncError.message}`
                    )
                }
            }

            return { ok: true, stats, applyResult, message, createdClientNames }
        } catch (error) {
            console.error('매출 반영 오류:', error)
            await showError(`매출 반영 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
            return { ok: false, reason: 'error', error }
        } finally {
            reset()
        }
    }, [registerMissingClients, registerMissingProductsFromSales, applySalesReconciliation, reset])

    return { importSalesRows, isImporting, progress }
}
