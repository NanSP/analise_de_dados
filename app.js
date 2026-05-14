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
    .from("autor")
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

  if(!arquivo){
    return
  }

  const texto = await arquivo.text()

  const linhas = texto.split("\n")

  const colunas = linhas[0]
    .trim()
    .split(",")

  const dados = []

  for(let i = 1; i < linhas.length; i++){

    if(!linhas[i].trim()) continue

    const valores = linhas[i].split(",")

    const obj = {}

    colunas.forEach((coluna, index) => {
      obj[coluna.trim()] = valores[index]?.trim()
    })

    dados.push(obj)
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