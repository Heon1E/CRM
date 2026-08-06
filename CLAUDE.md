# CLAUDE.md

React + Vite + Supabase 기반 B2B 영업 CRM (Xavian CRM). Capacitor로 iOS/Android 패키징, Vercel 배포.

> 에이전트 운영 원칙(3-Layer Architecture, self-annealing)은 `directives/Agent.md`에 있다. **작업 시작 전 반드시 읽을 것.**
> 코드 컨벤션(Supabase 데이터 정제, 백지화면 방지 Guard Clause, 에러 처리)은 `.cursorrules`에 있다.
> 디자인 토큰/색상/타이포그래피는 `DESIGN.md`.

## 명령어

```bash
npm run dev            # Vite dev server, port 5173 (strictPort)
npm run build          # 프로덕션 빌드
npm run test:unit      # 매출 추정 엔진 회귀 테스트 (node --test, 의존성 없음)
npm run test:e2e       # Playwright E2E (tests/sanity.spec.ts)
npm run test:e2e:headed
```

> `npm run build`가 esbuild 플랫폼 에러("installed esbuild for another platform")로 실패하면
> `node_modules/@esbuild/win32-x64/`에 `esbuild.exe`가 빠진 것이다(package.json/README만 존재).
> `npm rebuild esbuild`는 듣지 않는다. 해당 폴더를 지우고 다시 받아야 한다:
>
> ```bash
> rm -rf node_modules/@esbuild/win32-x64 && npm install @esbuild/win32-x64@0.21.5 --no-save --force
> ```

업로드 UI는 **Settings 페이지의 BULK DATA OPERATIONS 패널**에 있다 (`/sales`가 아니다).
브라우저 확인용 dev 서버 설정은 `.claude/launch.json`(`crm-dev`, 포트 5173).

## 디자인 시스템

**`src/index.css`가 단일 기준이다.** `DESIGN.md` 스펙(Indigo Purple `#833CF6`, 8px radius, Inter)을 구현한다.
예전엔 다크 이머럴드(`:root`) / Oracle 레드(tailwind `oem-*`) / 대시보드 레드(`.dashboard-light`) /
DESIGN.md 보라 — 네 가지가 뒤섞여 어느 것도 완성되지 않은 상태였다. 변수 **이름은 유지하고 값만** 브랜드에
맞춰 전체를 한 번에 정렬했으므로, 색을 바꾸려면 `index.css`의 토큰만 고치면 된다.

지켜야 할 규칙:

- **`html`은 반드시 16px.** Tailwind의 `text-xs`(0.75rem) 등이 전부 rem 기준이라, 여기를 15px로 낮추면
  앱 전체 글자가 조용히 6% 작아진다(`text-xs`가 11.3px이 됨). 본문 크기는 `body`에서 조정한다.
- **하드코딩 색상 금지.** `bg-[#1E1E1E]`, `text-white`, `text-gray-300` 같은 다크 테마 잔재를 밝은 배경에
  남기면 글씨가 보이지 않는다. `var(--text-primary)` 등 토큰을 쓸 것.
- **터치 영역 44px.** `index.css`가 아이콘 전용 버튼(`button:has(> svg:only-child)`)과 모바일 입력칸을
  전역으로 보정한다. 개별 컴포넌트에서는 `.icon-btn` / `min-h-tap`을 쓴다.
- **모바일 입력칸은 16px 폰트.** 16px 미만이면 iOS 사파리가 포커스 시 화면을 자동 확대한다.
  전역 규칙으로 처리되어 있으니 컴포넌트에서 `text-sm` 등으로 덮어쓰지 말 것.
- **목록은 데스크톱=표 / 모바일=카드.** `hidden md:block` + `md:hidden` 쌍으로 나눈다.
  카드 마크업은 `.data-card` 유틸을 쓴다. Sales·Products·Clients가 이 패턴을 따른다.
- 행 액션 버튼에 `opacity-0 group-hover:opacity-100`을 쓰지 말 것. 터치 기기엔 hover가 없어 버튼이
  아예 보이지 않는다.
