/**
 * Xavian CRM - 데이터 복구 스크립트
 * 
 * 사용법:
 * node scripts/restore.js <백업파일경로>
 * 예: node scripts/restore.js backup_20260110_XavianCRM.json
 * 
 * 또는 환경 변수로 백업 파일 경로 지정:
 * BACKUP_FILE=backup_20260110_XavianCRM.json node scripts/restore.js
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// ES Module에서 __dirname 사용하기 위한 설정
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// .env 파일 읽기 함수 (dotenv 패키지 없이 직접 구현)
const loadEnvFile = () => {
  const envPath = path.join(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    const lines = envContent.split('\n')
    lines.forEach((line) => {
      const trimmedLine = line.trim()
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=')
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim()
          // 따옴표 제거
          const cleanValue = value.replace(/^["']|["']$/g, '')
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = cleanValue
          }
        }
      }
    })
  }
}

// .env 파일 로드 시도
loadEnvFile()

// 환경 변수 로드
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY // 선택사항: 더 많은 권한이 필요한 경우

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase 환경 변수가 설정되지 않았습니다.')
  console.error('다음 환경 변수를 설정해주세요:')
  console.error('  - VITE_SUPABASE_URL 또는 SUPABASE_URL')
  console.error('  - VITE_SUPABASE_ANON_KEY 또는 SUPABASE_ANON_KEY')
  process.exit(1)
}

// Supabase 클라이언트 초기화 (Service Role Key가 있으면 사용, 없으면 Anon Key 사용)
const supabase = createClient(
  supabaseUrl,
  serviceRoleKey || supabaseAnonKey
)

// 백업 파일 경로 확인
const backupFilePath = process.argv[2] || process.env.BACKUP_FILE || 'backup_20260110_XavianCRM.json'
const fullPath = path.isAbsolute(backupFilePath) 
  ? backupFilePath 
  : path.join(process.cwd(), backupFilePath)

// 백업 파일 존재 확인
if (!fs.existsSync(fullPath)) {
  console.error(`❌ 백업 파일을 찾을 수 없습니다: ${fullPath}`)
  console.error('사용법: node scripts/restore.js <백업파일경로>')
  process.exit(1)
}

// JSON 파일 읽기 및 파싱
let backupData
try {
  const fileContent = fs.readFileSync(fullPath, 'utf-8')
  backupData = JSON.parse(fileContent)
  console.log('✅ 백업 파일 읽기 성공:', fullPath)
  console.log('📋 백업 정보:')
  console.log(`   - 백업 날짜: ${backupData.metadata?.backup_date || 'N/A'}`)
  console.log(`   - 사용자 이메일: ${backupData.metadata?.user_email || 'N/A'}`)
  console.log(`   - 회사명: ${backupData.metadata?.company_name || 'N/A'}`)
  console.log('📊 백업 데이터 요약:')
  if (backupData.summary) {
    console.log(`   - 제품: ${backupData.summary.products_count || 0}건`)
    console.log(`   - 고객: ${backupData.summary.clients_count || 0}건`)
    console.log(`   - 영업 활동: ${backupData.summary.activities_count || 0}건`)
    console.log(`   - 매출: ${backupData.summary.sales_count || 0}건`)
    console.log(`   - 이슈: ${backupData.summary.issues_count || 0}건`)
    console.log(`   - 설정: ${backupData.summary.settings_count || 0}건`)
  }
} catch (error) {
  console.error('❌ 백업 파일 읽기/파싱 실패:', error.message)
  process.exit(1)
}

// 데이터 정제 함수 (Supabase 저장 형식에 맞게 변환)
const sanitizeForInsert = (data, tableName, options = {}) => {
  const { preserveIds = true } = options // 기본값: id 유지
  
  const sanitized = data.map((item) => {
    const clean = { ...item }
    
    // id 처리: preserveIds가 false이면 제거 (새로 생성), true이면 유지
    if (!preserveIds) {
      delete clean.id
    }
    
    // created_at, updated_at 처리: 원본 유지 또는 현재 시간으로 설정
    if (options.useCurrentTime) {
      clean.created_at = new Date().toISOString()
      clean.updated_at = new Date().toISOString()
    } else {
      // 원본 시간 유지 (없으면 현재 시간)
      clean.created_at = clean.created_at || new Date().toISOString()
      clean.updated_at = clean.updated_at || new Date().toISOString()
    }
    
    // null 값 처리
    Object.keys(clean).forEach((key) => {
      if (clean[key] === null || clean[key] === undefined) {
        // 날짜 필드는 null 유지, 다른 필드는 기본값 사용
        if (key.includes('date') || key.includes('_at')) {
          clean[key] = null
        } else if (typeof clean[key] === 'number') {
          clean[key] = 0
        } else if (typeof clean[key] === 'string') {
          clean[key] = ''
        }
      }
    })
    
    // 테이블별 특별 처리
    if (tableName === 'clients') {
      // contract_prices가 JSON 문자열이면 객체로 변환
      if (typeof clean.contract_prices === 'string') {
        try {
          clean.contract_prices = JSON.parse(clean.contract_prices)
        } catch (e) {
          clean.contract_prices = []
        }
      }
      // lastOrder -> last_order, orderAmount -> order_amount 변환
      if (clean.lastOrder !== undefined) {
        clean.last_order = clean.lastOrder
        delete clean.lastOrder
      }
      if (clean.orderAmount !== undefined) {
        clean.order_amount = clean.orderAmount
        delete clean.orderAmount
      }
    }
    
    if (tableName === 'activities') {
      // clientId -> client_id, clientName -> client_name, user -> user_name 변환
      if (clean.clientId !== undefined) {
        clean.client_id = clean.clientId
        delete clean.clientId
      }
      if (clean.clientName !== undefined) {
        clean.client_name = clean.clientName
        delete clean.clientName
      }
      if (clean.user !== undefined) {
        clean.user_name = clean.user
        delete clean.user
      }
      // activity_date는 그대로 사용 (이미 snake_case)
    }
    
    if (tableName === 'sales') {
      // clientId -> client_id, clientName -> client_name, totalAmount -> total_amount 변환
      if (clean.clientId !== undefined) {
        clean.client_id = clean.clientId
        delete clean.clientId
      }
      if (clean.clientName !== undefined) {
        clean.client_name = clean.clientName
        delete clean.clientName
      }
      if (clean.totalAmount !== undefined) {
        clean.total_amount = clean.totalAmount
        delete clean.totalAmount
      }
      // items가 JSON 문자열이면 객체로 변환
      if (typeof clean.items === 'string') {
        try {
          clean.items = JSON.parse(clean.items)
        } catch (e) {
          clean.items = []
        }
      }
    }
    
    if (tableName === 'issues') {
      // date 필드는 그대로 사용
      if (clean.target_date === null || clean.target_date === undefined) {
        clean.target_date = clean.date || null
      }
    }
    
    return clean
  })
  
  return sanitized
}

// 데이터 복구 메인 함수
async function restoreData() {
  console.log('\n🔄 데이터 복구를 시작합니다...\n')
  
  const results = {
    success: {},
    failed: {}
  }
  
  try {
    // 1. 제품(Products) 복구
    if (backupData.data.products && backupData.data.products.length > 0) {
      console.log(`📦 제품 복구 중... (${backupData.data.products.length}건)`)
      const sanitized = sanitizeForInsert(backupData.data.products, 'products', { preserveIds: true })
      
      // Upsert 사용 (id가 있으면 업데이트, 없으면 삽입)
      const { data, error } = await supabase
        .from('products')
        .upsert(sanitized, { onConflict: 'id' })
        .select()
      
      if (error) {
        console.error('❌ 제품 복구 실패:', error.message)
        results.failed.products = error.message
      } else {
        console.log(`✅ 제품 복구 완료: ${data.length}건`)
        results.success.products = data.length
      }
    } else {
      console.log('⏭️  제품 데이터 없음 (건너뜀)')
    }
    
    // 2. 고객(Clients) 복구
    if (backupData.data.clients && backupData.data.clients.length > 0) {
      console.log(`\n👥 고객 복구 중... (${backupData.data.clients.length}건)`)
      const sanitized = sanitizeForInsert(backupData.data.clients, 'clients', { preserveIds: true })
      
      // Upsert 사용 (외래 키 관계 유지)
      const { data, error } = await supabase
        .from('clients')
        .upsert(sanitized, { onConflict: 'id' })
        .select()
      
      if (error) {
        console.error('❌ 고객 복구 실패:', error.message)
        results.failed.clients = error.message
      } else {
        console.log(`✅ 고객 복구 완료: ${data.length}건`)
        results.success.clients = data.length
      }
    } else {
      console.log('\n⏭️  고객 데이터 없음 (건너뜀)')
    }
    
    // 3. 영업 활동(Activities) 복구 (clients 복구 후)
    if (backupData.data.activities && backupData.data.activities.length > 0) {
      console.log(`\n📅 영업 활동 복구 중... (${backupData.data.activities.length}건)`)
      const sanitized = sanitizeForInsert(backupData.data.activities, 'activities', { preserveIds: true })
      
      // 배치로 나누어 삽입 (Supabase 제한 고려)
      const batchSize = 100
      let insertedCount = 0
      
      for (let i = 0; i < sanitized.length; i += batchSize) {
        const batch = sanitized.slice(i, i + batchSize)
        const { data, error } = await supabase
          .from('activities')
          .upsert(batch, { onConflict: 'id' })
          .select()
        
        if (error) {
          console.error(`❌ 영업 활동 복구 실패 (배치 ${Math.floor(i / batchSize) + 1}):`, error.message)
          results.failed.activities = error.message
          break
        } else {
          insertedCount += data.length
        }
      }
      
      if (!results.failed.activities) {
        console.log(`✅ 영업 활동 복구 완료: ${insertedCount}건`)
        results.success.activities = insertedCount
      }
    } else {
      console.log('\n⏭️  영업 활동 데이터 없음 (건너뜀)')
    }
    
    // 4. 매출(Sales) 복구 (clients 복구 후)
    if (backupData.data.sales && backupData.data.sales.length > 0) {
      console.log(`\n💰 매출 복구 중... (${backupData.data.sales.length}건)`)
      const sanitized = sanitizeForInsert(backupData.data.sales, 'sales', { preserveIds: true })
      
      const batchSize = 100
      let insertedCount = 0
      
      for (let i = 0; i < sanitized.length; i += batchSize) {
        const batch = sanitized.slice(i, i + batchSize)
        const { data, error } = await supabase
          .from('sales')
          .upsert(batch, { onConflict: 'id' })
          .select()
        
        if (error) {
          console.error(`❌ 매출 복구 실패 (배치 ${Math.floor(i / batchSize) + 1}):`, error.message)
          results.failed.sales = error.message
          break
        } else {
          insertedCount += data.length
        }
      }
      
      if (!results.failed.sales) {
        console.log(`✅ 매출 복구 완료: ${insertedCount}건`)
        results.success.sales = insertedCount
      }
    } else {
      console.log('\n⏭️  매출 데이터 없음 (건너뜀)')
    }
    
    // 5. 이슈(Issues) 복구
    if (backupData.data.issues && backupData.data.issues.length > 0) {
      console.log(`\n⚠️  이슈 복구 중... (${backupData.data.issues.length}건)`)
      const sanitized = sanitizeForInsert(backupData.data.issues, 'issues', { preserveIds: true })
      
      // Upsert 사용
      const { data, error } = await supabase
        .from('issues')
        .upsert(sanitized, { onConflict: 'id' })
        .select()
      
      if (error) {
        console.error('❌ 이슈 복구 실패:', error.message)
        results.failed.issues = error.message
      } else {
        console.log(`✅ 이슈 복구 완료: ${data.length}건`)
        results.success.issues = data.length
      }
    } else {
      console.log('\n⏭️  이슈 데이터 없음 (건너뜀)')
    }
    
    // 6. 설정(Settings) 복구 (선택사항 - 현재 사용자 것만)
    if (backupData.data.settings && backupData.data.settings.length > 0) {
      console.log(`\n⚙️  설정 복구 중... (${backupData.data.settings.length}건)`)
      
      // user_id를 현재 로그인한 사용자로 변경하거나, 원본 유지
      const sanitized = backupData.data.settings.map((setting) => {
        const clean = { ...setting }
        // user_id는 원본 유지하거나, 현재 사용자로 변경
        // clean.user_id = '현재사용자ID' // 필요시 활성화
        clean.created_at = clean.created_at || new Date().toISOString()
        clean.updated_at = new Date().toISOString()
        return clean
      })
      
      // Upsert 사용 (기존 설정이 있으면 업데이트)
      for (const setting of sanitized) {
        const { data, error } = await supabase
          .from('settings')
          .upsert(setting, { onConflict: 'user_id' })
          .select()
        
        if (error) {
          console.error('❌ 설정 복구 실패:', error.message)
          results.failed.settings = error.message
          break
        }
      }
      
      if (!results.failed.settings) {
        console.log(`✅ 설정 복구 완료: ${sanitized.length}건`)
        results.success.settings = sanitized.length
      }
    } else {
      console.log('\n⏭️  설정 데이터 없음 (건너뜀)')
    }
    
    // 결과 요약
    console.log('\n' + '='.repeat(60))
    console.log('📊 복구 결과 요약')
    console.log('='.repeat(60))
    
    const successCount = Object.keys(results.success).length
    const failedCount = Object.keys(results.failed).length
    
    if (successCount > 0) {
      console.log('✅ 성공한 테이블:')
      Object.entries(results.success).forEach(([table, count]) => {
        console.log(`   - ${table}: ${count}건`)
      })
    }
    
    if (failedCount > 0) {
      console.log('\n❌ 실패한 테이블:')
      Object.entries(results.failed).forEach(([table, error]) => {
        console.log(`   - ${table}: ${error}`)
      })
    }
    
    if (failedCount === 0) {
      console.log('\n🎉 모든 데이터 복구가 성공적으로 완료되었습니다!')
    } else {
      console.log(`\n⚠️  일부 데이터 복구에 실패했습니다. (성공: ${successCount}개, 실패: ${failedCount}개)`)
    }
    
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('\n❌ 데이터 복구 중 예상치 못한 오류 발생:', error)
    process.exit(1)
  }
}

// 스크립트 실행
restoreData()
  .then(() => {
    console.log('\n✅ 스크립트 실행 완료')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ 스크립트 실행 실패:', error)
    process.exit(1)
  })
