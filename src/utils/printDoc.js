/**
 * 문서를 PDF로 저장하기
 *
 * **PDF 라이브러리를 쓰지 않는다.** jsPDF+html2canvas는 한글 폰트를 따로 심어야
 * 하고 표가 이미지로 나가 글자가 뭉갠다. 브라우저 인쇄가 한글도 표도 깨끗하다.
 *
 * 다만 그냥 `window.print()`를 부르면 저장되는 파일 이름이 브라우저 탭 제목
 * (`아이앤디 CRM | 견적서`)이 된다. 견적서를 여러 장 받아 두면 어느 것이
 * 어느 거래처인지 알 수 없다.
 *
 * **브라우저는 저장할 때 `document.title`을 파일 이름으로 쓴다.** 그래서
 * 인쇄 직전에 제목을 바꿔 두고 끝나면 되돌린다.
 */

/** 파일 이름에 못 쓰는 글자를 바꾼다 (Windows 기준이 가장 좁다) */
const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()

/**
 * @param filename 확장자 없이. 예: `견적서_Q-20260815-01_한솔케미칼`
 * @param onDone   인쇄창이 닫힌 뒤 부를 것 (선택)
 */
export const printAs = (filename, onDone) => {
    const original = document.title
    const restore = () => {
        document.title = original
        window.removeEventListener('afterprint', restore)
        if (typeof onDone === 'function') onDone()
    }

    document.title = safe(filename) || original
    window.addEventListener('afterprint', restore)

    // 제목이 실제로 바뀐 뒤에 인쇄창을 연다.
    // 같은 틱에 부르면 브라우저가 예전 제목을 잡는 경우가 있다.
    setTimeout(() => {
        window.print()
        // afterprint를 안 주는 브라우저(구형 사파리 등)를 위한 보험
        setTimeout(restore, 1500)
    }, 60)
}

/** `견적서_Q-20260815-01_(주)한솔케미칼` */
export const quoteFileName = (quote) =>
    ['견적서', quote?.quote_no, quote?.client_name].filter(Boolean).join('_')

/** `발주서_PO-20260815-01_대달인터내셔널` */
export const poFileName = (order) =>
    ['발주서', order?.po_no, order?.vendor_name].filter(Boolean).join('_')

export default printAs
