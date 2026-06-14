import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Usage:
// - coloque um arquivo `.env` na raiz do projeto com as variáveis (SUPABASE_URL, SUPABASE_SERVICE_ROLE)
// - ou exporte as variáveis no ambiente antes de rodar
// Ex: node scripts/update_doi.js [--dry] /path/to/file.csv

// Carrega automaticamente .env (se existir) para process.env quando o script é executado
async function loadDotEnvIfExists() {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    const txt = await fs.readFile(envPath, "utf8");
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      // remover aspas
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // preservar variáveis já definidas no ambiente
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (e) {
    // ignore se não existir
  }
}

await loadDotEnvIfExists();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
  (process.env.SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE)?.trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE no ambiente");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// fuzzy matching config
const FUZZY_ENABLED = true; // habilita tentativa fuzzy automática
const FUZZY_THRESHOLD = 0.75; // similaridade mínima (0-1)
const FUZZY_CANDIDATE_LIMIT = 200; // número máximo de candidatos buscados via ilike

function normalizeString(s) {
  if (!s) return "";
  // remover diacríticos
  s = s.normalize("NFKD").replace(/\p{Diacritic}/gu, "");
  // minusculas, remover pontuação, colapsar espaços
  return s
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let v0 = new Array(bl + 1).fill(0).map((_, i) => i);
  let v1 = new Array(bl + 1).fill(0);
  for (let i = 0; i < al; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < bl; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    [v0, v1] = [v1, v0];
  }
  return v0[bl];
}

function similarity(a, b) {
  const na = normalizeString(a);
  const nb = normalizeString(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}

function parseCSVLine(line) {
  const vals = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      vals.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  vals.push(cur);
  return vals.map((v) => v.trim().replace(/^"|"$/g, ""));
}

async function fileToRows(path) {
  const txt = await fs.readFile(path, "utf8");
  const lines = txt.split(/\r?\n/);
  let headerIdx = 0;
  while (headerIdx < lines.length && lines[headerIdx].trim() === "")
    headerIdx++;
  if (headerIdx >= lines.length) throw new Error("Arquivo vazio");
  const headers = parseCSVLine(lines[headerIdx]);
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln || !ln.trim()) continue;
    const values = parseCSVLine(ln);
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = values[idx] ?? ""));
    rows.push(obj);
  }
  return rows;
}

async function findArticleIdByRow(row) {
  if (row.id) {
    const id = parseInt(row.id, 10);
    if (!Number.isNaN(id)) return id;
  }

  const title =
    row["Title"] ??
    row["Titulo"] ??
    row["title"] ??
    row["TITLE"] ??
    row["titulo"] ??
    null;
  if (!title) return null;

  try {
    const q = await supabase
      .from("artigo")
      .select("id")
      .eq("titulo", title)
      .limit(1)
      .single();
    if (q.data?.id) return q.data.id;
  } catch (e) {}

  try {
    const q2 = await supabase
      .from("artigo")
      .select("id")
      .ilike("titulo", `%${title}%`)
      .limit(1)
      .single();
    if (q2.data?.id) return q2.data.id;
  } catch (e) {}

  // tentativa fuzzy: buscar candidatos via ilike (baseado na primeira palavra do título)
  if (FUZZY_ENABLED) {
    try {
      const firstWord = (title.split(" ")[0] || title).replace(/[^a-zA-Z0-9]/g, "");
      const q3 = await supabase
        .from("artigo")
        .select("id, titulo")
        .ilike("titulo", `%${firstWord}%`)
        .limit(FUZZY_CANDIDATE_LIMIT);
      if (q3.data && q3.data.length) {
        let best = null;
        let bestScore = 0;
        for (const cand of q3.data) {
          const score = similarity(title, cand.titulo || "");
          if (score > bestScore) {
            bestScore = score;
            best = cand;
          }
        }
        if (best && bestScore >= FUZZY_THRESHOLD) {
          console.log(`Fuzzy match: "${title}" => id=${best.id} (score=${bestScore.toFixed(3)})`);
          return best.id;
        }
      }
    } catch (e) {
      // ignore fuzzy errors
    }
  }

  return null;
}

async function updateDoiForRow(row, dryRun = false) {
  const doi = (row["DOI"] ?? row["doi"] ?? "").trim();
  if (!doi) return { ok: false, reason: "no doi" };

  const id = await findArticleIdByRow(row);
  if (!id) return { ok: false, reason: "no id found" };

  if (dryRun) return { ok: true, id, dry: true };

  try {
    const r = await supabase
      .from("artigo")
      .update({ doi })
      .eq("id", id)
      .select("id")
      .single();
    if (r.error) return { ok: false, reason: r.error };
    return { ok: true, id };
  } catch (e) {
    return { ok: false, reason: e };
  }
}

async function run(path, dryRun = false) {
  console.log("Lendo arquivo:", path);
  const rows = await fileToRows(path);
  console.log("Linhas:", rows.length);

  const resumo = { updated: 0, skipped: 0, errors: [] };

  for (const r of rows) {
    try {
      const res = await updateDoiForRow(r, dryRun);
      if (res.ok) {
        if (!dryRun) console.log(`Atualizado id=${res.id}`);
        else console.log(`DRY id=${res.id}`);
        resumo.updated++;
      } else {
        console.warn("Pulando linha:", res.reason);
        resumo.skipped++;
        resumo.errors.push({ row: r, reason: res.reason });
      }
    } catch (e) {
      console.error("Erro processando linha:", e);
      resumo.errors.push({ row: r, reason: e });
    }
  }

  console.log("Resumo:", resumo);
}

const args = process.argv.slice(2);
const dry = args.includes("--dry") || args.includes("-d");
const csvPath = args.find((a) => !a.startsWith("-"));
if (!csvPath) {
  console.error("Passe o caminho do CSV como argumento");
  process.exit(1);
}

run(csvPath, dry)
  .then(() => console.log("Concluído"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
