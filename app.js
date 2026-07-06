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
  headerInner = document.querySelector(".header-inner"),
  chartsPanel = document.getElementById("chartsPanel"),
  yearChart = document.getElementById("yearChart"),
  authorChart = document.getElementById("authorChart"),
  keywordChart = document.getElementById("keywordChart"),
  journalChart = document.getElementById("journalChart"),
  typeChart = document.getElementById("typeChart"),
  doiChart = document.getElementById("doiChart"),
  yearSummary = document.getElementById("yearSummary"),
  authorSummary = document.getElementById("authorSummary"),
  keywordSummary = document.getElementById("keywordSummary"),
  journalSummary = document.getElementById("journalSummary"),
  typeSummary = document.getElementById("typeSummary"),
  doiSummary = document.getElementById("doiSummary"),
  totalCount = document.getElementById("totalCount"),
  yearCount = document.getElementById("yearCount"),
  authorCount = document.getElementById("authorCount"),
  keywordCount = document.getElementById("keywordCount");
const REF_SUMMARY_MAX_LENGTH = 120;

function createSvgElement(name, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

const relationCache = {
  autor: null,
  revista: null,
  index_keyword: null,
  autor_keywords: null,
};

async function loadRelationLabelMap(table, candidateFields) {
  if (relationCache[table]) return relationCache[table];
  // filtrar candidateFields para apenas colunas existentes na tabela
  const available = [];
  for (const f of candidateFields) {
    try {
      if (await columnExists(table, f)) available.push(f);
    } catch (e) {
      // ignore e continue
    }
  }
  const selectFields =
    available.length > 0 ? ["id", ...available].join(",") : "id";
  const { data, error } = await supabase.from(table).select(selectFields);
  const map = new Map();
  if (!error && Array.isArray(data)) {
    data.forEach((row) => {
      const id = row?.id;
      if (id === undefined || id === null) return;
      const label =
        (available.length > 0
          ? available.map((field) => row?.[field])
          : []
        ).find((value) => typeof value === "string" && value.trim()) ||
        String(id);
      map.set(String(id), label);
    });
  } else {
    console.warn(`Falha ao carregar labels de ${table}:`, error);
  }
  relationCache[table] = map;
  return map;
}

function countByIdField(dados, idField, labelMap) {
  const counts = new Map();
  dados.forEach((item) => {
    const id = item?.[idField];
    if (id === undefined || id === null) return;
    const label = labelMap.get(String(id)) || String(id);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));
}

async function getAuthorEntriesFromRelations(dados) {
  const authorMap = await loadRelationLabelMap("autor", [
    "nome",
    "nome_completo",
    "name",
  ]);
  const rawEntries = countByIdField(dados, "id_autor", authorMap);
  if (rawEntries.length) return rawEntries;

  if (!(await tableExists("artigo_autor"))) return [];
  const { data, error } = await supabase
    .from("artigo_autor")
    .select("id_autor");
  if (error || !Array.isArray(data)) return [];
  const counts = new Map();
  data.forEach((item) => {
    const id = item?.id_autor;
    if (id === undefined || id === null) return;
    const label = authorMap.get(String(id)) || String(id);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));
}

async function getJournalEntriesFromRelations(dados) {
  const journalMap = await loadRelationLabelMap("revista", [
    "nome_revista",
    "revista",
    "title",
    "name",
  ]);
  const rawEntries = countByIdField(dados, "id_revista", journalMap);
  if (rawEntries.length) return rawEntries;

  if (!(await tableExists("artigo_revista"))) return [];
  const { data, error } = await supabase
    .from("artigo_revista")
    .select("id_revista");
  if (error || !Array.isArray(data)) return [];
  const counts = new Map();
  data.forEach((item) => {
    const id = item?.id_revista;
    if (id === undefined || id === null) return;
    const label = journalMap.get(String(id)) || String(id);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));
}

async function getKeywordEntriesFromRelations(dados) {
  const indexMap = await loadRelationLabelMap("index_keyword", [
    "index_keyword",
    "keyword",
    "name",
  ]);
  const autorKeywordMap = await loadRelationLabelMap("autor_keywords", [
    "autor_keyword",
    "keyword",
    "name",
  ]);

  const entries = [];
  entries.push(...countByIdField(dados, "id_index_keyword", indexMap));
  entries.push(...countByIdField(dados, "id_autor_keyword", autorKeywordMap));

  const merged = new Map();
  entries.forEach(({ label, value }) => {
    merged.set(label, (merged.get(label) || 0) + value);
  });

  return [...merged.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));
}

