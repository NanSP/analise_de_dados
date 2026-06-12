import { createClient } from "@supabase/supabase-js";

// ============================================
// CONEXÃO SUPABASE VIA .ENV
// ============================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
// (debug) não expor supabase globalmente em produção

// tamanho padrão para truncamento de strings ao re-tentar inserts (ajustável)
const TRUNCATE_MAX = 255;

// ============================================
// ELEMENTOS
// ============================================

const thead = document.getElementById("thead");
const tbody = document.getElementById("tbody");
const info = document.getElementById("info");

// ============================================
// CRIAR TABELA
// ============================================

function criarTabela(dados) {
  thead.innerHTML = "";
  tbody.innerHTML = "";

  if (!dados || dados.length === 0) {
    info.innerHTML = "Nenhum dado encontrado.";
    return;
  }

  info.innerHTML = `${dados.length} registro(s) encontrado(s).`;

  const headers = Object.keys(dados[0]);

  let trHead = "<tr>";

  headers.forEach((header) => {
    trHead += `<th>${header}</th>`;
  });

  trHead += "</tr>";

  thead.innerHTML = trHead;

  dados.forEach((item) => {
    let tr = "<tr>";

    headers.forEach((header) => {
      tr += `<td>${item[header] ?? ""}</td>`;
    });

    tr += "</tr>";

    tbody.innerHTML += tr;
  });
}

// ============================================
// ARTIGOS
// ============================================

async function listarArtigos() {
  const { data, error } = await supabase.from("artigo").select("*");

  if (error) {
    alert(error.message);
    return;
  }

  criarTabela(data);
}

// ============================================
// AUTORES
// ============================================

async function listarAutores() {
  const { data, error } = await supabase.from("autor").select("*");

  if (error) {
    alert(error.message);
    return;
  }

  criarTabela(data);
}

// ============================================
// PALAVRAS-CHAVE
// ============================================

async function listarKeywords() {
  const { data, error } = await supabase.from("index_keyword").select("*");

  if (error) {
    alert(error.message);
    return;
  }

  criarTabela(data);
}

// ============================================
// REFERÊNCIAS
// ============================================

async function listarReferencias() {
  const { data, error } = await supabase.from("revista").select("*");

  if (error) {
    alert(error.message);
    return;
  }

  criarTabela(data);
}

// ============================================
// LIMPAR
// ============================================

function limparTabela() {
  thead.innerHTML = "";
  tbody.innerHTML = "";
  info.innerHTML = "";
}

// ============================================
// IMPORTAR CSV
// ============================================

document.getElementById("fileInput").addEventListener("change", importarCSV);

async function importarCSV(event) {
  const arquivo = event.target.files[0];
  if (!arquivo) return;

  const texto = await arquivo.text();
  const linhas = texto.split(/\r?\n/);

  // detectar cabeçalho do arquivo (usa primeira linha não-vazia)
  let headerLineIndex = 0;
  while (
    headerLineIndex < linhas.length &&
    linhas[headerLineIndex].trim() === ""
  )
    headerLineIndex++;

  if (headerLineIndex >= linhas.length) {
    alert("Arquivo CSV vazio.");
    return;
  }

  const parsedHeader = parseCSVLine(linhas[headerLineIndex]);
  const headers = parsedHeader.map((h) =>
    typeof h === "string" ? h.trim().replace(/^"|"$/g, "") : h,
  );

  // parser simples que respeita aspas e "" como escape
  function parseCSVLine(line) {
    const vals = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // escaped quote
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
    return vals;
  }

  const dados = [];
  // começar na linha após o header detectado
  for (let i = headerLineIndex + 1; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;

    const valores = parseCSVLine(linha);

    const obj = {};
    headers.forEach((col, idx) => {
      const v = valores[idx] ?? null;
      // trim e remover aspas remanescentes
      obj[col] = typeof v === "string" ? v.trim().replace(/^"|"$/g, "") : v;
    });

    dados.push(obj);
  }

  if (dados.length === 0) {
    alert("Nenhum registro para importar.");
    return;
  }
  // normaliza e insere nos relacionamentos do modelo lógico
  await normalizeAndInsert(dados);
}

