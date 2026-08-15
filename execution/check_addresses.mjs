
import { connect } from './_supabase.mjs'
const { supabase: supabase } = await connect({ write: process.argv.includes('--apply') })
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
