// Database Connection Test with Object Configuration
const { Client } = require('pg');

async function testConnectionWithObject() {
  console.log('🔍 Testing database connection with object configuration...\n');

  const connectionConfig = {
    host: 'aws-1-ap-southeast-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.uoermqevxkuxbazbzxkc',
    password: 'TigeTiger@17649720',
    ssl: {
      rejectUnauthorized: false,
    },
    connectionTimeoutMillis: 10000,
  };

  console.log('Connection details:');
  console.log(`Host: ${connectionConfig.host}`);
  console.log(`Port: ${connectionConfig.port}`);
  console.log(`Database: ${connectionConfig.database}`);
  console.log(`User: ${connectionConfig.user}`);
  console.log(`Password: ${connectionConfig.password.replace(/./g, '*')}`);

  const client = new Client(connectionConfig);

  try {
    console.log('\n⏳ Attempting to connect...');
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
    console.log('✅ Connection closed successfully');

    console.log('\n🎯 CORRECT CONNECTION CONFIGURATION:');
    console.log(JSON.stringify(connectionConfig, null, 2));

    // Return the correct connection string format
    return `postgresql://${connectionConfig.user}:${encodeURIComponent(connectionConfig.password)}@${connectionConfig.host}:${connectionConfig.port}/${connectionConfig.database}`;

  } catch (error) {
    console.error('❌ FAILED:', error.message);
    console.error('Error details:', error.code || 'No error code');
    console.error('Full error:', error);

    try {
      await client.end();
    } catch (e) {
      // Ignore close errors
    }

    // Try alternative port (pooler)
    console.log('\n🔄 Trying pooler port 6543...');
    connectionConfig.port = 6543;
    connectionConfig.password = 'TigeTiger@17649720'; // Reset password

    const client2 = new Client(connectionConfig);
    try {
      await client2.connect();
      console.log('✅ SUCCESS! Connected via pooler');

      const result = await client2.query('SELECT version()');
      console.log('Database version:', result.rows[0].version);

      await client2.end();
      return `postgresql://${connectionConfig.user}:${encodeURIComponent(connectionConfig.password)}@${connectionConfig.host}:${connectionConfig.port}/${connectionConfig.database}`;
    } catch (poolerError) {
      console.error('❌ Pooler also failed:', poolerError.message);
      try {
        await client2.end();
      } catch (e) {
        // Ignore close errors
      }
    }
  }

  return null;
}

testConnectionWithObject().then(connectionString => {
  if (connectionString) {
    console.log('\n✅ Use this connection string:');
    console.log(connectionString);
  } else {
    console.log('\n❌ All connection attempts failed');
    console.log('Possible issues:');
    console.log('1. Database password is incorrect');
    console.log('2. Database is paused/suspended in Supabase');
    console.log('3. IP restrictions on database access');
    console.log('4. Database region is different from ap-southeast-1');
  }
}).catch(console.error);