import test from 'node:test'
import assert from 'node:assert/strict'

/*
 * `api/` 파일이 **문법적으로 성한지**만 본다. 부르지는 않는다.
 *
 * 프롬프트가 전부 템플릿 리터럴 안에 들어 있어서, 설명에 백틱을 하나 쓰면
 * 거기서 문자열이 끝나 버린다 — 파일 전체가 깨진다. 실제로 두 번 났다:
 *
 *   - "TalkFile_....m4a" 를 백틱으로 감쌌다가 telegram-webhook.js 가 깨졌다
 *   - `amount` 라고 적었다가 또 깨졌다 (analyze-erp.js · telegram-webhook.js)
 *
 * 뒤쪽은 `telegramFingerprint.test.mjs` 가 우연히 잡았다 — 그 파일을
 * import 하기 때문이다. **`analyze-erp.js` 는 아무 테스트도 부르지 않아
 * 깨진 채로 배포될 수 있었다.** 화면에서 스크린샷을 올려야만 드러난다.
 *
 * 문서를 고칠 때는 백틱 대신 따옴표를 쓸 것.
 */

const MODULES = [
    '../api/analyze-erp.js',
    '../api/telegram-webhook.js',
    '../api/daily-digest.js',
    '../api/telegram-setup.js',
    '../api/polish-note.js',
    '../api/analyze-call.js',
    '../api/client-briefing.js',
]

for (const path of MODULES) {
    test(`${path} 가 문법 오류 없이 읽힌다`, async () => {
        const mod = await import(path)
        assert.equal(typeof mod.default, 'function', 'default export 가 핸들러여야 한다')
    })
}
