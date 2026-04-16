// =====================
// SETTINGS & GLOBALS
// =====================
const ROWS_PER_PAGE = 10;
let allCarsData = [];   // master dataset (for search)
let carsData = [];      // current view
let currentPage = 1;

let currentSortColumn = null;
let currentSortDirection = "asc";

let chart1Instance = null; // manufacturer bar
let chart2Instance = null; // fuel pie

const pastelColors = [
    "#F9DEEE", "#EAA9CF", "#C9B6E4",
    "#AEE1E1", "#F7D59C", "#B5EAD7",
    "#FFDAC1", "#E2F0CB", "#C7CEEA"
];

const num = x => Number(x) || 0;

// =====================
// UTIL
// =====================
function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function showError(msg) {
    const box = document.getElementById("cars-error");
    if (!box) return;
    box.style.display = "block";
    box.innerText = msg;
}

function hideError() {
    const box = document.getElementById("cars-error");
    if (!box) return;
    box.style.display = "none";
    box.innerText = "";
}

function destroyCharts() {
    if (chart1Instance) { chart1Instance.destroy(); chart1Instance = null; }
    if (chart2Instance) { chart2Instance.destroy(); chart2Instance = null; }
}

// =====================
// DROPDOWN (Manufacturer)
// =====================
function populateManufacturerOptions(data) {
    const select = document.getElementById("manufacturerFilter");
    if (!select) return;

    const prev = select.value;
    const set = new Set();

    data.forEach(car => { if (car.Manufacturer) set.add(car.Manufacturer); });

    select.innerHTML = '<option value="">All</option>';

    [...set].sort().forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
    });

    if (set.has(prev)) select.value = prev;
}

function populateModelOptions(data, selectedManufacturer) {
    const select = document.getElementById("modelFilter");
    if (!select) return;

    const prev = select.value;
    const set = new Set();

    // If manufacturer selected, filter models for that brand
    data.forEach(car => {
        if (selectedManufacturer) {
            if (car.Manufacturer === selectedManufacturer && car.Model) {
                set.add(car.Model);
            }
        } else {
            if (car.Model) set.add(car.Model);
        }
    });

    select.innerHTML = '<option value="">All</option>';

    [...set].sort().forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
    });

    // Restore previous model if still valid
    if (set.has(prev)) {
        select.value = prev;
    }
}

// =====================
// SEARCH (CLIENT SIDE)
// =====================
function applySearchFilter() {
    const input = document.getElementById("searchInput");
    const term = (input?.value || "").toLowerCase().trim();

    // If search empty → restore to current backend-filtered dataset (not master)
    if (term === "") {
        hideError();
        // Keep current backend-filtered carsData as-is; just re-render views
        renderKPIs(carsData);
        renderTablePage(1);
        buildManufacturerChart(carsData);
        buildFuelTypeChart(carsData);
        return;
    }

    // Always search the MASTER dataset
    const filtered = allCarsData.filter(car =>
        (car.Manufacturer || "").toLowerCase().includes(term) ||
        (car.Model || "").toLowerCase().includes(term) ||
        String(car.Price).toLowerCase().includes(term) ||
        String(car.CarID).toLowerCase().includes(term) ||
        String(car.Year_of_Manufacturing).toLowerCase().includes(term) ||
        String(car.Mileage).toLowerCase().includes(term)
    );

    // Update current view to filtered results
    carsData = filtered;

    if (filtered.length === 0) {
        showError("No cars found for your search.");
        // clear the table and charts for clarity
        document.getElementById("carTableBody").innerHTML = "";
        destroyCharts();
        // KPIs to zero
        const kpis = document.getElementById("kpis");
        if (kpis) {
            kpis.innerHTML = `
        <div class="kpi-card"><div class="kpi-title">Total Cars</div><div class="kpi-value">0</div></div>
        <div class="kpi-card"><div class="kpi-title">Average Price</div><div class="kpi-value">£0</div></div>
        <div class="kpi-card"><div class="kpi-title">Most Common Brand</div><div class="kpi-value">—</div></div>
      `;
        }
        // pagination reset
        const paginationDiv = document.getElementById("pagination");
        if (paginationDiv) paginationDiv.innerHTML = "";
        return;
    }

    hideError();
    renderKPIs(filtered);
    renderTablePage(1);
    buildManufacturerChart(filtered);
    buildFuelTypeChart(filtered);
}

