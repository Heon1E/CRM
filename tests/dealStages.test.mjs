/**
 * 영업 단계 회귀 테스트
 *
 * 파이프라인 숫자가 틀리면 "이번 달에 뭐가 떨어지나"를 잘못 보고 움직이게 된다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    STAGES, CLOSED, STAGE_KEYS, OPEN_KEYS, isOpen, isWon, isLost,
    probabilityOf, weightedAmount, daysInStage, isStale, isOverdue,
    summarize, groupByStage, STALE_DAYS,
} from '../src/utils/dealStages.js'

const NOW = new Date('2026-08-15T12:00:00Z').getTime()
const DAY = 86400000
const ago = (d) => new Date(NOW - d * DAY).toISOString()

test('열린 단계와 닫힌 단계가 겹치지 않는다', () => {
    assert.equal(STAGE_KEYS.length, STAGES.length + CLOSED.length)
    assert.ok(OPEN_KEYS.every((k) => !['수주', '실패'].includes(k)))
    assert.equal(isOpen('협상'), true)
    assert.equal(isOpen('수주'), false)
    assert.equal(isWon('수주'), true)
    assert.equal(isLost('실패'), true)
})

test('확률은 단계 기본값을 쓰되 건별 값이 이긴다', () => {
    assert.equal(probabilityOf({ stage: '제안' }), 45)
    assert.equal(probabilityOf({ stage: '제안', probability: 70 }), 70)
    assert.equal(probabilityOf({ stage: '제안', probability: 0 }), 0)   // 0도 값이다
    assert.equal(probabilityOf({ stage: '제안', probability: '' }), 45) // 빈칸은 값이 아니다
    assert.equal(probabilityOf({ stage: '없는단계' }), 0)
})

test('확률은 0~100으로 자른다', () => {
    assert.equal(probabilityOf({ stage: '리드', probability: 150 }), 100)
    assert.equal(probabilityOf({ stage: '리드', probability: -20 }), 0)
})

test('가중 금액 = 금액 × 확률', () => {
    assert.equal(weightedAmount({ stage: '협상', amount: 1000 }), 800)
    assert.equal(weightedAmount({ stage: '협상', amount: 1000, probability: 50 }), 500)
    assert.equal(weightedAmount({ stage: '리드' }), 0)
})

test('정체는 stage_changed_at으로 잰다 — updated_at이면 메모만 고쳐도 초기화된다', () => {
    const d = { stage: '협상', stage_changed_at: ago(30), updated_at: ago(0) }
    assert.equal(daysInStage(d, NOW), 30)
    assert.equal(isStale(d, NOW), true)   // 협상은 21일이 한도
})

test('샘플은 오래 걸리는 게 정상이라 기준이 길다', () => {
    // 똑같이 30일로 두면 샘플 건이 전부 빨갛게 떠서 경고가 의미를 잃는다
    assert.ok(STALE_DAYS['샘플'] > STALE_DAYS['협상'])
    assert.equal(isStale({ stage: '샘플', stage_changed_at: ago(45) }, NOW), false)
    assert.equal(isStale({ stage: '샘플', stage_changed_at: ago(70) }, NOW), true)
})

test('닫힌 건은 정체로 보지 않는다', () => {
    assert.equal(isStale({ stage: '수주', stage_changed_at: ago(999) }, NOW), false)
    assert.equal(isStale({ stage: '실패', stage_changed_at: ago(999) }, NOW), false)
})

test('예상 마감이 지났으면 표시한다 (닫힌 건은 제외)', () => {
    assert.equal(isOverdue({ stage: '협상', expected_close: '2026-08-14' }, NOW), true)
    assert.equal(isOverdue({ stage: '협상', expected_close: '2026-08-16' }, NOW), false)
    assert.equal(isOverdue({ stage: '협상' }, NOW), false)
    assert.equal(isOverdue({ stage: '수주', expected_close: '2020-01-01' }, NOW), false)
})

test('요약 — 열린 금액과 기대값을 나눠 센다', () => {
    const deals = [
        { stage: '제안', amount: 1000, stage_changed_at: ago(5) },     // 45% → 450
        { stage: '협상', amount: 2000, stage_changed_at: ago(40) },    // 80% → 1600, 정체
        { stage: '수주', amount: 3000 },
        { stage: '실패', amount: 500 },
    ]
    const s = summarize(deals, NOW)
    assert.equal(s.openCount, 2)
    assert.equal(s.openAmount, 3000)
    assert.equal(s.weighted, 2050)
    assert.equal(s.staleCount, 1)
    assert.equal(s.wonCount, 1)
    assert.equal(s.wonAmount, 3000)
    assert.equal(s.lostCount, 1)
})

test('수주율은 닫힌 건만 놓고 센다', () => {
    // 진행 중인 건을 분모에 넣으면 기회를 많이 만들수록 수주율이 떨어진다
    const s = summarize([
        { stage: '수주', amount: 1 }, { stage: '실패', amount: 1 },
        { stage: '리드', amount: 1 }, { stage: '리드', amount: 1 }, { stage: '리드', amount: 1 },
    ], NOW)
    assert.equal(s.winRate, 50)
})

test('닫힌 건이 없으면 수주율은 없다 (0%가 아니다)', () => {
    assert.equal(summarize([{ stage: '리드', amount: 1 }], NOW).winRate, null)
    assert.equal(summarize([], NOW).winRate, null)
})

test('빈 단계도 칸을 남긴다 — 보드는 자리가 고정돼야 읽힌다', () => {
    const g = groupByStage([{ stage: '제안', amount: 1 }])
    assert.equal(Object.keys(g).length, STAGE_KEYS.length)
    assert.deepEqual(g['리드'], [])
    assert.equal(g['제안'].length, 1)
})

test('빈 입력에도 죽지 않는다', () => {
    assert.equal(summarize(null, NOW).openCount, 0)
    assert.equal(daysInStage(null, NOW), 0)
    assert.equal(isStale(null, NOW), false)
})
