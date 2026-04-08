// Database Connection Test Script
const { Client } = require('pg');

async function testConnection() {
  const connectionStrings = [
    // Try with the correct password
    'postgresql://postgres.uoermqevxkuxbazbzxkc:TigeTiger@17649720@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
    'postgresql://postgres.uoermqevxkuxbazbzxkc:TigeTiger%4017649720@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
    'postgresql://postgres.uoermqevxkuxbazbzxkc:TigeTiger@17649720@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
    'postgresql://postgres.uoermqevxkuxbazbzxkc:TigeTiger@17649720@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require',
  ];

  for (let i = 0; i < connectionStrings.length; i++) {
    console.log(`\n--- Testing connection string ${i + 1} ---`);
    console.log(`Connection: ${connectionStrings[i].replace(/:[^:@]+@/, ':****@')}`); // Hide password

    const client = new Client({
      connectionString: connectionStrings[i],
      connectionTimeoutMillis: 10000,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    try {
      await client.connect();
      console.log('✅ SUCCESS! Connected to database');

      // Test query
      const result = await client.query('SELECT version()');
      console.log('Database version:', result.rows[0].version);

      // Check if our tables exist
      const tables = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);
      console.log('Existing tables:', tables.rows.map(row => row.table_name));

      await client.end();
      console.log('Connection closed successfully');

      // If successful, this is the right connection string
      console.log('\n🎯 CORRECT CONNECTION STRING FOUND:');
      console.log(connectionStrings[i]);
      return connectionStrings[i];

    } catch (error) {
      console.error('❌ FAILED:', error.message);
      console.error('Error details:', error.code || 'No error code');
      try {
        await client.end();
      } catch (e) {
        // Ignore close errors
      }
    }
  }

  console.log('\n❌ All connection attempts failed');
}

testConnection().catch(console.error);