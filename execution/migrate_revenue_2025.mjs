// 이 파일은 예전에 `@supabase/supabase-client`(오타, 실재하지 않는 패키지)를
// import하고 있어 **한 번도 돌지 않았다.** 접속을 공용 모듈로 바꾸면서 함께 고친다.
import { connect } from './_supabase.mjs'

const { supabase } = await connect({ write: process.argv.includes('--apply') })

async function migrateRevenue() {
    console.log('🚀 Starting Revenue Migration (2025)...');

    // 1. Fetch all sales for 2025
    const startDate = '2025-01-01';
    const endDate = '2025-12-31';

    const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('client_id, total_amount, quantity, unit_price')
        .gte('sale_date', startDate)
        .lte('sale_date', endDate);

    if (salesError) {
        console.error('❌ Error fetching sales:', salesError);
        return;
    }

    console.log(`📊 Fetched ${salesData.length} sales entries for 2025.`);

    // 2. Aggregate revenue by client_id
    const revenueMap = salesData.reduce((acc, row) => {
        const clientId = row.client_id;
        if (!clientId) return acc;

        const amount = row.total_amount !== null && row.total_amount !== undefined
            ? Number(row.total_amount)
            : Number(row.quantity || 0) * Number(row.unit_price || 0);

        acc[clientId] = (acc[clientId] || 0) + (Number(amount) || 0);
        return acc;
    }, {});

    const clientIds = Object.keys(revenueMap);
    console.log(`🎯 Found ${clientIds.length} unique clients with 2025 revenue.`);

    // 3. Update clients table
    // Note: We'll do this in batches if needed, but for now individual or small batch updates
    let successCount = 0;
    for (const clientId of clientIds) {
        const revenue = revenueMap[clientId];
        const { error: updateError } = await supabase
            .from('clients')
            .update({ last_year_revenue: revenue })
            .eq('id', clientId);

        if (updateError) {
            console.error(`❌ Failed to update client ${clientId}:`, updateError);
        } else {
            successCount++;
        }
    }

    console.log(`✅ Successfully updated ${successCount} clients with 2025 revenue.`);
}

migrateRevenue();
