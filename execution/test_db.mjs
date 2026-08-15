import { connect } from './_supabase.mjs'
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

console.log('URL:', supabaseUrl)
console.log('KEY:', supabaseAnonKey ? 'exists' : 'missing')

const { supabase: supabase } = await connect({ write: process.argv.includes('--apply') })
async function test() {
    const { data, count, error } = await supabase
        .from('clients')
        .select('*', { count: 'exact' })
        .range(0, 10)

    if (error) {
        console.error('Error:', error)
    } else {
        console.log('Data count:', data.length)
        console.log('Total count:', count)
        console.log('First client:', data[0]?.company)
    }
}

test()
