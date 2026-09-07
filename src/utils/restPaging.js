/**
 * 서버(`api/`)에서 PostgREST를 직접 부를 때 쓰는 쪽 나누기.
 *
 * ## `limit=5000`으로는 1,000행 상한이 풀리지 않는다
 *
 * 한 번에 돌려주는 행 수는 서버 설정(`max-rows`)이 정한다. 아무리 크게 적어도
 * **1,000에서 끊기고, 오류도 경고도 없다.** 실측:
 *
 * ```
 * 거래처 전체            1,169
 * limit=5000 한 방  ->   1,000     ← 169곳이 조용히 빠진다
 * offset 끊어 받기  ->   1,169     (고유 id 1,169개)
 * ```
 *
 * 두 자리에서 실제로 새고 있었다:
 *
 * - **텔레그램 봇의 거래처 매칭**(`loadClients`) — 빠진 169곳은 통화 녹음에서
 *   이름이 나와도 못 찾아 **'새 거래처'로 등록된다.** 매출은 원래 행에, 활동은
 *   새 행에 갈려 영업 코치가 같은 회사를 둘로 센다.
 * - **아침 브리핑**(`daily-digest`) — 빠진 곳의 후속조치가 `(이름 없음)`으로
 *   나간다. 무엇을 하기로 했는지는 적혀 있는데 누구인지가 없다.
 *
 * ## `order`를 반드시 준다
 *
 * 정렬이 없거나 유일하지 않으면 쪽 경계에서 **어떤 행은 두 번 오고 어떤 행은
 * 아예 안 온다.** 예전 코드에는 `order`가 아예 없어서 **어느 169곳이 빠지는지
 * 그때그때 달랐다** — 같은 거래처가 어제는 이름이 나오고 오늘은 안 나온다.
 */

/** 조회 경로에 정렬·쪽 정보를 붙인다. */
export const withPaging = (pathBase, offset, limit, orderBy = 'id') => {
    const sep = String(pathBase).includes('?') ? '&' : '?'
    return `${pathBase}${sep}order=${orderBy}.asc&limit=${limit}&offset=${offset}`
}

/**
 * 다 받을 때까지 끊어 받는다.
 *
 * @param {(path: string) => Promise<any[]>} get 한 쪽을 받아오는 함수
 * @param {string} pathBase `clients?select=id,company` 처럼 정렬·쪽 정보가 없는 경로
 */
export const fetchAllPages = async (get, pathBase, { pageSize = 1000, orderBy = 'id' } = {}) => {
    const out = []
    for (let offset = 0; ; offset += pageSize) {
        const rows = await get(withPaging(pathBase, offset, pageSize, orderBy))
        out.push(...(rows || []))
        if (!rows || rows.length < pageSize) break
    }
    return out
}
