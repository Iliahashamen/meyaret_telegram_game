import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

console.log('Testing Supabase connection...');
const { data, error } = await sb.from('users').select('count').limit(1);

if (error) {
  if (error.message.includes('does not exist')) {
    console.log('⚠  Tables not found — please run supabase-schema.sql in Supabase SQL Editor.');
  } else {
    console.log('✗ DB Error:', error.message);
  }
} else {
  console.log('✓ Supabase OK — users table exists and is accessible.');
}
