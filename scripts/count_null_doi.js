import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// carrega .env simples (KEY=VALUE)
function loadEnv(path = '.env') {
  const out = {};
  try {
    const txt = fs.readFileSync(path, 'utf8');
    txt.split(/\r?\n/).forEach((l) => {
      const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/(^"|"$)/g, '');
    });
  } catch (e) {}
  return out;
}

const env = loadEnv();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltam variáveis SUPABASE (VITE_SUPABASE_URL / VITE_SUPABASE_KEY ou SUPABASE_SERVICE_ROLE).');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

(async () => {
  try {
    // usar count exact sem retornar rows
    const res = await supabase.from('artigo').select('id', { count: 'exact', head: false }).is('doi', null).limit(1);
    if (res.error) {
      console.error('Erro na query:', res.error);
      process.exit(1);
    }

    // alguns adapters retornam count em res.count
    const count = res.count ?? (Array.isArray(res.data) ? res.data.length : 0);
    console.log(`Registros com doi NULL: ${count}`);
    process.exit(0);
  } catch (e) {
    console.error('Erro inesperado:', e);
    process.exit(1);
  }
})();
