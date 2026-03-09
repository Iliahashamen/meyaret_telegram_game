import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;

// Use service_role key in production (bypasses RLS — server-side only).
// Falls back to anon key for local dev if service_role isn't set yet.
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY !== 'PASTE_YOUR_SERVICE_ROLE_KEY_HERE'
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Missing SUPABASE_URL. Add it in Railway → your service → Variables tab.\n' +
    'Value: https://fbcjmniqwqiurssqdnka.supabase.co'
  );
}
if (!supabaseKey) {
  throw new Error(
    'Missing SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_ANON_KEY fallback). ' +
    'Add both in Railway → your service → Variables tab.'
  );
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY === 'PASTE_YOUR_SERVICE_ROLE_KEY_HERE') {
  console.warn(
    '[supabase] WARNING: Using anon key — get your service_role key from\n' +
    '  supabase.com → your project → Settings → API → service_role (secret)\n' +
    '  and set SUPABASE_SERVICE_ROLE_KEY in .env and Railway variables.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});
