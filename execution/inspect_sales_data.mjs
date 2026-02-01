
import { createClient } from '@supabase/supabase-js'


const supabase = createClient(
    'https://dfukyqrradgmytyqxvnw.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmdWt5cXJyYWRnbXl0eXF4dm53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MTExNzEsImV4cCI6MjA4MzA4NzE3MX0.YNMZJLVEXyFVMSlHjVPCRAZz-hB6PHf5wrUKj91BBkg'
)


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