function renderBarChart(svg, values, label) {
  if (!svg) return;
  svg.innerHTML = "";
  if (!values || values.length === 0) {
    const text = createSvgElement("text", {
      x: "210",
      y: "112",
      "text-anchor": "middle",
      fill: "#64748b",
      "font-size": "14",
    });
    text.textContent = "Sem dados suficientes";
    svg.appendChild(text);
    return;
  }

  const width = 420;
  const height = 220;
  const padding = 28;
  // tornar SVG responsivo e permitir overflow para tooltips/labels
  try {
    svg.setAttribute("height", String(height));
    svg.style.overflow = "visible";
    svg.style.display = "block";
  } catch (e) {}
  // espaço extra reservado para rótulos multilinha
  const chartHeight = height - padding * 2 - 24;
  // chartWidth será dinamicamente ajustado abaixo quando necessário
  let chartWidth = width - padding * 2;
  const maxValue = Math.max(...values.map((item) => item.value), 1);
  const GAP = 60; // espaço entre barras (aumentado para legibilidade)
  // aumentar largura máxima das barras
  const tentativeBarWidth =
    (chartWidth - (values.length - 1) * GAP) / values.length;
  const barWidth = Math.max(24, Math.min(200, tentativeBarWidth));
  // calcular largura total necessária para todas as barras
  const totalBarsWidth = Math.max(
    0,
    values.length * barWidth + Math.max(0, values.length - 1) * GAP,
  );
  // se necessário, aumentar a largura do SVG para permitir scroll horizontal
  try {
    const neededWidth = Math.max(width, totalBarsWidth + padding * 2);
    svg.setAttribute("viewBox", `0 0 ${neededWidth} ${height}`);
    svg.style.minWidth = `${Math.ceil(totalBarsWidth + padding * 2)}px`;
    if (svg.parentElement) svg.parentElement.style.overflowX = "auto";
    // ajustar chartWidth para desenho interno
    chartWidth = Math.max(chartWidth, totalBarsWidth);
  } catch (e) {}

  const grid = createSvgElement("line", {
    x1: padding,
    y1: height - padding - 18,
    x2: padding + chartWidth,
    y2: height - padding - 18,
    stroke: "#e2e8f0",
    "stroke-width": "1",
  });
  svg.appendChild(grid);

  values.forEach((item, index) => {
    const barHeight = (item.value / maxValue) * (chartHeight - 12);
    // posicionar barras (startX = padding quando houver scroll)
    const startX = padding + Math.max(0, (chartWidth - totalBarsWidth) / 2);
    const x = startX + index * (barWidth + GAP);
    const y = height - padding - 18 - barHeight;
    const rect = createSvgElement("rect", {
      x: x.toString(),
      y: y.toString(),
      width: barWidth.toString(),
      height: barHeight.toString(),
      rx: "8",
      fill: index % 2 === 0 ? "url(#barGradient)" : "#3b82f6",
    });
    // montar rótulo em múltiplas linhas abaixo da barra e tooltip com nome completo
    const fullLabel = String(item.label ?? "");
    const splitLabelToLines = (text, maxChars = 18, maxLines = 2) => {
      if (!text) return [""];
      const words = text.split(/\s+/);
      const lines = [];
      let cur = "";
      for (const w of words) {
        const candidate = cur ? `${cur} ${w}` : w;
        if (candidate.length <= maxChars) cur = candidate;
        else {
          if (cur) lines.push(cur);
          cur = w;
        }
        if (lines.length >= maxLines) break;
      }
      if (cur && lines.length < maxLines) lines.push(cur);
      return lines.slice(0, maxLines);
    };
    const lines = splitLabelToLines(fullLabel, 18, 2);
    const label = createSvgElement("text", {
      x: x + barWidth / 2,
      y: height - padding + 20,
      "text-anchor": "middle",
      fill: "#475569",
      "font-size": "11",
    });
    lines.forEach((ln, i) => {
      const tspan = createSvgElement("tspan", {
        x: (x + barWidth / 2).toString(),
        dy: i === 0 ? "0" : "14",
      });
      tspan.textContent = ln;
      label.appendChild(tspan);
    });
    // tooltip com o nome completo
    const titleRect = createSvgElement("title");
    titleRect.textContent = fullLabel;
    rect.appendChild(titleRect);
    const valueText = createSvgElement("text", {
      x: x + barWidth / 2,
      y: y - 8,
      "text-anchor": "middle",
      fill: "#334155",
      "font-size": "11",
      "font-weight": "700",
    });
    valueText.textContent = item.value;
    svg.appendChild(rect);
    svg.appendChild(label);
    svg.appendChild(valueText);
  });

  const defs = createSvgElement("defs");
  const gradient = createSvgElement("linearGradient", {
    id: "barGradient",
    x1: "0%",
    y1: "0%",
    x2: "0%",
    y2: "100%",
  });
  gradient.appendChild(
    createSvgElement("stop", { offset: "0%", "stop-color": "#60a5fa" }),
  );
  gradient.appendChild(
    createSvgElement("stop", { offset: "100%", "stop-color": "#2563eb" }),
  );
  defs.appendChild(gradient);
  svg.appendChild(defs);
  const title = createSvgElement("text", {
    x: padding,
    y: 18,
    fill: "#0f172a",
    "font-size": "13",
    "font-weight": "700",
  });
  title.textContent = label;
  svg.appendChild(title);
}

