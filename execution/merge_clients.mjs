
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

const TARGET_ID = 'ded930fa-a035-4d14-8315-99d0e5c99c1e' // Main Client (42 sales)
const SOURCE_ID_WITH_DATA = 'e7fc4ec4-a630-49d4-9be6-c71b51804c80' // Duplicate (2 sales, 3 activities)
const IDS_TO_DELETE = [
    'e7fc4ec4-a630-49d4-9be6-c71b51804c80',
    'a386915c-1515-4128-aa26-6c5fd17182d4',
    '09727046-e53a-427e-8803-e77015fbb2d7'
]

async function mergeClients() {
    console.log('Starting client merge process...')

    // 1. Migrate Sales
    const { error: salesError, count: salesCount } = await supabase
        .from('sales')
        .update({ client_id: TARGET_ID })
        .eq('client_id', SOURCE_ID_WITH_DATA)
        .select() // to get count

    if (salesError) console.error('Error migrating sales:', salesError)
    else console.log(`Migrated sales count for ${SOURCE_ID_WITH_DATA}: Done`)

    // 2. Migrate Activities
    const { error: actError } = await supabase
        .from('activities')
        .update({ client_id: TARGET_ID })
        .eq('client_id', SOURCE_ID_WITH_DATA)

    if (actError) console.error('Error migrating activities:', actError)
    else console.log(`Migrated activities.`)

    // 3. Migrate Issues
    const { error: issueError } = await supabase
        .from('issues')
        .update({ client_id: TARGET_ID })
        .eq('client_id', SOURCE_ID_WITH_DATA)

    if (issueError) console.error('Error migrating issues:', issueError)
    else console.log(`Migrated issues.`)

    // 4. Migrate Contacts
    // Check collision risk? Usually contact emails might be unique. 
    // If collision, we might fail. Just try update.
    const { error: contactError } = await supabase
        .from('client_contacts')
        .update({ client_id: TARGET_ID })
        .eq('client_id', SOURCE_ID_WITH_DATA)

    if (contactError) console.error('Error migrating contacts (might be duplicates):', contactError)
    else console.log(`Migrated contacts.`)

    // 5. Delete Clients
    for (const id of IDS_TO_DELETE) {
        const { error: delError } = await supabase
            .from('clients')
            .delete()
            .eq('id', id)

        if (delError) console.error(`Error deleting client ${id}:`, delError)
        else console.log(`Deleted client ${id}`)
    }

    console.log('Merge process completed.')
}

mergeClients()