- **Tailwind 색상 클래스를 쓰기 전에 `tailwind.config.js`에 정의되어 있는지 확인할 것.** `oem-blue`가
  17개 파일에서 123번 쓰이는데 설정에 없어 전부 무효였다. 다크 테마 시절엔 티가 안 났지만 배경이
  밝아지자 `bg-oem-blue text-white`가 '투명 배경 + 흰 글씨'가 되어 텍스트가 사라졌다.

검증은 브라우저에서 수치로 한다(스크린샷 없이도 가능): 가로 오버플로, 44px 미만 터치 영역,
12px 미만 글씨, 배경/글자 대비비. 특히 **색을 일괄 변경한 뒤에는 대비비 검사를 반드시 돌릴 것** —
배경만 밝게 바뀌고 흰 글씨가 남으면 텍스트가 사라진다.

## 알려진 손상 파일

`src/components/SalesCalendar.jsx`는 한글이 깨져(U+FFFD 85개) 문법 오류가 있는 상태다.
**어디에서도 import되지 않아** 빌드는 통과한다. 되살리려면 인코딩부터 복구해야 한다.

## 아키텍처

**3-Layer** (`.cursorrules` 참고)
- `directives/` — SOP 문서. `execution/` — 유지보수 스크립트(.mjs) 및 `execution/sql/` 마이그레이션. `src/` — React 앱. 루트 — 빌드 설정(이동 금지).

**상태 관리는 Context 중심. Redux 없음.**
- `src/contexts/DataContext.jsx` (1900줄) — 앱의 데이터 허브. clients/sales/activities/products를 Supabase에서 페이지네이션으로 전량 로드하고, `dashboardStats`(YoY, 월별 트렌드, Top/성장 고객, 휴면 고객)를 **클라이언트 사이드에서** 미리 계산해 내려준다. 대시보드 지표를 고칠 일이 있으면 대부분 여기 60~396행이다.
- `src/contexts/AuthContext.jsx` — Supabase Auth. `src/contexts/I18nContext.jsx` — ko/en. `BackgroundTaskContext` — 업로드 등 백그라운드 작업.
- `src/hooks/useDashboardData.js` — 담당자(sales_rep)별 내 실적. `SALES_REP_OPTIONS`에 영업사원 이름이 **하드코딩**되어 있고 이메일→한글이름 매핑도 여기 있다.

**라우팅**: `src/App.jsx`. `/`(Dashboard), `/clients/:id`, `/sales`, `/pipeline`, `/map`, `/calendar`, `/order-entry` 등은 `ProtectedRoute` 하위. `/landing`, `/pricing`, `/login`은 공개.

**외부 연동**: Supabase(DB/Auth/RLS), Google Gemini(`src/services/geminiService.js`, `aiSalesCoach.js`), Google Maps(`/map`), FullCalendar, Tesseract.js(명함 OCR), xlsx(엑셀 업로드/내보내기).

## 데이터 모델 주의사항

스키마는 `execution/sql/supabase_schema.sql`.

- `sales`: `client_id`, `sale_date`(DATE), `total_amount`(NUMERIC), `items`(JSONB)
- **snake_case(DB) ↔ camelCase(프론트) 혼용이 코드 전반에 존재한다.** 거의 모든 집계 코드가 `sale.total_amount ?? sale.totalAmount`, `sale.sale_date || sale.date || sale.created_at` 식으로 방어적으로 읽는다. 새 코드도 같은 패턴을 따를 것.
- 1000행 초과 조회는 `.range()` 페이지네이션 필수 (Supabase 기본 limit). **페이지네이션 시 `.order()`를 반드시 함께 지정** — 없으면 행이 중복/누락된다.

## 엑셀 일괄등록 (매출)

`src/components/SalesExcelUpload.jsx`. 처리 순서:

1. 엑셀 파싱 → 2. 거래처명 **퍼지 매칭**(`buildClientKeys`: ㈜/(주)/주식회사/공백/괄호 제거 후 소문자화)
→ 3. **미매칭 업체를 `registerMissingClients`로 먼저 생성** → 4. **대사**(`reconcileSales`)
→ 5. 미리보기 확인 → 6. `applySalesReconciliation`(삭제 → 수정 → 등록)

### 대사(Reconciliation) — `src/utils/salesReconciler.js`

같은 기간을 다시 올렸을 때 **중복을 만들지 않으면서 ERP에서 수정된 금액을 반영**하기 위한 순수 함수.
단순 중복 제거가 아니라 "엑셀 기준으로 해당 날짜를 맞추는" 방식이다.