function renderDonutChart(svg, values, label) {
  if (!svg) return;
  svg.innerHTML = "";
  if (!values || values.length === 0) {
    const text = createSvgElement("text", {
      x: "210",
      y: "112",
      "text-anchor": "middle",
      fill: "#64748b",
      "font-size": "14",
    });
    text.textContent = "Sem dados suficientes";
    svg.appendChild(text);
    return;
  }
  // layout responsivo e legenda à direita
  const width = 420;
  const height = 220;
  const padding = 20;
  try {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(height));
    svg.style.overflow = "visible";
    if (svg.parentElement) svg.parentElement.style.overflowX = "auto";
  } catch (e) {}

  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const total = values.reduce((sum, item) => sum + item.value, 0) || 1;
  let offset = 0;
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  // centro do donut (esquerda) e área de legenda (direita)
  const cx = padding + radius + 6; // 6px de folga
  const cy = Math.round(height / 2);

  // fundo do anel
  const circle = createSvgElement("circle", {
    cx: String(cx),
    cy: String(cy),
    r: String(radius),
    fill: "none",
    stroke: "#f1f5f9",
    "stroke-width": "24",
  });
  svg.appendChild(circle);

  // desenhar fatias (max 6 para legibilidade)
  values.slice(0, 6).forEach((item, index) => {
    const length = (item.value / total) * circumference;
    const arc = createSvgElement("circle", {
      cx: String(cx),
      cy: String(cy),
      r: String(radius),
      fill: "none",
      stroke: colors[index % colors.length],
      "stroke-width": "24",
      strokeLinecap: "round",
      strokeDasharray: `${length} ${circumference}`,
      strokeDashoffset: `${-offset}`,
      transform: `rotate(-90 ${cx} ${cy})`,
    });
    offset += length;
    svg.appendChild(arc);
  });

  // título dentro do donut (linha única) e subtítulo com total de tipos
  const title = createSvgElement("text", {
    x: String(cx),
    y: String(cy - 6),
    "text-anchor": "middle",
    fill: "#0f172a",
    "font-size": "13",
    "font-weight": "700",
  });
  title.textContent = label;
  svg.appendChild(title);

  const subtitle = createSvgElement("text", {
    x: String(cx),
    y: String(cy + 12),
    "text-anchor": "middle",
    fill: "#475569",
    "font-size": "11",
  });
  subtitle.textContent = `${values.length} tipos`;
  svg.appendChild(subtitle);

  // legenda à direita
  const legendX = cx + radius + 20;
  const legendY = Math.max(24, cy - 50);
  const legendGap = 22;
  values.slice(0, 6).forEach((item, index) => {
    const y = legendY + index * legendGap;
    const rect = createSvgElement("rect", {
      x: String(legendX),
      y: String(y - 10),
      width: "12",
      height: "12",
      rx: "2",
      fill: colors[index % colors.length],
    });

    const text = createSvgElement("text", {
      x: String(legendX + 18),
      y: String(y),
      fill: "#0f172a",
      "font-size": "12",
    });
    // rótulo: nome (quebrado se longo) + ": " + count
    const maxLabel = String(item.label || "");
    const shortLabel =
      maxLabel.length > 32 ? maxLabel.slice(0, 29) + "..." : maxLabel;
    text.textContent = `${shortLabel}: ${item.value}`;
    svg.appendChild(rect);
    svg.appendChild(text);
  });

  // caso haja mais categorias além das exibidas, mostrar "+N" no final da legenda
  if (values.length > 6) {
    const extra = values.length - 6;
    const moreText = createSvgElement("text", {
      x: String(legendX),
      y: String(legendY + 6 * legendGap),
      fill: "#64748b",
      "font-size": "12",
    });
    moreText.textContent = `+${extra} outros`;
    svg.appendChild(moreText);
  }
}

