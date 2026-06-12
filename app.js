import { createClient } from "@supabase/supabase-js";

// ============================================
// CONEXÃO SUPABASE VIA .ENV
// ============================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

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
  const { data, error } = await supabase.from("authors").select("*");

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

  const requiredHeaders = [
    "Authors",
    "Author full names",
    "Author(s) ID",
    "Title",
    "Year",
    "Source title",
    "Cited by",
    "DOI",
    "Link",
    "Abstract",
    "Author Keywords",
    "Index Keywords",
    "References",
    "ISSN",
    "ISBN",
    "CODEN",
    "Language of Original Document",
    "Document Type",
    "Open Access",
    "Source",
  ];

  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    alert(
      `Cabeçalhos obrigatórios ausentes no CSV:\n${missingHeaders.join("\n")}`,
    );
    return;
  }

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
  // tenta normalizar e inserir nos relacionamentos do modelo lógico
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

async function getOrCreateRevista(nome) {
  if (!(await tableExists("revista"))) return null;

  const candidates = ["nome_revista", "name", "source_title", "source"];
  let col = candidates.find((c) => columnExists("revista", c));
  if (!col) return null;

  try {
    const q = await supabase
      .from("revista")
      .select("id")
      .eq(col, nome)
      .limit(1)
      .single();
    if (q.data && q.data.id) return q.data.id;
  } catch (e) {}

  try {
    const ins = {};
    ins[col] = nome;
    const r = await supabase.from("revista").insert(ins).select("id").single();
    return r.data ? r.data.id : null;
  } catch (e) {
    console.error("Erro ao inserir revista", e);
    return null;
  }
}

async function getOrCreateAuthor(nome) {
  if (!(await tableExists("authors"))) return null;
  const candidates = ["nome_completo", "author_full_name", "name", "nome"];
  let col = candidates.find((c) => columnExists("authors", c));
  if (!col) return null;

  try {
    const q = await supabase
      .from("authors")
      .select("id")
      .eq(col, nome)
      .limit(1)
      .single();
    if (q.data && q.data.id) return q.data.id;
  } catch (e) {}

  try {
    const ins = {};
    ins[col] = nome;
    const r = await supabase.from("authors").insert(ins).select("id").single();
    return r.data ? r.data.id : null;
  } catch (e) {
    console.error("Erro ao inserir author", e);
    return null;
  }
}

async function getOrCreateIndexKeyword(keyword) {
  if (!(await tableExists("index_keyword"))) return null;
  const candidates = ["index_keyword", "keyword", "name"];
  let col = candidates.find((c) => columnExists("index_keyword", c));
  if (!col) return null;

  try {
    const q = await supabase
      .from("index_keyword")
      .select("id")
      .eq(col, keyword)
      .limit(1)
      .single();
    if (q.data && q.data.id) return q.data.id;
  } catch (e) {}

  try {
    const ins = {};
    ins[col] = keyword;
    const r = await supabase
      .from("index_keyword")
      .insert(ins)
      .select("id")
      .single();
    return r.data ? r.data.id : null;
  } catch (e) {
    console.error("Erro ao inserir index_keyword", e);
    return null;
  }
}

async function tryInsertArtigo(artigoObj) {
  if (!(await tableExists("artigo")))
    return { id: null, error: "Tabela artigo não existe" };
  try {
    const r = await supabase
      .from("artigo")
      .insert(artigoObj)
      .select("id")
      .single();
    return { id: r.data ? r.data.id : null };
  } catch (e) {
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

  for (const row of dados) {
    try {
      const title = row["Title"] ?? row["Titulo"] ?? row["title"] ?? null;
      const year = row["Year"] ?? row["Ano"] ?? null;
      const sourceTitle =
        row["Source title"] ?? row["Source"] ?? row["source"] ?? null;
      const doi = row["DOI"] ?? null;
      const link = row["Link"] ?? row["link"] ?? null;
      const referencias = row["References"] ?? row["Referencias"] ?? null;
      const issn = row["ISSN"] ?? null;
      const isbn = row["ISBN"] ?? null;
      const coden = row["CODEN"] ?? null;
      const linguagem =
        row["Language of Original Document"] ??
        row["Linguagem_Original"] ??
        null;
      const qt_citacao = row["Cited by"] ?? row["cited by"] ?? null;
      const abstract = row["Abstract"] ?? null;

      // criar/obter revista
      const id_revista = sourceTitle
        ? await getOrCreateRevista(sourceTitle)
        : null;
      if (id_revista) resumo.revistas++;

      // montar objeto artigo (usa nomes de colunas que provavelmente existem)
      const artigoObj = {
        Titulo: title,
        Ano: year,
        DOI: doi,
        Link: link,
        Referencias: referencias,
        ISSN: issn,
        ISBN: isbn,
        CODEN: coden,
        Linguagem_Original: linguagem,
        qt_citacao: qt_citacao,
        Abstract: abstract,
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
        row["Author full names"] ??
        row["Authors"] ??
        row["Author(s) ID"] ??
        null;
      if (authorsField) {
        const names = authorsField
          .split(/;|,/)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const name of names) {
          const id_autor = await getOrCreateAuthor(name);
          if (id_autor) resumo.autores++;
          // inserir junction artigo_autor se tabela existir
          if (await tableExists("artigo_autor")) {
            try {
              await supabase
                .from("artigo_autor")
                .insert({ id_artigo: id_artigo, id_autor: id_autor });
              resumo.junctions++;
            } catch (e) {
              console.warn("erro artigo_autor", e);
            }
          }
        }
      }

      // index keywords
      const indexField =
        row["Index Keywords"] ??
        row["Author Keywords"] ??
        row["Author Keywords"] ??
        null;
      if (indexField) {
        const kws = indexField
          .split(/;|,/)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const kw of kws) {
          const id_kw = await getOrCreateIndexKeyword(kw);
          if (id_kw) resumo.keywords++;
          if (await tableExists("artigo_index_keyword")) {
            try {
              await supabase
                .from("artigo_index_keyword")
                .insert({ id_artigo: id_artigo, id_index_keyword: id_kw });
              resumo.junctions++;
            } catch (e) {
              console.warn("erro artigo_index_keyword", e);
            }
          }
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