// ============================================
// NORMALIZAÇÃO E INSERÇÃO RELACIONAL
// ============================================

async function tableExists(table) {
  const { error } = await supabase.from(table).select("id").limit(1);
  return !error;
}

async function columnExists(table, column) {
  const { error } = await supabase.from(table).select(`${column}`).limit(1);
  return !error;
}

// cache de colunas por tabela para reduzir consultas repetidas
const tableColumnsCache = new Map();

// insere em qualquer tabela após sanitizar campos com base nas colunas existentes
async function sanitizeAndInsert(table, payload) {
  if (!(await tableExists(table)))
    return { error: `Tabela ${table} não existe` };
  try {
    if (!tableColumnsCache.has(table)) {
      const cols = new Set();
      for (const k of Object.keys(payload)) {
        try {
          if (await columnExists(table, k)) cols.add(k);
        } catch (e) {
          // ignore
        }
      }
      tableColumnsCache.set(table, cols);
    }

    const allowed = tableColumnsCache.get(table);
    const sanitized = {};
    for (const [k, v] of Object.entries(payload)) {
      if (allowed.has(k)) sanitized[k] = v;
      else console.debug(`Removendo campo não mapeado de ${table}: ${k}`);
    }
    if (Object.keys(sanitized).length === 0)
      return { error: "Nenhum campo válido para inserir" };

    const r = await supabase.from(table).insert(sanitized);
    if (r.error) {
      console.error(
        `Supabase error insert ${table}:`,
        r.error,
        "payload:",
        sanitized,
      );
      return { error: r.error };
    }
    return { data: r.data };
  } catch (e) {
    console.error(`Erro sanitizeAndInsert ${table}:`, e);
    return { error: e };
  }
}

// tentativa segura de encontrar um registro pelo valor da coluna
async function safeFind(table, column, value) {
  if (!value) return null;
  // tenta RPC genérico para evitar problemas de encoding na query string
  try {
    const r = await supabase.rpc("find_id_by_value", {
      p_table: table,
      p_column: column,
      p_value: value,
    });
    if (r.data) return r.data;
  } catch (e) {
    // ignore e fallback
  }
  // 1) filter eq
  try {
    const q1 = await supabase
      .from(table)
      .select("id")
      .eq(column, value)
      .limit(1)
      .single();
    if (q1.data && q1.data.id) return q1.data.id;
  } catch (e) {}

  // 2) match
  try {
    const q2 = await supabase
      .from(table)
      .select("id")
      .match({ [column]: value })
      .limit(1)
      .single();
    if (q2.data && q2.data.id) return q2.data.id;
  } catch (e) {}

  // 3) ilike (contains)
  try {
    const q3 = await supabase
      .from(table)
      .select("id")
      .ilike(column, `%${value}%`)
      .limit(1)
      .single();
    if (q3.data && q3.data.id) return q3.data.id;
  } catch (e) {}

  return null;
}

async function getOrCreateRevista(nome) {
  if (!(await tableExists("revista"))) return null;
  const nameCol = (await columnExists("revista", "nome_revista"))
    ? "nome_revista"
    : null;
  if (!nameCol) return null;

  // tentativa segura para evitar 406: filter -> match -> ilike
  try {
    const id = await safeFind("revista", nameCol, nome);
    if (id) return id;
  } catch (e) {}

  try {
    const r = await supabase
      .from("revista")
      .insert({ [nameCol]: nome })
      .select("id")
      .single();
    return r.data ? r.data.id : null;
  } catch (e) {
    console.error("Erro ao inserir revista", e);
    return null;
  }
}

async function getOrCreateAuthor(nome) {
  if (!(await tableExists("autor"))) return null;
  const col = (await columnExists("autor", "nome")) ? "nome" : "nome_completo";
  try {
    const id = await safeFind("autor", col, nome);
    if (id) return id;
  } catch (e) {}

  try {
    const ins = { nome: nome, nome_completo: nome };
    const r = await supabase.from("autor").insert(ins).select("id").single();
    return r.data ? r.data.id : null;
  } catch (e) {
    console.error("Erro ao inserir autor", e);
    return null;
  }
}

