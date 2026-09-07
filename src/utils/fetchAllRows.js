/**
 * 1,000행씩 끊어 전부 받는다.
 *
 * Supabase는 한 번에 최대 1,000행만 준다(서버 `max-rows`). `.range()`로 끊지
 * 않으면 **오류 없이** 뒷부분이 사라진다 — 백업이 매출 15,530건 중 1,000건만
 * 담고 "완료"라고 말하던 것이 그 예다.
 *
 * ## 정렬 기준이 유일해야 한다
 *
 * `.order()`를 준 것만으로는 부족하다. 값이 같은 행끼리의 순서는 정해져 있지
 * 않아서, 쪽 경계에서 **어떤 행은 두 번 오고 어떤 행은 아예 안 온다**
 * (2026-08-15: 매출 15,221행 중 27행이 겹치고 27행이 빠졌다. 오류도 없고
 * 행 수도 맞아 보여서 조용했다).
 *
 * 여기서 실제로 새고 있었다 — 거래처 목록을 `.order('company')`로 받는데
 * **회사명은 유일하지 않다.** 거래처가 1,167곳이라 쪽이 둘로 갈리고, 경계에서
 * 한 곳이 빠지면 그 회사의 엑셀 행이 매칭에 실패해 **같은 거래처가 하나 더
 * 만들어진다.** 매출을 쓰는 유일한 경로(`useSalesImport`)라 여파가 그대로 남는다.
 *
 * 그래서 **부르는 쪽이 무엇으로 정렬했든 `id`를 마지막 기준으로 더한다.**
 * 호출부마다 기억해서 붙이게 하면 새 호출이 생길 때마다 또 빠진다
 * (`fetchAllRecords`가 같은 이유로 같은 일을 한다).
 *
 * ## 조회는 쪽마다 새로 짓는다
 *
 * `buildQuery`를 **함수로** 받는 이유다. Supabase 빌더는 `.range()`가 새 객체를
 * 주는 것이 아니라 자기 자신에 조건을 붙이고 자기를 돌려주며, 한 번 `await`하면
 * 약속이 굳어 다시 기다려도 요청이 나가지 않는다. 빌더 하나를 만들어 두고
 * 돌려 쓰면 두 번째 쪽이 영영 오지 않는다.
 *
 * @param {() => object} buildQuery 쪽마다 새로 지을 Supabase 조회
 * @param {number} pageSize 한 번에 받을 행 수
 */
export const fetchAllRows = async (buildQuery, pageSize = 1000) => {
    let from = 0
    let results = []

    for (;;) {
        const { data, error } = await buildQuery()
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1)
        if (error) throw error
        results = results.concat(data || [])
        if (!data || data.length < pageSize) break
        from += pageSize
    }

    return results
}

export default fetchAllRows