// =====================
// BACKEND FETCH (Filters)
// =====================
function loadCars() {
    // If the user is actively searching, run client-side search instead.
    const searchTerm = (document.getElementById("searchInput")?.value || "").trim();
    if (searchTerm !== "") {
        applySearchFilter();
        return;
    }

    const sortValue = document.getElementById("sortOrder").value;
    const manufacturer = document.getElementById("manufacturerFilter").value;
    const model = document.getElementById("modelFilter").value;
    const minPrice = document.getElementById("minPrice").value;
    const maxPrice = document.getElementById("maxPrice").value;
    const hasAccident = document.getElementById("hasAccident")?.value;
    const hasService = document.getElementById("hasService")?.value;
    const feature = document.getElementById("featureFilter")?.value;
    const severity = document.getElementById("severityFilter")?.value;
    const serviceType = document.getElementById("serviceTypeFilter")?.value;
    const fuel = document.getElementById("fuelFilter")?.value;
    const minYear = document.getElementById("minYear")?.value;
    const maxYear = document.getElementById("maxYear")?.value;

    let url = "http://localhost:3000/cars";
    const params = new URLSearchParams();

    if (sortValue) params.append("sort", sortValue);
    if (manufacturer) params.append("manufacturer", manufacturer);
    if (model) params.append("model", model);
    if (minPrice) params.append("minPrice", minPrice);
    if (maxPrice) params.append("maxPrice", maxPrice);
    if (hasAccident) params.append("hasAccident", hasAccident);
    if (hasService) params.append("hasService", hasService);
    if (feature) params.append("feature", feature);
    if (severity) params.append("severity", severity);
    if (serviceType) params.append("serviceType", serviceType);
    if (fuel) params.append("fuel", fuel);
    if (minYear) params.append("minYear", minYear);
    if (maxYear) params.append("maxYear", maxYear);

    const qs = params.toString();
    if (qs) url += `?${qs}`;

    const isInitialLoad = (allCarsData.length === 0);

    fetch(url)
        .then(res => res.json())
        .then(data => {
            carsData = data;

            // On VERY FIRST load, capture master dataset for search as the full /cars (no filters)
            if (isInitialLoad) {
                fetch("http://localhost:3000/cars")
                    .then(r => r.json())
                    .then(full => {
                        allCarsData = [...full];
                        populateManufacturerOptions(allCarsData);
                        populateModelOptions(allCarsData, document.getElementById("manufacturerFilter").value);
                    })
                    .catch(() => { /* ignore */ });
            } else {
                // keep manufacturer list stable (based on master)
                populateManufacturerOptions(allCarsData);
            }

            if (data.length === 0) {
                showError("No cars match your filters.");
                document.getElementById("carTableBody").innerHTML = "";
                destroyCharts();
                // KPIs to zero for clarity
                const kpis = document.getElementById("kpis");
                if (kpis) {
                    kpis.innerHTML = `
            <div class="kpi-card"><div class="kpi-title">Total Cars</div><div class="kpi-value">0</div></div>
            <div class="kpi-card"><div class="kpi-title">Average Price</div><div class="kpi-value">£0</div></div>
            <div class="kpi-card"><div class="kpi-title">Most Common Brand</div><div class="kpi-value">—</div></div>
          `;
                }
                const paginationDiv = document.getElementById("pagination");
                if (paginationDiv) paginationDiv.innerHTML = "";
                return;
            }

            hideError();

            currentPage = 1;
            renderKPIs(carsData);
            renderTablePage(currentPage);
            buildManufacturerChart(carsData);
            buildFuelTypeChart(carsData);
        })
        .catch(err => console.error(err));
}

