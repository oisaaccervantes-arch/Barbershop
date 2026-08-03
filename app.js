const STORE_KEY = "bizantino-barberia-v1";

const defaultState = {
  services: [
    { id: crypto.randomUUID(), name: "Corte adulto", price: 250, type: "Servicio" },
    { id: crypto.randomUUID(), name: "Corte niño", price: 230, type: "Servicio" },
    { id: crypto.randomUUID(), name: "Corte y barba", price: 365, type: "Servicio" },
    { id: crypto.randomUUID(), name: "Barba express", price: 170, type: "Servicio" },
    { id: crypto.randomUUID(), name: "Barba premium", price: 185, type: "Servicio" },
    { id: crypto.randomUUID(), name: "Limpieza", price: 130, type: "Servicio" },
    { id: crypto.randomUUID(), name: "Afeitado", price: 180, type: "Servicio" },
    { id: crypto.randomUUID(), name: "Ceja", price: 110, type: "Servicio" },
    { id: crypto.randomUUID(), name: "Tinte", price: 110, type: "Servicio" },
    { id: crypto.randomUUID(), name: "Corte y lavado", price: 270, type: "Servicio" },
    { id: crypto.randomUUID(), name: "Diseño", price: 100, type: "Extra" },
    { id: crypto.randomUUID(), name: "Decoloracion", price: 600, type: "Extra" },
    { id: crypto.randomUUID(), name: "Corte y barba express", price: 365, type: "Paquete" },
    { id: crypto.randomUUID(), name: "Corte, barba, mascarilla y lavado", price: 380, type: "Paquete" },
    { id: crypto.randomUUID(), name: "Corte, barba, mascarilla, tinte y lavado", price: 400, type: "Paquete" }

  ],
  barbers: ["Peke", "Alfonso", "Manos puercas"],
  appointments: [],
  sales: []
};

let state = loadState();
let cart = [];