function collectKeywords(dados) {
  const keywords = new Map();
  const keywordFields = [
    "Index Keywords",
    "Author Keywords",
    "index_keywords",
    "author_keywords",
    "keywords",
  ];

  dados.forEach((item) => {
    keywordFields.forEach((key) => {
      const value = item?.[key];
      if (!value || typeof value !== "string") return;
      value
        .split(/;|\||,/)
        .map((kw) => kw.trim())
        .filter(Boolean)
        .forEach((kw) => {
          keywords.set(kw, (keywords.get(kw) || 0) + 1);
        });
    });
  });

  const entries = [...keywords.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));

  return { entries, unique: keywords.size };
}

function collectTopValues(dados, fields, splitValues = false) {
  const countMap = new Map();
  dados.forEach((item) => {
    const value = fields
      .map((key) => item?.[key])
      .find((v) => v !== undefined && v !== null && String(v).trim());
    if (!value) return;
    if (splitValues && typeof value === "string") {
      value
        .split(/;|\||,/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => countMap.set(part, (countMap.get(part) || 0) + 1));
    } else {
      const label = String(value).trim();
      if (label) countMap.set(label, (countMap.get(label) || 0) + 1);
    }
  });
  return [...countMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));
}

function collectDoiStats(dados) {
  const present = dados.reduce((acc, item) => {
    const doi = item?.DOI ?? item?.doi;
    return (
      acc + (doi !== undefined && doi !== null && String(doi).trim() ? 1 : 0)
    );
  }, 0);
  const missing = dados.length - present;
  return [
    { label: "Com DOI", value: present },
    { label: "Sem DOI", value: missing },
  ];
}

function renderMetrics(
  dados,
  yearEntries,
  authorCountValue,
  keywordCountValue,
) {
  if (totalCount) totalCount.textContent = String(dados.length);
  if (yearCount) yearCount.textContent = String(yearEntries.length);
  if (authorCount) authorCount.textContent = String(authorCountValue);
  if (keywordCount) keywordCount.textContent = String(keywordCountValue);
}

