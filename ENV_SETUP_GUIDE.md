# AI Agent 설정 가이드

## 🚀 Google Gemini API 연동 설정

### 1단계: Gemini API 키 발급

1. [Google AI Studio](https://aistudio.google.com/app/apikey)에 접속
2. Google 계정으로 로그인
3. **Get API key** 버튼 클릭
4. 생성된 키를 복사 (예: `AIzaSy...`)

### 2단계: 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 추가:

```env
# Supabase Configuration (기존)
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Gemini AI Agent Configuration (새로 추가)
VITE_GEMINI_API_KEY=AIzaSy-your-actual-key-here

# Optional: Custom Agent API endpoint
# VITE_AGENT_API_URL=https://your-domain.com/api/chat-agent
```

**⚠️ 보안 주의사항:**
- `.env` 파일은 절대 Git에 커밋하지 마세요 (`.gitignore`에 이미 포함되어 있음)
- 프로덕션 환경에서는 Vercel/Netlify 환경변수에 `GEMINI_API_KEY`를 설정하세요

### 3단계: Vercel/Netlify 배포 설정

#### Vercel
1. Vercel Dashboard → 프로젝트 선택
2. Settings → Environment Variables
3. 다음 변수 추가:
   - `GEMINI_API_KEY` = `AIzaSy...`
   - `VITE_SUPABASE_URL` = `...`
   - `VITE_SUPABASE_ANON_KEY` = `...`

#### Netlify
1. Netlify Dashboard → Site Settings → Environment Variables
2. 위와 동일하게 변수 추가

### 4단계: 개발 서버 재시작

```bash
npm run dev
```

### 5단계: 테스트

1. 웹사이트 우하단의 터미널 아이콘 클릭
2. 채팅창에 메시지 입력 (예: "안녕하세요")
3. Agent의 응답 확인

---

## 📁 파일 구조

```
CRM_Data/
├── api/
│   └── chat-agent.js          # Serverless API 프록시 (Vercel/Netlify용)
├── src/
│   └── components/
│       └── AgentChatWindow.jsx # Agent 채팅 UI
└── .env                        # 환경 변수 (로컬 개발용)
```

---

## 🔧 커스터마이징

### API 엔드포인트 변경
기본값: `/api/chat-agent` (Vercel Serverless Function)

다른 백엔드 사용 시:
```env
VITE_AGENT_API_URL=https://your-backend.com/api/chat
```

### Agent 시스템 프롬프트 수정
`api/chat-agent.js` 파일의 `system` 필드를 수정하세요.

---

## 🐛 문제 해결

### "API key not configured" 오류
- `.env` 파일에 `VITE_GEMINI_API_KEY` 또는 `GEMINI_API_KEY`가 설정되어 있는지 확인
- 개발 서버를 재시작했는지 확인

### "Failed to fetch" 오류
- 네트워크 연결 확인
- CORS 설정 확인 (api/chat-agent.js에 이미 구성됨)
- API 키 유효성 확인

### Vercel 배포 후 작동 안 함
- Vercel 환경변수에 `GEMINI_API_KEY`가 설정되어 있는지 확인
- 배포 후 환경변수를 추가한 경우 재배포 필요

---

## 💰 비용 안내

Google Gemini API는 사용량에 따라 과금됩니다:
- Gemini Pro: 무료 티어 제공 (월 60회/분 제한)
- 유료 사용 시: 매우 저렴한 가격 정책
- 자세한 내용: [Google AI Pricing](https://ai.google.dev/pricing)

**권장사항:**
- 개발/테스트 단계에서는 소량 사용
- 프로덕션에서는 사용량 모니터링 설정
- Rate limiting 구현 고려