const money = value => `$${Number(value).toLocaleString("es-MX")}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

function loadState() {
  const saved = localStorage.getItem(STORE_KEY);
  return saved ? JSON.parse(saved) : structuredClone(defaultState);
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function $(selector) {
  return document.querySelector(selector);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

function renderSelects() {
  document.querySelectorAll('select[name="barber"]').forEach(select => {
    select.innerHTML = state.barbers.map(name => `<option>${name}</option>`).join("");
  });

  const serviceOptions = state.services
    .map(service => `<option value="${service.id}">${service.name} - ${money(service.price)}</option>`)
    .join("");
  $('select[name="serviceId"]').innerHTML = serviceOptions;
}

function renderShell() {
  const formatter = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });
  $("#todayLabel").textContent = formatter.format(new Date());
  const salesToday = state.sales.filter(sale => sale.date === todayISO());
  $("#todaySales").textContent = money(salesToday.reduce((sum, sale) => sum + sale.total, 0));
  $("#activeAppointments").textContent = state.appointments.filter(item => !["atendida", "cancelada"].includes(item.status)).length;
}

function renderAppointments() {
  const query = $("#appointmentSearch").value.trim().toLowerCase();
  const rows = state.appointments
    .filter(item => `${item.customer} ${item.serviceName} ${item.barber}`.toLowerCase().includes(query))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .map(item => `
      <tr>
        <td><strong>${item.customer}</strong><small>${item.phone || "Sin telefono"}</small></td>
        <td>${item.serviceName}<br><small>${money(item.price)}</small></td>
        <td>${item.barber}</td>
        <td>${item.date}<br><small>${item.time}</small></td>
        <td><span class="status ${item.status}">${item.status}</span></td>
        <td>
          <div class="row-actions">
            <button class="chip-button" data-action="confirm" data-id="${item.id}">Confirmar</button>
            <button class="chip-button pay" data-action="charge" data-id="${item.id}">Cobrar</button>
            <button class="chip-button danger" data-action="cancel" data-id="${item.id}">Cancelar</button>
          </div>
        </td>
      </tr>
    `).join("");

  $("#appointmentRows").innerHTML = rows || `<tr><td colspan="6">No hay citas registradas.</td></tr>`;
}

function renderServices() {
  $("#cashierServices").innerHTML = state.services.map(service => `
    <button class="service-card" data-service="${service.id}">
      <strong>${service.name}</strong>
      <span>${service.type}</span>
      <b>${money(service.price)}</b>
    </button>
  `).join("");

  $("#serviceList").innerHTML = state.services.map(service => `
    <div class="price-item">
      <div>
        <strong>${service.name}</strong>
        <span>${service.type}</span>
      </div>
      <strong>${money(service.price)}</strong>
    </div>
  `).join("");
}

function renderCart() {
  if (!cart.length) {
    $("#cartItems").innerHTML = `<div class="cart-empty">Selecciona servicios para cobrar.</div>`;
  } else {
    $("#cartItems").innerHTML = cart.map((item, index) => `
      <div class="cart-item">
        <div>
          <strong>${item.name}</strong>
          <span>${money(item.price)}</span>
        </div>
        <button class="icon-button" type="button" data-remove="${index}" title="Quitar">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    `).join("");
  }

  $("#cartTotal").textContent = money(cart.reduce((sum, item) => sum + item.price, 0));
}

function renderShift() {
  const salesToday = state.sales.filter(sale => sale.date === todayISO());
  const total = salesToday.reduce((sum, sale) => sum + sale.total, 0);
  const byMethod = method => salesToday.filter(sale => sale.payment === method).reduce((sum, sale) => sum + sale.total, 0);

  $("#shiftSummary").innerHTML = [
    ["Total", money(total)],
    ["Efectivo", money(byMethod("Efectivo"))],
    ["Tarjeta", money(byMethod("Tarjeta"))],
    ["Transferencia", money(byMethod("Transferencia"))],
    ["Servicios", salesToday.reduce((sum, sale) => sum + sale.items.length, 0)]
  ].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join("");

  $("#saleRows").innerHTML = salesToday.map(sale => `
    <tr>
      <td>${sale.time}</td>
      <td>${sale.customer || "Publico general"}</td>
      <td>${sale.items.map(item => item.name).join(", ")}</td>
      <td>${sale.barber}</td>
      <td>${sale.payment}</td>
      <td><strong>${money(sale.total)}</strong></td>
    </tr>
  `).join("") || `<tr><td colspan="6">Todavia no hay ventas en este turno.</td></tr>`;
}

function renderAll() {
  renderSelects();
  renderShell();
  renderAppointments();
  renderServices();
  renderCart();
  renderShift();
}

function switchView(view) {
  document.querySelectorAll(".view").forEach(item => item.classList.toggle("active", item.id === view));
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  $("#viewTitle").textContent = document.querySelector(`[data-view="${view}"]`).textContent.trim();
}

function printBlock(html) {
  const node = document.createElement("section");
  node.className = "print-area";
  node.innerHTML = html;
  document.body.appendChild(node);
  window.print();
  node.remove();
}

function saleTicket(sale) {
  return `
    <h2 style="text-align:center;margin:0">BIZANTINO</h2>
    <p style="text-align:center;margin:0 0 10px">Barberia</p>
    <hr>
    <p>Folio: ${sale.id.slice(0, 8).toUpperCase()}<br>Fecha: ${sale.date} ${sale.time}<br>Barbero: ${sale.barber}</p>
    <p>Cliente: ${sale.customer || "Publico general"}</p>
    <hr>
    ${sale.items.map(item => `<p style="display:flex;justify-content:space-between"><span>${item.name}</span><strong>${money(item.price)}</strong></p>`).join("")}
    <hr>
    <h3 style="display:flex;justify-content:space-between"><span>Total</span><span>${money(sale.total)}</span></h3>
    <p>Pago: ${sale.payment}</p>
    <p style="text-align:center">Gracias por su visita</p>
  `;
}

function shiftTicket() {
  const salesToday = state.sales.filter(sale => sale.date === todayISO());
  const total = salesToday.reduce((sum, sale) => sum + sale.total, 0);
  return `
    <h2 style="text-align:center;margin:0">BIZANTINO</h2>
    <p style="text-align:center;margin:0 0 10px">Corte de turno</p>
    <hr>
    <p>Fecha: ${todayISO()}<br>Ventas: ${salesToday.length}</p>
    ${salesToday.map(sale => `<p>${sale.time} ${sale.payment}<br>${sale.items.map(item => item.name).join(", ")}<br><strong>${money(sale.total)}</strong></p>`).join("")}
    <hr>
    <h3>Total: ${money(total)}</h3>
  `;
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view]");
  if (nav) switchView(nav.dataset.view);

  const serviceButton = event.target.closest("[data-service]");
  if (serviceButton) {
    const service = state.services.find(item => item.id === serviceButton.dataset.service);
    cart.push({ id: service.id, name: service.name, price: service.price });
    renderCart();
  }

  const remove = event.target.closest("[data-remove]");
  if (remove) {
    cart.splice(Number(remove.dataset.remove), 1);
    renderCart();
  }

  const action = event.target.closest("[data-action]");
  if (action) {
    const appointment = state.appointments.find(item => item.id === action.dataset.id);
    if (action.dataset.action === "confirm") appointment.status = "confirmada";
    if (action.dataset.action === "cancel") appointment.status = "cancelada";
    if (action.dataset.action === "charge") {
      cart = [{ id: appointment.serviceId, name: appointment.serviceName, price: appointment.price }];
      $("#saleForm").customer.value = appointment.customer;
      $("#saleForm").barber.value = appointment.barber;
      appointment.status = "atendida";
      switchView("cashier");
    }
    saveState();
    renderAll();
  }
});

$("#quickAppointment").addEventListener("click", () => switchView("appointments"));
$("#appointmentSearch").addEventListener("input", renderAppointments);
$("#clearCart").addEventListener("click", () => { cart = []; renderCart(); });
$("#printShift").addEventListener("click", () => printBlock(shiftTicket()));

$("#appointmentForm").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const service = state.services.find(item => item.id === form.serviceId.value);
  state.appointments.push({
    id: crypto.randomUUID(),
    customer: form.customer.value.trim(),
    phone: form.phone.value.trim(),
    date: form.date.value,
    time: form.time.value,
    barber: form.barber.value,
    serviceId: service.id,
    serviceName: service.name,
    price: service.price,
    status: "pendiente"
  });
  form.reset();
  form.date.value = todayISO();
  form.time.value = nowTime();
  saveState();
  renderAll();
  showToast("Cita guardada");
});

$("#serviceForm").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  state.services.push({
    id: crypto.randomUUID(),
    name: form.name.value.trim(),
    price: Number(form.price.value),
    type: form.type.value
  });
  form.reset();
  saveState();
  renderAll();
  showToast("Servicio agregado");
});

$("#saleForm").addEventListener("submit", event => {
  event.preventDefault();
  if (!cart.length) {
    showToast("Agrega al menos un servicio");
    return;
  }

  const form = event.currentTarget;
  const sale = {
    id: crypto.randomUUID(),
    date: todayISO(),
    time: nowTime(),
    customer: form.customer.value.trim(),
    barber: form.barber.value,
    payment: form.payment.value,
    items: [...cart],
    total: cart.reduce((sum, item) => sum + item.price, 0)
  };

  state.sales.push(sale);
  cart = [];
  form.reset();
  saveState();
  renderAll();
  printBlock(saleTicket(sale));
  showToast("Venta registrada");
});

$("#appointmentForm").date.value = todayISO();
$("#appointmentForm").time.value = nowTime();
renderAll();