- **대상 범위는 엑셀에 등장하는 날짜뿐이다.** 그 외 날짜의 매출은 절대 건드리지 않는다.
- 매칭 단계(앞에서 짝을 찾으면 뒤는 보지 않음, 한 행은 한 번만 소비):
  1. 날짜+거래처+품목+수량+단가+금액 → 유지
  2. 날짜+거래처+품목+수량 → 금액 수정
  3. 날짜+거래처+품목 → 수량·금액 수정
  4. 짝 없는 엑셀 행 → 신규 등록 / 짝 없는 기존 행 → **삭제 후보**
- 거래처가 비어있던 행(`client_id = null`)은 어느 단계에서도 매칭되지 않아 삭제 후보로 잡힌다.
  이 때문에 상반기 재업로드만으로 '알수없음' 잔재가 정리된다.
- **삭제는 미리보기에서 사용자가 승인해야만 실행된다.** 자동 삭제 금지 — 사용자가 명시적으로 정한 정책이다.

`npm run test:unit`의 `tests/salesReconciler.test.mjs`가 이 규칙들을 고정하고 있다. 로직 변경 시 반드시 실행.

**`addSale`의 `skipDuplicateCheck` 옵션**: `addSale`에는 "그 거래처의 그 날짜에 매출이 하나라도 있으면
행을 통째로 건너뛰는" 오래된 검사가 있다. 대사를 이미 거친 호출은 이 검사를 통과해야 하므로
`applySalesReconciliation`이 `skipDuplicateCheck: true`로 호출한다. **다른 호출부(AddSaleModal,
PipelineBoard)는 기존 동작을 유지한다.**

**3번이 날짜별 저장 루프보다 반드시 앞에 있어야 한다.** `addSale`은 날짜마다 한 번씩 호출되는데,
그 안의 거래처 자동 등록 폴백은 `clients` state 클로저를 보므로 같은 업체가 여러 날짜에 걸쳐 있으면
거래처가 중복 생성된다. 앞단에서 파일 전체를 한 번에 처리해야 한다.

**주의: 매출 행에 `clientName`을 반드시 실어 보낼 것.** `addSale`의 거래처 자동 등록 폴백은
`r.clientName`으로 동작한다. 과거에 이 필드가 누락되어 신규 업체의 매출이 `client_id = null`로
저장되고 목록에 '알수없음'으로 표시되는 버그가 있었다.

거래처를 끝내 확정하지 못한 행은 **저장하지 않고 건너뛴 뒤 사용자에게 알린다.**

`addSale`은 이제 `sales.client_name`에 업체명을 함께 저장한다. 앱은 이 컬럼을 읽지 않지만,
거래처 연결이 깨졌을 때 업체명을 되찾을 유일한 단서다. **지우지 말 것.**

### 거래처가 비어있는 매출 복구

과거 버그로 `client_id`가 비어있는 매출이 남아 있다면 `execution/repair_orphan_sales.mjs`로 복구한다.
당시 데이터에는 업체명이 저장되지 않았으므로 **원본 엑셀 파일이 필요하다.**

```bash
node execution/repair_orphan_sales.mjs <엑셀파일...>          # 미리보기 (DB 변경 없음)
node execution/repair_orphan_sales.mjs <엑셀파일...> --apply  # 실제 반영
```

날짜+품목+수량+단가로 원본 엑셀과 대조해 업체를 찾아낸다(2순위: 날짜+품목+총액). 후보가 여럿이면
자동으로 고르지 않고 '확인 필요'로 분류한다. **기본은 미리보기이며 `--apply` 없이는 아무것도 바꾸지 않는다.**

## 매출 추정 엔진 (핵심 도메인 로직)

파일 3개로 구성:
- `src/utils/revenueForecastEngine.js` — 순수 계산 엔진 (v7.0). 부작용 없음. `now`를 주입받아 테스트 가능.
- `src/services/forecastService.js` — 데이터 fetch + `revenue_forecasts` 테이블 24시간 캐시.
- `src/components/RevenueForecastPanel.jsx` — 대시보드 UI. 버튼 클릭 시에만 계산(on-demand).

