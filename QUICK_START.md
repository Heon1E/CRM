# 🚀 AI Agent 빠른 시작 가이드

## 1단계: API 키 발급 (2분 소요)

1. [Anthropic Console](https://console.anthropic.com/) 접속
2. 가입 또는 로그인
3. **API Keys** 메뉴 클릭
4. **Create Key** 버튼 클릭
5. 생성된 키를 복사 (예: `sk-ant-api03-...`)

---

## 2단계: 환경 변수 설정 (1분 소요)

### 방법 A: `.env` 파일 생성 (권장)

프로젝트 **루트 폴더**(package.json이 있는 곳)에 `.env` 파일 생성:

```env
# Supabase 설정 (이미 있으면 그대로 유지)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...

# Claude AI 설정 (새로 추가)
VITE_ANTHROPIC_API_KEY=sk-ant-api03-여기에-실제키-붙여넣기
```

### 방법 B: 시스템 환경 변수 설정

**Windows (PowerShell):**
```powershell
$env:VITE_ANTHROPIC_API_KEY="sk-ant-api03-여기에-실제키"
```

**Mac/Linux (Terminal):**
```bash
export VITE_ANTHROPIC_API_KEY="sk-ant-api03-여기에-실제키"
```

---

## 3단계: 개발 서버 재시작

기존에 실행 중인 서버를 **중지(Ctrl+C)** 하고 다시 시작:

```bash
npm run dev
```

---

## 4단계: 테스트

1. 브라우저에서 CRM 웹사이트 열기
2. 우하단의 **터미널 아이콘** 클릭
3. 채팅창에 메시지 입력:
   - "안녕하세요"
   - "Dashboard 차트를 분석해줘"
   - "매출 데이터 집계 로직을 설명해줘"
4. Agent의 응답 확인 ✅

---

## 🐛 문제 해결

### "API 요청 실패: 404" 오류
**원인:** 로컬 개발 환경에서 serverless function을 찾을 수 없음  
**해결:** 최신 코드로 업데이트됨 - 이제 로컬에서 직접 Claude API 호출

### "환경변수가 설정되어 있지 않습니다" 오류
**해결:**
1. `.env` 파일이 **프로젝트 루트**에 있는지 확인
2. 파일 내용에 `VITE_ANTHROPIC_API_KEY=...` 있는지 확인
3. **개발 서버를 재시작**했는지 확인 (중요!)

### API 키가 작동하지 않음
**확인사항:**
1. API 키가 `sk-ant-api03-`로 시작하는지 확인
2. [Anthropic Console](https://console.anthropic.com/)에서 키가 활성화되어 있는지 확인
3. 계정에 크레딧이 충분한지 확인

---

## 📁 파일 위치 확인

```
CRM_Data/                    ← 프로젝트 루트
├── .env                     ← 여기에 환경변수 파일 생성
├── package.json
├── vite.config.js
├── src/
│   └── components/
│       └── AgentChatWindow.jsx
└── api/
    └── chat-agent.js
```

---

## 💰 비용 안내

- Claude 3.5 Sonnet: 입력 ~$3 / 백만 토큰
- 일반적인 대화 1회: ~0.001-0.01달러
- 테스트/개발 단계: 하루에 수십 센트 수준

---

## ✅ 성공 확인

Agent 채팅창 상단에 **"🟢 Ready"** 표시가 있고,  
메시지를 보내면 응답이 오면 **성공!**

문제가 계속되면 터미널 로그를 확인하세요:
- "🔧 Development mode: Calling Claude API directly" ← 정상
- "Failed to fetch" ← 네트워크/API 키 문제
