import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";

// Usage:
// SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node scripts/import_supabase.js /path/to/scopus.csv

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE no ambiente");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

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

async function tableExists(table) {
  const { error } = await supabase.from(table).select("id").limit(1);
  return !error;
}

async function getOrCreateRevista(nome) {
  if (!(await tableExists("revista"))) return null;
  try {
    const q = await supabase
      .from("revista")
      .select("id")
      .eq("nome_revista", nome)
      .limit(1)
      .single();
    if (q.data?.id) return q.data.id;
  } catch (e) {}
  try {
    const r = await supabase
      .from("revista")
      .insert({ nome_revista: nome })
      .select("id")
      .single();
    return r.data?.id ?? null;
  } catch (e) {
    console.error("revista insert", e);
    return null;
  }
}

async function getOrCreateAuthor(nome) {
  if (!(await tableExists("autor"))) return null;
  try {
    const q = await supabase
      .from("autor")
      .select("id")
      .eq("nome", nome)
      .limit(1)
      .single();
    if (q.data?.id) return q.data.id;
  } catch (e) {}
  try {
    const r = await supabase
      .from("autor")
      .insert({ nome: nome, nome_completo: nome })
      .select("id")
      .single();
    return r.data?.id ?? null;
  } catch (e) {
    console.error("autor insert", e);
    return null;
  }
}

async function getOrCreateIndexKeyword(keyword) {
  if (!(await tableExists("index_keyword"))) return null;
  try {
    const q = await supabase
      .from("index_keyword")
      .select("id")
      .eq("index_keyword", keyword)
      .limit(1)
      .single();
    if (q.data?.id) return q.data.id;
  } catch (e) {}
  try {
    const r = await supabase
      .from("index_keyword")
      .insert({ index_keyword: keyword })
      .select("id")
      .single();
    return r.data?.id ?? null;
  } catch (e) {
    console.error("index_keyword insert", e);
    return null;
  }
}

async function getOrCreateAutorKeyword(keyword) {
  if (!(await tableExists("autor_keywords"))) return null;
  try {
    const q = await supabase
      .from("autor_keywords")
      .select("id")
      .eq("autor_keyword", keyword)
      .limit(1)
      .single();
    if (q.data?.id) return q.data.id;
  } catch (e) {}
  try {
    const r = await supabase
      .from("autor_keywords")
      .insert({ autor_keyword: keyword })
      .select("id")
      .single();
    return r.data?.id ?? null;
  } catch (e) {
    console.error("autor_keywords insert", e);
    return null;
  }
}

async function insertArtigo(obj) {
  if (!(await tableExists("artigo"))) return { id: null, error: "no table" };
  try {
    const r = await supabase.from("artigo").insert(obj).select("id").single();
    return { id: r.data?.id ?? null };
  } catch (e) {
    return { id: null, error: e };
  }
}

async function run(path) {
  console.log("Lendo", path);
  const rows = await fileToRows(path);
  console.log("Linhas lidas:", rows.length);
  const resumo = {
    artigos: 0,
    revistas: 0,
    autores: 0,
    keywords: 0,
    junctions: 0,
    errors: [],
  };

  for (const row of rows) {
    try {
      const title =
        row["Title"] ?? row["Titulo"] ?? row["title"] ?? row["TITLE"] ?? null;
      const year = parseInt(row["Year"] ?? row["Ano"] ?? "") || null;
      const sourceTitle =
        row["Source title"] ?? row["Source"] ?? row["source"] ?? null;
      const link = row["Link"] ?? row["link"] ?? null;
      const referencias = row["References"] ?? row["Referencias"] ?? null;
      const issn = row["ISSN"] ?? null;
      const isbn = row["ISBN"] ?? null;
      const coden = row["CODEN"] ?? null;
      const linguagem =
        row["Language of Original Document"] ??
        row["Linguagem_Original"] ??
        null;
      const qt_citacao = parseInt(row["Cited by"] ?? "") || 0;

      const id_revista = sourceTitle
        ? await getOrCreateRevista(sourceTitle)
        : null;
      if (id_revista) resumo.revistas++;

      const artigoObj = {
        titulo: title,
        ano: year,
        link: link,
        referencias: referencias,
        tipo_documento: row["Document Type"] ?? null,
        issn: issn,
        isbn: isbn,
        coden: coden,
        linguagem_original: linguagem,
        qt_citacao: qt_citacao,
        id_revista: id_revista,
      };

      const artR = await insertArtigo(artigoObj);
      if (artR.error) {
        resumo.errors.push({ row: title, error: artR.error });
        continue;
      }
      const id_artigo = artR.id;
      resumo.artigos++;

      // autores
      const authorsField =
        row["Authors"] ?? row["Author"] ?? row["Author full names"] ?? null;
      let firstAuthorId = null;
      if (authorsField) {
        const names = authorsField
          .split(/;|\||,/)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const name of names) {
          const id_autor = await getOrCreateAuthor(name);
          if (id_autor) {
            resumo.autores++;
            if (!firstAuthorId) firstAuthorId = id_autor;
          }
          if ((await tableExists("artigo_autor")) && id_autor) {
            try {
              await supabase
                .from("artigo_autor")
                .insert({ id_artigo, id_autor });
              resumo.junctions++;
            } catch (e) {
              console.warn("artigo_autor", e);
            }
          }
        }
      }
      if (firstAuthorId) {
        try {
          await supabase
            .from("artigo")
            .update({ id_autor: firstAuthorId })
            .eq("id", id_artigo);
        } catch (e) {
          console.warn("update id_autor", e);
        }
      }

      // keywords
      const indexField =
        row["Index Keywords"] ?? row["Author Keywords"] ?? null;
      if (indexField) {
        const kws = indexField
          .split(/;|,/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (kws.length) {
          const id_kw = await getOrCreateIndexKeyword(kws[0]);
          if (id_kw) {
            resumo.keywords++;
            try {
              await supabase
                .from("artigo")
                .update({ id_index_keyword: id_kw })
                .eq("id", id_artigo);
            } catch (e) {
              console.warn("update id_index_keyword", e);
            }
          }
        }
      }

      const authorKeywordsField = row["Author Keywords"] ?? null;
      if (authorKeywordsField) {
        const aks = authorKeywordsField
          .split(/;|,/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (aks.length) {
          const id_ak = await getOrCreateAutorKeyword(aks[0]);
          if (id_ak) {
            resumo.keywords++;
            try {
              await supabase
                .from("artigo")
                .update({ id_autor_keyword: id_ak })
                .eq("id", id_artigo);
            } catch (e) {
              console.warn("update id_autor_keyword", e);
            }
          }
        }
      }

      if (id_revista && (await tableExists("artigo_revista"))) {
        try {
          await supabase
            .from("artigo_revista")
            .insert({ id_artigo, id_revista });
          resumo.junctions++;
        } catch (e) {
          console.warn("artigo_revista", e);
        }
      }
    } catch (e) {
      resumo.errors.push({ error: e, row: row });
    }
  }

  console.log("Resumo:", resumo);
}

const arg = process.argv[2];
if (!arg) {
  console.error("Passe o caminho do CSV como argumento");
  process.exit(1);
}
run(arg)
  .then(() => console.log("Concluído"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