async function renderCharts(dados) {
  if (!chartsPanel) return;
  if (!dados || !dados.length) {
    chartsPanel.hidden = true;
    return;
  }

  chartsPanel.hidden = false;

  const years = new Map();
  const authors = new Map();
  const yearKeys = ["ano", "Ano", "Year", "year", "YEAR"];
  const authorKeys = [
    "author",
    "Author",
    "Authors",
    "Author full names",
    "Autor",
    "autores",
    "nome_autor",
    "nome",
    "name",
    "Name",
  ];

  dados.forEach((item) => {
    const yearValue = yearKeys
      .map((key) => item?.[key])
      .find((value) => value !== undefined && value !== null && value !== "");
    if (yearValue !== undefined) {
      const yearLabel = String(yearValue).trim();
      if (yearLabel) years.set(yearLabel, (years.get(yearLabel) || 0) + 1);
    }

    const authorValue = authorKeys
      .map((key) => item?.[key])
      .find((value) => typeof value === "string" && value.trim());
    if (authorValue) {
      const names = authorValue
        .split(/;|\||,/)
        .map((name) => name.trim())
        .filter(Boolean);
      names.forEach((name) => {
        authors.set(name, (authors.get(name) || 0) + 1);
      });
    }
  });

  const yearEntries = [...years.entries()]
    .sort((a, b) =>
      String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }),
    )
    .slice(-8)
    .map(([label, value]) => ({ label, value }));
  // debug toggle: quando true, mostra no console os valores que alimentam os gráficos
  const DEBUG_CHARTS = false;
  let keywordData = collectKeywords(dados);
  let authorEntries = [...authors.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));
  const journalEntries = collectTopValues(dados, [
    "Source title",
    "Source",
    "source",
    "journal",
    "Journal",
    "revista",
    "nome_revista",
  ]);
  const typeEntries = collectTopValues(
    dados,
    [
      "Document Type",
      "Tipo de Documento",
      "document_type",
      "tipo_documento",
      "type",
    ],
    false,
  );
  const doiEntries = collectDoiStats(dados);

  if (authorEntries.length === 0) {
    authorEntries = await getAuthorEntriesFromRelations(dados);
  }
  const actualJournalEntries =
    journalEntries.length > 0
      ? journalEntries
      : await getJournalEntriesFromRelations(dados);
  if (actualJournalEntries.length > 0) {
    journalEntries.splice(0, journalEntries.length, ...actualJournalEntries);
  }

  if (keywordData.entries.length === 0) {
    const fallbackKeywords = await getKeywordEntriesFromRelations(dados);
    if (fallbackKeywords.length > 0) {
      keywordData = {
        entries: fallbackKeywords,
        unique: fallbackKeywords.length,
      };
    }
  }

  if (DEBUG_CHARTS) {
    console.debug("renderCharts debug: yearEntries", yearEntries);
    console.debug("renderCharts debug: authorEntries", authorEntries);
    console.debug("renderCharts debug: journalEntries", journalEntries);
    console.debug("renderCharts debug: keywordData", keywordData);
    // detectar labels numéricos (possível id em vez de nome)
    const numericLabels = (arr) =>
      arr.filter((it) => /^\d+$/.test(String(it.label)));
    console.debug("numeric author labels:", numericLabels(authorEntries));
    console.debug("numeric journal labels:", numericLabels(journalEntries));
    console.debug(
      "numeric keyword labels:",
      numericLabels(keywordData.entries || []),
    );
  }

  const authorCountValue = authorEntries.length;
  const keywordCountValue =
    (keywordData.unique ?? keywordData.entries.length) || 0;
  renderMetrics(dados, yearEntries, authorCountValue, keywordCountValue);

  if (yearEntries.length > 0) {
    renderBarChart(yearChart, yearEntries, "Artigos por ano");
    if (yearSummary) yearSummary.textContent = `${yearEntries.length} períodos`;
  } else {
    renderBarChart(yearChart, [], "Artigos por ano");
    if (yearSummary) yearSummary.textContent = "Sem ano";
  }

  if (authorEntries.length > 0) {
    renderDonutChart(authorChart, authorEntries, "Top autores");
    if (authorSummary)
      authorSummary.textContent = `${authorEntries.length} nomes`;
  } else {
    renderDonutChart(authorChart, [], "Top autores");
    if (authorSummary) authorSummary.textContent = "Sem autores";
  }

  if (keywordData.entries.length > 0) {
    renderBarChart(keywordChart, keywordData.entries, "Top keywords");
    if (keywordSummary)
      keywordSummary.textContent = `${keywordData.entries.length} termos`;
  } else {
    renderBarChart(keywordChart, [], "Top keywords");
    if (keywordSummary) keywordSummary.textContent = "Sem keywords";
  }

  if (journalEntries.length > 0) {
    renderBarChart(journalChart, journalEntries, "Top revistas");
    if (journalSummary)
      journalSummary.textContent = `${journalEntries.length} revistas`;
  } else {
    renderBarChart(journalChart, [], "Top revistas");
    if (journalSummary) journalSummary.textContent = "Sem revistas";
  }

  if (typeEntries.length > 0) {
    renderDonutChart(typeChart, typeEntries, "Tipos de documento");
    if (typeSummary) typeSummary.textContent = `${typeEntries.length} tipos`;
  } else {
    renderDonutChart(typeChart, [], "Tipos de documento");
    if (typeSummary) typeSummary.textContent = "Sem tipos";
  }

  if (doiEntries.length > 0) {
    renderBarChart(doiChart, doiEntries, "Presença de DOI");
    if (doiSummary) doiSummary.textContent = `${doiEntries.length} categorias`;
  } else {
    renderBarChart(doiChart, [], "Presença de DOI");
    if (doiSummary) doiSummary.textContent = "Sem dados";
  }
}

