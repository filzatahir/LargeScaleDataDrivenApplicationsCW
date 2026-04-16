// =========================
// SETTINGS + GLOBALS
// =========================
const ROWS_PER_PAGE = 10;

let servicesData = [];        // filtered results (what we render)
let servicesFullData = [];    // full dataset (for dropdowns)
let currentPage = 1;

let currentSortColumn = null;
let currentSortDirection = "asc";

let chart1Instance = null;
let chart2Instance = null;

const pastelColors = [
  "#F9DEEE", "#EAA9CF", "#C9B6E4",
  "#AEE1E1", "#F7D59C", "#B5EAD7",
  "#FFDAC1", "#E2F0CB", "#C7CEEA"
];

const num = x => Number(x) || 0;

// =========================
// DROPDOWNS
// =========================
function populateServiceDropdowns() {
  const manuSel  = document.getElementById("svcManuFilter");
  const modelSel = document.getElementById("svcModelFilter");
  const typeSel  = document.getElementById("svcTypeFilter");
  if (!manuSel || !modelSel || !typeSel) return;

  const selectedManu  = manuSel.value;
  const selectedModel = modelSel.value;

  const manuSet = new Set();
  const modelSet = new Set();    // filtered by selected manufacturer
  const typeSet = new Set();

  // manufacturers + types from full dataset
  servicesFullData.forEach(r => {
    if (r.Manufacturer) manuSet.add(r.Manufacturer);
    if (r.ServiceType) typeSet.add(r.ServiceType);
  });

  // models limited by current manufacturer (or all if none selected)
  servicesFullData.forEach(r => {
    if (!selectedManu || r.Manufacturer === selectedManu) {
      if (r.Model) modelSet.add(r.Model);
    }
  });

  // rebuild dropdowns
  manuSel.innerHTML  = `<option value="">Any</option>`;
  modelSel.innerHTML = `<option value="">Any</option>`;
  typeSel.innerHTML  = `<option value="">Any</option>`;

  [...manuSet].sort().forEach(m => manuSel.innerHTML  += `<option value="${m}">${m}</option>`);
  [...modelSet].sort().forEach(m => modelSel.innerHTML += `<option value="${m}">${m}</option>`);
  [...typeSet].sort().forEach(t => typeSel.innerHTML  += `<option value="${t}">${t}</option>`);

  // restore selections if still valid
  if (selectedManu && manuSet.has(selectedManu)) manuSel.value = selectedManu;
  if (selectedModel && modelSet.has(selectedModel)) modelSel.value = selectedModel;
}

// when manufacturer changes, rebuild model list first, then load
function onManuChange() {
  populateServiceDropdowns(); // rebuild models for this manu
  loadServices();             // then fetch filtered rows
}

// =========================
// LOAD (FILTERED) DATA
// =========================
function loadServices() {
  const manu  = document.getElementById("svcManuFilter")?.value || "";
  const model = document.getElementById("svcModelFilter")?.value || "";
  const type  = document.getElementById("svcTypeFilter")?.value || "";
  const minC  = document.getElementById("svcMinCost")?.value || "";
  const maxC  = document.getElementById("svcMaxCost")?.value || "";
  const multi = document.getElementById("svcMultiFilter")?.value || "";

  let url = "/services?";
  if (manu)  url += `manufacturer=${encodeURIComponent(manu)}&`;
  if (model) url += `model=${encodeURIComponent(model)}&`;
  if (type)  url += `type=${encodeURIComponent(type)}&`;
  if (minC)  url += `minCost=${encodeURIComponent(minC)}&`;
  if (maxC)  url += `maxCost=${encodeURIComponent(maxC)}&`;
  if (multi) url += `multi=${encodeURIComponent(multi)}&`;

  fetch(url)
    .then(r => r.json())
    .then(data => {
      servicesData = data;
      currentPage = 1;

      // rebuild model list again in case the chosen manu reduced options
      populateServiceDropdowns();

      renderKPIs(servicesData);
      renderTablePage(currentPage);
      buildServiceTypeChart(servicesData);
      buildCostByYearChart(servicesData);
    })
    .catch(err => console.error("loadServices error:", err));
}

// =========================
/* SORTING */
// =========================
function sortByColumn(column) {
  if (currentSortColumn === column) {
    currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
  } else {
    currentSortColumn = column;
    currentSortDirection = "asc";
  }

  servicesData.sort((a, b) => {
    let A = a[column], B = b[column];
    if (column === "Date_of_Service") { A = new Date(A); B = new Date(B); }
    return currentSortDirection === "asc" ? (A > B ? 1 : -1) : (A < B ? 1 : -1);
  });

  currentPage = 1;
  renderTablePage(currentPage);
}

