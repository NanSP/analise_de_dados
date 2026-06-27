import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
);
const thead = document.getElementById("thead"),
  tbody = document.getElementById("tbody"),
  info = document.getElementById("info"),
  btnVoltar = document.getElementById("btnVoltar"),
  buttonsDiv = document.querySelector(".buttons"),
  headerInner = document.querySelector(".header-inner");
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
  headers.forEach((h) => {
    trHead += `<th>${h}</th>`;
  });
  trHead += "</tr>";
  thead.innerHTML = trHead;
  dados.forEach((item) => {
    let tr = "<tr>";
    headers.forEach((h) => {
      tr += `<td>${item[h] ?? ""}</td>`;
    });
    tr += "</tr>";
    tbody.innerHTML += tr;
  });
}
function showContentView() {
  if (buttonsDiv) buttonsDiv.style.display = "none";
  if (btnVoltar && headerInner) {
    headerInner.appendChild(btnVoltar);
    btnVoltar.style.display = "inline-block";
  } else if (btnVoltar) btnVoltar.style.display = "inline-block";
}
function showMenuView() {
  if (buttonsDiv) {
    if (btnVoltar) buttonsDiv.insertBefore(btnVoltar, buttonsDiv.firstChild);
    buttonsDiv.style.display = "flex";
  }
  if (btnVoltar && headerInner && headerInner.contains(btnVoltar) && buttonsDiv)
    btnVoltar.style.display = "none";
  else if (btnVoltar) btnVoltar.style.display = "none";
  limparTabela();
}
async function listarArtigos() {
  try {
    info.innerText = "Buscando artigos...";
    const { data, error } = await supabase.from("artigo").select("*");
    if (error) {
      console.error("Erro:", error);
      alert("Erro: " + (error.message || error));
      info.innerText = "Erro";
      return;
    }
    criarTabela(data);
    if (Array.isArray(data) && data.length > 0) showContentView();
    else info.innerText = "Nenhum artigo encontrado";
  } catch (e) {
    console.error(e);
    alert("Erro inesperado");
    info.innerText = "Erro";
  }
}
async function listarAutores() {
  const { data, error } = await supabase.from("autor").select("*");
  if (error) {
    alert(error.message);
    return;
  }
  criarTabela(data);
  showContentView();
}
async function listarKeywords() {
  const { data, error } = await supabase.from("index_keyword").select("*");
  if (error) {
    alert(error.message);
    return;
  }
  criarTabela(data);
  showContentView();
}
async function listarReferencias() {
  const { data, error } = await supabase.from("revista").select("*");
  if (error) {
    alert(error.message);
    return;
  }
  criarTabela(data);
  showContentView();
}
function limparTabela() {
  thead.innerHTML = "";
  tbody.innerHTML = "";
  info.innerHTML = "";
}
document.getElementById("fileInput").addEventListener("change", importarCSV);
async function importarCSV(event) {
  const arquivo = event.target.files[0];
  if (!arquivo) return;
  const texto = await arquivo.text(),
    linhas = texto.split(/\r?\n/);
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
  const parseCSVLine = (line) => {
    const vals = [],
      ch = [];
    let cur = "",
      inQuotes = !1;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (c === "," && !inQuotes) {
        vals.push(cur);
        cur = "";
      } else cur += c;
    }
    vals.push(cur);
    return vals;
  };
  const parsedHeader = parseCSVLine(linhas[headerLineIndex]),
    headers = parsedHeader.map((h) =>
      typeof h === "string" ? h.trim().replace(/^"|"$/g, "") : h,
    ),
    dados = [];
  for (let i = headerLineIndex + 1; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;
    const valores = parseCSVLine(linha),
      obj = {};
    headers.forEach((col, idx) => {
      const v = valores[idx] ?? null;
      obj[col] = typeof v === "string" ? v.trim().replace(/^"|"$/g, "") : v;
    });
    dados.push(obj);
  }
  if (dados.length === 0) {
    alert("Nenhum registro para importar.");
    return;
  }
  await normalizeAndInsert(dados);
}
async function tableExists(table) {
  const { error } = await supabase.from(table).select("id").limit(1);
  return !error;
}
async function columnExists(table, column) {
  const { error } = await supabase.from(table).select(`${column}`).limit(1);
  return !error;
}
const tableColumnsCache = new Map();
async function sanitizeAndInsert(table, payload) {
  if (!(await tableExists(table)))
    return { error: `Tabela ${table} não existe` };
  try {
    if (!tableColumnsCache.has(table)) {
      const cols = new Set();
      for (const k of Object.keys(payload)) {
        try {
          if (await columnExists(table, k)) cols.add(k);
        } catch (e) {}
      }
      tableColumnsCache.set(table, cols);
    }
    const allowed = tableColumnsCache.get(table),
      sanitized = {};
    for (const [k, v] of Object.entries(payload)) {
      if (allowed.has(k)) sanitized[k] = v;
      else console.debug(`Campo não mapeado: ${k}`);
    }
    if (Object.keys(sanitized).length === 0)
      return { error: "Nenhum campo válido" };
    const r = await supabase.from(table).insert(sanitized);
    if (r.error) {
      console.error(`Erro ${table}:`, r.error, payload);
      return { error: r.error };
    }
    return { data: r.data };
  } catch (e) {
    console.error(`Erro ${table}:`, e);
    return { error: e };
  }
}
async function safeFind(table, column, value) {
  if (!value) return null;
  try {
    const r = await supabase.rpc("find_id_by_value", {
      p_table: table,
      p_column: column,
      p_value: value,
    });
    if (r.data) return r.data;
  } catch (e) {}
  try {
    const q1 = await supabase
      .from(table)
      .select("id")
      .filter(column, "eq", value)
      .limit(1)
      .single();
    if (q1.data?.id) return q1.data.id;
  } catch (e) {}
  try {
    const q2 = await supabase
      .from(table)
      .select("id")
      .match({ [column]: value })
      .limit(1)
      .single();
    if (q2.data?.id) return q2.data.id;
  } catch (e) {}
  try {
    const q3 = await supabase
      .from(table)
      .select("id")
      .ilike(column, `%${value}%`)
      .limit(1)
      .single();
    if (q3.data?.id) return q3.data.id;
  } catch (e) {}
  return null;
}
async function getOrCreateRevista(nome) {
  if (!(await tableExists("revista"))) return null;
  const nameCol = (await columnExists("revista", "nome_revista"))
    ? "nome_revista"
    : null;
  if (!nameCol) return null;
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
    return r.data?.id ?? null;
  } catch (e) {
    console.error("Erro revista:", e);
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
    const r = await supabase
      .from("autor")
      .insert({ nome, nome_completo: nome })
      .select("id")
      .single();
    return r.data?.id ?? null;
  } catch (e) {
    console.error("Erro autor:", e);
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
    return r.data?.id ?? null;
  } catch (e) {
    console.error("Erro keyword:", e);
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
    return r.data?.id ?? null;
  } catch (e) {
    console.error("Erro autor_keyword:", e);
    return null;
  }
}
async function tryInsertArtigo(artigoObj) {
  if (!(await tableExists("artigo")))
    return { id: null, error: "Tabela artigo não existe" };
  try {
    if (!tableColumnsCache.has("artigo")) {
      const cols = new Set();
      for (const k of Object.keys(artigoObj)) {
        try {
          if (await columnExists("artigo", k)) cols.add(k);
        } catch (e) {}
      }
      tableColumnsCache.set("artigo", cols);
    }
    const allowed = tableColumnsCache.get("artigo"),
      sanitized = {};
    for (const [k, v] of Object.entries(artigoObj)) {
      if (allowed.has(k)) sanitized[k] = v;
      else console.debug(`Campo não mapeado: ${k}`);
    }
    if (Object.keys(sanitized).length === 0)
      return { id: null, error: "Nenhum campo válido" };
    artigoObj = sanitized;
  } catch (e) {
    console.warn("Falha sanitizar:", e);
  }
  try {
    console.debug("Inserindo:", artigoObj);
    const r = await supabase
      .from("artigo")
      .insert(artigoObj)
      .select("id")
      .single();
    if (r.error) {
      console.error("Erro insert:", r.error);
      return { id: null, error: r.error };
    }
    return { id: r.data?.id ?? null };
  } catch (e) {
    console.error("Erro:", e);
    if (e?.response) console.error("Response:", e.response);
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
    },
    cache = {
      revista: new Map(),
      autor: new Map(),
      index_keyword: new Map(),
      autor_keywords: new Map(),
    },
    getCachedOrCreate = (cache, nome, fn) =>
      (async () => {
        if (!nome) return null;
        if (cache.has(nome)) return cache.get(nome);
        const id = await fn(nome);
        cache.set(nome, id);
        return id;
      })();
  for (const row of dados) {
    try {
      const title =
          row["Title"] ?? row["Titulo"] ?? row["title"] ?? row["TITLE"] ?? null,
        year = parseInt(row["Year"] ?? row["Ano"] ?? row["year"] ?? "") || null,
        sourceTitle =
          row["Source title"] ?? row["Source"] ?? row["source"] ?? null,
        doi = row["DOI"] ?? null,
        link = row["Link"] ?? row["link"] ?? null,
        referencias =
          row["References"] ??
          row["Referencias"] ??
          row["References list"] ??
          null,
        issn = row["ISSN"] ?? null,
        isbn = row["ISBN"] ?? null,
        coden = row["CODEN"] ?? null,
        linguagem =
          row["Language of Original Document"] ??
          row["Linguagem_Original"] ??
          row["Language"] ??
          null,
        qt_citacao =
          parseInt(
            row["Cited by"] ?? row["cited by"] ?? row["Citations"] ?? "",
          ) || 0;
      const id_revista = sourceTitle
        ? await getOrCreateRevista(sourceTitle)
        : null;
      if (id_revista) resumo.revistas++;
      const artigoObj = {
        titulo: title,
        ano: year,
        link,
        referencias,
        tipo_documento:
          row["Document Type"] ?? row["Tipo de Documento"] ?? null,
        issn,
        isbn,
        coden,
        linguagem_original: linguagem,
        qt_citacao,
        id_revista,
      };
      const artigoRes = await tryInsertArtigo(artigoObj);
      if (artigoRes.error) {
        resumo.errors.push({ row: title, error: artigoRes.error });
        continue;
      }
      const id_artigo = artigoRes.id;
      resumo.artigos++;
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
          if ((await tableExists("artigo_autor")) && id_autor && id_artigo) {
            try {
              const resAA = await sanitizeAndInsert("artigo_autor", {
                id_artigo,
                id_autor,
              });
              if (!resAA?.error) resumo.junctions++;
              else console.warn("erro artigo_autor:", resAA.error);
            } catch (e) {
              console.warn("erro artigo_autor:", e);
            }
          }
        }
      }
      if (firstAuthorId && id_artigo) {
        try {
          await supabase
            .from("artigo")
            .update({ id_autor: firstAuthorId })
            .eq("id", id_artigo);
        } catch (e) {
          console.warn("erro id_autor:", e);
        }
      }
      const indexField =
        row["Index Keywords"] ?? row["Author Keywords"] ?? null;
      if (indexField) {
        const kws = indexField
          .split(/;|,/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (kws.length && id_artigo) {
          const id_kw = await getOrCreateIndexKeyword(kws[0]);
          if (id_kw) {
            resumo.keywords++;
            try {
              await supabase
                .from("artigo")
                .update({ id_index_keyword: id_kw })
                .eq("id", id_artigo);
            } catch (e) {
              console.warn("erro id_index_keyword:", e);
            }
          }
        }
      }
      const authorKeywordsField = row["Author Keywords"] ?? null;
      if (authorKeywordsField && id_artigo) {
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
              console.warn("erro id_autor_keyword:", e);
            }
          }
        }
      }
      if (id_revista && (await tableExists("artigo_revista")) && id_artigo) {
        try {
          const resAR = await sanitizeAndInsert("artigo_revista", {
            id_artigo,
            id_revista,
          });
          if (!resAR?.error) resumo.junctions++;
          else console.warn("erro artigo_revista:", resAR.error);
        } catch (e) {
          console.warn("erro artigo_revista:", e);
        }
      }
    } catch (e) {
      resumo.errors.push({ error: e });
    }
  }
  let msg = `Importação finalizada. Artigos: ${resumo.artigos}, Revistas: ${resumo.revistas}, Autores: ${resumo.autores}, Keywords: ${resumo.keywords}, Ligações: ${resumo.junctions}`;
  if (resumo.errors.length)
    msg += `\nErros: ${JSON.stringify(resumo.errors.slice(0, 5))}`;
  alert(msg);
  listarArtigos();
}
function setButtonsEnabled(enabled) {
  [
    "btnArtigos",
    "btnAutores",
    "btnKeywords",
    "btnReferencias",
    "btnLimpar",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
}
async function checkSupabaseConnection() {
  try {
    const r = await supabase.from("artigo").select("id").limit(1);
    if (r?.error) throw r.error;
    info.innerText = "Conexão OK";
    setButtonsEnabled(!0);
  } catch (e) {
    console.warn("Falha conexão:", e);
    info.innerText = "Erro de conexão — botões desativados";
    setButtonsEnabled(!1);
  }
}
document.getElementById("btnArtigos").addEventListener("click", listarArtigos);
document.getElementById("btnAutores").addEventListener("click", listarAutores);
document
  .getElementById("btnKeywords")
  .addEventListener("click", listarKeywords);
document
  .getElementById("btnReferencias")
  .addEventListener("click", listarReferencias);
async function listarIssnIsbn() {
  if (!(await tableExists("artigo"))) {
    alert("Tabela 'artigo' não existe.");
    return;
  }
  try {
    const cols = [];
    if (await columnExists("artigo", "issn")) cols.push("issn");
    if (await columnExists("artigo", "isbn")) cols.push("isbn");
    if (cols.length === 0) {
      alert("Nem 'issn' nem 'isbn' existem.");
      return;
    }
    const { data, error } = await supabase
      .from("artigo")
      .select(cols.join(","))
      .limit(1000);
    if (error) {
      alert(error.message);
      return;
    }
    const out = data.map((r) => {
      const i = r.issn || "",
        b = r.isbn || "";
      return { issn_isbn: [i, b].filter(Boolean).join(" / ") };
    });
    criarTabela(out);
    showContentView();
  } catch (e) {
    console.error("Erro:", e);
    alert("Erro ao gerar lista ISSN/ISBN");
  }
}
document
  .getElementById("btnIssnIsbn")
  .addEventListener("click", listarIssnIsbn);
if (btnVoltar) btnVoltar.addEventListener("click", showMenuView);
document.getElementById("btnLimpar").addEventListener("click", limparTabela);
document.getElementById("btnUpload").addEventListener("click", () => {
  document.getElementById("fileInput").click();
});
async function preencherDoiVazios() {
  const opts = arguments[0] || {};
  if (!(await tableExists("artigo"))) {
    alert("Tabela 'artigo' não existe.");
    return;
  }
  if (!(await columnExists("artigo", "doi"))) {
    alert("Coluna 'doi' não existe.");
    return;
  }
  if (!opts.skipConfirm) {
    alert("Use o botão de confirmação na interface.");
    return;
  }
  try {
    const lote = 500;
    let offset = 0,
      totalUpdated = 0;
    while (!0) {
      const { data, error } = await supabase
        .from("artigo")
        .select("id")
        .is("doi", null)
        .range(offset, offset + lote - 1);
      if (error) {
        alert(`Erro: ${error.message}`);
        return;
      }
      if (!data || data.length === 0) break;
      for (const row of data) {
        try {
          const u = await supabase
            .from("artigo")
            .update({ doi: "sem dados" })
            .eq("id", row.id);
          if (!u.error) totalUpdated++;
          else console.warn("Erro:", row.id, u.error);
        } catch (e) {
          console.warn("Erro:", row.id, e);
        }
      }
      if (data.length < lote) break;
      offset += lote;
    }
    alert(`Atualização finalizada. Registros atualizados: ${totalUpdated}`);
    listarArtigos();
  } catch (e) {
    console.error("Erro:", e);
    alert("Erro ao preencher DOIs");
  }
}
async function showCountDoi() {
  if (!(await tableExists("artigo"))) {
    alert("Tabela 'artigo' não existe.");
    return;
  }
  if (!(await columnExists("artigo", "doi"))) {
    alert("Coluna 'doi' não existe.");
    return;
  }
  try {
    const res = await supabase
        .from("artigo")
        .select("id", { count: "exact", head: !1 })
        .is("doi", null)
        .limit(1),
      count = res.count ?? (Array.isArray(res.data) ? res.data.length : 0);
    info.innerText = `Registros com doi NULL: ${count}`;
    const existing = document.getElementById("btnConfirmFillDoi");
    if (existing) existing.remove();
    if (count > 0) {
      const btn = document.createElement("button");
      btn.id = "btnConfirmFillDoi";
      btn.className = "danger";
      btn.textContent = "Confirmar preencher DOI vazios";
      btn.addEventListener("click", async () => {
        btn.disabled = !0;
        await preencherDoiVazios({ skipConfirm: !0 });
        btn.remove();
      });
      (document.querySelector(".buttons") || document.body).appendChild(btn);
    }
  } catch (e) {
    console.error("Erro:", e);
    alert("Erro ao verificar DOIs");
  }
}
document.getElementById("btnFillDoi").addEventListener("click", showCountDoi);
checkSupabaseConnection();

async function listarAutores() {
  const { data, error } = await supabase.from("autor").select("*");

  if (error) {
    alert(error.message);
    return;
  }

  criarTabela(data);
  showContentView();
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
  showContentView();
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
  showContentView();
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
      .filter(column, "eq", value)
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
  // sanitizar payload: manter apenas colunas existentes na tabela artigo
  try {
    if (!tableColumnsCache.has("artigo")) {
      const cols = new Set();
      for (const k of Object.keys(artigoObj)) {
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
    for (const [k, v] of Object.entries(artigoObj)) {
      if (allowed.has(k)) sanitized[k] = v;
      else console.debug(`Removendo campo não mapeado de artigo: ${k}`);
    }
    if (Object.keys(sanitized).length === 0)
      return { id: null, error: "Nenhum campo válido para inserir em artigo" };
    artigoObj = sanitized;
  } catch (e) {
    console.warn("Falha ao sanitizar payload artigo:", e);
  }
  try {
    console.debug("Inserindo artigo:", artigoObj);
    const r = await supabase
      .from("artigo")
      .insert(artigoObj)
      .select("id")
      .single();
    if (r.error) {
      console.error("Supabase returned error on insert artigo:", r.error);
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

function setButtonsEnabled(enabled) {
  const ids = [
    "btnArtigos",
    "btnAutores",
    "btnKeywords",
    "btnReferencias",
    "btnLimpar",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
}

async function checkSupabaseConnection() {
  try {
    // tentativa simples para verificar disponibilidade e auth
    const r = await supabase.from("artigo").select("id").limit(1);
    if (r && r.error) throw r.error;
    info.innerText = "Conexão com Supabase OK";
    setButtonsEnabled(true);
  } catch (e) {
    console.warn("Falha conexão Supabase:", e);
    info.innerText =
      "Erro de conexão com Supabase — os botões de consulta foram desativados.";
    setButtonsEnabled(false);
  }
}

document.getElementById("btnArtigos").addEventListener("click", listarArtigos);

document.getElementById("btnAutores").addEventListener("click", listarAutores);

document
  .getElementById("btnKeywords")
  .addEventListener("click", listarKeywords);

document
  .getElementById("btnReferencias")
  .addEventListener("click", listarReferencias);

// listar issn + isbn unidos
async function listarIssnIsbn() {
  // verificar se a tabela artigo existe
  if (!(await tableExists("artigo"))) {
    alert("Tabela 'artigo' não existe.");
    return;
  }

  // selecionar apenas issn e isbn (se existirem) e montar uma coluna combinada
  try {
    // usar select raw para concatenar se o servidor permitir
    const cols = [];
    if (await columnExists("artigo", "issn")) cols.push("issn");
    if (await columnExists("artigo", "isbn")) cols.push("isbn");

    if (cols.length === 0) {
      alert("Nem 'issn' nem 'isbn' existem na tabela 'artigo'.");
      return;
    }

    const selectCols = cols.join(",");
    const { data, error } = await supabase
      .from("artigo")
      .select(selectCols)
      .limit(1000);

    if (error) {
      alert(error.message);
      return;
    }

    // transformar cada linha em { identificador: 'ISSN / ISBN' }
    const out = data.map((r) => {
      const i = r.issn || "";
      const b = r.isbn || "";
      const combined = [i, b].filter(Boolean).join(" / ");
      return { issn_isbn: combined };
    });

    criarTabela(out);
    showContentView();
  } catch (e) {
    console.error("Erro listarIssnIsbn:", e);
    alert("Erro ao gerar lista ISSN/ISBN");
  }
}

document
  .getElementById("btnIssnIsbn")
  .addEventListener("click", listarIssnIsbn);

if (btnVoltar) btnVoltar.addEventListener("click", showMenuView);

document.getElementById("btnLimpar").addEventListener("click", limparTabela);

document.getElementById("btnUpload").addEventListener("click", () => {
  document.getElementById("fileInput").click();
});

// ============================================
// PREENCHER DOIs NULOS
// ============================================
async function preencherDoiVazios() {
  // a função agora aceita um objeto de opções para permitir execução via confirmação
  const opts = arguments[0] || {};
  const requireConfirm = !opts.skipConfirm;

  if (!(await tableExists("artigo"))) {
    alert("Tabela 'artigo' não existe.");
    return;
  }

  if (!(await columnExists("artigo", "doi"))) {
    alert(
      "Coluna 'doi' não existe na tabela 'artigo'. Execute sql/add_column_doi.sql primeiro.",
    );
    return;
  }

  if (requireConfirm) {
    // não executar sem confirmação explícita (a UI deve chamar com skipConfirm)
    alert(
      "A ação de preenchimento não é executada diretamente. Use o botão de confirmação gerado na interface.",
    );
    return;
  }

  try {
    const lote = 500;
    let offset = 0;
    let totalUpdated = 0;

    while (true) {
      const start = offset;
      const end = offset + lote - 1;
      const { data, error } = await supabase
        .from("artigo")
        .select("id")
        .is("doi", null)
        .range(start, end);

      if (error) {
        alert(`Erro ao buscar artigos com doi nulo: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) break;

      for (const row of data) {
        try {
          const u = await supabase
            .from("artigo")
            .update({ doi: "sem dados" })
            .eq("id", row.id);
          if (u.error) console.warn("Erro atualizando id", row.id, u.error);
          else totalUpdated++;
        } catch (e) {
          console.warn("Erro atualizando doi para id", row.id, e);
        }
      }

      if (data.length < lote) break;
      offset += lote;
    }

    alert(`Atualização finalizada. Registros atualizados: ${totalUpdated}`);
    listarArtigos();
  } catch (e) {
    console.error("Erro em preencherDoiVazios:", e);
    alert("Erro ao preencher DOIs vazios. Veja console para detalhes.");
  }
}

// não executa atualização diretamente: apenas mostra contagem e cria botão de confirmação
async function showCountDoi() {
  if (!(await tableExists("artigo"))) {
    alert("Tabela 'artigo' não existe.");
    return;
  }

  if (!(await columnExists("artigo", "doi"))) {
    alert(
      "Coluna 'doi' não existe na tabela 'artigo'. Execute sql/add_column_doi.sql primeiro.",
    );
    return;
  }

  try {
    const res = await supabase
      .from("artigo")
      .select("id", { count: "exact", head: false })
      .is("doi", null)
      .limit(1);

    if (res.error) {
      alert(`Erro ao contar artigos com doi nulo: ${res.error.message}`);
      return;
    }

    const count = res.count ?? (Array.isArray(res.data) ? res.data.length : 0);
    info.innerText = `Registros com doi NULL: ${count}`;

    // remover botão de confirmação existente, se houver
    const existing = document.getElementById("btnConfirmFillDoi");
    if (existing) existing.remove();

    if (count > 0) {
      const btn = document.createElement("button");
      btn.id = "btnConfirmFillDoi";
      btn.className = "danger";
      btn.textContent = "Confirmar preencher DOI vazios";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await preencherDoiVazios({ skipConfirm: true });
        btn.remove();
      });
      const container = document.querySelector(".buttons") || document.body;
      container.appendChild(btn);
    }
  } catch (e) {
    console.error("Erro ao contar DOIs nulos:", e);
    alert("Erro ao verificar DOIs nulos. Veja console para detalhes.");
  }
}

document.getElementById("btnFillDoi").addEventListener("click", showCountDoi);

// verificar conexão ao carregar
checkSupabaseConnection();