async function criarTabela(dados) {
  await renderCharts(dados);
  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
    trHead += `<th>${escapeHtml(h)}</th>`;
  });
  trHead += "</tr>";
  thead.innerHTML = trHead;
  dados.forEach((item) => {
    let tr = "<tr>";
    headers.forEach((h) => {
      let val = item[h] ?? "";
      if (typeof val === "string" && /referenc/i.test(h)) {
        const full = val.replace(/\s+/g, " ").trim();
        const refsCount = full
          ? full
              .split(/\s*;\s*|\s*\|\s*/)
              .map((ref) => ref.trim())
              .filter(Boolean).length
          : 0;
        const summary =
          full.length > REF_SUMMARY_MAX_LENGTH
            ? full.slice(0, REF_SUMMARY_MAX_LENGTH) + "..."
            : full;
        const display = refsCount ? `${summary} (${refsCount} ref.)` : summary;
        tr += `<td title="${escapeHtml(full)}">${escapeHtml(display)}</td>`;
      } else {
        tr += `<td>${escapeHtml(val)}</td>`;
      }
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
    await criarTabela(data);
    if (Array.isArray(data) && data.length > 0) showContentView();
    else info.innerText = "Nenhum artigo encontrado";
  } catch (e) {
    console.error(e);
    alert("Erro inesperado");
    info.innerText = "Erro";
  }
}
async function listarDados(tableName, label) {
  try {
    const { data, error } = await supabase.from(tableName).select("*");
    if (error) {
      console.error(`Erro ao listar ${label}:`, error);
      alert(error.message || `Erro ao listar ${label}`);
      return;
    }
    await criarTabela(data);
    showContentView();
  } catch (e) {
    console.error(`Erro ao listar ${label}:`, e);
    alert(`Erro ao listar ${label}`);
  }
}
async function listarAutores() {
  return listarDados("autor", "autores");
}
async function listarKeywords() {
  return listarDados("index_keyword", "keywords");
}
async function listarReferencias() {
  return listarDados("revista", "referências");
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
    await criarTabela(out);
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