**임계값은 전부 `FORECAST_CONFIG`에 모여 있다. 튜닝은 반드시 거기서 한다.**
**로직을 건드리면 `npm run test:unit`을 돌린다.** `tests/revenueForecastEngine.test.mjs`는 과거에 실제로
발생했던 결함들을 고정한 회귀 테스트다 (의존성 없이 `node --test`로 동작).

### 계산 순서

1. **집계** — 최근 4년(`currentYear-3` ~ `currentYear`)의 매출을 `clientMap[client_id][year][month]` 12칸 배열로 누적.
2. **세그먼트 분류** — 고객 1명당 하나. 판정 순서가 곧 우선순위다:
   | 세그먼트 | 조건 | 예측식 |
   |---|---|---|
   | `NewThisYear` | 과거 3년 실적 전무, 올해만 거래 | 올해 YTD ÷ 경과 영업일 × 연 영업일, 3배 캡 |
   | `Churned` | 과거 피크(2년전·3년전 중 max) > 10만원 **and** 작년 ≤ 피크의 30% | 작년 ≤ 10만원이면 0, 아니면 작년 실적 유지 |
   | `HighPotential` | 작년에 거래 시작 **and** H2 > H1×1.5 **and** H2 > 100만원 | H2 영업일당 매출 연환산 × 1.1, 작년의 3배 캡 |
   | `New` | 거래 시작 2년 이내 **and** 최근 2년 활동 월수 ≤ 9 | 작년 ÷ 활동월수 × 12, **작년의 3배 캡** |
   | `Growing` | 그 외, 영업일 정규화 성장률 ≥ +10% | 작년 × (1 + min(정규화성장률, 0.3)) |
   | `Declining` | 그 외, 영업일 정규화 성장률 ≤ −10% | 작년 × (1 + max(정규화성장률, −0.2)) |
   | `Stable` | 나머지 | (2년전 + 작년) ÷ 2 |
   - 분류와 예측 배수 **모두 영업일 정규화 성장률(RPBD)** 을 쓴다. 둘을 다른 지표로 계산하면 라벨과 숫자가 어긋난다.
   - 월별 배분("시즌성")은 작년 월별 실적을 **영업일당 매출로 환산한 뒤 예측 연도 영업일로 재분배**한다.
     작년 구성비를 그대로 복사하면 설날/추석 이동분이 엉뚱한 달에 실린다
     (2026-02 영업일 17일 vs 2025-02 20일, 2025-10 18일 vs 2026-10 20일).
3. **YTD 캘리브레이션** — 모델의 연초~오늘 누계(**영업일 기준**) 대비 실제 누계 비율(`rawScale`)을 전체에 곱한다.
   **[0.8, 1.2]로 클램프**. 올해 실적이 모델 YTD의 10% 미만이면 데이터 미입력으로 보고 스케일 1.0 + `incompleteFlag`.
4. **출력 조립** — 마감된 달 = 실적 확정 / **진행 중인 달 = 확정 실적 + 잔여 영업일 예측** / 미래 = 예측.
   즉 `total_amount`는 "YTD 실적 + 잔여기간 예측"이며, 정의상 이미 확정된 매출보다 작아질 수 없다.

### 설계상 의도된 동작 (버그로 오인하기 쉬움)

- **올해 데이터가 비면 예측 총액이 작아 보인다.** 마감된 달을 실적으로 덮어쓰는 구조라, 매출 입력이
  안 된 상태면 그 달이 0으로 확정된다. 이 경우 `incompleteFlag`가 서고 UI에 "데이터 부족" 배지와
  요약문 ⚠️ 가 표시된다. **배지가 떠 있으면 숫자를 신뢰하면 안 된다.**
- `Churned`의 'Reduced' 케이스는 추가 감소 없이 작년 수준을 유지한다 (추가 감소를 가정하지 않음).
- 세그먼트 캡(3배 / +30% / −20%)과 전체 배율 클램프(0.8~1.2)는 이중 안전장치다. 급성장 고객이 많은
  해에는 예측이 구조적으로 보수적으로 나온다.

### 남은 이슈