// =====================
// SORTING
// =====================
function sortByColumn(column) {
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
    } else {
        currentSortColumn = column;
        currentSortDirection = "asc";
    }

    carsData.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        return currentSortDirection === "asc"
            ? (valA > valB ? 1 : -1)
            : (valA < valB ? 1 : -1);
    });

    currentPage = 1;
    renderTablePage(currentPage);
}

// =====================
// TABLE + PAGINATION
// =====================
function renderTablePage(page) {
    const tbody = document.getElementById("carTableBody");
    if (!tbody) return;
  
    tbody.innerHTML = "";
  
    const start = (page - 1) * ROWS_PER_PAGE;
    const end = start + ROWS_PER_PAGE;
  
    carsData.slice(start, end).forEach(car => {
      const hasAcc = car.accidents && car.accidents.length > 0 ? "Yes" : "No";
      const hasSvc = car.services && car.services.length > 0 ? "Yes" : "No";
  
      // main row
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${car.CarID}</td>
        <td>${car.Manufacturer}</td>
        <td>${car.Model}</td>
        <td>£${num(car.Price).toLocaleString()}</td>
        <td>${car.Mileage}</td>
        <td>${car.Fuel_Type}</td>
        <td>${car.Year_of_Manufacturing}</td>
        <td>${car["Engine size"]}</td>
        <td>${hasAcc}</td>
        <td>${hasSvc}</td>
        <td><button class="details-btn">View</button></td>
      `;
      tbody.appendChild(row);
  
      // expandable details row
      const expandRow = document.createElement("tr");
      expandRow.className = "expand-row";
      expandRow.style.display = "none";
      expandRow.innerHTML = `
        <td colspan="11" class="details-cell">
          <strong>Accidents:</strong><br>
          ${
            car.accidents && car.accidents.length
              ? car.accidents.map(a => `- ${a.Severity} (£${a.Cost_of_Repair})`).join("<br>")
              : "No accidents"
          }
          <br><br><strong>Services:</strong><br>
          ${
            car.services && car.services.length
              ? car.services.map(s => `- ${s.ServiceType} (£${s.Cost_of_Service})`).join("<br>")
              : "No services"
          }
        </td>
      `;
      tbody.appendChild(expandRow);
    });
  
    renderPagination();
  }


function renderPagination() {
    const totalPages = Math.ceil(carsData.length / ROWS_PER_PAGE);
    const paginationDiv = document.getElementById("pagination");
    paginationDiv.innerHTML = "";

    const prevBtn = document.createElement("button");
    prevBtn.innerText = "‹ Prev";
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; renderTablePage(currentPage); } };
    stylePageButton(prevBtn);
    paginationDiv.appendChild(prevBtn);

    const pageInfo = document.createElement("span");
    pageInfo.innerText = `Page ${currentPage} of ${totalPages}`;
    pageInfo.style.margin = "0 12px";
    pageInfo.style.fontWeight = "600";
    pageInfo.style.color = "var(--pink-strong)";
    paginationDiv.appendChild(pageInfo);

    const nextBtn = document.createElement("button");
    nextBtn.innerText = "Next ›";
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; renderTablePage(currentPage); } };
    stylePageButton(nextBtn);
    paginationDiv.appendChild(nextBtn);
}

function stylePageButton(btn) {
    btn.style.margin = "3px";
    btn.style.padding = "6px 14px";
    btn.style.border = "1px solid var(--pink)";
    btn.style.background = "#ffffff";
    btn.style.color = "var(--pink)";
    btn.style.borderRadius = "8px";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "14px";
}

// =====================
// KPIs
// =====================
function renderKPIs(data) {
    const totalCars = data.length;
    const avgPrice = totalCars ? Math.round(data.reduce((s, c) => s + num(c.Price), 0) / totalCars) : 0;

    const makerCounts = {};
    data.forEach(car => {
        const m = car.Manufacturer || "Unknown";
        makerCounts[m] = (makerCounts[m] || 0) + 1;
    });

    const mostCommonMaker = totalCars
        ? Object.entries(makerCounts).sort((a, b) => b[1] - a[1])[0][0]
        : "—";

    const kpiBox = document.getElementById("kpis");
    if (kpiBox) {
        kpiBox.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-title">Total Cars</div>
        <div class="kpi-value">${totalCars}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Average Price</div>
        <div class="kpi-value">£${avgPrice.toLocaleString()}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Most Common Brand</div>
        <div class="kpi-value">${mostCommonMaker}</div>
      </div>
    `;
    }

    const sideTotal = document.getElementById("side-total-cars");
    const sideAvg = document.getElementById("side-avg-price");
    const sideBrand = document.getElementById("side-top-brand");

    if (sideTotal) sideTotal.innerText = totalCars;
    if (sideAvg) sideAvg.innerText = "£" + avgPrice.toLocaleString();
    if (sideBrand) sideBrand.innerText = mostCommonMaker;
}

// =====================
// CHARTS
// =====================
function buildManufacturerChart(data) {
    const ctx = document.getElementById("chart1");
    if (!ctx) return;

    if (chart1Instance) chart1Instance.destroy();

    const counts = {};
    data.forEach(car => counts[car.Manufacturer] = (counts[car.Manufacturer] || 0) + 1);

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const labels = sorted.map(x => x[0]);
    const values = sorted.map(x => x[1]);

    chart1Instance = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Cars",
                data: values,
                backgroundColor: pastelColors.slice(0, labels.length),
                borderColor: pastelColors.slice(0, labels.length),
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: "Cars by Manufacturer (Top 10)",
                    color: "#EAA9CF",
                    font: { size: 14, weight: "600" }
                }
            }
        }
    });
}

