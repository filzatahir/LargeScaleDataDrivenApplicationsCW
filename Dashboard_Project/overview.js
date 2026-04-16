// =====================
// SETTINGS & GLOBALS
// =====================
const ROWS_PER_PAGE = 10;
let allCarsData = [];
let carsData = [];
let currentPage = 1;

let chart1Instance = null; // manufacturer bar
let chart2Instance = null; // fuel pie

const pastelColors = [
  "#F9DEEE", "#EAA9CF", "#C9B6E4",
  "#AEE1E1", "#F7D59C", "#B5EAD7",
  "#FFDAC1", "#E2F0CB", "#C7CEEA"
];

const num = x => Number(x) || 0;

// =====================
// DROPDOWN
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

// =====================
// BACKEND FETCH
// =====================
function loadCars() {
  const sortValue = document.getElementById("sortOrder").value;
  const manufacturer = document.getElementById("manufacturerFilter").value;
  const minPrice = document.getElementById("minPrice").value;
  const maxPrice = document.getElementById("maxPrice").value;

  let url = "http://localhost:3000/cars";
  const params = new URLSearchParams();

  if (sortValue) params.append("sort", sortValue);
  if (manufacturer) params.append("manufacturer", manufacturer);
  if (minPrice) params.append("minPrice", minPrice);
  if (maxPrice) params.append("maxPrice", maxPrice);

  const qs = params.toString();
  if (qs) url += `?${qs}`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      carsData = data;

      if (allCarsData.length === 0) {
        allCarsData = [...data];
        populateManufacturerOptions(allCarsData);
      }

      currentPage = 1;
      renderKPIs(data);
      renderTablePage(currentPage);
      buildManufacturerChart(data);
      buildFuelTypeChart(data);
    })
    .catch(err => console.error(err));
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
    `;
    tbody.appendChild(row);
  });

  renderPagination();
}

function renderPagination() {
  const paginationDiv = document.getElementById("pagination");
  paginationDiv.innerHTML = "";

  const totalPages = Math.ceil(carsData.length / ROWS_PER_PAGE);

  const prevBtn = document.createElement("button");
  prevBtn.innerText = "‹ Prev";
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      renderTablePage(currentPage);
    }
  };
  paginationDiv.appendChild(prevBtn);

  const info = document.createElement("span");
  info.innerText = `Page ${currentPage} of ${totalPages}`;
  paginationDiv.appendChild(info);

  const nextBtn = document.createElement("button");
  nextBtn.innerText = "Next ›";
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderTablePage(currentPage);
    }
  };
  paginationDiv.appendChild(nextBtn);
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

  const mostCommonBrand = totalCars
    ? Object.entries(makerCounts).sort((a, b) => b[1] - a[1])[0][0]
    : "—";

  document.getElementById("kpis").innerHTML = `
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
      <div class="kpi-value">${mostCommonBrand}</div>
    </div>
  `;

  // sidebar mirrors
  document.getElementById("side-total-cars").innerText = totalCars;
  document.getElementById("side-avg-price").innerText = "£" + avgPrice.toLocaleString();
  document.getElementById("side-top-brand").innerText = mostCommonBrand;
}

// =====================
// CHARTS (match your preferred style)
// =====================
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

function buildManufacturerChart(data) {
  const ctx = document.getElementById("chart1");
  if (!ctx) return;
  if (chart1Instance) chart1Instance.destroy();

  const counts = {};
  data.forEach(car => {
    const m = car.Manufacturer || "Other";
    counts[m] = (counts[m] || 0) + 1;
  });

  const labels = Object.keys(counts);
  const values = Object.values(counts);

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
          text: "Cars by Manufacturer",
          color: "#EAA9CF",
          font: { size: 14, weight: "600" }
        }
      },
      scales: {
        x: {
          ticks: { color: "#4A3F46", font: { size: 12 } },
          grid: { display: false }
        },
        y: {
          ticks: { color: "#4A3F46", font: { size: 12 } },
          grid: { color: "rgba(234,169,207,.25)" }
        }
      }
    }
  });
}

// =====================
// LAST UPDATED
// =====================
document.addEventListener("DOMContentLoaded", () => {
  const last = document.getElementById("side-last-updated");
  if (last) {
    const now = new Date();
    const formatted = now.toLocaleString("en-UK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).replace(",", " at");
    last.innerText = formatted;
  }
});

// =====================
// INIT
// =====================
document.addEventListener("DOMContentLoaded", () => {
  loadCars();
  document.getElementById("manufacturerFilter").addEventListener("change", loadCars);
  document.getElementById("sortOrder").addEventListener("change", loadCars);
  document.getElementById("minPrice").addEventListener("input", loadCars);
  document.getElementById("maxPrice").addEventListener("input", loadCars);
});