- `getCachedForecast`에 `user_id` 필터가 없다. 이 패널은 전사 매출을 계산하므로 **캐시 공유가 의도된
  동작**이지만, `execution/sql/`에 엄격 RLS(`FIX_FORECAST_RLS_FULL.sql`)와 전체 허용 RLS
  (`FIX_RLS_RELAXED.sql`)가 둘 다 있어 어느 쪽이 적용됐는지 확인이 필요하다. 엄격 RLS가 걸려 있으면
  캐시가 사실상 동작하지 않는다(다른 사용자 행이 안 보여 매번 재계산).
- 분석 실행마다 `revenue_forecasts`에 새 행을 INSERT한다 (정리 로직 없음).
- 캐시에서 읽은 예측에는 `incompleteFlag` 컬럼이 없어, UI가 `analysis_summary`의 ⚠️ 접두어로 판단한다.

### 공휴일 데이터

`src/utils/koreanHolidays.js`의 `HOLIDAYS_BY_YEAR`는 **2023~2026년만 하드코딩**되어 있다. 등록되지 않은
연도는 주말만 제외되어 영업일이 과대 계산되므로, `getHolidays()`가 콘솔 경고를 띄우고
엔진은 `holidayDataMissing`을 반환한다. **매년 갱신 필요.**

## KPI 위젯 (평가 지표)

`src/components/KPIWidget.jsx`. 대시보드의 KPI Performance 카드. 담당자(sales_rep) 기준으로 집계한다.

**임계값은 두 상수에 모여 있다. 기준이 바뀌면 여기만 고친다.**

```js
KPI_REVENUE_QUALIFY = { HALF_YEAR: 1천만, ANNUAL: 2천만 }   // 실적 인정 기준
CHURN_RULE          = { GAP_MONTHS: 6, MIN_HISTORY_REVENUE: 1천만 }  // 단절 판정
```

### 공식 기준표와의 대응 (2026년간 KPI)

항목·가중치·등급구간은 회사 공식 표를 그대로 옮겼다. `KPI_BANDS` / `getGradeInfo`가 단일 출처다.

| 항목 | 가중치 | 지표 | 산출 |
|---|---|---|---|
| 수익성 | 40 | EBITDA(영업이익) 목표달성 | **수동 입력** (CRM에 자료 없음) |
| 부문기여 | 20 | 25년대비 26년 판매상승률 | 자동 |
| 고객관리 | 15 | 기존고객 및 단절고객 편입 | 자동 |
| 신규고객 발굴 | 10 | 매출발생 기준 | 자동 |
| 정기적방문횟수 | 10 | 연간 기준 (계획 240건) | 자동 (연말 예상치로 환산) |
| 채권관리 | 5 | 연간 기준 (적을수록 좋음) | **수동 입력** |

등급: 탁월 120~ / 우수 110~ / 양호(계획) 100~ / 보통 90~ / 미흡 80~

과거에 있었던 오류들 — 같은 실수를 반복하지 말 것:

- **채권관리(가중치 5) 항목이 아예 없었다.** 가중치 합이 95점이라 총점이 실제와 달랐다.
- **등급 구간이 S≥110 / A≥100 / B≥80 / C≥60 이었다.** 한 칸씩 후해서 110%가 '탁월'로 표시됐다.
- **고객관리가 '편입 1건당 20%'였다.** 기준표상 0건은 '양호(100%)'인데 0%(미흡)로 잡혀 담당자가 크게 손해봤다.
- **정기적방문 목표가 52주×2=104건이었다.** 기준표의 계획은 연 240건이다.
- **수익성이 '전년 대비 매출'이었다.** 기준표는 EBITDA(영업이익)다. 전혀 다른 지표다.

**미입력 항목은 0으로 치지 말 것.** `bandScore`가 `null`을 돌려주고 총점 계산에서 제외한다.
`Number(null)`은 0이라 그냥 `Number()`로 받으면 '미입력'이 '미흡(80%)'이 되어 총점이 부당하게 깎인다.
수동 입력값은 `getKpiManualInputs` / `setKpiManualInput`(localStorage)로 관리한다.

최종평가는 100점을 90점으로 환산하고 2차조정자 임의평가 10점을 합산한다 — 이 환산은 화면에서 하지 않는다.

### 실적 인정 기준 (신규·편입 공통)