function buildFuelTypeChart(data) {
    const ctx = document.getElementById("chart2");
    if (!ctx) return;

    if (chart2Instance) chart2Instance.destroy();

    const counts = {};
    data.forEach(car => {
        const type = car.Fuel_Type || "Unknown";
        counts[type] = (counts[type] || 0) + 1;
    });

    const labels = Object.keys(counts);
    const values = Object.values(counts);

    chart2Instance = new Chart(ctx, {
        type: "pie",
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: pastelColors.slice(0, labels.length),
                borderColor: "#ffffff",
                borderWidth: 2
            }]
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: "Fuel Type Distribution",
                    color: "#EAA9CF",
                    font: { size: 14, weight: "600" }
                },
                legend: {
                    position: "bottom",
                    labels: { color: "#4A3F46", font: { size: 12 } }
                }
            }
        }
    });
}

// =====================
// INIT
// =====================
document.addEventListener("DOMContentLoaded", () => {
    loadCars();

    document.getElementById("sortOrder").addEventListener("change", loadCars);
    document.getElementById("manufacturerFilter").addEventListener("change", () => {
        const manu = document.getElementById("manufacturerFilter").value;

        // Update model list whenever manufacturer changes
        populateModelOptions(allCarsData, manu);

        // Reset model when manufacturer changes
        document.getElementById("modelFilter").value = "";

        loadCars();
    });
    document.getElementById("modelFilter").addEventListener("change", loadCars);
    document.getElementById("minPrice").addEventListener("input", loadCars);
    document.getElementById("maxPrice").addEventListener("input", loadCars);

    // Debounced search so interim text (like "golf" in "golff") doesn't snap results early
    document.getElementById("searchInput")?.addEventListener("input", debounce(applySearchFilter, 300));

    document.querySelectorAll("th[data-sort]").forEach(th => {
        th.style.cursor = "pointer";
        th.addEventListener("click", () => sortByColumn(th.getAttribute("data-sort")));
    });
});

document.addEventListener("click", (e) => {
    if (!e.target.classList.contains("details-btn")) return;

    const btn = e.target;
    const tr = btn.closest("tr");
    const expandRow = tr.nextElementSibling;

    if (!expandRow) return;

    const isHidden = expandRow.style.display === "none";

    expandRow.style.display = isHidden ? "table-row" : "none";
    btn.innerText = isHidden ? "Hide" : "View";
});

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