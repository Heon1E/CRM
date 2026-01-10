# 데이터 복구 스크립트 사용 가이드

## 개요
`restore.js` 스크립트는 백업된 JSON 파일을 읽어서 Supabase 데이터베이스에 복구하는 도구입니다.

## 사전 준비

### 1. 환경 변수 설정
`.env` 파일에 Supabase 설정이 있어야 합니다:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

또는 터미널에서 직접 환경 변수 지정:
```bash
# Windows PowerShell
$env:VITE_SUPABASE_URL="https://your-project.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="your-anon-key"

# Windows CMD
set VITE_SUPABASE_URL=https://your-project.supabase.co
set VITE_SUPABASE_ANON_KEY=your-anon-key

# Linux/Mac
export VITE_SUPABASE_URL=https://your-project.supabase.co
export VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 2. 백업 파일 준비
복구할 백업 JSON 파일이 필요합니다. 파일 이름 형식: `backup_YYYYMMDD_XavianCRM.json`

## 사용 방법

### 방법 1: 백업 파일을 인자로 전달
```bash
node scripts/restore.js backup_20260110_XavianCRM.json
```

### 방법 2: 절대 경로 사용
```bash
node scripts/restore.js "C:\Users\hunir\Downloads\backup_20260110_XavianCRM.json"
```

### 방법 3: 환경 변수로 파일 경로 지정
```bash
BACKUP_FILE=backup_20260110_XavianCRM.json node scripts/restore.js
```

## 복구 순서

스크립트는 다음 순서로 데이터를 복구합니다 (외래 키 관계 고려):

1. **제품 (products)** - 독립적
2. **고객 (clients)** - 독립적
3. **영업 활동 (activities)** - clients 참조
4. **매출 (sales)** - clients 참조
5. **이슈 (issues)** - 독립적
6. **설정 (settings)** - user_id 참조

## 주의사항

⚠️ **기존 데이터 처리**
- 현재 스크립트는 기존 데이터를 삭제하지 않고 **새 데이터를 추가**합니다.
- 중복 방지를 원하면 스크립트에서 기존 데이터 삭제 로직을 활성화하세요.

⚠️ **ID 충돌**
- 백업 파일의 `id` 값이 그대로 사용됩니다.
- 기존 데이터와 ID가 충돌하면 에러가 발생할 수 있습니다.
- ID를 제거하고 새로 생성하려면 스크립트의 `sanitizeForInsert` 함수에서 `delete clean.id` 주석을 해제하세요.

⚠️ **외래 키 관계**
- `activities`와 `sales`는 `clients` 테이블의 ID를 참조합니다.
- 복구 전에 해당 `client_id`가 존재하는지 확인하세요.

⚠️ **Settings 복구**
- `settings` 테이블은 `user_id`를 참조합니다.
- 현재 로그인한 사용자의 설정만 복구하려면 스크립트에서 `user_id`를 변경하세요.

## 실행 결과

스크립트 실행 시 다음 정보가 출력됩니다:
- ✅ 성공한 테이블 및 복구된 데이터 개수
- ❌ 실패한 테이블 및 에러 메시지
- 📊 전체 복구 결과 요약

## 문제 해결

### "백업 파일을 찾을 수 없습니다" 에러
- 백업 파일 경로가 정확한지 확인
- 절대 경로 또는 상대 경로 확인

### "Column does not exist" 에러
- 백업 파일의 컬럼명과 DB 스키마가 일치하는지 확인
- `supabase_schema.sql`을 실행하여 테이블 생성 확인

### "Foreign key violation" 에러
- 참조하는 테이블 (예: clients)이 먼저 복구되었는지 확인
- client_id가 실제로 존재하는지 확인
