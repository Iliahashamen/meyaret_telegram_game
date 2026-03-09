import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY !== 'PASTE_YOUR_SERVICE_ROLE_KEY_HERE'
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_ANON_KEY;

// Log clearly what is missing — server will still start so /health responds
if (!supabaseUrl) {
  console.error(
    '[supabase] MISSING SUPABASE_URL !\n' +
    '  Go to Railway → your service → Variables → add:\n' +
    '  SUPABASE_URL = https://fbcjmniqwqiurssqdnka.supabase.co'
  );
}
if (!supabaseKey) {
  console.error(
    '[supabase] MISSING SUPABASE KEY !\n' +
    '  Go to Railway → your service → Variables → add:\n' +
    '  SUPABASE_SERVICE_ROLE_KEY = eyJhbGci...(your service_role JWT)'
  );
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY === 'PASTE_YOUR_SERVICE_ROLE_KEY_HERE') {
  console.warn('[supabase] Using anon key — some operations may fail RLS policies.');
}

// Export null if config is missing so the server still boots
// (routes will return 503 instead of crashing everything)
export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;

export const DB_OK = !!supabase;
