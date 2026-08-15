
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { connect } from './_supabase.mjs'

// Load environment variables manually
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.resolve(__dirname, '.env')
const envContent = fs.readFileSync(envPath, 'utf-8')

const envConfig = {}
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
        const key = match[1].trim()
        const value = match[2].trim().replace(/^['"](.*)['"]$/, '$1')
        envConfig[key] = value
    }
})

const supabaseUrl = envConfig.VITE_SUPABASE_URL
const supabaseKey = envConfig.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env')
    process.exit(1)
}

const { supabase: supabase } = await connect({ write: process.argv.includes('--apply') })
async function checkDuplicates() {
    console.log('Searching for clients matching "현대산업"...')

    const { data: clients, error } = await supabase
        .from('clients')
        .select('*')
        .ilike('company', '%현대산업%')

    if (error) {
        console.error('Error fetching clients:', error)
        return
    }

    console.log(`Found ${clients.length} clients.`)

    for (const client of clients) {
        const { count, data: sales, error: salesError } = await supabase
            .from('sales')
            .select('total_amount', { count: 'exact' })
            .eq('client_id', client.id)

        if (salesError) {
            console.error(`Error fetching sales for ${client.company}:`, salesError)
            continue
        }

        const totalRevenue = sales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)

        const { count: activityCount } = await supabase
            .from('activities')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', client.id)

        const { count: issueCount } = await supabase
            .from('issues')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', client.id)

        console.log('------------------------------------------------')
        console.log(`ID: ${client.id}`)
        console.log(`Company: ${client.company}`)
        console.log(`Created At: ${client.created_at}`)
        console.log(`Sales Count: ${count}`)
        console.log(`Activities Count: ${activityCount}`)
        console.log(`Issues Count: ${issueCount}`)
        console.log(`Total Revenue: ${totalRevenue.toLocaleString()} KRW`)
    }
}

checkDuplicates()
