const STORE_KEY = "bizantino-barberia-v1";
const API_BASE_URL = "http://127.0.0.1:8000/api";

const serviceTypeToApi = {
  Servicio: "SERVICE",
  Paquete: "PACKAGE",
  Extra: "EXTRA"
};

const serviceTypeFromApi = {
  SERVICE: "Servicio",
  PACKAGE: "Paquete",
  EXTRA: "Extra"
};

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
    { id: crypto.randomUUID(), name: "Decoloración", price: 600, type: "Extra" },
    { id: crypto.randomUUID(), name: "Corte y barba express", price: 365, type: "Paquete" },
    { id: crypto.randomUUID(), name: "Corte, barba, mascarilla y lavado", price: 380, type: "Paquete" },
    { id: crypto.randomUUID(), name: "Corte, barba, mascarilla, tinte y lavado", price: 400, type: "Paquete" }

  ],
  barbers: ["Peke", "Alfonso", "Manos puercas"],
  customers: [],
  appointments: [],
  sales: []
};

let state = loadState();
let cart = [];
let catalogServices = [];
let catalogBarbers = [];
let catalogCustomers = [];

const moneyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});
const money = value => moneyFormatter.format(Number(value));
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);
const escapeHtml = value => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function loadState() {
  const saved = localStorage.getItem(STORE_KEY);
  return saved ? JSON.parse(saved) : structuredClone(defaultState);
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

async function loadServicesFromApi() {
  const response = await fetch(`${API_BASE_URL}/services`);
  if (!response.ok) throw new Error("No fue posible consultar el catálogo");

  const services = await response.json();
  catalogServices = services.map(service => ({
    id: String(service.id),
    name: service.name,
    price: Number(service.price),
    type: serviceTypeFromApi[service.type],
    active: service.active,
    displayOrder: service.display_order
  }));
  state.services = catalogServices.filter(service => service.active);
  saveState();
}

async function loadBarbersFromApi() {
  const response = await fetch(`${API_BASE_URL}/barbers`);
  if (!response.ok) throw new Error("No fue posible consultar los barberos");

  const barbers = await response.json();
  catalogBarbers = barbers.map(barber => ({
    id: String(barber.id),
    name: barber.name,
    active: barber.active
  }));
  state.barbers = catalogBarbers
    .filter(barber => barber.active)
    .map(barber => barber.name);
  saveState();
}

async function loadCustomersFromApi() {
  const response = await fetch(`${API_BASE_URL}/customers`);
  if (!response.ok) throw new Error("No fue posible consultar los clientes");

  catalogCustomers = (await response.json()).map(customer => ({
    id: String(customer.id),
    name: customer.name,
    phone: customer.phone || "",
    notes: customer.notes || "",
    active: customer.active
  }));
  state.customers = catalogCustomers.filter(customer => customer.active);
  saveState();
}

async function ensureCustomer(name, phone) {
  const normalizedName = name.trim();
  const normalizedPhone = phone.trim();
  if (!normalizedName && !normalizedPhone) return null;
  if (normalizedPhone.length !== 10) {
    throw new Error("El teléfono debe tener 10 dígitos");
  }

  const existingCustomer = catalogCustomers.find(
    customer => customer.phone === normalizedPhone
  );
  if (existingCustomer) {
    if (!existingCustomer.active) {
      const response = await fetch(
        `${API_BASE_URL}/customers/${existingCustomer.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true })
        }
      );
      if (!response.ok) throw new Error("No fue posible reactivar al cliente");
      await loadCustomersFromApi();
      return catalogCustomers.find(customer => customer.id === existingCustomer.id);
    }
    return existingCustomer;
  }
  if (!normalizedName) {
    throw new Error("Captura el nombre del cliente nuevo");
  }

  const response = await fetch(`${API_BASE_URL}/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: normalizedName,
      phone: normalizedPhone || null,
      notes: null,
      active: true
    })
  });
  if (!response.ok) throw new Error("No fue posible registrar al cliente");

  const customer = await response.json();
  await loadCustomersFromApi();
  return {
    id: String(customer.id),
    name: customer.name,
    phone: customer.phone || "",
    notes: customer.notes || "",
    active: customer.active
  };
}

function resetServiceForm() {
  const form = $("#serviceForm");
  form.reset();
  form.serviceId.value = "";
  $("#serviceFormTitle").textContent = "Agregar servicio";
  $("#serviceSubmitLabel").textContent = "Agregar";
  $("#cancelServiceEdit").classList.add("hidden");
}

