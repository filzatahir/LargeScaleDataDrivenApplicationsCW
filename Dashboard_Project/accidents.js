// =========================
// SETTINGS + GLOBALS
// =========================
const ROWS_PER_PAGE = 10;

let accData = [];      // filtered accident rows
let accDataFull = [];  // FULL accident dataset for dropdowns
let currentPage = 1;

let severityChart = null;
let costByYearChart = null;

function num(x) { return Number(x) || 0; }

// =========================
// KPI CARDS
// =========================
function renderKPIs(data) {
  const total = data.length;

  const sevCounts = {};
  let totalCost = 0;

  data.forEach(r => {
    const s = r.Severity || "Unknown";
    sevCounts[s] = (sevCounts[s] || 0) + 1;
    totalCost += num(r.Cost_of_Repair);
  });

  const mostCommonSeverity = Object.entries(sevCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";

  const avgCost = total ? Math.round(totalCost / total) : 0;

  document.getElementById("kpis").innerHTML = `
      <div class="kpi-card">
        <div class="kpi-title">Total Accidents</div>
        <div class="kpi-value">${total}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Most Common Severity</div>
        <div class="kpi-value">${mostCommonSeverity}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Avg Repair Cost</div>
        <div class="kpi-value">£${avgCost.toLocaleString()}</div>
      </div>
    `;
}

// =========================
// CHARTS
// =========================
const pastel = [
  "#F9DEEE", "#EAA9CF", "#C9B6E4", "#AEE1E1",
  "#F7D59C", "#B5EAD7", "#FFDAC1", "#E2F0CB", "#C7CEEA"
];

function buildSeverityChart(data) {
  const ctx = document.getElementById("accChartSeverity");
  if (!ctx) return;
  if (severityChart) severityChart.destroy();

  const counts = {};

  data.forEach(r => {
    const s = r.Severity || "Unknown";
    counts[s] = (counts[s] || 0) + 1;
  });

  severityChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: pastel
      }]
    }
  });
}

function buildCostByYearChart(data) {
  const ctx = document.getElementById("accChartCostByYear");
  if (!ctx) return;
  if (costByYearChart) costByYearChart.destroy();

  const yearTotals = {};

  data.forEach(r => {
    const d = r.Date_of_Accident ? new Date(r.Date_of_Accident) : null;
    const y = d && !isNaN(d) ? d.getFullYear() : "Unknown";
    yearTotals[y] = (yearTotals[y] || 0) + num(r.Cost_of_Repair);
  });

  const years = Object.keys(yearTotals)
    .filter(y => y !== "Unknown")
    .sort((a, b) => Number(a) - Number(b));

  if (yearTotals["Unknown"] !== undefined) years.push("Unknown");

  costByYearChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: years,
      datasets: [{
        label: "Total Repair Cost (£)",
        data: years.map(y => yearTotals[y]),
        backgroundColor: pastel
      }]
    }
  });
}

