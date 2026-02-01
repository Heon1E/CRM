import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    'https://dfukyqrradgmytyqxvnw.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmdWt5cXJyYWRnbXl0eXF4dm53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc0NTE4NDksImV4cCI6MjA1MzAyNzg0OX0.6yuwNsKNCM0BwAXxbJSUFONlzvM0CTSc-QCdW21HJlQ'
)

async function checkAddresses() {
    const { data, error } = await supabase
        .from('clients')
        .select('id, company, address, postal_code, latitude, longitude')
        .not('address', 'is', null)
        .limit(20)

    if (error) {
        console.error('Error:', error)
        return
    }

    const withCoords = data.filter(c => c.latitude && c.longitude)
    const withoutCoords = data.filter(c => !c.latitude || !c.longitude)

    console.log('\n=== 주소 데이터 분석 ===')
    console.log(`주소가 있는 거래처: ${data.length}개`)
    console.log(`좌표가 있는 거래처: ${withCoords.length}개`)
    console.log(`좌표가 없는 거래처: ${withoutCoords.length}개\n`)

    if (withCoords.length > 0) {
        console.log('=== 좌표가 있는 거래처 샘플 ===')
        withCoords.slice(0, 3).forEach(c => {
            console.log(`- ${c.company}`)
            console.log(`  주소: ${c.address}`)
            console.log(`  좌표: ${c.latitude}, ${c.longitude}\n`)
        })
    }

    if (withoutCoords.length > 0) {
        console.log('=== 좌표가 없는 거래처 샘플 ===')
        withoutCoords.slice(0, 5).forEach(c => {
            console.log(`- ${c.company}`)
            console.log(`  주소: ${c.address}`)
            console.log(`  우편번호: ${c.postal_code || 'X'}\n`)
        })
    }
}

checkAddresses()
