
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

async function cleanupDuplicates() {
    console.log('Fetching all clients for duplicate cleanup...')

    const { data: clients, error } = await supabase
        .from('clients')
        .select('id, company, created_at')

    if (error) {
        console.error('Error fetching clients:', error)
        return
    }

    // Group by company name
    const groups = {}
    clients.forEach(c => {
        const name = c.company.trim()
        if (!groups[name]) groups[name] = []
        groups[name].push(c)
    })

    // Filter groups with > 1 client
    const duplicateGroups = Object.entries(groups).filter(([name, list]) => list.length > 1)
    console.log(`Found ${duplicateGroups.length} groups of duplicates.`)

    let deletedCount = 0
    let keptCount = 0

    for (const [name, list] of duplicateGroups) {
        console.log(`\nProcessing: "${name}" (${list.length} records)`)

        // Enrich with data counts
        const enrichedList = []
        for (const client of list) {
            // Check Sales
            const { count: salesCount } = await supabase
                .from('sales')
                .select('*', { count: 'exact', head: true })
                .eq('client_id', client.id)

            // Check Activities
            const { count: actCount } = await supabase
                .from('activities')
                .select('*', { count: 'exact', head: true })
                .eq('client_id', client.id)

            // Check Issues
            const { count: issueCount } = await supabase
                .from('issues')
                .select('*', { count: 'exact', head: true })
                .eq('client_id', client.id)

            // Check Contacts
            const { count: contactCount } = await supabase
                .from('client_contacts')
                .select('*', { count: 'exact', head: true })
                .eq('client_id', client.id)

            const totalData = (salesCount || 0) + (actCount || 0) + (issueCount || 0) + (contactCount || 0)

            enrichedList.push({
                ...client,
                totalData,
                salesCount
            })
        }

        // Sorting Logic:
        // 1. Most data first
        // 2. If data equal, oldest CreatedAt first (Keep original)
        enrichedList.sort((a, b) => {
            if (b.totalData !== a.totalData) return b.totalData - a.totalData
            return new Date(a.created_at) - new Date(b.created_at) // Oldest first
        })

        // Keeper is the first one
        const keeper = enrichedList[0]
        const removables = enrichedList.slice(1).filter(c => c.totalData === 0)
        const skipped = enrichedList.slice(1).filter(c => c.totalData > 0)

        console.log(`  - KEEPER: ${keeper.id} (Data: ${keeper.totalData})`)

        if (skipped.length > 0) {
            console.log(`  - WARNING: Found other duplicates with data. SKIPPING MERGE for safety.`)
            skipped.forEach(s => console.log(`    - SKIPPED: ${s.id} (Data: ${s.totalData})`))
        }

        if (removables.length > 0) {
            for (const rm of removables) {
                console.log(`  - DELETING: ${rm.id} (Empty)`)
                const { error: delError } = await supabase
                    .from('clients')
                    .delete()
                    .eq('id', rm.id)

                if (delError) console.error(`    - FAILED: ${delError.message}`)
                else deletedCount++
            }
        }
    }

    console.log('\n=== CLEANUP COMPLETE ===')
    console.log(`Deleted ${deletedCount} empty duplicate records.`)
}

cleanupDuplicates()
