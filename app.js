import { createClient } from '@supabase/supabase-js'

// ============================================
// CONEXÃO SUPABASE VIA .ENV
// ============================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

const supabase = createClient(
  supabaseUrl,
  supabaseKey
)

// ============================================
// ELEMENTOS
// ============================================

const thead = document.getElementById("thead")
const tbody = document.getElementById("tbody")
const info = document.getElementById("info")

// ============================================
// CRIAR TABELA
// ============================================

function criarTabela(dados){

  thead.innerHTML = ""
  tbody.innerHTML = ""

  if(!dados || dados.length === 0){
    info.innerHTML = "Nenhum dado encontrado."
    return
  }

  info.innerHTML = `${dados.length} registro(s) encontrado(s).`

  const headers = Object.keys(dados[0])

  let trHead = "<tr>"

  headers.forEach(header => {
    trHead += `<th>${header}</th>`
  })

  trHead += "</tr>"

  thead.innerHTML = trHead

  dados.forEach(item => {

    let tr = "<tr>"

    headers.forEach(header => {
      tr += `<td>${item[header] ?? ""}</td>`
    })

    tr += "</tr>"

    tbody.innerHTML += tr
  })
}

// ============================================
// ARTIGOS
// ============================================

async function listarArtigos(){

  const { data, error } = await supabase
    .from("artigo")
    .select("*")

  if(error){
    alert(error.message)
    return
  }

  criarTabela(data)
}

// ============================================
// AUTORES
// ============================================

async function listarAutores(){

  const { data, error } = await supabase
    .from("authors")
    .select("*")

  if(error){
    alert(error.message)
    return
  }

  criarTabela(data)
}

// ============================================
// PALAVRAS-CHAVE
// ============================================

async function listarKeywords(){

  const { data, error } = await supabase
    .from("index_keyword")
    .select("*")

  if(error){
    alert(error.message)
    return
  }

  criarTabela(data)
}

// ============================================
// REFERÊNCIAS
// ============================================

async function listarReferencias(){

  const { data, error } = await supabase
    .from("revista")
    .select("*")

  if(error){
    alert(error.message)
    return
  }

  criarTabela(data)
}

// ============================================
// LIMPAR
// ============================================

function limparTabela(){

  thead.innerHTML = ""
  tbody.innerHTML = ""
  info.innerHTML = ""

}

// ============================================
// IMPORTAR CSV
// ============================================

document
  .getElementById("fileInput")
  .addEventListener("change", importarCSV)

async function importarCSV(event){

  const arquivo = event.target.files[0]
  if(!arquivo) return

  const texto = await arquivo.text()
  const linhas = texto.split(/\r?\n/)

  // cabeçalhos fixos (como você enviou)
  const headers = [
    "Authors",
    "Author full names",
    "Author(s) ID",
    "Title",
    "Year",
    "Source title",
    "Volume",
    "Issue",
    "Art. No.",
    "Page start",
    "Page end",
    "Cited by",
    "DOI",
    "Link",
    "Document Type",
    "Publication Stage",
    "Open Access",
    "Source",
    "EID"
  ]

  // parser simples que respeita aspas e "" como escape
  function parseCSVLine(line){
    const vals = []
    let cur = ""
    let inQuotes = false
    for(let i = 0; i < line.length; i++){
      const ch = line[i]
      if(ch === '"'){
        if(inQuotes && line[i+1] === '"'){ // escaped quote
          cur += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if(ch === "," && !inQuotes){
        vals.push(cur)
        cur = ""
      } else {
        cur += ch
      }
    }
    vals.push(cur)
    return vals
  }

  const dados = []
  // começar em 1 para pular header real do arquivo (usamos headers fixos)
  for(let i = 1; i < linhas.length; i++){
    const linha = linhas[i].trim()
    if(!linha) continue

    const valores = parseCSVLine(linha)

    const obj = {}
    headers.forEach((col, idx) => {
      const v = valores[idx] ?? null
      // trim e remover aspas remanescentes
      obj[col] = typeof v === "string" ? v.trim().replace(/^"|"$/g, "") : v
    })

    dados.push(obj)
  }

  if(dados.length === 0){
    alert("Nenhum registro para importar.")
    return
  }

  const { error } = await supabase
    .from("artigo")
    .insert(dados)

  if(error){
    alert(error.message)
    return
  }

  alert("CSV importado com sucesso!")
  listarArtigos()
}

// ============================================
// EVENTOS
// ============================================

document
  .getElementById("btnArtigos")
  .addEventListener("click", listarArtigos)

document
  .getElementById("btnAutores")
  .addEventListener("click", listarAutores)

document
  .getElementById("btnKeywords")
  .addEventListener("click", listarKeywords)

document
  .getElementById("btnReferencias")
  .addEventListener("click", listarReferencias)

document
  .getElementById("btnLimpar")
  .addEventListener("click", limparTabela)

document
  .getElementById("btnUpload")
  .addEventListener("click", () => {
    document.getElementById("fileInput").click()
  })