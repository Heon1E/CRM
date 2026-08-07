# 텔레그램으로 CRM에 자료 보내기 — 설정 순서

휴대폰에서 봇에게 ERP 화면 사진이나 메시지를 보내면, 읽어서 CRM에 담아둔다.

## 먼저 알아둘 것

**봇은 매출을 바로 저장하지 않는다.** 읽어서 '받은 항목'에 담아두기만 하고,
반영은 CRM **설정 > 받은 항목**에서 확인 버튼을 눌러야 일어난다.

이유가 있다. 매출은 대사(중복 검사)를 거쳐야 같은 날짜를 다시 올려도 중복이 생기지 않는데,
그 로직은 앱 안에 있다. 봇이 바로 넣으면 2026-08-05에 있었던 중복 등록 사고가 그대로 재현된다.
일정·활동은 중복 위험이 낮아 반영 버튼 한 번이면 바로 등록된다.

**카카오톡은 안 된다.** 개인 카톡 대화를 읽는 API가 없다(카카오 정책). 카카오톡 채널
챗봇은 사업자 심사와 별도 서버가 필요하고, 그것도 채널로 온 문의만 읽는다.
텔레그램은 봇 API가 공개돼 있어 이 방식이 가능하다.

---

## 1. 봇 만들기 (2분)

1. 텔레그램에서 **@BotFather** 를 찾아 대화를 연다
2. `/newbot` 을 보낸다
3. 봇 이름과 아이디를 정한다 (아이디는 `_bot`으로 끝나야 한다)
4. **토큰**을 준다. `123456:ABC-DEF...` 형태의 긴 문자열이다

> 토큰은 봇의 비밀번호다. 채팅방이나 화면 공유에 노출하지 말 것.

## 2. Supabase에 테이블 만들기 (1분)

Supabase 대시보드 > SQL Editor 에서
`execution/sql/telegram_inbox.sql` 내용을 붙여넣고 실행한다.

## 3. Vercel 환경변수 넣기

Vercel > 프로젝트 > Settings > Environment Variables 에서 아래를 추가한다.
**`VITE_` 접두어를 붙이면 안 된다.** 붙이면 브라우저에 그대로 노출된다.

| 이름 | 값 |
|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather가 준 토큰 |
| `TELEGRAM_WEBHOOK_SECRET` | 아무 긴 문자열 (예: 40자 랜덤). 직접 정한다 |
| `TELEGRAM_ALLOWED_CHAT_IDS` | 일단 비워두거나 아무 값. 4단계에서 채운다 |
| `GEMINI_API_KEY` | 기존 Gemini 키 (`VITE_` 없는 이름으로) |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Settings > API 의 `service_role` 키 |

> `service_role` 키는 RLS를 무시하는 강력한 키다. **서버(Vercel 환경변수)에만** 두고
> 코드나 프론트엔드에 절대 넣지 말 것.

넣은 뒤 **재배포**한다 (Deployments > 최신 항목 > Redeploy).

## 4. 웹훅 연결

내 PC의 `.env.local`에 아래 두 줄을 넣는다 (이 파일은 커밋되지 않는다):

```
TELEGRAM_BOT_TOKEN=BotFather가_준_토큰
TELEGRAM_WEBHOOK_SECRET=3단계에서_정한_그_문자열
```

그리고 실행한다:

```bash
node execution/setup_telegram_webhook.mjs --url https://내주소.vercel.app
```

이제 텔레그램에서 내 봇에게 `/start` 를 보낸다.
봇이 **chat id**를 알려준다. 그 숫자를 Vercel의 `TELEGRAM_ALLOWED_CHAT_IDS` 에 넣고
다시 재배포한다.

> 이 허용 목록이 비어 있으면 봇은 아무 데이터도 받지 않는다.
> 봇 아이디는 누구나 검색할 수 있으므로, 이 목록이 사실상의 자물쇠다.

## 5. 써보기

봇에게 보내본다:

- ERP 매출 화면 캡처 → "매출 12건으로 읽었습니다"
- ERP 미수금 화면 캡처 → "채권 8건으로 읽었습니다"
- `내일 오후 2시 한국화학 방문` → "일정·활동 1건으로 읽었습니다"

CRM **설정 > 받은 항목**에 뜬다. 내용을 확인하고 **반영**을 누른다.

---

## 잘 안 될 때

```bash
node execution/setup_telegram_webhook.mjs --info
```

- `마지막 오류: Wrong response from the webhook: 401` → `TELEGRAM_WEBHOOK_SECRET`이
  Vercel과 `.env.local`에서 다르다
- 봇이 "등록된 사용자만" 이라고 답한다 → `TELEGRAM_ALLOWED_CHAT_IDS`에 내 chat id가 없다
- 봇이 답이 없다 → 웹훅 주소가 틀렸거나 재배포를 안 했다
- "읽지 못했습니다" → `GEMINI_API_KEY`가 없거나 만료됐다

## 사진 찍는 요령

- 표 **전체**가 한 화면에 들어오게. 잘리면 잘린 만큼 빠진다
- 글씨가 작으면 ERP에서 화면 배율을 키우고 찍는다
- 한 번에 6장까지. 긴 목록은 나눠 보낸다
- 판독은 틀릴 수 있다. **반영 전에 숫자를 눈으로 확인할 것**
