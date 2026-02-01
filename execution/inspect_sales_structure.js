
var { createClient } = require('@supabase/supabase-js');

// Create a single supabase client for interacting with your database
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function inspectSales() {
    const { data: sales, error } = await supabase
        .from('sales')
        .select('*')
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
