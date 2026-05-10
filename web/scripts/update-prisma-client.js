// Update Prisma Client after schema creation
const { execSync } = require('child_process');

console.log('🔄 Updating Prisma Client...\n');

try {
  // Generate Prisma Client from the existing database
  console.log('📥 Pulling schema from database...');
  execSync('npx prisma db pull', { stdio: 'inherit' });

  console.log('\n✅ Schema pulled successfully!');

  // Generate Prisma Client
  console.log('\n🔨 Generating Prisma Client...');
  execSync('npx prisma generate', { stdio: 'inherit' });

  console.log('\n🎉 Prisma setup completed!');
  console.log('📋 You can now use Prisma in your POS terminal:');

  console.log('\nUsage example:');
  console.log('```typescript');
  console.log('import { PrismaClient } from \'@prisma/client\'');
  console.log('const prisma = new PrismaClient()');
  console.log('');
  console.log('// Get all retailers');
  console.log('const retailers = await prisma.entity.findMany({');
  console.log('  where: { role: \'RETAILER\' }');
  console.log('})');
  console.log('```');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('\n💡 Make sure you have executed the SQL schema in Supabase first!');
  console.log('1. Go to: https://supabase.com/dashboard/project/uoermqevxkuxbazbzxkc/sql/new');
  console.log('2. Copy the schema from supabase/schema.sql');
  console.log('3. Execute it in the SQL editor');
  console.log('4. Then run this script again');
}