**반기 1천만원 또는 연 2천만원 이상.** 둘은 같은 속도이므로 하나만 넘으면 인정한다
(상반기에 1천만원을 채우면 연말까지 기다리지 않는다).

### 신규고객 발굴

**올해 처음 거래한 곳**만 신규다. **CRM 등록일(`created_at`)로 판정하면 안 된다** —
거래처 데이터를 올해 한꺼번에 입력해서 담당 40곳 전부가 '올해 등록'이었고,
2025년부터 매월 거래하던 곳까지 신규로 잡혔다(20건). 실제 매출 이력 기준으로 5건.

### 단절고객 편입

**6개월 이상 거래 공백 + 과거 누적 1천만원 이상 거래 이력**이 있어야 단절로 본다.

- 과거 실적 조건이 핵심이다. 없으면 한두 번 소액만 사고 만 곳까지 잡혀 목록이 의미를 잃는다(16곳 → 4곳).
- 공백 6개월인 이유: 2~3개월 간격으로 꾸준히 소액 주문하는 정상 거래처가 있다
  (리메카 — 3년간 17개월 주문, 누적 2,182만원). 5개월로 잡으면 이런 곳이 단절로 분류된다.
- 편입 = 단절 상태였다가 올해 다시 거래 + 실적 기준 통과.
  **올해 처음 거래한 곳은 편입에서 제외한다** (신규와 이중 계상 방지).

과거에 있었던 버그: 단절 목록을 만들 때 '최근 거래가 있는 곳'을 미리 제외해 놓고
그 목록에서 다시 '최근 거래가 있는 곳'을 찾았다. 교집합이 정의상 항상 비어
**이 KPI는 구조적으로 영원히 0건**이었다.

### KPI별 수동 제외

`src/utils/kpiCategories.js`의 `getKpiExclusions` / `toggleKpiExclusion` / `isExcludedFrom`.
localStorage에 `{ clientId: { new?: true, churn?: true } }` 형태로 저장한다.

- `new` — 자회사 파생 등으로 신규로 보기 어려운 곳
- `churn` — 폐업·상호변경으로 복구 불가능한 곳

**반드시 KPI별로 제외해야 한다.** 담당 거래처 목록(`managedClientIds`)에서 통째로 빼면
매출·부문기여 KPI의 실적까지 사라져 담당자가 손해를 본다. 자회사 파생 건은 '신규'만
아닐 뿐 매출은 정상 실적이다.

기존 `setKpiCategory`의 `'미산정'`(전체 제외)과는 별개 저장소다.

## Gemini (AI 기능)

`src/services/geminiService.js`. 모델명은 `VITE_GEMINI_MODEL`로 바꿀 수 있고 기본값은 `gemini-2.5-flash`다.
**`gemini-1.5-flash`는 단종되어 404가 난다** — 하드코딩하지 말 것.

키가 무효하거나 모델이 없는 등 **재시도해도 소용없는 오류는 재시도하지 않는다.** 한 번 확인되면
모듈 수준에서 AI 기능을 끄고(`disabledReason`) 경고를 1회만 출력한다. 이후 호출은 네트워크 없이
즉시 실패한다. 상태는 `isGeminiAvailable()` / `getGeminiDisabledReason()`으로 확인한다.
이 래치가 없으면 대시보드를 열 때마다 같은 에러가 콘솔을 수십 줄씩 채운다.

## 환경 변수

`.env` / `.env.local` (커밋 금지). Supabase URL/anon key, Google Maps API key, Gemini API key,
`VITE_GEMINI_MODEL`. 상세는 `directives/ENV_SETUP_GUIDE.md`.

> **`VITE_` 접두어가 붙은 값은 빌드 결과물에 그대로 박혀 배포된다.** `dist/assets/*.js`에서 문자열로
> 추출 가능하므로, 브라우저에 노출돼도 되는 값만 넣을 것. Supabase anon key는 RLS로 보호되므로 정상이지만,
> **Gemini 키는 노출 시 제3자가 사용자 계정으로 API를 호출할 수 있다.**
> 근본 해결은 서버(예: `api/` 서버리스 함수)에서 호출하고 키를 `VITE_` 없이 두는 것이다.
> 과거 커밋에 키가 하드코딩된 이력이 있으므로(`git log --all -S"AIzaSy"`), 그 키들은 폐기되어야 한다.