async function getOrCreateIndexKeyword(keyword) {
  if (!(await tableExists("index_keyword"))) return null;
  const col = (await columnExists("index_keyword", "index_keyword"))
    ? "index_keyword"
    : null;
  if (!col) return null;
  try {
    const id = await safeFind("index_keyword", col, keyword);
    if (id) return id;
  } catch (e) {}

  try {
    const r = await supabase
      .from("index_keyword")
      .insert({ [col]: keyword })
      .select("id")
      .single();
    return r.data ? r.data.id : null;
  } catch (e) {
    console.error("Erro ao inserir index_keyword", e);
    return null;
  }
}

async function getOrCreateAutorKeyword(keyword) {
  if (!(await tableExists("autor_keywords"))) return null;
  const col = (await columnExists("autor_keywords", "autor_keyword"))
    ? "autor_keyword"
    : null;
  if (!col) return null;
  try {
    const id = await safeFind("autor_keywords", col, keyword);
    if (id) return id;
  } catch (e) {}

  try {
    const r = await supabase
      .from("autor_keywords")
      .insert({ [col]: keyword })
      .select("id")
      .single();
    return r.data ? r.data.id : null;
  } catch (e) {
    console.error("Erro ao inserir autor_keyword", e);
    return null;
  }
}

async function tryInsertArtigo(artigoObj) {
  if (!(await tableExists("artigo")))
    return { id: null, error: "Tabela artigo não existe" };
  // truncar strings proativamente para evitar erros de tamanho no banco
  let payload = { ...artigoObj };
  try {
    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === "string" && v.length > TRUNCATE_MAX) {
        console.warn(
          `Campo '${k}' truncado de ${v.length} para ${TRUNCATE_MAX} caracteres.`,
        );
        payload[k] = v.slice(0, TRUNCATE_MAX);
      }
    }
  } catch (e) {
    console.warn("Erro ao truncar strings do payload:", e);
  }

  // sanitizar payload: manter apenas colunas existentes na tabela artigo
  try {
    if (!tableColumnsCache.has("artigo")) {
      const cols = new Set();
      for (const k of Object.keys(payload)) {
        try {
          if (await columnExists("artigo", k)) cols.add(k);
        } catch (e) {
          // ignore
        }
      }
      tableColumnsCache.set("artigo", cols);
    }
    const allowed = tableColumnsCache.get("artigo");
    const sanitized = {};
    for (const [k, v] of Object.entries(payload)) {
      if (allowed.has(k)) sanitized[k] = v;
      else console.debug(`Removendo campo não mapeado de artigo: ${k}`);
    }
    if (Object.keys(sanitized).length === 0)
      return { id: null, error: "Nenhum campo válido para inserir em artigo" };
    payload = sanitized;
  } catch (e) {
    console.warn("Falha ao sanitizar payload artigo:", e);
  }
  try {
    console.debug("Inserindo artigo:", payload);
    const r = await supabase
      .from("artigo")
      .insert(payload)
      .select("id")
      .single();
    if (r.error) {
      console.error("Supabase returned error on insert artigo:", r.error);
      // detectar erro de comprimento de campo (22001) e tentar truncar
      if (r.error.code === "22001") {
        try {
          const lengths = {};
          for (const [k, v] of Object.entries(artigoObj)) {
            if (typeof v === "string") lengths[k] = v.length;
          }
          console.warn("Comprimentos de campos (strings):", lengths);
          // truncar todas as strings para TRUNCATE_MAX caracteres e tentar novamente
          const truncated = {};
          for (const [k, v] of Object.entries(artigoObj)) {
            if (typeof v === "string") truncated[k] = v.slice(0, TRUNCATE_MAX);
            else truncated[k] = v;
          }
          console.warn(
            "Tentando inserir artigo com strings truncadas (20 chars)",
            truncated,
          );
          const r2 = await supabase
            .from("artigo")
            .insert(truncated)
            .select("id")
            .single();
          if (r2.error) {
            console.error("Segundo insert truncado também falhou:", r2.error);
            return { id: null, error: r2.error };
          }
          return { id: r2.data ? r2.data.id : null, truncated: true };
        } catch (ee) {
          console.error("Erro ao tentar truncar/reattempt:", ee);
          return { id: null, error: r.error };
        }
      }
      return { id: null, error: r.error };
    }
    return { id: r.data ? r.data.id : null };
  } catch (e) {
    console.error("Erro insert artigo:", e);
    if (e && e.response) console.error("Response body:", e.response);
    return { id: null, error: e };
  }
}