function resetBarberForm() {
  const form = $("#barberForm");
  form.reset();
  form.barberId.value = "";
  $("#barberFormTitle").textContent = "Agregar barbero";
  $("#barberSubmitLabel").textContent = "Agregar";
  $("#cancelBarberEdit").classList.add("hidden");
}

function resetCustomerForm() {
  const form = $("#customerForm");
  form.reset();
  form.customerId.value = "";
  $("#customerFormTitle").textContent = "Agregar cliente";
  $("#customerSubmitLabel").textContent = "Agregar";
  $("#cancelCustomerEdit").classList.add("hidden");
}

function autofillCustomerByPhone(form) {
  const phone = form.phone.value;
  const customer = phone.length === 10
    ? catalogCustomers.find(item => item.active && item.phone === phone)
    : null;

  if (customer) {
    form.customer.value = customer.name;
    form.customer.readOnly = true;
    form.customer.dataset.customerId = customer.id;
    showToast("Cliente encontrado");
  } else {
    if (form.customer.dataset.customerId) {
      form.customer.value = "";
      delete form.customer.dataset.customerId;
    }
    form.customer.readOnly = false;
  }
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

  $("#customerPhoneOptions").innerHTML = (state.customers || [])
    .map(customer =>
      `<option value="${escapeHtml(customer.phone)}">${escapeHtml(customer.name)}</option>`
    )
    .join("");
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

  const catalog = catalogServices.length ? catalogServices : state.services;
  $("#serviceList").innerHTML = catalog.map(service => `
    <div class="price-item ${service.active === false ? "inactive" : ""}">
      <div>
        <strong>${service.name}</strong>
        <span>${service.type}${service.active === false ? " · Inactivo" : ""}</span>
      </div>
      <div class="catalog-actions">
        <strong>${money(service.price)}</strong>
        <button class="chip-button" type="button" data-edit-service="${service.id}">Editar</button>
        <button class="chip-button ${service.active === false ? "pay" : "danger"}" type="button"
          data-toggle-service="${service.id}">
          ${service.active === false ? "Activar" : "Desactivar"}
        </button>
      </div>
    </div>
  `).join("");
}

function renderBarbers() {
  const barbers = catalogBarbers.length
    ? catalogBarbers
    : state.barbers.map((name, index) => ({
        id: String(index),
        name,
        active: true
      }));

  $("#barberList").innerHTML = barbers.map(barber => `
    <div class="price-item ${barber.active ? "" : "inactive"}">
      <div>
        <strong>${barber.name}</strong>
        <span>${barber.active ? "Activo" : "Inactivo"}</span>
      </div>
      <div class="catalog-actions">
        <button class="chip-button" type="button" data-edit-barber="${barber.id}">Editar</button>
        <button class="chip-button ${barber.active ? "danger" : "pay"}" type="button"
          data-toggle-barber="${barber.id}">
          ${barber.active ? "Desactivar" : "Activar"}
        </button>
      </div>
    </div>
  `).join("");
}