// =========================
// TABLE RENDERING
// =========================
function renderTablePage(page) {
  const tbody = document.getElementById("accTableBody");
  tbody.innerHTML = "";

  const start = (page - 1) * ROWS_PER_PAGE;
  const end = start + ROWS_PER_PAGE;

  accData.slice(start, end).forEach(r => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${r.AccidentID}</td>
      <td>${r.CarID}</td>
      <td>${r.Manufacturer || ""}</td>
      <td>${r.Model || ""}</td>
      <td>${r.Date_of_Accident || ""}</td>
      <td>${r.Severity}</td>
      <td>£${num(r.Cost_of_Repair).toLocaleString()}</td>
      <td>${r.Description}</td>
    `;

    tbody.appendChild(tr);
  });

  renderPagination();
}

function renderPagination() {
  const totalPages = Math.ceil(accData.length / ROWS_PER_PAGE) || 1;
  const container = document.getElementById("pagination");

  container.innerHTML = `
    <button ${currentPage === 1 ? "disabled" : ""} onclick="currentPage--; renderTablePage(currentPage)">‹ Prev</button>
    <span style="font-weight:700; color:var(--pink-strong);">Page ${currentPage} of ${totalPages}</span>
    <button ${currentPage === totalPages ? "disabled" : ""} onclick="currentPage++; renderTablePage(currentPage)">Next ›</button>
  `;
}

// =========================
// DROPDOWN POPULATION
// =========================
function populateAccidentDropdowns() {
  const manuSel = document.getElementById("accManuFilter");
  const modelSel = document.getElementById("accModelFilter");

  if (!manuSel || !modelSel) return;

  const selectedManu = manuSel.value;
  const prevModel = modelSel.value;

  const manuSet = new Set();
  const modelSet = new Set();

  // Fill manufacturers from FULL dataset
  accDataFull.forEach(row => {
    if (row.Manufacturer) manuSet.add(row.Manufacturer);
  });

  // Fill models:
  // If a manufacturer is selected -> only models from that manufacturer
  accDataFull.forEach(row => {
    if (!row.Model) return;

    if (!selectedManu || row.Manufacturer === selectedManu) {
      modelSet.add(row.Model);
    }
  });

  //  manufacturer dropdown
  manuSel.innerHTML = `<option value="">Any</option>`;
  [...manuSet].sort().forEach(m => {
    manuSel.innerHTML += `<option value="${m}">${m}</option>`;
  });
  manuSel.value = selectedManu; // manu selection

  // model dropdown
  modelSel.innerHTML = `<option value="">Any</option>`;
  [...modelSet].sort().forEach(m => {
    modelSel.innerHTML += `<option value="${m}">${m}</option>`;
  });

  if (prevModel && modelSet.has(prevModel)) {
    modelSel.value = prevModel;
  }
}

// =========================
// LOAD ACCIDENTS
// =========================
function loadAccidents() {
  const manu = document.getElementById("accManuFilter")?.value;
  const model = document.getElementById("accModelFilter")?.value;
  const minCost = document.getElementById("minRepairCost")?.value;
  const maxCost = document.getElementById("maxRepairCost")?.value;
  const multi = document.getElementById("multiAccFilter")?.value;
  const sort = document.getElementById("accSort")?.value;

  let url = "http://localhost:3000/accidents?";

  if (manu) url += `manufacturer=${manu}&`;
  if (model) url += `model=${model}&`;
  if (minCost) url += `minCost=${minCost}&`;
  if (maxCost) url += `maxCost=${maxCost}&`;
  if (multi) url += `multi=${multi}&`;
  if (sort) url += `sort=${sort}&`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      accData = data;
      currentPage = 1;

      renderKPIs(accData);
      buildSeverityChart(accData);
      buildCostByYearChart(accData);
      renderTablePage(currentPage);

      populateAccidentDropdowns(); // uses FULL dataset
    });
}

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", () => {

  // Load FULL dataset for dropdowns
  fetch("http://localhost:3000/accidents")
    .then(res => res.json())
    .then(data => {
      accDataFull = data; // store unfiltered copy
      accData = data;

      populateAccidentDropdowns();
      renderKPIs(accData);
      buildSeverityChart(accData);
      buildCostByYearChart(accData);
      renderTablePage(currentPage);
    });
});

// =========================
// FILTER LISTENERS
// =========================
document.getElementById("accManuFilter").addEventListener("change", loadAccidents);
document.getElementById("accModelFilter").addEventListener("change", loadAccidents);
document.getElementById("minRepairCost").addEventListener("input", loadAccidents);
document.getElementById("maxRepairCost").addEventListener("input", loadAccidents);
document.getElementById("multiAccFilter").addEventListener("change", loadAccidents);
document.getElementById("accSort").addEventListener("change", loadAccidents);

// sidebar timestamp
document.addEventListener("DOMContentLoaded", () => {
  const last = document.getElementById("side-last-updated");
  if (last) {
    last.innerText = new Date().toLocaleString("en-UK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
});