async function normalizeAndInsert(dados) {
  const resumo = {
    artigos: 0,
    revistas: 0,
    autores: 0,
    keywords: 0,
    junctions: 0,
    errors: [],
  };

  // caches para reduzir queries repetidas durante import
  const cache = {
    revista: new Map(),
    autor: new Map(),
    index_keyword: new Map(),
    autor_keywords: new Map(),
  };

  async function getCachedOrCreateRevista(nome) {
    if (!nome) return null;
    if (cache.revista.has(nome)) return cache.revista.get(nome);
    const id = await getOrCreateRevista(nome);
    cache.revista.set(nome, id);
    return id;
  }

  async function getCachedOrCreateAuthor(nome) {
    if (!nome) return null;
    if (cache.autor.has(nome)) return cache.autor.get(nome);
    const id = await getOrCreateAuthor(nome);
    cache.autor.set(nome, id);
    return id;
  }

  async function getCachedOrCreateIndexKeyword(nome) {
    if (!nome) return null;
    if (cache.index_keyword.has(nome)) return cache.index_keyword.get(nome);
    const id = await getOrCreateIndexKeyword(nome);
    cache.index_keyword.set(nome, id);
    return id;
  }

  async function getCachedOrCreateAutorKeyword(nome) {
    if (!nome) return null;
    if (cache.autor_keywords.has(nome)) return cache.autor_keywords.get(nome);
    const id = await getOrCreateAutorKeyword(nome);
    cache.autor_keywords.set(nome, id);
    return id;
  }

  for (const row of dados) {
    try {
      const title =
        row["Title"] ?? row["Titulo"] ?? row["title"] ?? row["TITLE"] ?? null;
      const year =
        parseInt(row["Year"] ?? row["Ano"] ?? row["year"] ?? "") || null;
      const sourceTitle =
        row["Source title"] ?? row["Source"] ?? row["source"] ?? null;
      const doi = row["DOI"] ?? null;
      const link = row["Link"] ?? row["link"] ?? null;
      const referencias =
        row["References"] ??
        row["Referencias"] ??
        row["References list"] ??
        null;
      const issn = row["ISSN"] ?? null;
      const isbn = row["ISBN"] ?? null;
      const coden = row["CODEN"] ?? null;
      const linguagem =
        row["Language of Original Document"] ??
        row["Linguagem_Original"] ??
        row["Language"] ??
        null;
      const qt_citacao =
        parseInt(
          row["Cited by"] ?? row["cited by"] ?? row["Citations"] ?? "",
        ) || 0;

      // criar/obter revista (usando cache)
      const id_revista = sourceTitle
        ? await getCachedOrCreateRevista(sourceTitle)
        : null;
      if (id_revista) resumo.revistas++;

      // montar objeto artigo com os nomes de colunas corretos do seu schema
      const artigoObj = {
        titulo: title,
        ano: year,
        link: link,
        referencias: referencias,
        tipo_documento:
          row["Document Type"] ?? row["Tipo de Documento"] ?? null,
        issn: issn,
        isbn: isbn,
        coden: coden,
        linguagem_original: linguagem,
        qt_citacao: qt_citacao,
        id_revista: id_revista,
      };

      const artigoRes = await tryInsertArtigo(artigoObj);
      if (artigoRes.error) {
        resumo.errors.push({ row: title, error: artigoRes.error });
        continue;
      }
      const id_artigo = artigoRes.id;
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
        for (const [i, name] of names.entries()) {
          const id_autor = await getCachedOrCreateAuthor(name);
          if (id_autor) {
            resumo.autores++;
            if (!firstAuthorId) firstAuthorId = id_autor;
          }
          // inserir junction artigo_autor
          if ((await tableExists("artigo_autor")) && id_autor && id_artigo) {
            try {
              const resAA = await sanitizeAndInsert("artigo_autor", {
                id_artigo: id_artigo,
                id_autor: id_autor,
              });
              if (resAA && resAA.error) {
                console.warn("erro artigo_autor", resAA.error);
                console.warn("payload", { id_artigo, id_autor });
              } else {
                resumo.junctions++;
              }
            } catch (e) {
              console.warn("erro artigo_autor", e);
              console.warn("payload", { id_artigo, id_autor });
            }
          }
        }
      }

      // define id_autor (representante) no artigo como o primeiro autor, se houver
      if (firstAuthorId && id_artigo) {
        try {
          await supabase
            .from("artigo")
            .update({ id_autor: firstAuthorId })
            .eq("id", id_artigo);
        } catch (e) {
          console.warn("erro atualizando id_autor no artigo", e);
        }
      }

      // index keywords
      // Index keywords e Author keywords: para o schema atual, salvamos o primeiro de cada
      const indexField =
        row["Index Keywords"] ??
        row["Index Keywords"] ??
        row["Author Keywords"] ??
        null;
      if (indexField) {
        const kws = indexField
          .split(/;|,/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (kws.length && id_artigo) {
          const id_kw = await getCachedOrCreateIndexKeyword(kws[0]);
          if (id_kw) {
            resumo.keywords++;
            try {
              await supabase
                .from("artigo")
                .update({ id_index_keyword: id_kw })
                .eq("id", id_artigo);
            } catch (e) {
              console.warn("erro atualizando id_index_keyword no artigo", e);
            }
          }
        }
      }

      const authorKeywordsField =
        row["Author Keywords"] ?? row["Author Keywords"] ?? null;
      if (authorKeywordsField && id_artigo) {
        const aks = authorKeywordsField
          .split(/;|,/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (aks.length) {
          const id_ak = await getCachedOrCreateAutorKeyword(aks[0]);
          if (id_ak) {
            resumo.keywords++;
            try {
              await supabase
                .from("artigo")
                .update({ id_autor_keyword: id_ak })
                .eq("id", id_artigo);
            } catch (e) {
              console.warn("erro atualizando id_autor_keyword no artigo", e);
            }
          }
        }
      }

      // criar entrada em artigo_revista se a tabela existir
      if (id_revista && (await tableExists("artigo_revista")) && id_artigo) {
        try {
          const resAR = await sanitizeAndInsert("artigo_revista", {
            id_artigo: id_artigo,
            id_revista: id_revista,
          });
          if (resAR && resAR.error) {
            console.warn("erro artigo_revista", resAR.error);
            console.warn("payload", { id_artigo, id_revista });
          } else {
            resumo.junctions++;
          }
        } catch (e) {
          console.warn("erro artigo_revista", e);
        }
      }
    } catch (e) {
      resumo.errors.push({ error: e });
    }
  }

  // mostrar resumo para o usuário
  let msg = `Importação finalizada. Artigos: ${resumo.artigos}, Revistas criadas: ${resumo.revistas}, Autores: ${resumo.autores}, Keywords: ${resumo.keywords}, Ligações: ${resumo.junctions}`;
  if (resumo.errors.length)
    msg += `\nErros: ${JSON.stringify(resumo.errors.slice(0, 5))}`;
  alert(msg);
  listarArtigos();
}

// ============================================
// EVENTOS
// ============================================

document.getElementById("btnArtigos").addEventListener("click", listarArtigos);

document.getElementById("btnAutores").addEventListener("click", listarAutores);

document
  .getElementById("btnKeywords")
  .addEventListener("click", listarKeywords);

document
  .getElementById("btnReferencias")
  .addEventListener("click", listarReferencias);

document.getElementById("btnLimpar").addEventListener("click", limparTabela);

document.getElementById("btnUpload").addEventListener("click", () => {
  document.getElementById("fileInput").click();
});