function renderCustomers() {
  const query = ($("#customerSearch")?.value || "").trim().toLowerCase();
  const customers = catalogCustomers.filter(customer =>
    `${customer.name} ${customer.phone}`.toLowerCase().includes(query)
  );

  $("#customerList").innerHTML = customers.map(customer => `
    <div class="price-item ${customer.active ? "" : "inactive"}">
      <div>
        <strong>${escapeHtml(customer.name)}</strong>
        <span>${escapeHtml(customer.phone || "Sin teléfono")} · ${customer.active ? "Activo" : "Inactivo"}</span>
      </div>
      <div class="catalog-actions">
        <button class="chip-button" type="button" data-edit-customer="${customer.id}">Editar</button>
        <button class="chip-button ${customer.active ? "danger" : "pay"}" type="button"
          data-toggle-customer="${customer.id}">
          ${customer.active ? "Desactivar" : "Activar"}
        </button>
      </div>
    </div>
  `).join("") || `<div class="cart-empty">No hay clientes registrados.</div>`;
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
  renderBarbers();
  renderCustomers();
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

document.addEventListener("click", async event => {
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

  const editService = event.target.closest("[data-edit-service]");
  if (editService) {
    const service = catalogServices.find(item => item.id === editService.dataset.editService);
    if (service) {
      const form = $("#serviceForm");
      form.serviceId.value = service.id;
      form.name.value = service.name;
      form.price.value = service.price;
      form.type.value = service.type;
      $("#serviceFormTitle").textContent = "Editar servicio";
      $("#serviceSubmitLabel").textContent = "Guardar cambios";
      $("#cancelServiceEdit").classList.remove("hidden");
      form.name.focus();
    }
  }

  const toggleService = event.target.closest("[data-toggle-service]");
  if (toggleService) {
    const service = catalogServices.find(item => item.id === toggleService.dataset.toggleService);
    if (!service) return;
    if (service.active && !window.confirm(`¿Desactivar "${service.name}"?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/services/${service.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !service.active })
      });
      if (!response.ok) throw new Error("No fue posible cambiar el estado");
      await loadServicesFromApi();
      renderAll();
      showToast(service.active ? "Servicio desactivado" : "Servicio activado");
    } catch (error) {
      console.error(error);
      showToast("No se pudo actualizar el servicio");
    }
  }

  const editBarber = event.target.closest("[data-edit-barber]");
  if (editBarber) {
    const barber = catalogBarbers.find(item => item.id === editBarber.dataset.editBarber);
    if (barber) {
      const form = $("#barberForm");
      form.barberId.value = barber.id;
      form.name.value = barber.name;
      $("#barberFormTitle").textContent = "Editar barbero";
      $("#barberSubmitLabel").textContent = "Guardar cambios";
      $("#cancelBarberEdit").classList.remove("hidden");
      form.name.focus();
    }
  }

  const toggleBarber = event.target.closest("[data-toggle-barber]");
  if (toggleBarber) {
    const barber = catalogBarbers.find(item => item.id === toggleBarber.dataset.toggleBarber);
    if (!barber) return;
    if (barber.active && !window.confirm(`¿Desactivar a "${barber.name}"?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/barbers/${barber.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !barber.active })
      });
      if (!response.ok) throw new Error("No fue posible cambiar el estado");
      await loadBarbersFromApi();
      renderAll();
      showToast(barber.active ? "Barbero desactivado" : "Barbero activado");
    } catch (error) {
      console.error(error);
      showToast("No se pudo actualizar el barbero");
    }
  }

  const editCustomer = event.target.closest("[data-edit-customer]");
  if (editCustomer) {
    const customer = catalogCustomers.find(item => item.id === editCustomer.dataset.editCustomer);
    if (customer) {
      const form = $("#customerForm");
      form.customerId.value = customer.id;
      form.name.value = customer.name;
      form.phone.value = customer.phone;
      form.notes.value = customer.notes;
      $("#customerFormTitle").textContent = "Editar cliente";
      $("#customerSubmitLabel").textContent = "Guardar cambios";
      $("#cancelCustomerEdit").classList.remove("hidden");
      form.name.focus();
    }
  }

  const toggleCustomer = event.target.closest("[data-toggle-customer]");
  if (toggleCustomer) {
    const customer = catalogCustomers.find(item => item.id === toggleCustomer.dataset.toggleCustomer);
    if (!customer) return;
    if (customer.active && !window.confirm(`¿Desactivar a "${customer.name}"?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/customers/${customer.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !customer.active })
      });
      if (!response.ok) throw new Error("No fue posible cambiar el estado");
      await loadCustomersFromApi();
      renderAll();
      showToast(customer.active ? "Cliente desactivado" : "Cliente activado");
    } catch (error) {
      console.error(error);
      showToast("No se pudo actualizar el cliente");
    }
  }

  const action = event.target.closest("[data-action]");
  if (action) {
    const appointment = state.appointments.find(item => item.id === action.dataset.id);
    if (action.dataset.action === "confirm") appointment.status = "confirmada";
    if (action.dataset.action === "cancel") appointment.status = "cancelada";
    if (action.dataset.action === "charge") {
      cart = [{ id: appointment.serviceId, name: appointment.serviceName, price: appointment.price }];
      $("#saleForm").customer.value = appointment.customer;
      $("#saleForm").phone.value = appointment.phone || "";
      $("#saleForm").customer.readOnly = Boolean(appointment.customerId);
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
$("#cancelServiceEdit").addEventListener("click", resetServiceForm);
$("#cancelBarberEdit").addEventListener("click", resetBarberForm);
$("#cancelCustomerEdit").addEventListener("click", resetCustomerForm);
$("#customerSearch").addEventListener("input", renderCustomers);
$("#appointmentForm").phone.addEventListener("input", () =>
  autofillCustomerByPhone($("#appointmentForm"))
);
$("#saleForm").phone.addEventListener("input", () =>
  autofillCustomerByPhone($("#saleForm"))
);

$("#appointmentForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const service = state.services.find(item => item.id === form.serviceId.value);
  try {
    const customer = await ensureCustomer(form.customer.value, form.phone.value);
    state.appointments.push({
      id: crypto.randomUUID(),
      customerId: customer?.id || null,
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
    form.customer.readOnly = false;
    delete form.customer.dataset.customerId;
    form.date.value = todayISO();
    form.time.value = nowTime();
    saveState();
    renderAll();
    showToast("Cita y cliente guardados");
  } catch (error) {
    console.error(error);
    showToast("No se pudo registrar la cita");
  }
});

$("#serviceForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const serviceId = form.serviceId.value;
  const currentService = catalogServices.find(item => item.id === serviceId);
  const nextOrder = catalogServices.length
    ? Math.max(...catalogServices.map(item => item.displayOrder || 0)) + 1
    : 1;

  try {
    const response = await fetch(
      serviceId ? `${API_BASE_URL}/services/${serviceId}` : `${API_BASE_URL}/services`,
      {
      method: serviceId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.value.trim(),
        price: Number(form.price.value),
        type: serviceTypeToApi[form.type.value],
        active: currentService?.active ?? true,
        display_order: currentService?.displayOrder ?? nextOrder
      })
    });

    if (!response.ok) throw new Error("No fue posible guardar el servicio");

    resetServiceForm();
    await loadServicesFromApi();
    renderAll();
    showToast(serviceId ? "Servicio actualizado" : "Servicio agregado");
  } catch (error) {
    console.error(error);
    showToast("No se pudo conectar con el servidor");
  }
});

$("#barberForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const barberId = form.barberId.value;
  const currentBarber = catalogBarbers.find(item => item.id === barberId);

  try {
    const response = await fetch(
      barberId ? `${API_BASE_URL}/barbers/${barberId}` : `${API_BASE_URL}/barbers`,
      {
        method: barberId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.value.trim(),
          active: currentBarber?.active ?? true
        })
      }
    );
    if (!response.ok) throw new Error("No fue posible guardar el barbero");

    resetBarberForm();
    await loadBarbersFromApi();
    renderAll();
    showToast(barberId ? "Barbero actualizado" : "Barbero agregado");
  } catch (error) {
    console.error(error);
    showToast("No se pudo guardar el barbero");
  }
});

$("#customerForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const customerId = form.customerId.value;
  const currentCustomer = catalogCustomers.find(item => item.id === customerId);

  try {
    const response = await fetch(
      customerId
        ? `${API_BASE_URL}/customers/${customerId}`
        : `${API_BASE_URL}/customers`,
      {
        method: customerId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.value.trim(),
          phone: form.phone.value.trim() || null,
          notes: form.notes.value.trim() || null,
          active: currentCustomer?.active ?? true
        })
      }
    );
    if (!response.ok) throw new Error("No fue posible guardar el cliente");

    resetCustomerForm();
    await loadCustomersFromApi();
    renderAll();
    showToast(customerId ? "Cliente actualizado" : "Cliente agregado");
  } catch (error) {
    console.error(error);
    showToast("No se pudo guardar el cliente");
  }
});

$("#saleForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!cart.length) {
    showToast("Agrega al menos un servicio");
    return;
  }

  const form = event.currentTarget;
  try {
    const customer = await ensureCustomer(form.customer.value, form.phone.value);
    const sale = {
      id: crypto.randomUUID(),
      date: todayISO(),
      time: nowTime(),
      customerId: customer?.id || null,
      customer: form.customer.value.trim(),
      phone: form.phone.value.trim(),
      barber: form.barber.value,
      payment: form.payment.value,
      items: [...cart],
      total: cart.reduce((sum, item) => sum + item.price, 0)
    };

    state.sales.push(sale);
    cart = [];
    form.reset();
    form.customer.readOnly = false;
    delete form.customer.dataset.customerId;
    saveState();
    renderAll();
    printBlock(saleTicket(sale));
    showToast(customer ? "Venta y cliente guardados" : "Venta registrada");
  } catch (error) {
    console.error(error);
    showToast("No se pudo registrar la venta");
  }
});

async function initialize() {
  $("#appointmentForm").date.value = todayISO();
  $("#appointmentForm").time.value = nowTime();
  renderAll();

  try {
    await Promise.all([
      loadServicesFromApi(),
      loadBarbersFromApi(),
      loadCustomersFromApi()
    ]);
    renderAll();
  } catch (error) {
    console.error(error);
    showToast("Catálogo sin conexión; se muestran datos guardados");
  }
}

initialize();
