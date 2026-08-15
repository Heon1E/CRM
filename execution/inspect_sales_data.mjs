
import { connect } from './_supabase.mjs'


const { supabase: supabase } = await connect({ write: process.argv.includes('--apply') })
async function inspectSales() {


    const { data: sales, error } = await supabase
        .from('sales')
        .select('*')
        .not('items', 'is', null)
        .neq('items', '[]') // Filter out empty arrays
        .limit(3);



    if (error) {
        console.error('Error:', error);
        return;
    }

    if (sales && sales.length > 0) {
        console.log('Sample Sale:', JSON.stringify(sales[0], null, 2));
        if (sales[0].items) {
            console.log('Sample Items:', JSON.stringify(sales[0].items, null, 2));
        }
    } else {
        console.log('No sales found.');
    }
}

inspectSales();
