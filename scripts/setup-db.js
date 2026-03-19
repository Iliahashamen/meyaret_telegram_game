#!/usr/bin/env node
/**
 * MEYARET DB setup — run supabase-schema.sql in Supabase SQL Editor.
 * Paste the file contents at: supabase.com → SQL Editor → New query → Run.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', 'supabase-schema.sql');

console.log('[setup-db] Schema:', schemaPath);
console.log('[setup-db] Paste supabase-schema.sql into Supabase → SQL Editor and run.');
process.exit(0);