// =========================
/* TABLE + PAGINATION */
// =========================
function renderTablePage(page) {
  const tbody = document.getElementById("servicesTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const start = (page - 1) * ROWS_PER_PAGE;
  const end = start + ROWS_PER_PAGE;

  servicesData.slice(start, end).forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.ServiceID}</td>
      <td>${s.CarID}</td>
      <td>${s.Manufacturer || ""}</td>
      <td>${s.Model || ""}</td>
      <td>${s.Date_of_Service || ""}</td>
      <td>£${num(s.Cost_of_Service).toLocaleString()}</td>
      <td>${s.ServiceType || ""}</td>
    `;
    tbody.appendChild(tr);
  });

  renderPagination();
}

function renderPagination() {
  const paginationDiv = document.getElementById("pagination");
  if (!paginationDiv) return;
  const totalPages = Math.ceil(servicesData.length / ROWS_PER_PAGE) || 1;

  paginationDiv.innerHTML = "";

  const prev = document.createElement("button");
  prev.innerText = "‹ Prev";
  prev.disabled = currentPage === 1;
  prev.onclick = () => { currentPage--; renderTablePage(currentPage); };

  const info = document.createElement("span");
  info.innerText = `Page ${currentPage} of ${totalPages}`;
  info.style.fontWeight = "600";
  info.style.color = "var(--pink-strong)";

  const next = document.createElement("button");
  next.innerText = "Next ›";
  next.disabled = currentPage === totalPages;
  next.onclick = () => { currentPage++; renderTablePage(currentPage); };

  paginationDiv.appendChild(prev);
  paginationDiv.appendChild(info);
  paginationDiv.appendChild(next);
}

// =========================
/* KPIs */
// =========================
function renderKPIs(data) {
  const total = data.length;
  const avgCost = total ? Math.round(data.reduce((s, r) => s + num(r.Cost_of_Service), 0) / total) : 0;

  const typeCounts = {};
  data.forEach(r => {
    const t = r.ServiceType || "Other";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const mostCommonType = Object.entries(typeCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "—";

  const box = document.getElementById("kpis");
  if (!box) return;
  box.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-title">Total Services</div>
      <div class="kpi-value">${total}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Average Service Cost</div>
      <div class="kpi-value">£${avgCost.toLocaleString()}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Most Common Service Type</div>
      <div class="kpi-value">${mostCommonType}</div>
    </div>
  `;
}

// =========================
/* CHARTS */
// =========================
function buildServiceTypeChart(data) {
  const ctx = document.getElementById("chart1");
  if (!ctx) return;
  if (chart1Instance) chart1Instance.destroy();

  const counts = {};
  data.forEach(r => {
    const t = r.ServiceType || "Other";
    counts[t] = (counts[t] || 0) + 1;
  });

  chart1Instance = new Chart(ctx, {
    type: "pie",
    data: {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: pastelColors,
        borderColor: "#fff",
        borderWidth: 2
      }]
    },
    options: { plugins: { legend: { position: "bottom" } } }
  });
}

function buildCostByYearChart(data) {
  const ctx = document.getElementById("chart2");
  if (!ctx) return;
  if (chart2Instance) chart2Instance.destroy();

  const totals = {};
  data.forEach(r => {
    if (!r.Date_of_Service) return;
    const y = new Date(r.Date_of_Service).getFullYear();
    totals[y] = (totals[y] || 0) + num(r.Cost_of_Service);
  });

  const years = Object.keys(totals).sort((a,b)=>Number(a)-Number(b));
  chart2Instance = new Chart(ctx, {
    type: "line",
    data: {
      labels: years,
      datasets: [{
        label: "Total Service Cost (£)",
        data: years.map(y => totals[y]),
        borderColor: "#EAA9CF",
        backgroundColor: "rgba(234,169,207,.2)",
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: "#EAA9CF"
      }]
    },
    options: { plugins: { legend: { display: false } } }
  });
}

// =========================
/* INIT */
// =========================
document.addEventListener("DOMContentLoaded", () => {
  // Load FULL dataset once (for dropdowns + initial render)
  fetch("/services")
    .then(r => r.json())
    .then(data => {
      servicesFullData = data.slice(); // keep original full copy
      servicesData = data.slice();

      populateServiceDropdowns();
      renderKPIs(servicesData);
      renderTablePage(currentPage);
      buildServiceTypeChart(servicesData);
      buildCostByYearChart(servicesData);
    })
    .catch(err => console.error("init load error:", err));

  // header sorting
  document.querySelectorAll("th[data-sort]")?.forEach(th => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      sortByColumn(th.getAttribute("data-sort"));
    });
  });

  // cost sort dropdown
  document.getElementById("serviceSort")?.addEventListener("change", (e) => {
    const v = e.target.value;
    if (v === "low-high")   servicesData.sort((a,b)=> num(a.Cost_of_Service)-num(b.Cost_of_Service));
    if (v === "high-low")   servicesData.sort((a,b)=> num(b.Cost_of_Service)-num(a.Cost_of_Service));
    renderTablePage(1);
  });

  // filter listeners
  document.getElementById("svcManuFilter")?.addEventListener("change", onManuChange);
  document.getElementById("svcModelFilter")?.addEventListener("change", loadServices);
  document.getElementById("svcTypeFilter")?.addEventListener("change", loadServices);
  document.getElementById("svcMinCost")?.addEventListener("input",  loadServices);
  document.getElementById("svcMaxCost")?.addEventListener("input",  loadServices);
  document.getElementById("svcMultiFilter")?.addEventListener("change", loadServices);

  // last updated
  const last = document.getElementById("side-last-updated");
  if (last) {
    last.innerText = new Date().toLocaleString("en-UK", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }
});