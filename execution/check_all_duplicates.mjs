
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkAllDuplicates() {
    console.log('Fetching all clients to check for duplicates...')

    const { data: clients, error } = await supabase
        .from('clients')
        .select('id, company, created_at')

    if (error) {
        console.error('Error fetching clients:', error)
        return
    }

    // Group by company name (normalized)
    const groups = {}
    clients.forEach(c => {
        // Normalize: Remove spaces, lowercase, remove potentially variable parts like (주) if desired, 
        // but for now let's stick to exact string match + trimming to be safe.
        const name = c.company.trim()
        if (!groups[name]) groups[name] = []
        groups[name].push(c)
    })

    // Filter groups with > 1 client
    const duplicates = Object.entries(groups).filter(([name, list]) => list.length > 1)

    console.log(`Found ${duplicates.length} sets of duplicate clients by name.`)
    console.log('Analyzing content...')

    const critical = []
    const easyFix = []
    const allEmpty = []

    for (const [name, list] of duplicates) {
        const details = []
        let dataCount = 0

        for (const client of list) {
            // Fetch stats
            const { count: salesCount, data: sales } = await supabase
                .from('sales')
                .select('total_amount', { count: 'exact' })
                .eq('client_id', client.id)

            const totalRevenue = (sales || []).reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)

            const { count: actCount } = await supabase
                .from('activities')
                .select('*', { count: 'exact', head: true })
                .eq('client_id', client.id)

            const hasData = salesCount > 0 || actCount > 0
            if (hasData) dataCount++

            details.push({
                id: client.id,
                created: new Date(client.created_at).toLocaleDateString(),
                sales: salesCount,
                revenue: totalRevenue,
                activities: actCount,
                hasData
            })
        }

        if (dataCount > 1) {
            critical.push({ name, details })
        } else if (dataCount === 1) {
            easyFix.push({ name, details })
        } else {
            allEmpty.push({ name, details })
        }
    }

    console.log('\n=== SUMMARY ===')
    console.log(`Total Duplicate Sets: ${duplicates.length}`)
    console.log(`- Critical (Multiple recs with data): ${critical.length}`)
    console.log(`- Easy Fix (Only 1 rec with data): ${easyFix.length}`)
    console.log(`- Ghosts (All empty): ${allEmpty.length}`)

    if (critical.length > 0) {
        console.log('\n=== CRITICAL MERGES REQUIRED ===')
        critical.forEach(item => {
            console.log(`\nDuplicate: "${item.name}"`)
            item.details.forEach(d => {
                console.log(`  - ID: ${d.id} | Sales: ${d.sales} (${d.revenue.toLocaleString()} KRW) | Acts: ${d.activities}`)
            })
        })
    }

    if (easyFix.length > 0) {
        console.log('\n=== EASY CLEANUP (Review First 5) ===')
        easyFix.slice(0, 5).forEach(item => {
            console.log(`\nDuplicate: "${item.name}"`)
            item.details.forEach(d => {
                const marker = d.hasData ? " [KEEP]" : " [DELETE]"
                console.log(`  - ID: ${d.id} | Sales: ${d.sales} (${d.revenue.toLocaleString()} KRW) | Acts: ${d.activities}${marker}`)
            })
        })
        if (easyFix.length > 5) console.log(`... and ${easyFix.length - 5} more.`)
    }
}

checkAllDuplicates()
