const STORE_KEY = "bizantino-barberia-v1";
const ACTIVE_VIEW_KEY = "bizantino-active-view";
const isLocalFrontendServer = ["127.0.0.1", "localhost"].includes(window.location.hostname)
  && window.location.port !== "8000";
const deploymentBasePath = window.location.pathname.startsWith("/bizantino/")
  ? "/bizantino"
  : "";
const API_BASE_URL = isLocalFrontendServer
  ? "http://127.0.0.1:8000/api"
  : `${window.location.origin}${deploymentBasePath}/api`;
const apiFileUrl = path => `${API_BASE_URL.replace(/\/api$/, "")}${path}`;
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const response = await originalFetch(input, { ...init, credentials: "include" });
  const url = typeof input === "string" ? input : input.url;
  if (response.status === 401 && !url.endsWith("/auth/login")) showLogin();
  return response;
};

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
let catalogReceptionists = [];
let catalogCustomers = [];
let systemUsers = [];
let pendingAppointmentId = null;
let appointmentView = "active";
let birthdayDiscountServiceId = null;
let currentShift = null;
let shiftHistory = [];
let pendingCancellationAppointmentId = null;
let pendingConfirmationAppointmentId = null;
let appointmentSelectedServiceIds = [];
let confirmationSelectedServiceIds = [];
let servicePickerTarget = null;
let servicePickerDraftIds = new Set();
let pendingCloseShiftData = null;
let authenticatedUser = null;
let suggestedStartingReceipt = null;
let currentAttendance = [];
let attendanceHistory = [];
let workSchedules = [];
let scheduleCopySourceCell = null;
let selectedSchedulePeople = new Set();
let scheduleSelectionContext = "";
let pendingAttendanceStatus = null;

const appointmentStatusFromApi = {
  PENDING: "pendiente",
  CONFIRMED: "confirmada",
  COMPLETED: "atendida",
  CANCELLED: "cancelada"
};

const appointmentStatusToApi = {
  pendiente: "PENDING",
  confirmada: "CONFIRMED",
  atendida: "COMPLETED",
  cancelada: "CANCELLED"
};

const paymentMethodLabels = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia"
};

const moneyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});
const money = value => moneyFormatter.format(Number(value));

function formatBirthDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function parseBirthDate(value) {
  const text = value.trim();
  if (!text) return null;
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw new Error("La fecha de nacimiento debe escribirse como DD/MM/AAAA");
  const [, day, month, year] = match;
  const candidate = new Date(`${year}-${month}-${day}T12:00:00`);
  if (
    Number.isNaN(candidate.getTime())
    || candidate.getFullYear() !== Number(year)
    || candidate.getMonth() + 1 !== Number(month)
    || candidate.getDate() !== Number(day)
    || `${year}-${month}-${day}` > todayISO()
  ) {
    throw new Error("La fecha de nacimiento no es válida");
  }
  return `${year}-${month}-${day}`;
}
const dateToLocalISO = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const todayISO = () => dateToLocalISO(new Date());
const currentWeekStartISO = () => {
  const date = new Date();
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - daysSinceMonday);
  return dateToLocalISO(date);
};
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

async function loadReceptionistsFromApi() {
  const response = await fetch(`${API_BASE_URL}/receptionists`);
  if (!response.ok) throw new Error("No fue posible consultar las recepcionistas");
  catalogReceptionists = (await response.json()).map(receptionist => ({
    id: String(receptionist.id),
    name: receptionist.name,
    active: receptionist.active
  }));
}

async function loadCustomersFromApi() {
  const response = await fetch(`${API_BASE_URL}/customers`);
  if (!response.ok) throw new Error("No fue posible consultar los clientes");

  catalogCustomers = (await response.json()).map(customer => ({
    id: String(customer.id),
    name: customer.name,
    phone: customer.phone || "",
    birthDate: customer.birth_date || "",
    notes: customer.notes || "",
    active: customer.active
  }));
  state.customers = catalogCustomers.filter(customer => customer.active);
  saveState();
}

async function loadAppointmentsFromApi() {
  const response = await fetch(`${API_BASE_URL}/appointments`);
  if (!response.ok) throw new Error("No fue posible consultar las citas");

  state.appointments = (await response.json()).map(appointment => ({
    id: String(appointment.id),
    customerId: String(appointment.customer_id),
    customer: appointment.customer_name,
    phone: appointment.customer_phone,
    birthDate: appointment.customer_birth_date || "",
    date: appointment.appointment_date,
    time: appointment.appointment_time.slice(0, 5),
    barberId: appointment.barber_id ? String(appointment.barber_id) : null,
    barber: appointment.barber_name || "Por asignar",
    serviceIds: (appointment.service_ids || []).map(String),
    serviceId: appointment.service_ids?.length
      ? String(appointment.service_ids[0])
      : (appointment.service_id ? String(appointment.service_id) : null),
    serviceName: appointment.service_names?.length
      ? appointment.service_names.join(", ")
      : (appointment.service_name || "Por definir"),
    price: appointment.price === null ? null : Number(appointment.price),
    status: appointmentStatusFromApi[appointment.status],
    cancellationNote: appointment.cancellation_note || "",
    cancelledAt: appointment.cancelled_at || null
  }));
  saveState();
}

function mapSaleFromApi(sale) {
  const soldAt = new Date(sale.sold_at);
  return {
    id: String(sale.id),
    folio: sale.folio,
    date: dateToLocalISO(soldAt),
    time: soldAt.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }),
    customerId: sale.customer_id ? String(sale.customer_id) : null,
    customer: sale.customer_name || "",
    barberId: String(sale.barber_id),
    barber: sale.barber_name,
    appointmentId: sale.appointment_id ? String(sale.appointment_id) : null,
    shiftId: sale.shift_id ? String(sale.shift_id) : null,
    receiptNumber: sale.receipt_number,
    discount: Number(sale.discount || 0),
    discountReason: sale.discount_reason || null,
    status: sale.status || "COMPLETED",
    cancellationReason: sale.cancellation_reason || "",
    cancelledAt: sale.cancelled_at || null,
    receiptCorrections: (sale.receipt_corrections || []).map(correction => ({
      oldReceiptNumber: correction.old_receipt_number,
      newReceiptNumber: correction.new_receipt_number,
      reason: correction.reason,
      correctedByName: correction.corrected_by_name || "Usuario eliminado",
      correctedAt: correction.corrected_at
    })),
    payment: sale.payments.length > 1
      ? "Mixto"
      : paymentMethodLabels[sale.payments[0]?.method] || "Sin pago",
    payments: sale.payments.map(payment => ({
      method: payment.method,
      amount: Number(payment.amount),
      tenderedAmount: payment.tendered_amount === null
        ? null
        : Number(payment.tendered_amount),
      changeAmount: payment.change_amount === null
        ? null
        : Number(payment.change_amount)
    })),
    items: sale.items.map(item => ({
      id: String(item.service_id),
      name: item.service_name,
      price: Number(item.unit_price),
      quantity: item.quantity
    })),
    total: Number(sale.total)
  };
}

async function loadSalesFromApi() {
  const response = await fetch(`${API_BASE_URL}/sales`);
  if (!response.ok) throw new Error("No fue posible consultar las ventas");
  state.sales = (await response.json()).map(mapSaleFromApi);
  saveState();
}

async function loadCurrentShiftFromApi() {
  const response = await fetch(`${API_BASE_URL}/shifts/current`);
  if (!response.ok) throw new Error("No fue posible consultar el turno");
  currentShift = await response.json();
}

async function loadShiftHistoryFromApi() {
  const response = await fetch(`${API_BASE_URL}/shifts`);
  if (!response.ok) throw new Error("No fue posible consultar el historial de turnos");
  shiftHistory = await response.json();
}

async function loadAttendanceFromApi() {
  const [currentResponse, historyResponse, schedulesResponse] = await Promise.all([
    fetch(`${API_BASE_URL}/attendance/current`),
    fetch(`${API_BASE_URL}/attendance/history`),
    fetch(`${API_BASE_URL}/attendance/schedules`)
  ]);
  if (!currentResponse.ok || !historyResponse.ok || !schedulesResponse.ok) {
    throw new Error("No fue posible consultar el checador");
  }
  currentAttendance = await currentResponse.json();
  attendanceHistory = await historyResponse.json();
  workSchedules = await schedulesResponse.json();
}

async function loadUsersFromApi() {
  if (authenticatedUser?.role !== "ADMIN") {
    systemUsers = [];
    return;
  }
  const response = await fetch(`${API_BASE_URL}/users`);
  if (!response.ok) throw new Error("No fue posible consultar las cuentas");
  systemUsers = await response.json();
}

async function loadSuggestedReceiptFromApi() {
  const response = await fetch(`${API_BASE_URL}/shifts/next-receipt`);
  if (!response.ok) throw new Error("No fue posible consultar el siguiente folio");
  suggestedStartingReceipt = await response.json();
  const input = $("#openShiftForm").startingReceiptNumber;
  input.value = suggestedStartingReceipt.next_receipt_number;
  input.readOnly = false;
  $("#startingReceiptHelp").textContent =
    `Sugerido: ${suggestedStartingReceipt.next_receipt_number}. Puedes modificarlo antes de abrir el turno.`;
}

async function updateAppointmentStatus(appointmentId, status, cancellationNote = null, barberId = null, serviceIds = []) {
  const response = await fetch(
    `${API_BASE_URL}/appointments/${appointmentId}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        cancellation_note: cancellationNote,
        barber_id: barberId ? Number(barberId) : null,
        service_ids: serviceIds.map(Number)
      })
    }
  );
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.detail || "No fue posible actualizar la cita");
  }
}

async function ensureCustomer(name, phone, birthDate = "", customerId = null) {
  const normalizedName = name.trim();
  const normalizedPhone = phone.trim();
  const normalizedBirthDate = parseBirthDate(birthDate);
  if (!normalizedName && !normalizedPhone) return null;
  if (normalizedPhone.length !== 10) {
    throw new Error("El teléfono debe tener 10 dígitos");
  }

  const existingCustomer = catalogCustomers.find(customer =>
    customer.id === String(customerId || "")
  ) || catalogCustomers.find(customer =>
    customer.phone === normalizedPhone
      && customer.name.toLocaleLowerCase("es-MX") === normalizedName.toLocaleLowerCase("es-MX")
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
    if (normalizedBirthDate && normalizedBirthDate !== existingCustomer.birthDate) {
      const response = await fetch(`${API_BASE_URL}/customers/${existingCustomer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: existingCustomer.name,
          phone: existingCustomer.phone,
          birth_date: normalizedBirthDate,
          notes: existingCustomer.notes || null,
          active: true
        })
      });
      if (!response.ok) throw new Error("No fue posible guardar la fecha de nacimiento");
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
      birth_date: normalizedBirthDate,
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
    birthDate: customer.birth_date || "",
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

function resetAppointmentForm() {
  const form = $("#appointmentForm");
  form.reset();
  form.appointmentId.value = "";
  form.phone.disabled = false;
  form.customer.readOnly = false;
  form.birthDate.disabled = false;
  form.barber.disabled = false;
  delete form.customer.dataset.customerId;
  form.date.value = todayISO();
  form.time.value = nowTime();
  updateAppointmentBarberOptions();
  renderAppointmentServiceOptions();
  $("#appointmentFormTitle").textContent = "Nueva cita";
  $("#appointmentSubmitLabel").textContent = "Guardar cita";
  $("#saveAnotherAppointment").classList.remove("hidden");
  $("#saveAnotherAppointmentHelp").classList.remove("hidden");
  $("#cancelAppointmentEdit").classList.add("hidden");
  form.querySelector("[data-customer-choice-wrap]").classList.add("hidden");
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function appointmentConflicts(form, excludeId = null) {
  if (!form.barber.value) return null;
  const requestedStart = timeToMinutes(form.time.value);
  const requestedEnd = requestedStart + 15;
  return state.appointments.find(appointment => {
    const existingStart = timeToMinutes(appointment.time);
    const existingEnd = existingStart + 15;
    return appointment.id !== excludeId
      && appointment.barberId === form.barber.value
      && appointment.date === form.date.value
      && ["pendiente", "confirmada"].includes(appointment.status)
      && requestedStart < existingEnd
      && requestedEnd > existingStart;
  });
}

function resetBarberForm() {
  const form = $("#barberForm");
  form.reset();
  form.barberId.value = "";
  $("#barberFormTitle").textContent = "Agregar barbero";
  $("#barberSubmitLabel").textContent = "Agregar";
  $("#cancelBarberEdit").classList.add("hidden");
}

function resetReceptionistForm() {
  const form = $("#receptionistForm");
  form.reset();
  form.receptionistId.value = "";
  $("#receptionistFormTitle").textContent = "Agregar recepcionista";
  $("#receptionistSubmitLabel").textContent = "Agregar";
  $("#cancelReceptionistEdit").classList.add("hidden");
}

function resetUserForm() {
  const form = $("#userForm");
  form.reset();
  form.userId.value = "";
  form.password.required = true;
  $("#userFormTitle").textContent = "Crear cuenta";
  $("#userSubmitLabel").textContent = "Crear cuenta";
  $("#userPasswordHelp").textContent = "Obligatoria para una cuenta nueva.";
  $("#cancelUserEdit").classList.add("hidden");
}

function resetCustomerForm() {
  const form = $("#customerForm");
  form.reset();
  form.customerId.value = "";
  $("#customerFormTitle").textContent = "Agregar cliente";
  $("#customerSubmitLabel").textContent = "Agregar";
  $("#cancelCustomerEdit").classList.add("hidden");
}

function applyCustomerChoice(form, choice) {
  if (!choice || choice === "__new__") {
    if (form.customer.dataset.customerId) {
      form.customer.value = "";
      form.birthDate.value = "";
    }
    delete form.customer.dataset.customerId;
    form.customer.readOnly = false;
    return;
  }
  const customer = catalogCustomers.find(item => item.id === choice);
  if (!customer) return;
  form.customer.value = customer.name;
  form.customer.readOnly = true;
  form.customer.dataset.customerId = customer.id;
  form.birthDate.value = formatBirthDate(customer.birthDate);
  form.birthDate.disabled = false;
}

function autofillCustomerByPhone(form, chooseNew = false) {
  const phone = form.phone.value.trim();
  const matches = phone.length === 10
    ? catalogCustomers.filter(item => item.active && item.phone === phone)
    : [];
  const wrapper = form.querySelector("[data-customer-choice-wrap]");
  const select = form.customerChoice;
  if (matches.length) {
    const currentId = form.customer.dataset.customerId;
    select.innerHTML = matches.map(customer =>
      `<option value="${customer.id}">${escapeHtml(customer.name)}${customer.birthDate ? ` · ${formatBirthDate(customer.birthDate)}` : ""}</option>`
    ).join("") + `<option value="__new__">+ Agregar otra persona</option>`;
    wrapper.classList.remove("hidden");
    select.value = chooseNew
      ? "__new__"
      : (matches.some(customer => customer.id === currentId) ? currentId : matches[0].id);
    applyCustomerChoice(form, select.value);
    showToast(matches.length === 1 ? "Persona encontrada" : `${matches.length} personas usan este teléfono`);
  } else {
    wrapper.classList.add("hidden");
    applyCustomerChoice(form, "__new__");
  }
  if (form.id === "saleForm") {
    birthdayDiscountServiceId = null;
    renderCart();
  }
}

function isBirthdayOn(birthDate, targetDate = todayISO()) {
  if (!birthDate || !targetDate) return false;
  return birthDate.slice(5) === targetDate.slice(5);
}

function formatAppointmentDate(isoDate) {
  const target = new Date(`${isoDate}T12:00:00`);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = dateToLocalISO(tomorrow);
  if (isoDate === todayISO()) return "Hoy";
  if (isoDate === tomorrowISO) return "Mañana";
  const options = { weekday: "short", day: "numeric", month: "short" };
  if (target.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
  return new Intl.DateTimeFormat("es-MX", options)
    .format(target)
    .replace(",", "");
}

function currentSaleCustomer() {
  const form = $("#saleForm");
  const savedCustomer = catalogCustomers.find(customer => customer.id === form.customer.dataset.customerId)
    || catalogCustomers.find(customer =>
      customer.active
      && customer.phone === form.phone.value.trim()
      && customer.name.toLocaleLowerCase("es-MX") === form.customer.value.trim().toLocaleLowerCase("es-MX")
    );
  if (savedCustomer) return savedCustomer;

  const birthDate = parseBirthDate(form.birthDate.value);
  return birthDate ? {
    id: null,
    name: form.customer.value.trim(),
    phone: form.phone.value.trim(),
    birthDate
  } : null;
}

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const getCartSubtotal = () => roundMoney(
  cart.reduce((sum, item) => sum + Number(item.price), 0)
);
const getBirthdayDiscount = () => {
  return birthdayDiscountServiceId === "ALL" ? roundMoney(getCartSubtotal() / 2) : 0;
};

const userRoleLabels = {
  ADMIN: "Administradora",
  RECEPTION: "Recepcionista",
  SUPPORT: "Soporte · solo consulta"
};
const getCartTotal = () => roundMoney(getCartSubtotal() - getBirthdayDiscount());

function updatePaymentFields() {
  const form = $("#saleForm");
  const method = form.payment.value;
  const total = getCartTotal();
  $("#cashPaymentFields").classList.toggle("hidden", method !== "CASH");
  $("#mixedPaymentFields").classList.toggle("hidden", method !== "MIXED");

  const cashReceived = Number(form.cashReceived.value || total);
  $("#cashChange").textContent = money(Math.max(0, cashReceived - total));

  const assigned = roundMoney(
    Number(form.mixedCash.value || 0)
    + Number(form.mixedCard.value || 0)
    + Number(form.mixedTransfer.value || 0)
  );
  const remaining = roundMoney(total - assigned);
  $("#mixedPaymentStatus").textContent = remaining > 0
    ? "Falta asignar"
    : remaining < 0
      ? "Excede el total"
      : "Pago completo";
  $("#mixedPaymentRemaining").textContent = money(Math.abs(remaining));
}

function buildPayments(form, total) {
  const method = form.payment.value;
  if (method === "CASH") {
    const tendered = roundMoney(Number(form.cashReceived.value || total));
    if (tendered < total) throw new Error("El efectivo recibido es insuficiente");
    return [{ method: "CASH", amount: total, tendered_amount: tendered }];
  }
  if (method === "CARD" || method === "TRANSFER") {
    return [{ method, amount: total, tendered_amount: null }];
  }

  const values = [
    ["CASH", roundMoney(form.mixedCash.value)],
    ["CARD", roundMoney(form.mixedCard.value)],
    ["TRANSFER", roundMoney(form.mixedTransfer.value)]
  ].filter(([, amount]) => amount > 0);
  if (values.length < 2) {
    throw new Error("Un pago mixto requiere al menos dos métodos");
  }
  const assigned = roundMoney(values.reduce((sum, [, amount]) => sum + amount, 0));
  if (assigned !== total) {
    throw new Error("La suma de pagos no coincide con el total");
  }
  return values.map(([paymentMethod, amount]) => ({
    method: paymentMethod,
    amount,
    tendered_amount: paymentMethod === "CASH"
      ? roundMoney(Number(form.mixedCashReceived.value || amount))
      : null
  }));
}

function $(selector) {
  return document.querySelector(selector);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}

function renderSelects() {
  document.querySelectorAll('select[name="barber"]').forEach(select => {
    if (select.closest("#appointmentForm") || select.closest("#appointmentConfirmationForm")) return;
    const barbers = catalogBarbers.length
      ? catalogBarbers.filter(barber => barber.active)
      : state.barbers.map(name => ({ id: name, name }));
    select.innerHTML = barbers
      .map(barber => `<option value="${barber.id}">${escapeHtml(barber.name)}</option>`)
      .join("");
  });

  const saleBarberSelect = $("#saleForm select[name='barber']");
  if (currentShift && saleBarberSelect) {
    saleBarberSelect.innerHTML = currentShift.barbers
      .map(barber => `<option value="${barber.id}">${escapeHtml(barber.name)}</option>`)
      .join("");
  }
  updateAppointmentBarberOptions();

  renderAppointmentServiceOptions();

  $("#customerPhoneOptions").innerHTML = (state.customers || [])
    .map(customer =>
      `<option value="${escapeHtml(customer.phone)}">${escapeHtml(customer.name)}</option>`
    )
    .join("");

  const barberFilter = $("#salesBarberFilter");
  const selectedBarber = barberFilter.value || "ALL";
  barberFilter.innerHTML = `
    <option value="ALL">Todos los barberos</option>
    ${catalogBarbers.map(barber =>
      `<option value="${barber.id}">${escapeHtml(barber.name)}${barber.active ? "" : " (inactivo)"}</option>`
    ).join("")}
  `;
  if ([...barberFilter.options].some(option => option.value === selectedBarber)) {
    barberFilter.value = selectedBarber;
  }

  const receptionistSelect = $("#shiftReceptionistSelect");
  const selectedReceptionist = receptionistSelect.value;
  receptionistSelect.innerHTML = `
    <option value="">Selecciona una recepcionista</option>
    ${catalogReceptionists.filter(item => item.active).map(item =>
      `<option value="${item.id}">${escapeHtml(item.name)}</option>`
    ).join("")}
  `;
  if ([...receptionistSelect.options].some(option => option.value === selectedReceptionist)) {
    receptionistSelect.value = selectedReceptionist;
  }
}

function serviceSelectionSummary(selectedIds) {
  const services = selectedIds
    .map(id => state.services.find(service => service.id === String(id)))
    .filter(Boolean);
  if (!services.length) return "Todavía no hay servicios seleccionados.";
  const total = services.reduce((sum, service) => sum + service.price, 0);
  return `<strong>${services.map(service => escapeHtml(service.name)).join(", ")}</strong>${services.length} servicio${services.length === 1 ? "" : "s"} · ${money(total)}`;
}

function renderAppointmentServiceOptions(selectedIds = null) {
  if (selectedIds !== null) appointmentSelectedServiceIds = selectedIds.map(String);
  const container = $("#appointmentServiceOptions");
  if (container) container.innerHTML = serviceSelectionSummary(appointmentSelectedServiceIds);
}

function checkedServiceIds(containerId) {
  return containerId === "confirmationServiceOptions"
    ? [...confirmationSelectedServiceIds]
    : [...appointmentSelectedServiceIds];
}

function showLogin(message = "") {
  authenticatedUser = null;
  document.body.classList.remove("support-mode");
  $("#loginScreen").classList.remove("hidden");
  $("#loginError").textContent = message;
  $("#loginError").classList.toggle("hidden", !message);
  $("#loginForm").password.value = "";
}

function showApplication(user) {
  authenticatedUser = user;
  $("#sessionUserName").textContent = `${user.full_name} · ${userRoleLabels[user.role] || user.role}`;
  document.body.classList.toggle("support-mode", user.role === "SUPPORT");
  document.querySelectorAll("[data-admin-only]").forEach(element =>
    element.classList.toggle("hidden", user.role !== "ADMIN")
  );
  $("#loginScreen").classList.add("hidden");
  $("#loginError").classList.add("hidden");
}

async function loadApplicationData() {
  await Promise.all([
    loadServicesFromApi(),
    loadBarbersFromApi(),
    loadReceptionistsFromApi(),
    loadCustomersFromApi(),
    loadAppointmentsFromApi(),
    loadSalesFromApi(),
    loadCurrentShiftFromApi(),
    loadShiftHistoryFromApi(),
    loadSuggestedReceiptFromApi(),
    loadAttendanceFromApi(),
    loadUsersFromApi()
  ]);
  renderAll();
}

function updateAppointmentBarberOptions() {
  const form = $("#appointmentForm");
  const select = form.barber;
  const selectedBarber = select.value;
  const usesCurrentShift = currentShift
    && form.date.value === currentShift.business_date;
  const barbers = usesCurrentShift
    ? currentShift.barbers
    : catalogBarbers.filter(barber => barber.active);
  select.innerHTML = `<option value="">Por asignar</option>` + barbers
    .map(barber => `<option value="${barber.id}">${escapeHtml(barber.name)}</option>`)
    .join("");
  if ([...select.options].some(option => option.value === selectedBarber)) {
    select.value = selectedBarber;
  }
}

function renderShell() {
  const formatter = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });
  $("#todayLabel").textContent = formatter.format(new Date());
  const salesToday = state.sales.filter(sale =>
    sale.date === todayISO() && sale.status === "COMPLETED"
  );
  $("#todaySales").textContent = money(salesToday.reduce((sum, sale) => sum + sale.total, 0));
  $("#activeAppointments").textContent = state.appointments.filter(item => !["atendida", "cancelada"].includes(item.status)).length;
}

function renderAppointments() {
  const query = $("#appointmentSearch").value.trim().toLowerCase();
  const activeStatuses = ["pendiente", "confirmada"];
  const activeCount = state.appointments.filter(item =>
    activeStatuses.includes(item.status)
  ).length;
  const historyCount = state.appointments.length - activeCount;
  $("#activeAppointmentCount").textContent = activeCount;
  $("#historyAppointmentCount").textContent = historyCount;

  const rows = state.appointments
    .filter(item => appointmentView === "active"
      ? activeStatuses.includes(item.status)
      : !activeStatuses.includes(item.status)
    )
    .filter(item => `${item.customer} ${item.serviceName} ${item.barber}`.toLowerCase().includes(query))
    .sort((a, b) => appointmentView === "active"
      ? `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
      : `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
    )
    .map(item => `
      <tr>
        <td><strong>${item.customer}</strong>${isBirthdayOn(item.birthDate, item.date) ? ` <span title="Cumpleaños">🎂</span>` : ""}<small>${item.phone || "Sin telefono"}</small></td>
        <td>${escapeHtml(item.serviceName)}${item.price === null ? "" : `<br><small>${money(item.price)}</small>`}</td>
        <td>${escapeHtml(item.barber)}</td>
        <td class="appointment-date"><strong>${formatAppointmentDate(item.date)}</strong><small>${item.time}</small></td>
        <td>
          <span class="status ${item.status}">${item.status}</span>
          ${item.status === "cancelada" && item.cancellationNote
            ? `<small class="cancellation-note">Motivo: ${escapeHtml(item.cancellationNote)}</small>`
            : ""}
        </td>
        <td>
          ${["atendida", "cancelada"].includes(item.status) ? "" : `
            <div class="row-actions">
              ${item.status === "pendiente"
                ? `<button class="chip-button" data-action="confirm" data-id="${item.id}">Confirmar</button>`
                : ""}
              <button class="chip-button" data-action="edit" data-id="${item.id}">Editar</button>
              ${item.barberId && item.serviceId
                ? `<button class="chip-button pay" data-action="charge" data-id="${item.id}">Cobrar</button>`
                : `<small>Confirma los datos para cobrar</small>`}
              <button class="chip-button danger" data-action="cancel" data-id="${item.id}">Cancelar</button>
            </div>
          `}
        </td>
      </tr>
    `).join("");

  const emptyMessage = appointmentView === "active"
    ? "No hay citas pendientes."
    : "No hay citas en el historial.";
  $("#appointmentRows").innerHTML = rows || `<tr><td colspan="6">${emptyMessage}</td></tr>`;
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
  const canManageCatalog = authenticatedUser?.role === "ADMIN";
  $("#serviceList").innerHTML = catalog.map(service => `
    <div class="price-item ${service.active === false ? "inactive" : ""}">
      <div>
        <strong>${service.name}</strong>
        <span>${service.type}${service.active === false ? " · Inactivo" : ""}</span>
      </div>
      <div class="catalog-actions">
        <strong>${money(service.price)}</strong>
        ${canManageCatalog ? `<button class="chip-button" type="button" data-edit-service="${service.id}">Editar</button>
        <button class="chip-button ${service.active === false ? "pay" : "danger"}" type="button"
          data-toggle-service="${service.id}">
          ${service.active === false ? "Activar" : "Desactivar"}
        </button>` : ""}
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

function renderReceptionists() {
  $("#receptionistList").innerHTML = catalogReceptionists.map(receptionist => `
    <div class="price-item ${receptionist.active ? "" : "inactive"}">
      <div>
        <strong>${escapeHtml(receptionist.name)}</strong>
        <span>${receptionist.active ? "Activa" : "Inactiva"}</span>
      </div>
      <div class="catalog-actions">
        <button class="chip-button" type="button" data-edit-receptionist="${receptionist.id}">Editar</button>
        <button class="chip-button ${receptionist.active ? "danger" : "pay"}" type="button"
          data-toggle-receptionist="${receptionist.id}">
          ${receptionist.active ? "Desactivar" : "Activar"}
        </button>
      </div>
    </div>
  `).join("") || `<div class="cart-empty">No hay recepcionistas registradas.</div>`;
}

function renderUsers() {
  const container = $("#userList");
  if (!container) return;
  container.innerHTML = systemUsers.map(user => `
    <div class="price-item ${user.active ? "" : "inactive"}">
      <div>
        <strong>${escapeHtml(user.full_name)}</strong>
        <span>@${escapeHtml(user.username)} · ${userRoleLabels[user.role] || user.role} · ${user.active ? "Activa" : "Inactiva"}</span>
      </div>
      <div class="catalog-actions">
        <button class="chip-button" type="button" data-edit-user="${user.id}">Editar</button>
        <button class="chip-button ${user.active ? "danger" : "pay"}" type="button" data-toggle-user="${user.id}" ${user.id === authenticatedUser?.id ? 'disabled title="No puedes desactivar tu propia cuenta"' : ""}>${user.active ? "Desactivar" : "Activar"}</button>
      </div>
    </div>
  `).join("") || `<div class="cart-empty">No hay cuentas registradas.</div>`;
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
        <span>${escapeHtml(customer.phone || "Sin teléfono")} · ${formatBirthDate(customer.birthDate) || "Sin fecha de nacimiento"} · ${customer.active ? "Activo" : "Inactivo"}</span>
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
  const birthdayCustomer = currentSaleCustomer();
  const canUseBirthdayDiscount = Boolean(
    birthdayCustomer && isBirthdayOn(birthdayCustomer.birthDate)
  );
  if (!canUseBirthdayDiscount) birthdayDiscountServiceId = null;
  $("#birthdayNotice").classList.toggle("hidden", !canUseBirthdayDiscount);
  $("#birthdaySaleDiscount").textContent = birthdayDiscountServiceId === "ALL"
    ? "Quitar descuento de cumpleaños"
    : "Aplicar 50 % a toda la venta";

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

  const discount = getBirthdayDiscount();
  $("#cartTotal").innerHTML = discount
    ? `<span class="birthday-discount">-${money(discount)}</span> ${money(getCartTotal())}`
    : money(getCartTotal());
  updatePaymentFields();
}

function applyScheduledStaffToOpenShift() {
  if (currentShift) return;
  const form = $("#openShiftForm");
  const businessDate = todayISO();
  const date = new Date(`${businessDate}T12:00:00`);
  const weekStart = businessWeekStartIso(date);
  const dayOfWeek = (date.getDay() + 1) % 7;
  const scheduled = workSchedules.filter(item =>
    String(item.week_start).slice(0, 10) === weekStart &&
    item.shift_type === form.shiftType.value &&
    Number(item.day_of_week) === dayOfWeek &&
    item.status === "WORK"
  );
  const barberIds = new Set(
    scheduled.filter(item => item.person_type === "BARBER").map(item => String(item.person_id))
  );
  form.querySelectorAll('input[name="barberIds"]').forEach(input => {
    input.checked = barberIds.has(input.value);
  });
  const receptionists = scheduled.filter(item => item.person_type === "RECEPTIONIST");
  form.receptionistId.value = receptionists.length ? String(receptionists[0].person_id) : "";
  const label = form.shiftType.value === "MORNING" ? "matutino" : "vespertino";
  $("#shiftScheduleStatus").textContent = scheduled.length
    ? `Selección cargada automáticamente del horario ${label} de hoy. Puedes modificarla antes de abrir.`
    : `No hay personal programado para el turno ${label} de hoy. Selecciónalo manualmente.`;
}

function renderShift() {
  const shiftSales = state.sales
    .filter(sale => currentShift
      && sale.shiftId === String(currentShift.id)
      && sale.status === "COMPLETED")
    .sort((a, b) =>
      `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
  );
  const total = roundMoney(shiftSales.reduce((sum, sale) => sum + sale.total, 0));
  const byMethod = method => roundMoney(shiftSales.reduce(
    (sum, sale) => sum + (sale.payments || [])
      .filter(payment => payment.method === method)
      .reduce((paymentSum, payment) => paymentSum + payment.amount, 0),
    0
  ));

  $("#openShiftForm").classList.toggle("hidden", Boolean(currentShift));
  $("#shiftDashboard").classList.toggle("hidden", !currentShift);
  $("#currentShiftLabel").textContent = currentShift
    ? `${currentShift.shift_type === "MORNING" ? "Matutino" : "Vespertino"} · ${currentShift.business_date} · Recepción: ${currentShift.receptionist?.name || "Sin registrar"} · Folio siguiente: ${currentShift.next_receipt_number}`
    : "No hay un turno abierto";
  $("#shiftStatus").textContent = currentShift ? "Abierto" : "Sin turno";
  $("#shiftBarberOptions").innerHTML = catalogBarbers
    .filter(barber => barber.active)
    .map(barber => `<label><input type="checkbox" name="barberIds" value="${barber.id}"> ${escapeHtml(barber.name)}</label>`)
    .join("");
  if (!currentShift) applyScheduledStaffToOpenShift();
  $("#saleForm").receiptNumber.disabled = !currentShift;
  if (currentShift && !$("#saleForm").receiptNumber.value) {
    $("#saleForm").receiptNumber.value = currentShift.next_receipt_number;
  }
  if (!currentShift) return;

  const cashSales = byMethod("CASH");
  const cardSales = byMethod("CARD");
  const transferSales = byMethod("TRANSFER");
  const expenses = currentShift.expenses || [];
  const expenseTotal = roundMoney(expenses.reduce((sum, expense) => sum + Number(expense.amount), 0));
  const expectedSalesCash = roundMoney(cashSales - expenseTotal);
  const expectedCash = roundMoney(Number(currentShift.opening_cash) + expectedSalesCash);
  $("#closeShiftForm").fundReserved.value = Number(currentShift.opening_cash);

  const evidenceStatus = $("#shiftEvidenceStatus");
  const evidencePreview = $("#shiftEvidencePreview");
  const closeShiftButton = $("#closeShiftButton");
  const hasEvidence = Boolean(currentShift.evidence_url);
  const missingReceipts = currentShift.missing_receipt_numbers || [];
  const receiptGapNotice = $("#receiptGapNotice");
  const receiptGapReasonField = $("#receiptGapReasonField");
  receiptGapNotice.classList.toggle("hidden", !missingReceipts.length);
  receiptGapReasonField.classList.toggle("hidden", !missingReceipts.length);
  receiptGapNotice.textContent = missingReceipts.length
    ? `Faltan folios: ${missingReceipts.map(number => String(number).padStart(4, "0")).join(", ")}. Corrígelos desde Ventas o escribe el motivo.`
    : "";
  const formReceiptGapReason = $("#closeShiftForm").receiptGapReason;
  formReceiptGapReason.required = missingReceipts.length > 0;
  evidenceStatus.textContent = currentShift.evidence_url ? "Adjuntada" : "Pendiente";
  evidenceStatus.classList.toggle("complete", hasEvidence);
  ["cashSalesCounted", "cardReported", "transferReported", "closingNotes", "receiptGapReason"].forEach(field => {
    $("#closeShiftForm")[field].disabled = !hasEvidence;
  });
  $("#closeShiftForm").classList.toggle("evidence-locked", !hasEvidence);
  $("#closeShiftEvidenceNotice").classList.toggle("hidden", hasEvidence);
  closeShiftButton.classList.toggle("requires-evidence", !currentShift.evidence_url);
  closeShiftButton.disabled = !hasEvidence;
  if (currentShift.evidence_url) closeShiftButton.removeAttribute("aria-describedby");
  else closeShiftButton.setAttribute("aria-describedby", "shiftEvidenceStatus");
  closeShiftButton.title = currentShift.evidence_url ? "" : "Adjunta la evidencia del checador para cerrar";
  evidencePreview.innerHTML = currentShift.evidence_url
    ? `<a href="${apiFileUrl(currentShift.evidence_url)}" target="_blank" rel="noopener"><img src="${apiFileUrl(currentShift.evidence_url)}?v=${encodeURIComponent(currentShift.evidence_uploaded_at || "")}" alt="Evidencia del checador"><span><strong>${escapeHtml(currentShift.evidence_original_name || "Evidencia del checador")}</strong><small>Adjuntada ${new Date(currentShift.evidence_uploaded_at).toLocaleString("es-MX")}${currentShift.evidence_uploaded_by_name ? ` por ${escapeHtml(currentShift.evidence_uploaded_by_name)}` : ""}. Puedes reemplazarla seleccionando otra imagen.</small></span></a>`
    : `<p class="muted">Todavía no se ha adjuntado la foto de este corte.</p>`;

  $("#shiftSystemTotals").innerHTML = `
    <div class="cut-line"><span>Fondo inicial</span><strong>${money(currentShift.opening_cash)}</strong></div>
    <div class="cut-line"><span>Ventas en efectivo</span><strong>${money(cashSales)}</strong></div>
    <div class="cut-line"><span>Gastos</span><strong>-${money(expenseTotal)}</strong></div>
    <div class="cut-line"><span>Tarjeta</span><strong>${money(cardSales)}</strong></div>
    <div class="cut-line"><span>Transferencias</span><strong>${money(transferSales)}</strong></div>
    <div class="cut-line"><span>Efectivo de ventas esperado</span><strong>${money(expectedSalesCash)}</strong></div>
    <div class="cut-line total"><span>Total efectivo esperado con fondo</span><strong>${money(expectedCash)}</strong></div>
    <div class="cut-line total"><span>Venta total</span><strong>${money(total)}</strong></div>
  `;

  $("#expenseList").innerHTML = expenses.length
    ? expenses.map(expense => `<div class="expense-line"><span>${escapeHtml(expense.concept)}</span><strong>-${money(expense.amount)}</strong></div>`).join("")
    : `<p class="muted">Sin gastos registrados.</p>`;

  const byBarber = new Map();
  shiftSales.forEach(sale => {
    const row = byBarber.get(sale.barberId) || {
      name: sale.barber,
      sales: 0,
      services: 0,
      serviceCounts: new Map()
    };
    row.sales += sale.total;
    sale.items.forEach(item => {
      const quantity = item.quantity || 1;
      row.services += quantity;
      row.serviceCounts.set(
        item.name,
        (row.serviceCounts.get(item.name) || 0) + quantity
      );
    });
    byBarber.set(sale.barberId, row);
  });
  $("#barberProduction").innerHTML = [...byBarber.values()]
    .map(row => `
      <div class="production-line barber-production-line">
        <span>
          <strong>${escapeHtml(row.name)}</strong>
          <small>${[...row.serviceCounts]
            .map(([serviceName, quantity]) => `${escapeHtml(serviceName)} × ${quantity}`)
            .join(" · ")}</small>
        </span>
        <strong>${money(row.sales)}</strong>
      </div>
    `)
    .join("") || `<p class="muted">Todavía no hay producción.</p>`;

  const byService = new Map();
  shiftSales.flatMap(sale => sale.items).forEach(item => {
    const row = byService.get(item.id) || { name: item.name, quantity: 0, total: 0 };
    row.quantity += item.quantity || 1;
    row.total += item.price * (item.quantity || 1);
    byService.set(item.id, row);
  });
  $("#serviceProduction").innerHTML = [...byService.values()]
    .map(row => `<div class="production-line"><span>${escapeHtml(row.name)} × ${row.quantity}</span><strong>${money(row.total)}</strong></div>`)
    .join("") || `<p class="muted">Todavía no hay servicios.</p>`;

  $("#movementSummary").textContent = `Ver ${shiftSales.length} movimientos del turno`;

  $("#saleRows").innerHTML = shiftSales.map(sale => `
    <tr>
      <td>${sale.time}<br><small>Folio ${sale.receiptNumber ?? "—"}</small></td>
      <td>${sale.customer || "Publico general"}</td>
      <td>${sale.items.map(item => item.name).join(", ")}</td>
      <td>${sale.barber}</td>
      <td>${sale.payment}</td>
      <td><strong>${money(sale.total)}</strong></td>
    </tr>
  `).join("") || `<tr><td colspan="6">Todavia no hay ventas en este turno.</td></tr>`;

  updateReconciliation(expectedSalesCash, cardSales, transferSales);
}

function shiftFinancialSummary(shift) {
  const sales = state.sales
    .filter(sale => sale.shiftId === String(shift.id) && sale.status === "COMPLETED")
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const byMethod = method => roundMoney(sales.reduce(
    (sum, sale) => sum + sale.payments
      .filter(payment => payment.method === method)
      .reduce((paymentSum, payment) => paymentSum + payment.amount, 0), 0
  ));
  const expenses = roundMoney((shift.expenses || []).reduce(
    (sum, expense) => sum + Number(expense.amount), 0
  ));
  const expectedSalesCash = roundMoney(byMethod("CASH") - expenses);
  const expectedCash = roundMoney(Number(shift.opening_cash) + expectedSalesCash);
  const difference = shift.status === "CLOSED" ? roundMoney(
    Number(shift.cash_counted || 0) - expectedCash
    + Number(shift.card_reported || 0) - byMethod("CARD")
    + Number(shift.transfer_reported || 0) - byMethod("TRANSFER")
  ) : null;
  return {
    sales,
    total: roundMoney(sales.reduce((sum, sale) => sum + sale.total, 0)),
    cash: byMethod("CASH"),
    card: byMethod("CARD"),
    transfer: byMethod("TRANSFER"),
    expectedSalesCash,
    expectedCash,
    expenses,
    difference,
    firstFolio: sales[0]?.receiptNumber,
    lastFolio: sales[sales.length - 1]?.receiptNumber
  };
}

function historicalShiftDetail(shift, summary) {
  const barberTotals = new Map();
  const serviceTotals = new Map();
  summary.sales.forEach(sale => {
    const barber = barberTotals.get(sale.barberId) || {
      name: sale.barber, total: 0, services: new Map()
    };
    barber.total += sale.total;
    sale.items.forEach(item => {
      const quantity = item.quantity || 1;
      barber.services.set(item.name, (barber.services.get(item.name) || 0) + quantity);
      const service = serviceTotals.get(item.id) || { name: item.name, quantity: 0, total: 0 };
      service.quantity += quantity;
      service.total += item.price * quantity;
      serviceTotals.set(item.id, service);
    });
    barberTotals.set(sale.barberId, barber);
  });
  const cashDifference = roundMoney(Number(shift.cash_counted || 0) - summary.expectedCash);
  const cardDifference = roundMoney(Number(shift.card_reported || 0) - summary.card);
  const transferDifference = roundMoney(Number(shift.transfer_reported || 0) - summary.transfer);
  const differenceLine = value => `<strong class="${value === 0 ? "balanced-text" : value < 0 ? "short-text" : "over-text"}">${money(value)}</strong>`;
  return `
    <div class="history-detail-grid">
      <section class="history-detail-card">
        <h4>Conciliación</h4>
        <div class="cut-line"><span>Recepcionista</span><strong>${escapeHtml(shift.receptionist?.name || "Sin registrar")}</strong></div>
        <div class="cut-line"><span>Cerrado por</span><strong>${escapeHtml(shift.closed_by_name || "Sin registrar")}</strong></div>
        <div class="cut-line"><span>Fondo inicial</span><strong>${money(shift.opening_cash)}</strong></div>
        <div class="cut-line"><span>Fondo que quedó en caja</span><strong>${money(shift.opening_cash)}</strong></div>
        <div class="cut-line"><span>Efectivo de ventas esperado</span><strong>${money(summary.expectedSalesCash)}</strong></div>
        <div class="cut-line"><span>Efectivo de ventas entregado</span><strong>${money(Math.max(0, Number(shift.cash_counted || 0) - Number(shift.opening_cash)))}</strong></div>
        <div class="cut-line"><span>Total efectivo contado</span><strong>${money(shift.cash_counted)}</strong></div>
        <div class="cut-line"><span>Diferencia efectivo</span>${differenceLine(cashDifference)}</div>
        <div class="cut-line"><span>Tarjeta sistema / terminal</span><strong>${money(summary.card)} / ${money(shift.card_reported)}</strong></div>
        <div class="cut-line"><span>Diferencia tarjeta</span>${differenceLine(cardDifference)}</div>
        <div class="cut-line"><span>Transferencias sistema / verificadas</span><strong>${money(summary.transfer)} / ${money(shift.transfer_reported)}</strong></div>
        <div class="cut-line"><span>Diferencia transferencias</span>${differenceLine(transferDifference)}</div>
      </section>
      <section class="history-detail-card">
        <h4>Gastos</h4>
        ${(shift.expenses || []).map(expense => `
          <div class="expense-line"><span>${escapeHtml(expense.concept)}</span><strong>-${money(expense.amount)}</strong></div>
        `).join("") || `<p class="muted">Sin gastos registrados.</p>`}
        <div class="cut-line total"><span>Total de gastos</span><strong>${money(summary.expenses)}</strong></div>
        <div class="closing-notes"><strong>Notas del cierre</strong><p>${escapeHtml(shift.closing_notes || "Sin notas registradas.")}</p></div>
        ${shift.receipt_gap_reason ? `<div class="closing-notes"><strong>Motivo de folios faltantes</strong><p>${escapeHtml(shift.receipt_gap_reason)}</p></div>` : ""}
        <div class="closing-notes"><strong>Evidencia del checador</strong>${shift.evidence_url
          ? `<a class="evidence-history-card" href="${apiFileUrl(shift.evidence_url)}" target="_blank" rel="noopener">
              <img src="${apiFileUrl(shift.evidence_url)}" alt="Evidencia del checador del turno">
              <span><strong>${escapeHtml(shift.evidence_original_name || "Foto del checador")}</strong><small>Adjuntada ${new Date(shift.evidence_uploaded_at).toLocaleString("es-MX")}${shift.evidence_uploaded_by_name ? ` por ${escapeHtml(shift.evidence_uploaded_by_name)}` : ""}</small><em><span class="material-symbols-outlined">open_in_new</span> Abrir imagen completa</em></span>
            </a>`
          : `<p>Este corte anterior no tiene evidencia registrada.</p>`}</div>
      </section>
      <section class="history-detail-card">
        <h4>Producción por barbero</h4>
        ${[...barberTotals.values()].map(barber => `
          <div class="production-line barber-production-line">
            <span><strong>${escapeHtml(barber.name)}</strong><small>${[...barber.services].map(([name, quantity]) => `${escapeHtml(name)} × ${quantity}`).join(" · ")}</small></span>
            <strong>${money(barber.total)}</strong>
          </div>
        `).join("") || `<p class="muted">Sin producción.</p>`}
      </section>
      <section class="history-detail-card">
        <h4>Servicios realizados</h4>
        ${[...serviceTotals.values()].map(service => `
          <div class="production-line"><span>${escapeHtml(service.name)} × ${service.quantity}</span><strong>${money(service.total)}</strong></div>
        `).join("") || `<p class="muted">Sin servicios.</p>`}
        <div class="cut-line"><span>Descuentos aplicados</span><strong>-${money(summary.sales.reduce((sum, sale) => sum + (sale.discount || 0), 0))}</strong></div>
        <div class="cut-line total"><span>Venta neta</span><strong>${money(summary.total)}</strong></div>
      </section>
    </div>
    <div class="table-wrap history-movements">
      <table>
        <thead><tr><th>Folio</th><th>Hora</th><th>Cliente</th><th>Servicios</th><th>Barbero</th><th>Pago</th><th>Total</th></tr></thead>
        <tbody>${summary.sales.map(sale => `
          <tr><td>${sale.receiptNumber ?? "—"}</td><td>${sale.time}</td><td>${escapeHtml(sale.customer || "Público general")}</td><td>${sale.items.map(item => escapeHtml(item.name)).join(", ")}${sale.discount ? `<small>Descuento: -${money(sale.discount)}</small>` : ""}</td><td>${escapeHtml(sale.barber)}</td><td>${sale.payment}</td><td><strong>${money(sale.total)}</strong></td></tr>
        `).join("") || `<tr><td colspan="7">Sin movimientos.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderShiftHistory() {
  const closedShifts = shiftHistory.filter(shift => shift.status === "CLOSED");
  $("#shiftHistoryRows").innerHTML = closedShifts.map(shift => {
    const summary = shiftFinancialSummary(shift);
    const differenceClass = summary.difference === 0 ? "balanced-text" : summary.difference < 0 ? "short-text" : "over-text";
    const folios = summary.firstFolio === undefined
      ? "Sin ventas"
      : `${summary.firstFolio} → ${summary.lastFolio}`;
    return `
      <tr>
        <td><strong>${formatAppointmentDate(shift.business_date)}</strong><small>${new Date(shift.opened_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</small></td>
        <td>${shift.shift_type === "MORNING" ? "Matutino" : "Vespertino"}</td>
        <td>${shift.barbers.map(barber => escapeHtml(barber.name)).join(", ")}</td>
        <td>${escapeHtml(shift.receptionist?.name || "Sin registrar")}</td>
        <td>${folios}</td>
        <td><strong>${money(summary.total)}</strong><small>${summary.sales.length} ventas</small></td>
        <td>${money(summary.expenses)}</td>
        <td class="${differenceClass}"><strong>${money(summary.difference)}</strong></td>
        <td><button class="chip-button" type="button" data-toggle-shift="${shift.id}">Ver desglose</button></td>
      </tr>
      <tr class="shift-history-detail hidden" id="shift-history-${shift.id}"><td colspan="9">${historicalShiftDetail(shift, summary)}</td></tr>
    `;
  }).join("") || `<tr><td colspan="9">Todavía no hay turnos cerrados.</td></tr>`;
}

function updateReconciliation(expectedSalesCash, expectedCard, expectedTransfer) {
  if (!currentShift) return;
  const form = $("#closeShiftForm");
  const cashDifference = roundMoney(Number(form.cashSalesCounted.value || 0) - expectedSalesCash);
  const cardDifference = roundMoney(Number(form.cardReported.value || 0) - expectedCard);
  const transferDifference = roundMoney(Number(form.transferReported.value || 0) - expectedTransfer);
  const difference = roundMoney(cashDifference + cardDifference + transferDifference);
  const result = $("#reconciliationResult");
  result.className = `reconciliation-result ${difference === 0 ? "balanced" : difference < 0 ? "short" : "over"}`;
  result.innerHTML = difference === 0
    ? `<span>Todo coincide</span><strong>Caja cuadrada</strong>`
    : difference < 0
      ? `<span>Diferencia total</span><strong>Faltan ${money(Math.abs(difference))}</strong>`
      : `<span>Diferencia total</span><strong>Sobran ${money(difference)}</strong>`;
}

function renderSalesCharts(sales) {
  const dailyTotals = new Map();
  const barberTotals = new Map();
  sales.forEach(sale => {
    dailyTotals.set(sale.date, (dailyTotals.get(sale.date) || 0) + sale.total);
    const barber = barberTotals.get(sale.barberId) || {
      name: sale.barber,
      total: 0,
      services: 0
    };
    barber.total += sale.total;
    barber.services += sale.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    barberTotals.set(sale.barberId, barber);
  });

  const days = [...dailyTotals.entries()].sort(([dateA], [dateB]) => dateA.localeCompare(dateB));
  const maxDaily = Math.max(0, ...days.map(([, total]) => total));
  $("#dailySalesChart").innerHTML = days.map(([date, total]) => {
    const [, month, day] = date.split("-");
    const height = maxDaily ? Math.max(3, (total / maxDaily) * 145) : 3;
    return `
      <div class="daily-bar-column" title="${date}: ${money(total)}">
        <span class="daily-bar-value">${money(total)}</span>
        <div class="daily-bar" style="height:${height}px"></div>
        <span class="daily-bar-label">${day}/${month}</span>
      </div>
    `;
  }).join("") || `<p class="chart-empty">No hay ventas para graficar.</p>`;

  const barbers = [...barberTotals.values()].sort((a, b) => b.total - a.total);
  const maxBarber = Math.max(0, ...barbers.map(barber => barber.total));
  $("#barberProductionChart").innerHTML = barbers.map(barber => `
    <div class="production-chart-row">
      <div class="production-chart-heading">
        <strong>${escapeHtml(barber.name)}</strong>
        <span>${barber.services} servicio${barber.services === 1 ? "" : "s"} · ${money(barber.total)}</span>
      </div>
      <div class="production-track">
        <div class="production-fill" style="width:${maxBarber ? (barber.total / maxBarber) * 100 : 0}%"></div>
      </div>
    </div>
  `).join("") || `<p class="chart-empty">No hay producción para graficar.</p>`;
}

function renderSalesReport() {
  const dateFrom = $("#salesDateFrom").value;
  const dateTo = $("#salesDateTo").value;
  const barberId = $("#salesBarberFilter").value;
  const query = $("#salesSearch").value.trim().toLowerCase();
  const matchingSales = state.sales
    .filter(sale => !dateFrom || sale.date >= dateFrom)
    .filter(sale => !dateTo || sale.date <= dateTo)
    .filter(sale => barberId === "ALL" || sale.barberId === barberId)
    .filter(sale => {
      const searchableText = [
        sale.folio,
        sale.receiptNumber,
        sale.customer || "Público general",
        sale.barber,
        sale.payment,
        ...sale.items.map(item => item.name)
      ].join(" ").toLowerCase();
      return searchableText.includes(query);
    })
    .sort((a, b) =>
      `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
    );
  const sales = matchingSales.filter(sale => sale.status === "COMPLETED");

  const paymentTotal = method => sales.reduce(
    (sum, sale) => sum + (sale.payments || [])
      .filter(payment => payment.method === method)
      .reduce((paymentSum, payment) => paymentSum + payment.amount, 0),
    0
  );
  const total = sales.reduce((sum, sale) => sum + sale.total, 0);
  const shiftsById = new Map(shiftHistory.map(shift => [String(shift.id), shift]));
  if (currentShift) shiftsById.set(String(currentShift.id), currentShift);
  const expenseTotal = roundMoney([...shiftsById.values()]
    .filter(shift => !dateFrom || shift.business_date >= dateFrom)
    .filter(shift => !dateTo || shift.business_date <= dateTo)
    .reduce((sum, shift) => sum + (shift.expenses || [])
      .reduce((expenseSum, expense) => expenseSum + Number(expense.amount), 0), 0));
  const showsWholeBusiness = barberId === "ALL" && !query;
  const netAfterExpenses = roundMoney(total - expenseTotal);

  $("#salesReportSummary").innerHTML = [
    ["Ventas brutas", money(total)],
    ["Gastos", money(expenseTotal)],
    ["Neto después de gastos", showsWholeBusiness ? money(netAfterExpenses) : "—"],
    ["Efectivo", money(paymentTotal("CASH"))],
    ["Tarjeta", money(paymentTotal("CARD"))],
    ["Transferencia", money(paymentTotal("TRANSFER"))],
    ["Ventas", sales.length]
  ].map(([label, value]) =>
    `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`
  ).join("");

  renderSalesCharts(sales);

  $("#salesReportRows").innerHTML = matchingSales.map(sale => `
    <tr class="${sale.status === "CANCELLED" ? "cancelled-sale" : ""}">
      <td>${sale.date}<br><small>${sale.time}</small></td>
      <td>
        <strong>${sale.receiptNumber ?? escapeHtml((sale.folio || sale.id).slice(0, 8).toUpperCase())}</strong>
        ${sale.receiptCorrections?.length ? (() => {
          const correction = sale.receiptCorrections.at(-1);
          return `<small class="receipt-correction-note">Antes ${correction.oldReceiptNumber} · ${escapeHtml(correction.correctedByName)}</small>`;
        })() : ""}
      </td>
      <td>${escapeHtml(sale.customer || "Público general")}</td>
      <td>${sale.items.map(item =>
        `${item.quantity > 1 ? `${item.quantity} × ` : ""}${escapeHtml(item.name)}`
      ).join("<br>")}</td>
      <td>${escapeHtml(sale.barber)}</td>
      <td>${escapeHtml(sale.payment)}</td>
      <td>
        <strong>${money(sale.total)}</strong>
        ${sale.status === "CANCELLED"
          ? `<small class="cancellation-note">Cancelada: ${escapeHtml(sale.cancellationReason)}</small>`
          : ""}
      </td>
      <td>
        ${["ADMIN", "RECEPTION"].includes(authenticatedUser?.role) ? `
          <button class="chip-button" type="button" data-correct-sale-receipt="${sale.id}">Corregir folio</button>
        ` : ""}
        ${sale.status === "COMPLETED" ? `
          <button class="chip-button danger" type="button" data-cancel-sale="${sale.id}">Cancelar</button>
        ` : `<span class="status cancelada">cancelada</span>`}
      </td>
    </tr>
  `).join("") || `<tr><td colspan="8">No hay ventas en el periodo seleccionado.</td></tr>`;
}

function renderCancellations() {
  const query = ($("#cancellationSearch")?.value || "").trim().toLowerCase();
  const cancellations = state.appointments
    .filter(appointment => appointment.status === "cancelada")
    .filter(appointment => [
      appointment.customer,
      appointment.phone,
      appointment.serviceName,
      appointment.barber,
      appointment.cancellationNote
    ].join(" ").toLowerCase().includes(query))
    .sort((a, b) => {
      const aKey = a.cancelledAt || `${a.date}T${a.time}`;
      const bKey = b.cancelledAt || `${b.date}T${b.time}`;
      return bKey.localeCompare(aKey);
    });
  const allCancellations = state.appointments.filter(item => item.status === "cancelada");
  const withReason = allCancellations.filter(item => item.cancellationNote).length;
  $("#cancellationSummary").textContent =
    `${allCancellations.length} cancelaciones · ${withReason} con motivo registrado`;
  $("#cancellationJumpLabel").textContent =
    `Ver cancelaciones (${allCancellations.length})`;
  $("#cancellationRows").innerHTML = cancellations.map(appointment => {
    const cancelledDate = appointment.cancelledAt
      ? new Date(appointment.cancelledAt).toLocaleString("es-MX", {
          day: "numeric", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit"
        })
      : "Cancelación anterior";
    return `
      <tr>
        <td>${cancelledDate}</td>
        <td><strong>${formatAppointmentDate(appointment.date)}</strong><small>${appointment.time}</small></td>
        <td><strong>${escapeHtml(appointment.customer)}</strong><small>${escapeHtml(appointment.phone || "Sin teléfono")}</small></td>
        <td>${escapeHtml(appointment.serviceName)}<small>${money(appointment.price)}</small></td>
        <td>${escapeHtml(appointment.barber)}</td>
        <td class="cancellation-reason">${escapeHtml(appointment.cancellationNote || "Sin motivo registrado")}</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="6">No hay cancelaciones que coincidan con la búsqueda.</td></tr>`;
}

const attendanceStatusLabels = {
  PENDING: "Pendiente", PRESENT: "Asistió", ABSENT: "Falta",
  REST: "Descanso", PERMISSION: "Permiso"
};
const weekDayLabels = ["Sábado", "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const shiftTypeLabels = { MORNING: "Matutino", EVENING: "Vespertino" };

function attendanceTime(value) {
  return value ? new Date(value).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—";
}

function localDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function businessWeekStartIso(date = new Date()) {
  const value = new Date(date);
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() - ((value.getDay() + 1) % 7));
  return dateToLocalISO(value);
}

function normalizeSelectedWeekStart(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const daysUntilSaturday = (6 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + daysUntilSaturday);
  return dateToLocalISO(date);
}

function schedulePeople() {
  return [
    ...catalogReceptionists.filter(person => person.active).map(person => ({ ...person, personType: "RECEPTIONIST" })),
    ...catalogBarbers.filter(person => person.active).map(person => ({ ...person, personType: "BARBER" }))
  ];
}

function schedulePersonKey(personType, personId) {
  return `${personType}-${personId}`;
}

function captureVisibleScheduleDraft() {
  const form = $("#scheduleForm");
  if (!form.weekStart.value) return;
  const week = form.weekStart.value;
  const shift = form.shiftType.value;
  const drafts = [...form.querySelectorAll("[data-schedule-cell]")].flatMap(cell => {
    const resting = cell.querySelector("[data-schedule-rest]").checked;
    const value = field => cell.querySelector(`[data-field="${field}"]`).value || null;
    const startTime = value("start_time");
    const endTime = value("end_time");
    if (!resting && !startTime && !endTime) return [];
    return [{
      week_start: week, shift_type: shift,
      person_type: cell.dataset.personType, person_id: Number(cell.dataset.personId),
      day_of_week: Number(cell.dataset.day), status: resting ? "REST" : "WORK",
      start_time: resting ? null : startTime, end_time: resting ? null : endTime,
      meal_start: resting ? null : value("meal_start"), meal_end: resting ? null : value("meal_end")
    }];
  });
  workSchedules = workSchedules.filter(item => !(
    String(item.week_start).slice(0, 10) === week && item.shift_type === shift
  ));
  workSchedules.push(...drafts);
}

function scheduleCell(person, dayIndex, schedule) {
  const key = `${person.personType}-${person.id}-${dayIndex}`;
  const resting = schedule?.status === "REST";
  return `<td class="schedule-day-cell" data-schedule-cell="${key}" data-person-type="${person.personType}" data-person-id="${person.id}" data-day="${dayIndex}">
    <label class="schedule-rest"><input type="checkbox" data-schedule-rest ${resting ? "checked" : ""}> Descanso</label>
    <div class="schedule-time-pair ${resting ? "hidden" : ""}" data-schedule-times>
      <label><small>Entrada</small><input type="time" data-field="start_time" value="${schedule?.start_time?.slice(0, 5) || ""}"></label>
      <label><small>Salida</small><input type="time" data-field="end_time" value="${schedule?.end_time?.slice(0, 5) || ""}"></label>
      <label><small>Comida</small><input type="time" data-field="meal_start" value="${schedule?.meal_start?.slice(0, 5) || ""}"></label>
      <label><small>Regreso</small><input type="time" data-field="meal_end" value="${schedule?.meal_end?.slice(0, 5) || ""}"></label>
    </div>
    <button class="schedule-repeat-button" type="button" data-repeat-schedule>Repetir horario</button>
  </td>`;
}

function renderWeeklySchedule() {
  const form = $("#scheduleForm");
  if (!form.weekStart.value) form.weekStart.value = businessWeekStartIso();
  form.weekStart.value = normalizeSelectedWeekStart(form.weekStart.value);
  const selectedWeek = form.weekStart.value;
  const selectedShift = form.shiftType.value;
  const context = `${selectedWeek}|${selectedShift}`;
  if (scheduleSelectionContext !== context) {
    selectedSchedulePeople = new Set(
      workSchedules
        .filter(item => String(item.week_start).slice(0, 10) === selectedWeek && item.shift_type === selectedShift)
        .map(item => schedulePersonKey(item.person_type, item.person_id))
    );
    scheduleSelectionContext = context;
  }
  $("#schedulePeopleOptions").innerHTML = schedulePeople().map(person => {
    const key = schedulePersonKey(person.personType, person.id);
    return `<label class="schedule-person-option"><input type="checkbox" value="${key}" ${selectedSchedulePeople.has(key) ? "checked" : ""}>
      <span><strong>${escapeHtml(person.name)}</strong><small>${person.personType === "BARBER" ? "Barbero" : "Recepción"}</small></span></label>`;
  }).join("") || "No hay personal activo.";
  const dates = weekDayLabels.map((label, index) => {
    const date = new Date(`${selectedWeek}T12:00:00`);
    date.setDate(date.getDate() + index);
    return `${label}<small>${date.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</small>`;
  });
  $("#scheduleWeekHeader").innerHTML = `<th>Personal</th>${dates.map(value => `<th>${value}</th>`).join("")}`;
  const visiblePeople = schedulePeople().filter(person => selectedSchedulePeople.has(schedulePersonKey(person.personType, person.id)));
  $("#scheduleRows").innerHTML = visiblePeople.map(person => {
    const cells = weekDayLabels.map((_, dayIndex) => {
      const schedule = workSchedules.find(item =>
        String(item.week_start).slice(0, 10) === selectedWeek && item.shift_type === selectedShift &&
        item.person_type === person.personType && Number(item.person_id) === Number(person.id) &&
        Number(item.day_of_week) === dayIndex
      );
      return scheduleCell(person, dayIndex, schedule);
    }).join("");
    return `<tr><th class="schedule-person"><strong>${escapeHtml(person.name)}</strong><small>${person.personType === "BARBER" ? "Barbero" : "Recepción"}</small></th>${cells}</tr>`;
  }).join("") || `<tr><td colspan="8">Selecciona arriba el personal que trabajará en este turno.</td></tr>`;
  renderSavedScheduleSummary(selectedWeek);
}

function renderSavedScheduleSummary(selectedWeek) {
  const weekDate = new Date(`${selectedWeek}T12:00:00`);
  const weekEnd = new Date(weekDate);
  weekEnd.setDate(weekEnd.getDate() + 6);
  $("#savedSchedulesWeekLabel").textContent = `Del ${weekDate.toLocaleDateString("es-MX")} al ${weekEnd.toLocaleDateString("es-MX")}`;
  const people = schedulePeople();
  const card = (shiftType, title) => {
    const entries = workSchedules.filter(item =>
      String(item.week_start).slice(0, 10) === selectedWeek && item.shift_type === shiftType
    );
    const keys = [...new Set(entries.map(item => schedulePersonKey(item.person_type, item.person_id)))];
    const names = keys.map(key => {
      const person = people.find(item => schedulePersonKey(item.personType, item.id) === key);
      return person?.name || "Personal no disponible";
    });
    return `<div>
      <p class="eyebrow">Turno</p>
      <h4>${title}</h4>
      ${names.length
        ? `<p>${names.map(escapeHtml).join(", ")}</p><small>${entries.length} días configurados</small>`
        : `<p class="muted">Todavía no se ha configurado este turno.</p>`}
    </div>
    <button class="secondary-button compact" type="button" data-view-saved-schedule="${shiftType}">${names.length ? "Ver o editar" : "Configurar"}</button>`;
  };
  $("#savedScheduleMorning").innerHTML = card("MORNING", "Matutino");
  $("#savedScheduleEvening").innerHTML = card("EVENING", "Vespertino");
}

function renderAttendance() {
  $("#attendanceShiftLabel").textContent = currentShift
    ? `${shiftTypeLabels[currentShift.shift_type]} · ${currentShift.business_date}`
    : "Abre un turno para comenzar a registrar.";
  renderCurrentShiftPersonForm();
  $("#attendanceCurrentRows").innerHTML = currentAttendance.map(record => {
    const canClockIn = record.status === "PENDING" && !record.clock_in;
    const canMealOut = record.clock_in && !record.meal_out && !record.clock_out;
    const canMealIn = record.meal_out && !record.meal_in && !record.clock_out;
    const canClockOut = record.clock_in && !record.clock_out;
    return `
      <article class="attendance-card ${record.complete ? "complete" : ""}">
        <div class="attendance-person">
          <div><strong>${escapeHtml(record.person_name)}</strong><small>${record.person_type === "BARBER" ? "Barbero" : "Recepción"}</small></div>
          <span class="status ${record.complete ? "done" : "pending"}">${record.continues_next_shift ? "Continúa" : attendanceStatusLabels[record.status]}</span>
        </div>
        <div class="attendance-times">
          <span><small>Programado</small>${record.scheduled_start ? `${record.scheduled_start.slice(0, 5)}–${record.scheduled_end.slice(0, 5)}` : "Sin horario"}</span>
          <span><small>Entrada</small>${attendanceTime(record.clock_in)}</span>
          <span><small>Comida</small>${attendanceTime(record.meal_out)} / ${attendanceTime(record.meal_in)}</span>
          <span><small>Salida</small>${attendanceTime(record.clock_out)}</span>
        </div>
        ${record.continued_from_record_id ? `<p class="muted attendance-continuation">Jornada iniciada en el turno matutino.</p>` : ""}
        <div class="attendance-actions">
          ${canClockIn ? `<button class="submit-button compact" data-attendance-event="CLOCK_IN" data-record-id="${record.id}">Registrar entrada</button>` : ""}
          ${canMealOut ? `<button class="secondary-button compact" data-attendance-event="MEAL_OUT" data-record-id="${record.id}">Salir a comida</button>` : ""}
          ${canMealIn ? `<button class="secondary-button compact" data-attendance-event="MEAL_IN" data-record-id="${record.id}">Regresar de comida</button>` : ""}
          ${canClockOut ? `<button class="submit-button compact" data-attendance-event="CLOCK_OUT" data-record-id="${record.id}">Registrar salida</button>` : ""}
          ${canClockIn ? `<button class="secondary-button compact" data-attendance-event="ABSENT" data-record-id="${record.id}">Falta</button><button class="secondary-button compact" data-attendance-event="PERMISSION" data-record-id="${record.id}">Permiso</button>` : ""}
          ${authenticatedUser?.role === "ADMIN" ? `<button class="secondary-button compact" data-correct-attendance="${record.id}">Corregir</button>` : ""}
        </div>
        ${record.added_by_name || record.recorded_by_name || record.corrected_by_name ? `<p class="attendance-audit">${record.added_by_name ? `Agregado al turno por <strong>${escapeHtml(record.added_by_name)}</strong>` : ""}${record.recorded_by_name ? `${record.added_by_name ? " · " : ""}Último registro: <strong>${escapeHtml(record.recorded_by_name)}</strong>` : ""}${record.corrected_by_name ? `${record.added_by_name || record.recorded_by_name ? " · " : ""}Corrección: <strong>${escapeHtml(record.corrected_by_name)}</strong>` : ""}</p>` : ""}
      </article>`;
  }).join("") || `<div class="cart-empty">No hay personal en un turno abierto.</div>`;

  renderWeeklySchedule();

  const attendanceWeeks = new Map();
  attendanceHistory.forEach(record => {
    const week = businessWeekStartIso(new Date(`${record.business_date}T12:00:00`));
    if (!attendanceWeeks.has(week)) attendanceWeeks.set(week, []);
    attendanceWeeks.get(week).push(record);
  });
  $("#attendanceHistoryGroups").innerHTML = [...attendanceWeeks.entries()]
    .sort(([weekA], [weekB]) => weekB.localeCompare(weekA))
    .map(([week, records], index) => {
      const start = new Date(`${week}T12:00:00`);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      const range = `${start.toLocaleDateString("es-MX", { day: "numeric", month: "long" })} al ${end.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}`;
      const present = records.filter(record => record.status === "PRESENT").length;
      const matrixRows = new Map();
      records.forEach(record => {
        const key = `${record.person_type}-${record.person_id}-${record.shift_type}`;
        if (!matrixRows.has(key)) matrixRows.set(key, {
          name: record.person_name, personType: record.person_type,
          shiftType: record.shift_type, days: new Map()
        });
        const dayIndex = (new Date(`${record.business_date}T12:00:00`).getDay() + 1) % 7;
        matrixRows.get(key).days.set(dayIndex, record);
      });
      const dayHeaders = weekDayLabels.map((day, dayIndex) => {
        const date = new Date(start); date.setDate(date.getDate() + dayIndex);
        return `<th>${day}<small>${date.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</small></th>`;
      }).join("");
      const differenceLabel = record => {
        if (record.status !== "PRESENT") return `<span class="attendance-incidence">${attendanceStatusLabels[record.status]}</span>`;
        if (!record.scheduled_start || !record.clock_in) return `<span class="attendance-no-schedule">Sin comparación</span>`;
        const expected = new Date(`${record.business_date}T${record.scheduled_start.slice(0, 8)}`);
        const minutes = Math.round((new Date(record.clock_in) - expected) / 60000);
        if (minutes === 0) return `<span class="attendance-on-time">A la hora</span>`;
        if (minutes < 0) return `<span class="attendance-early">${Math.abs(minutes)} min antes</span>`;
        return `<span class="attendance-late">+${minutes} min</span>`;
      };
      const shiftMatrix = (shiftType, title) => {
        const people = [...matrixRows.values()]
          .filter(person => person.shiftType === shiftType)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!people.length) return `<section class="attendance-shift-section"><h4>${title}</h4><p class="muted">Sin registros para este turno.</p></section>`;
        return `<section class="attendance-shift-section">
          <h4>${title}</h4>
          <div class="table-wrap"><table class="attendance-matrix">
            <thead><tr><th>Personal</th>${dayHeaders}</tr></thead>
            <tbody>${people.map(person => `
              <tr><th class="attendance-matrix-person"><strong>${escapeHtml(person.name)}</strong><small>${person.personType === "BARBER" ? "Barbero" : "Recepción"}</small></th>
                ${weekDayLabels.map((_, dayIndex) => {
                  const record = person.days.get(dayIndex);
                  if (!record) return `<td class="attendance-matrix-empty">—</td>`;
                  const programmed = record.scheduled_start ? `${record.scheduled_start.slice(0, 5)}–${record.scheduled_end.slice(0, 5)}` : "Sin horario";
                  return `<td class="attendance-matrix-cell">
                    <small>Programado</small><strong>${programmed}</strong>
                    <small>Entrada real</small><strong>${attendanceTime(record.clock_in)}</strong>
                    <small>Salida real</small><strong>${attendanceTime(record.clock_out)}</strong>
                    ${record.continues_next_shift ? `<span class="status done">Continúa en vespertino</span>` : ""}
                    ${differenceLabel(record)}
                    ${record.recorded_by_name ? `<small>Registró: ${escapeHtml(record.recorded_by_name)}</small>` : ""}
                    ${record.corrected_by_name ? `<small>Corrigió: ${escapeHtml(record.corrected_by_name)}</small>` : ""}
                    ${authenticatedUser?.role === "ADMIN" ? `<button class="schedule-repeat-button" data-correct-attendance="${record.id}">Corregir</button>` : ""}
                  </td>`;
                }).join("")}
              </tr>`).join("")}</tbody>
          </table></div>
        </section>`;
      };
      return `<details class="attendance-week" ${index === 0 ? "open" : ""}>
        <summary><span><strong>Semana del ${range}</strong><small>${records.length} registros · ${present} asistencias</small></span></summary>
        <div class="attendance-export-row"><button class="secondary-button compact" type="button" data-export-attendance-week="${week}"><span class="material-symbols-outlined">download</span> Exportar Excel</button></div>
        ${shiftMatrix("MORNING", "Turno matutino")}
        ${shiftMatrix("EVENING", "Turno vespertino")}
      </details>`;
    }).join("") || `<div class="cart-empty">Todavía no hay asistencias registradas.</div>`;
}

function renderCurrentShiftPersonForm() {
  const form = $("#addShiftPersonForm");
  if (!form) return;
  const allowed = currentShift && ["ADMIN", "RECEPTION"].includes(authenticatedUser?.role);
  form.classList.toggle("hidden", !allowed);
  if (!allowed) return;

  const type = form.personType.value || "BARBER";
  const assigned = new Set(currentAttendance
    .filter(record => record.person_type === type)
    .map(record => String(record.person_id)));
  const people = (type === "BARBER" ? catalogBarbers : catalogReceptionists)
    .filter(person => person.active && !assigned.has(String(person.id)));
  const previous = form.personId.value;
  form.personId.innerHTML = people.length
    ? people.map(person => `<option value="${person.id}">${escapeHtml(person.name)}</option>`).join("")
    : `<option value="">No hay personal disponible</option>`;
  if (people.some(person => String(person.id) === previous)) form.personId.value = previous;
  form.personId.disabled = !people.length;
  form.querySelector('button[type="submit"]').disabled = !people.length;
}

function renderAll() {
  renderSelects();
  renderShell();
  renderAppointments();
  renderServices();
  renderBarbers();
  renderReceptionists();
  renderUsers();
  renderCustomers();
  renderCart();
  renderShift();
  renderShiftHistory();
  renderSalesReport();
  renderCancellations();
  renderAttendance();
}

function switchView(view) {
  if (!document.getElementById(view)?.classList.contains("view")) view = "appointments";
  document.querySelectorAll(".view").forEach(item => item.classList.toggle("active", item.id === view));
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  const titles = {
    appointments: "Citas",
    cashier: "Caja",
    services: "Catálogo",
    barbers: "Personal",
    customers: "Clientes",
    sales: "Ventas",
    shift: "Corte de turno",
    attendance: "Checador"
  };
  $("#viewTitle").textContent = titles[view] || view;
  sessionStorage.setItem(ACTIVE_VIEW_KEY, view);
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
    <p>Folio: ${sale.receiptNumber ?? (sale.folio || sale.id).slice(0, 8).toUpperCase()}<br>Fecha: ${sale.date} ${sale.time}<br>Barbero: ${sale.barber}</p>
    <p>Cliente: ${sale.customer || "Publico general"}</p>
    ${sale.discount ? `<p>Descuento de cumpleaños: <strong>-${money(sale.discount)}</strong></p>` : ""}
    <hr>
    ${sale.items.map(item => `<p style="display:flex;justify-content:space-between"><span>${item.quantity > 1 ? `${item.quantity} × ` : ""}${item.name}</span><strong>${money(item.price * (item.quantity || 1))}</strong></p>`).join("")}
    <hr>
    <h3 style="display:flex;justify-content:space-between"><span>Total</span><span>${money(sale.total)}</span></h3>
    <p>Pago: ${sale.payment}</p>
    ${(sale.payments || []).map(payment => `
      <p style="display:flex;justify-content:space-between">
        <span>${paymentMethodLabels[payment.method]}</span>
        <strong>${money(payment.amount)}</strong>
      </p>
    `).join("")}
    ${(sale.payments || [])
      .filter(payment => payment.method === "CASH" && payment.changeAmount > 0)
      .map(payment => `<p>Cambio: <strong>${money(payment.changeAmount)}</strong></p>`)
      .join("")}
    <p style="text-align:center">Gracias por su visita</p>
  `;
}

function shiftTicket() {
  const salesToday = state.sales
    .filter(sale => currentShift
      && sale.shiftId === String(currentShift.id)
      && sale.status === "COMPLETED")
    .sort((a, b) =>
      `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
    );
  const total = salesToday.reduce((sum, sale) => sum + sale.total, 0);
  const paymentTotal = method => salesToday.reduce(
    (sum, sale) => sum + sale.payments
      .filter(payment => payment.method === method)
      .reduce((paymentSum, payment) => paymentSum + payment.amount, 0),
    0
  );
  const expenseTotal = (currentShift?.expenses || []).reduce(
    (sum, expense) => sum + Number(expense.amount), 0
  );
  const expectedCash = Number(currentShift?.opening_cash || 0) + paymentTotal("CASH") - expenseTotal;
  const difference = roundMoney(
    Number(currentShift?.cash_counted || 0) - expectedCash
    + Number(currentShift?.card_reported || 0) - paymentTotal("CARD")
    + Number(currentShift?.transfer_reported || 0) - paymentTotal("TRANSFER")
  );
  return `
    <h2 style="text-align:center;margin:0">BIZANTINO</h2>
    <p style="text-align:center;margin:0 0 10px">Corte de turno</p>
    <hr>
    <p>Fecha: ${currentShift?.business_date || todayISO()}<br>Turno: ${currentShift?.shift_type === "MORNING" ? "Matutino" : "Vespertino"}<br>Ventas: ${salesToday.length}</p>
    <p>Efectivo esperado: <strong>${money(expectedCash)}</strong><br>Efectivo contado: <strong>${money(currentShift?.cash_counted || 0)}</strong></p>
    <p>Tarjeta sistema/terminal: ${money(paymentTotal("CARD"))} / ${money(currentShift?.card_reported || 0)}<br>Transferencias sistema/verificadas: ${money(paymentTotal("TRANSFER"))} / ${money(currentShift?.transfer_reported || 0)}</p>
    <p>Gastos: <strong>${money(expenseTotal)}</strong></p>
    <p>Notas: ${escapeHtml(currentShift?.closing_notes || "Sin notas")}</p>
    ${(currentShift?.expenses || []).map(expense => `<p>${escapeHtml(expense.concept)}: -${money(expense.amount)}</p>`).join("")}
    <hr>
    <h3>Total: ${money(total)}</h3>
    <h3>Diferencia: ${money(difference)}</h3>
    <hr>
    ${salesToday.map(sale => `<p>Folio ${sale.receiptNumber ?? "—"} · ${sale.time} · ${sale.payment}<br>${sale.items.map(item => item.name).join(", ")}<br><strong>${money(sale.total)}</strong></p>`).join("")}
  `;
}

async function registerAttendanceEvent(recordId, attendanceEvent) {
  const response = await fetch(`${API_BASE_URL}/attendance/${recordId}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: attendanceEvent })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.detail || "No fue posible registrar la asistencia");
  await loadAttendanceFromApi();
  renderAttendance();
  showToast("Asistencia actualizada");
}

function closeAttendanceStatusModal() {
  pendingAttendanceStatus = null;
  $("#attendanceStatusModal").classList.add("hidden");
}

function openAttendanceStatusModal(recordId, attendanceEvent) {
  const record = currentAttendance.find(item => String(item.id) === String(recordId));
  const isAbsent = attendanceEvent === "ABSENT";
  pendingAttendanceStatus = { recordId, attendanceEvent };
  $("#attendanceStatusTitle").textContent = isAbsent ? "Asignar falta" : "Registrar permiso";
  $("#attendanceStatusMessage").textContent = isAbsent
    ? `¿Estás seguro de asignar una falta a ${record?.person_name || "esta persona"}?`
    : `¿Estás seguro de registrar un permiso para ${record?.person_name || "esta persona"}?`;
  $("#confirmAttendanceStatus").textContent = isAbsent ? "Sí, asignar falta" : "Sí, registrar permiso";
  $("#attendanceStatusModal").classList.remove("hidden");
}

$("#closeAttendanceStatus").addEventListener("click", closeAttendanceStatusModal);
$("#cancelAttendanceStatus").addEventListener("click", closeAttendanceStatusModal);
$("#confirmAttendanceStatus").addEventListener("click", async event => {
  if (!pendingAttendanceStatus) return;
  const pending = { ...pendingAttendanceStatus };
  event.currentTarget.disabled = true;
  try {
    await registerAttendanceEvent(pending.recordId, pending.attendanceEvent);
    closeAttendanceStatusModal();
  } catch (error) {
    showToast(error.message);
  } finally {
    event.currentTarget.disabled = false;
  }
});

document.addEventListener("click", async event => {
  const nav = event.target.closest("[data-view]");
  if (nav) switchView(nav.dataset.view);

  const attendanceEvent = event.target.closest("[data-attendance-event]");
  if (attendanceEvent) {
    const eventType = attendanceEvent.dataset.attendanceEvent;
    if (["ABSENT", "PERMISSION"].includes(eventType)) {
      openAttendanceStatusModal(attendanceEvent.dataset.recordId, eventType);
      return;
    }
    attendanceEvent.disabled = true;
    try {
      await registerAttendanceEvent(attendanceEvent.dataset.recordId, eventType);
    } catch (error) {
      showToast(error.message);
    } finally {
      attendanceEvent.disabled = false;
    }
  }

  const correctAttendance = event.target.closest("[data-correct-attendance]");
  if (correctAttendance) {
    const record = [...currentAttendance, ...attendanceHistory]
      .find(item => String(item.id) === correctAttendance.dataset.correctAttendance);
    if (record) {
      const form = $("#attendanceCorrectionForm");
      form.recordId.value = record.id;
      form.clockIn.value = localDateTimeInput(record.clock_in);
      form.mealOut.value = localDateTimeInput(record.meal_out);
      form.mealIn.value = localDateTimeInput(record.meal_in);
      form.clockOut.value = localDateTimeInput(record.clock_out);
      form.status.value = record.status;
      form.notes.value = record.notes || "";
      $("#attendanceCorrectionName").textContent = record.person_name;
      $("#attendanceCorrectionModal").classList.remove("hidden");
    }
  }

  const deleteSchedule = event.target.closest("[data-delete-schedule]");
  if (deleteSchedule) {
    if (deleteSchedule.dataset.confirmDelete !== "true") {
      deleteSchedule.dataset.confirmDelete = "true";
      deleteSchedule.textContent = "Confirmar eliminación";
      deleteSchedule.className = "secondary-button compact";
      showToast("Presiona nuevamente para eliminar el horario");
      return;
    }
    const response = await fetch(`${API_BASE_URL}/attendance/schedules/${deleteSchedule.dataset.deleteSchedule}`, { method: "DELETE" });
    if (response.ok) {
      await loadAttendanceFromApi();
      renderAttendance();
      showToast("Horario eliminado");
    } else {
      const result = await response.json().catch(() => ({}));
      showToast(result.detail || "No fue posible eliminar el horario");
    }
  }

  const appointmentTab = event.target.closest("[data-appointment-view]");
  if (appointmentTab) {
    appointmentView = appointmentTab.dataset.appointmentView;
    document.querySelectorAll("[data-appointment-view]").forEach(tab =>
      tab.classList.toggle("active", tab === appointmentTab)
    );
    renderAppointments();
  }

  const cancelSale = event.target.closest("[data-cancel-sale]");
  if (cancelSale) {
    const sale = state.sales.find(item => item.id === cancelSale.dataset.cancelSale);
    if (!sale) return;
    $("#saleCancellationForm").dataset.saleId = sale.id;
    $("#saleCancellationLabel").textContent =
      `Folio ${sale.receiptNumber ?? sale.folio.slice(0, 8)} · ${sale.customer || "Público general"} · ${money(sale.total)}`;
    $("#saleCancellationForm").reset();
    $("#saleCancellationModal").classList.remove("hidden");
    $("#saleCancellationForm").reason.focus();
  }

  const correctSaleReceipt = event.target.closest("[data-correct-sale-receipt]");
  if (correctSaleReceipt) {
    const sale = state.sales.find(item => item.id === correctSaleReceipt.dataset.correctSaleReceipt);
    if (!sale) return;
    const form = $("#saleReceiptCorrectionForm");
    form.reset();
    form.dataset.saleId = sale.id;
    form.receiptNumber.value = sale.receiptNumber ?? "";
    $("#saleReceiptCorrectionLabel").textContent =
      `Folio actual ${sale.receiptNumber ?? "—"} · ${sale.customer || "Público general"} · ${money(sale.total)}`;
    $("#saleReceiptCorrectionHistory").innerHTML = sale.receiptCorrections?.length
      ? `<strong>Correcciones anteriores</strong>${sale.receiptCorrections.slice().reverse().map(correction => `
          <p>${correction.oldReceiptNumber} → ${correction.newReceiptNumber}<br>
          <small>${escapeHtml(correction.reason)} · ${escapeHtml(correction.correctedByName)}</small></p>
        `).join("")}`
      : "";
    $("#saleReceiptCorrectionModal").classList.remove("hidden");
    form.receiptNumber.select();
  }

  const toggleShift = event.target.closest("[data-toggle-shift]");
  if (toggleShift) {
    const detail = $(`#shift-history-${toggleShift.dataset.toggleShift}`);
    const willOpen = detail.classList.contains("hidden");
    detail.classList.toggle("hidden", !willOpen);
    toggleShift.textContent = willOpen ? "Ocultar desglose" : "Ver desglose";
  }

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

  const birthdayDiscount = event.target.closest("[data-birthday-sale-discount]");
  if (birthdayDiscount) {
    birthdayDiscountServiceId = birthdayDiscountServiceId === "ALL" ? null : "ALL";
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

  const editReceptionist = event.target.closest("[data-edit-receptionist]");
  if (editReceptionist) {
    const receptionist = catalogReceptionists.find(item => item.id === editReceptionist.dataset.editReceptionist);
    if (receptionist) {
      const form = $("#receptionistForm");
      form.receptionistId.value = receptionist.id;
      form.name.value = receptionist.name;
      $("#receptionistFormTitle").textContent = "Editar recepcionista";
      $("#receptionistSubmitLabel").textContent = "Guardar cambios";
      $("#cancelReceptionistEdit").classList.remove("hidden");
      form.name.focus();
    }
  }

  const toggleReceptionist = event.target.closest("[data-toggle-receptionist]");
  if (toggleReceptionist) {
    const receptionist = catalogReceptionists.find(item => item.id === toggleReceptionist.dataset.toggleReceptionist);
    if (!receptionist) return;
    if (receptionist.active && !window.confirm(`¿Desactivar a "${receptionist.name}"?`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/receptionists/${receptionist.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !receptionist.active })
      });
      if (!response.ok) throw new Error("No fue posible cambiar el estado");
      await loadReceptionistsFromApi();
      renderAll();
      showToast(receptionist.active ? "Recepcionista desactivada" : "Recepcionista activada");
    } catch (error) {
      console.error(error);
      showToast("No se pudo actualizar la recepcionista");
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
      form.birthDate.value = formatBirthDate(customer.birthDate);
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
    try {
      if (action.dataset.action === "edit") {
        const form = $("#appointmentForm");
        form.appointmentId.value = appointment.id;
        form.phone.value = appointment.phone || "";
        form.customer.value = appointment.customer;
        form.birthDate.value = formatBirthDate(appointment.birthDate);
        form.date.value = appointment.date;
        form.time.value = appointment.time;
        updateAppointmentBarberOptions();
        form.barber.value = appointment.barberId || "";
        renderAppointmentServiceOptions(appointment.serviceIds || []);
        form.phone.disabled = true;
        form.customer.readOnly = true;
        form.birthDate.disabled = true;
        form.barber.disabled = false;
        $("#appointmentFormTitle").textContent = "Editar cita";
        $("#appointmentSubmitLabel").textContent = "Guardar cambios";
        $("#saveAnotherAppointment").classList.add("hidden");
        $("#saveAnotherAppointmentHelp").classList.add("hidden");
        form.querySelector("[data-customer-choice-wrap]").classList.add("hidden");
        $("#cancelAppointmentEdit").classList.remove("hidden");
        form.time.focus();
      }
      if (action.dataset.action === "confirm") {
        if (appointment.barberId && appointment.serviceIds.length) {
          await updateAppointmentStatus(appointment.id, "CONFIRMED", null, appointment.barberId, appointment.serviceIds);
          await loadAppointmentsFromApi();
          renderAll();
          showToast("Cita confirmada");
        } else {
          openAppointmentConfirmationModal(appointment);
          return;
        }
      }
      if (action.dataset.action === "cancel") {
        pendingCancellationAppointmentId = appointment.id;
        $("#cancellationAppointmentLabel").textContent =
          `${appointment.customer} · ${appointment.serviceName} · ${formatAppointmentDate(appointment.date)} ${appointment.time}`;
        $("#cancellationForm").reset();
        $("#cancellationModal").classList.remove("hidden");
        $("#cancellationForm").reason.focus();
        return;
      }
      if (action.dataset.action === "charge") {
        cart = appointment.serviceIds.map(serviceId => {
          const service = state.services.find(item => item.id === serviceId);
          return service ? { id: service.id, name: service.name, price: service.price } : null;
        }).filter(Boolean);
        $("#saleForm").customer.value = appointment.customer;
        $("#saleForm").phone.value = appointment.phone || "";
        $("#saleForm").birthDate.value = formatBirthDate(appointment.birthDate);
        $("#saleForm").customer.readOnly = true;
        $("#saleForm").customer.dataset.customerId = appointment.customerId;
        $("#saleForm").barber.value = appointment.barberId;
        pendingAppointmentId = appointment.id;
        switchView("cashier");
        renderCart();
      }
    } catch (error) {
      console.error(error);
      showToast("No se pudo actualizar la cita");
    }
  }
});

$("#quickAppointment").addEventListener("click", () => switchView("appointments"));
function closeHelpModal() {
  $("#helpModal").classList.add("hidden");
}
$("#openHelp").addEventListener("click", () => $("#helpModal").classList.remove("hidden"));
$("#closeHelpModal").addEventListener("click", closeHelpModal);
$("#finishHelp").addEventListener("click", closeHelpModal);
$("#appointmentSearch").addEventListener("input", renderAppointments);
$("#clearCart").addEventListener("click", () => {
  cart = [];
  birthdayDiscountServiceId = null;
  renderCart();
});
$("#paymentMethod").addEventListener("change", updatePaymentFields);
[
  "cashReceived",
  "mixedCash",
  "mixedCashReceived",
  "mixedCard",
  "mixedTransfer"
].forEach(fieldName => {
  $("#saleForm")[fieldName].addEventListener("input", updatePaymentFields);
});
$("#cancelServiceEdit").addEventListener("click", resetServiceForm);
$("#cancelAppointmentEdit").addEventListener("click", resetAppointmentForm);
$("#cancelBarberEdit").addEventListener("click", resetBarberForm);
$("#cancelReceptionistEdit").addEventListener("click", resetReceptionistForm);
$("#cancelUserEdit").addEventListener("click", resetUserForm);

$("#userList").addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit-user]");
  if (editButton) {
    const user = systemUsers.find(item => String(item.id) === editButton.dataset.editUser);
    if (!user) return;
    const form = $("#userForm");
    form.userId.value = user.id;
    form.fullName.value = user.full_name;
    form.username.value = user.username;
    form.role.value = user.role;
    form.password.value = "";
    form.password.required = false;
    $("#userFormTitle").textContent = "Editar cuenta";
    $("#userSubmitLabel").textContent = "Guardar cambios";
    $("#userPasswordHelp").textContent = "Déjala vacía para conservar la contraseña actual.";
    $("#cancelUserEdit").classList.remove("hidden");
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    form.fullName.focus();
    return;
  }

  const toggleButton = event.target.closest("[data-toggle-user]");
  if (!toggleButton || toggleButton.disabled) return;
  const user = systemUsers.find(item => String(item.id) === toggleButton.dataset.toggleUser);
  if (!user) return;
  if (user.active && !window.confirm(`¿Desactivar la cuenta de "${user.full_name}"?`)) return;
  try {
    const response = await fetch(`${API_BASE_URL}/users/${user.id}/active`, { method: "PATCH" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "No fue posible actualizar la cuenta");
    await loadUsersFromApi();
    renderUsers();
    showToast(result.active ? "Cuenta activada" : "Cuenta desactivada");
  } catch (error) {
    showToast(error.message || "No fue posible actualizar la cuenta");
  }
});
$("#cancelCustomerEdit").addEventListener("click", resetCustomerForm);

function closeAppointmentConfirmationModal() {
  pendingConfirmationAppointmentId = null;
  $("#appointmentConfirmationForm").reset();
  $("#appointmentConfirmationModal").classList.add("hidden");
}

function openAppointmentConfirmationModal(appointment) {
  pendingConfirmationAppointmentId = appointment.id;
  const usesCurrentShift = currentShift
    && appointment.date === currentShift.business_date;
  const barbers = usesCurrentShift
    ? currentShift.barbers
    : catalogBarbers.filter(barber => barber.active);
  const form = $("#appointmentConfirmationForm");
  const select = form.barber;
  select.innerHTML = `<option value="">Selecciona un barbero</option>` + barbers
    .map(barber => `<option value="${barber.id}">${escapeHtml(barber.name)}</option>`)
    .join("");
  confirmationSelectedServiceIds = [...(appointment.serviceIds || [])];
  $("#confirmationServiceOptions").innerHTML = serviceSelectionSummary(confirmationSelectedServiceIds);
  select.value = appointment.barberId || "";
  $("#appointmentConfirmationLabel").textContent =
    `${appointment.customer} · ${appointment.serviceName} · ${formatAppointmentDate(appointment.date)} ${appointment.time}`;
  $("#appointmentConfirmationModal").classList.remove("hidden");
  select.focus();
}

$("#closeAppointmentConfirmationModal").addEventListener("click", closeAppointmentConfirmationModal);
$("#cancelAppointmentConfirmationModal").addEventListener("click", closeAppointmentConfirmationModal);

function renderServicePicker() {
  $("#servicePickerGrid").innerHTML = state.services.map(service => `
    <button class="service-picker-card ${servicePickerDraftIds.has(service.id) ? "selected" : ""}"
      type="button" data-picker-service="${service.id}">
      <strong>${escapeHtml(service.name)}</strong>
      <span>${escapeHtml(service.type)}</span>
      <b>${money(service.price)}</b>
    </button>
  `).join("");
  const selected = state.services.filter(service => servicePickerDraftIds.has(service.id));
  $("#servicePickerCount").textContent = `${selected.length} servicio${selected.length === 1 ? "" : "s"}`;
  $("#servicePickerTotal").textContent = money(selected.reduce((sum, service) => sum + service.price, 0));
}

function openServicePicker(target) {
  servicePickerTarget = target;
  const selected = target === "confirmation"
    ? confirmationSelectedServiceIds
    : appointmentSelectedServiceIds;
  servicePickerDraftIds = new Set(selected.map(String));
  renderServicePicker();
  $("#servicePickerModal").classList.remove("hidden");
}

function closeServicePicker() {
  servicePickerTarget = null;
  $("#servicePickerModal").classList.add("hidden");
}

$("#openAppointmentServicePicker").addEventListener("click", () => openServicePicker("appointment"));
$("#openConfirmationServicePicker").addEventListener("click", () => openServicePicker("confirmation"));
$("#closeServicePickerModal").addEventListener("click", closeServicePicker);
$("#cancelServicePickerModal").addEventListener("click", closeServicePicker);
$("#servicePickerGrid").addEventListener("click", event => {
  const card = event.target.closest("[data-picker-service]");
  if (!card) return;
  const serviceId = card.dataset.pickerService;
  if (servicePickerDraftIds.has(serviceId)) servicePickerDraftIds.delete(serviceId);
  else servicePickerDraftIds.add(serviceId);
  renderServicePicker();
});
$("#applyServicePicker").addEventListener("click", () => {
  const selected = [...servicePickerDraftIds];
  if (servicePickerTarget === "confirmation") {
    confirmationSelectedServiceIds = selected;
    $("#confirmationServiceOptions").innerHTML = serviceSelectionSummary(selected);
  } else {
    renderAppointmentServiceOptions(selected);
  }
  closeServicePicker();
});

$("#appointmentConfirmationForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!pendingConfirmationAppointmentId) return;
  const form = event.currentTarget;
  const serviceIds = checkedServiceIds("confirmationServiceOptions");
  if (!serviceIds.length) {
    showToast("Selecciona al menos un servicio");
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await updateAppointmentStatus(
      pendingConfirmationAppointmentId,
      "CONFIRMED",
      null,
      form.barber.value,
      serviceIds
    );
    await loadAppointmentsFromApi();
    closeAppointmentConfirmationModal();
    renderAll();
    showToast("Cita confirmada con barbero y servicio");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No fue posible confirmar la cita");
  } finally {
    button.disabled = false;
  }
});

function closeCancellationModal() {
  pendingCancellationAppointmentId = null;
  $("#cancellationForm").reset();
  $("#cancellationModal").classList.add("hidden");
}
$("#closeCancellationModal").addEventListener("click", closeCancellationModal);
$("#cancelCancellationModal").addEventListener("click", closeCancellationModal);
$("#cancellationForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!pendingCancellationAppointmentId) return;
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    await updateAppointmentStatus(
      pendingCancellationAppointmentId,
      "CANCELLED",
      form.reason.value.trim()
    );
    await loadAppointmentsFromApi();
    closeCancellationModal();
    appointmentView = "history";
    document.querySelectorAll("[data-appointment-view]").forEach(tab =>
      tab.classList.toggle("active", tab.dataset.appointmentView === "history")
    );
    renderAll();
    showToast("Cita cancelada");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No fue posible cancelar la cita");
  } finally {
    submitButton.disabled = false;
  }
});
$("#customerSearch").addEventListener("input", renderCustomers);
$("#salesDateFrom").addEventListener("change", renderSalesReport);
$("#salesDateTo").addEventListener("change", renderSalesReport);
$("#salesBarberFilter").addEventListener("change", renderSalesReport);
$("#salesSearch").addEventListener("input", renderSalesReport);
$("#cancellationSearch").addEventListener("input", renderCancellations);

function closeSaleCancellationModal() {
  $("#saleCancellationForm").reset();
  $("#saleCancellationModal").classList.add("hidden");
  delete $("#saleCancellationForm").dataset.saleId;
}

$("#closeSaleCancellationModal").addEventListener("click", closeSaleCancellationModal);
$("#cancelSaleCancellationModal").addEventListener("click", closeSaleCancellationModal);
$("#saleCancellationForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const saleId = form.dataset.saleId;
  const reason = form.reason.value.trim();
  if (!saleId || !reason) return;
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/sales/${saleId}/cancel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.detail || "No fue posible cancelar la venta");
    }
    await Promise.all([loadSalesFromApi(), loadCurrentShiftFromApi(), loadShiftHistoryFromApi()]);
    closeSaleCancellationModal();
    renderAll();
    showToast("Venta cancelada y conservada en el historial");
  } catch (error) {
    showToast(error.message || "No fue posible cancelar la venta");
  } finally {
    submitButton.disabled = false;
  }
});

function closeSaleReceiptCorrectionModal() {
  $("#saleReceiptCorrectionForm").reset();
  $("#saleReceiptCorrectionModal").classList.add("hidden");
  delete $("#saleReceiptCorrectionForm").dataset.saleId;
}

$("#closeSaleReceiptCorrectionModal").addEventListener("click", closeSaleReceiptCorrectionModal);
$("#cancelSaleReceiptCorrectionModal").addEventListener("click", closeSaleReceiptCorrectionModal);
$("#saleReceiptCorrectionForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const saleId = form.dataset.saleId;
  const receiptNumber = Number(form.receiptNumber.value);
  const reason = form.reason.value.trim();
  if (!saleId || !reason) return;
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/sales/${saleId}/receipt-number`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipt_number: receiptNumber, reason })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.detail || "No fue posible corregir el folio");
    }
    await Promise.all([loadSalesFromApi(), loadCurrentShiftFromApi(), loadShiftHistoryFromApi()]);
    closeSaleReceiptCorrectionModal();
    renderAll();
    showToast("Folio corregido; el cambio quedó registrado");
  } catch (error) {
    showToast(error.message || "No fue posible corregir el folio");
  } finally {
    submitButton.disabled = false;
  }
});
$("#goToCancellations").addEventListener("click", () =>
  $(".cancellations-panel").scrollIntoView({ behavior: "smooth", block: "start" })
);
$("#backToSales").addEventListener("click", () =>
  $("#salesReportPanel").scrollIntoView({ behavior: "smooth", block: "start" })
);
$("#appointmentForm").phone.addEventListener("input", () =>
  autofillCustomerByPhone($("#appointmentForm"))
);
$("#appointmentForm").customerChoice.addEventListener("change", event =>
  applyCustomerChoice($("#appointmentForm"), event.target.value)
);
$("#appointmentForm").date.addEventListener("change", updateAppointmentBarberOptions);
$("#saleForm").phone.addEventListener("input", () =>
  autofillCustomerByPhone($("#saleForm"))
);
$("#saleForm").customerChoice.addEventListener("change", event => {
  applyCustomerChoice($("#saleForm"), event.target.value);
  birthdayDiscountServiceId = null;
  renderCart();
});
document.querySelectorAll('input[name="birthDate"]').forEach(input => {
  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "").slice(0, 8);
    input.value = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
      .filter(Boolean)
      .join("/");
    if (input.form?.id === "saleForm") {
      birthdayDiscountServiceId = null;
      renderCart();
    }
  });
});

$("#scheduleForm").weekStart.addEventListener("change", event => {
  const selected = event.currentTarget.value;
  const normalized = normalizeSelectedWeekStart(selected);
  event.currentTarget.value = normalized;
  if (selected && selected !== normalized) showToast(`La semana se ajustó al sábado ${formatAppointmentDate(normalized)}`);
  renderWeeklySchedule();
});
$("#scheduleForm").shiftType.addEventListener("change", renderWeeklySchedule);
$("#savedSchedulesPanel").addEventListener("click", event => {
  const button = event.target.closest("[data-view-saved-schedule]");
  if (!button) return;
  $("#scheduleForm").shiftType.value = button.dataset.viewSavedSchedule;
  renderWeeklySchedule();
  $("#scheduleForm").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#schedulePeopleOptions").addEventListener("change", event => {
  if (!event.target.matches('input[type="checkbox"]')) return;
  captureVisibleScheduleDraft();
  if (event.target.checked) selectedSchedulePeople.add(event.target.value);
  else selectedSchedulePeople.delete(event.target.value);
  renderWeeklySchedule();
});
$("#scheduleRows").addEventListener("change", event => {
  if (!event.target.matches("[data-schedule-rest]")) return;
  const times = event.target.closest("[data-schedule-cell]").querySelector("[data-schedule-times]");
  times.classList.toggle("hidden", event.target.checked);
  if (event.target.checked) times.querySelectorAll("input").forEach(input => { input.value = ""; });
});

function closeRepeatScheduleModal() {
  $("#repeatScheduleModal").classList.add("hidden");
  $("#repeatScheduleForm").reset();
  scheduleCopySourceCell = null;
}

$("#scheduleRows").addEventListener("click", event => {
  const button = event.target.closest("[data-repeat-schedule]");
  if (!button) return;
  scheduleCopySourceCell = button.closest("[data-schedule-cell]");
  const sourceDay = Number(scheduleCopySourceCell.dataset.day);
  const personName = scheduleCopySourceCell.closest("tr").querySelector(".schedule-person strong").textContent;
  $("#repeatScheduleDescription").textContent = `${personName}: repetir el horario de ${weekDayLabels[sourceDay]} en:`;
  $("#repeatScheduleDays").innerHTML = weekDayLabels.map((day, index) => index === sourceDay ? "" :
    `<label><input type="checkbox" name="targetDay" value="${index}"> ${day}</label>`
  ).join("");
  $("#repeatScheduleModal").classList.remove("hidden");
});

$("#closeRepeatSchedule").addEventListener("click", closeRepeatScheduleModal);
$("#cancelRepeatSchedule").addEventListener("click", closeRepeatScheduleModal);
$("#repeatScheduleForm").addEventListener("submit", event => {
  event.preventDefault();
  if (!scheduleCopySourceCell) return;
  const selectedDays = [...event.currentTarget.querySelectorAll('input[name="targetDay"]:checked')]
    .map(input => input.value);
  if (!selectedDays.length) return showToast("Selecciona al menos un día");
  const personType = scheduleCopySourceCell.dataset.personType;
  const personId = scheduleCopySourceCell.dataset.personId;
  const resting = scheduleCopySourceCell.querySelector("[data-schedule-rest]").checked;
  const sourceValues = Object.fromEntries(
    [...scheduleCopySourceCell.querySelectorAll("[data-field]")].map(input => [input.dataset.field, input.value])
  );
  selectedDays.forEach(day => {
    const target = $("#scheduleRows").querySelector(
      `[data-schedule-cell][data-person-type="${personType}"][data-person-id="${personId}"][data-day="${day}"]`
    );
    target.querySelector("[data-schedule-rest]").checked = resting;
    target.querySelector("[data-schedule-times]").classList.toggle("hidden", resting);
    target.querySelectorAll("[data-field]").forEach(input => {
      input.value = resting ? "" : sourceValues[input.dataset.field];
    });
  });
  closeRepeatScheduleModal();
  showToast(`Horario repetido en ${selectedDays.length} día${selectedDays.length === 1 ? "" : "s"}`);
});

$("#copyPreviousWeek").addEventListener("click", () => {
  const form = $("#scheduleForm");
  const current = new Date(`${form.weekStart.value}T12:00:00`);
  current.setDate(current.getDate() - 7);
  const previousWeek = current.toISOString().slice(0, 10);
  const previous = workSchedules.filter(item => item.week_start === previousWeek && item.shift_type === form.shiftType.value);
  if (!previous.length) return showToast("La semana anterior no tiene horarios guardados");
  workSchedules = workSchedules.filter(item => !(item.week_start === form.weekStart.value && item.shift_type === form.shiftType.value));
  workSchedules.push(...previous.map(item => ({ ...item, id: null, week_start: form.weekStart.value })));
  selectedSchedulePeople = new Set(previous.map(item => schedulePersonKey(item.person_type, item.person_id)));
  renderWeeklySchedule();
  showToast("Semana anterior copiada. Presiona Guardar para confirmar");
});

async function downloadExcel(url, fallbackName) {
  const response = await fetch(url);
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.detail || "No fue posible generar el archivo Excel");
  }
  const disposition = response.headers.get("Content-Disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallbackName;
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

$("#exportScheduleExcel").addEventListener("click", async event => {
  const form = $("#scheduleForm");
  event.currentTarget.disabled = true;
  try {
    const params = new URLSearchParams({ week_start: form.weekStart.value, shift_type: form.shiftType.value });
    await downloadExcel(`${API_BASE_URL}/attendance/export/schedule?${params}`, `horario_${form.weekStart.value}.xlsx`);
    showToast("Horario exportado a Excel");
  } catch (error) {
    showToast(error.message);
  } finally {
    event.currentTarget.disabled = false;
  }
});

$("#attendanceHistoryGroups").addEventListener("click", async event => {
  const button = event.target.closest("[data-export-attendance-week]");
  if (!button) return;
  button.disabled = true;
  try {
    const week = button.dataset.exportAttendanceWeek;
    await downloadExcel(`${API_BASE_URL}/attendance/export/history?week_start=${encodeURIComponent(week)}`, `asistencias_${week}.xlsx`);
    showToast("Asistencias exportadas a Excel");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

$("#scheduleForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const selectedKeys = new Set(
      [...$("#schedulePeopleOptions").querySelectorAll('input[type="checkbox"]:checked')]
        .map(input => input.value)
    );
    if (!selectedKeys.size) throw new Error("Selecciona al menos una persona para este turno");
    const schedules = [...form.querySelectorAll("[data-schedule-cell]")].flatMap(cell => {
    const resting = cell.querySelector("[data-schedule-rest]").checked;
    const value = field => cell.querySelector(`[data-field="${field}"]`).value || null;
    const startTime = value("start_time");
    const endTime = value("end_time");
    if (!resting && !startTime && !endTime) return [];
    if (!resting && (!startTime || !endTime)) throw new Error("Cada día trabajado necesita entrada y salida");
    return [{
      week_start: form.weekStart.value,
      person_type: cell.dataset.personType,
      person_id: Number(cell.dataset.personId),
      day_of_week: Number(cell.dataset.day),
      shift_type: form.shiftType.value,
      status: resting ? "REST" : "WORK",
      start_time: resting ? null : startTime,
      end_time: resting ? null : endTime,
      meal_start: resting ? null : value("meal_start"),
      meal_end: resting ? null : value("meal_end")
    }];
  });
    const peopleWithSchedule = new Set(schedules.map(item => schedulePersonKey(item.person_type, item.person_id)));
    if ([...selectedKeys].some(key => !peopleWithSchedule.has(key))) {
      throw new Error("Cada persona seleccionada necesita al menos un día de trabajo o descanso");
    }
    selectedSchedulePeople = selectedKeys;
    const payload = { week_start: form.weekStart.value, shift_type: form.shiftType.value, schedules };
    const response = await fetch(`${API_BASE_URL}/attendance/schedules/week`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "No fue posible guardar el horario");
    workSchedules = workSchedules.filter(item => !(
      String(item.week_start).slice(0, 10) === form.weekStart.value &&
      item.shift_type === form.shiftType.value
    ));
    workSchedules.push(...result);
    renderAttendance();
    showToast("Semana completa guardada");
  } catch (error) {
    showToast(error.message);
  }
});

function closeAttendanceCorrectionModal() {
  $("#attendanceCorrectionModal").classList.add("hidden");
  $("#attendanceCorrectionForm").reset();
}
$("#closeAttendanceCorrection").addEventListener("click", closeAttendanceCorrectionModal);
$("#cancelAttendanceCorrection").addEventListener("click", closeAttendanceCorrectionModal);
$("#attendanceCorrectionForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const toIso = value => value ? new Date(value).toISOString() : null;
  try {
    const response = await fetch(`${API_BASE_URL}/attendance/${form.recordId.value}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clock_in: toIso(form.clockIn.value), meal_out: toIso(form.mealOut.value),
        meal_in: toIso(form.mealIn.value), clock_out: toIso(form.clockOut.value),
        status: form.status.value, notes: form.notes.value || null
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "No fue posible corregir la asistencia");
    closeAttendanceCorrectionModal();
    await loadAttendanceFromApi();
    renderAttendance();
    showToast("Asistencia corregida");
  } catch (error) {
    showToast(error.message);
  }
});

$("#addShiftPersonForm").personType.addEventListener("change", renderCurrentShiftPersonForm);
$("#addShiftPersonForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  if (!currentShift || !form.personId.value) return;
  button.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/attendance/current/person`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        person_type: form.personType.value,
        person_id: Number(form.personId.value)
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "No fue posible agregar al personal");
    await Promise.all([loadCurrentShiftFromApi(), loadAttendanceFromApi()]);
    renderAll();
    showToast(`${result.person_name} fue agregado al turno actual`);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

$("#openShiftForm").shiftType.addEventListener("change", applyScheduledStaffToOpenShift);

$("#openShiftForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const barberIds = [...form.querySelectorAll('input[name="barberIds"]:checked')]
    .map(input => Number(input.value));
  if (!barberIds.length) {
    showToast("Selecciona al menos un barbero");
    return;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/shifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shift_type: form.shiftType.value,
        opening_cash: Number(form.openingCash.value || 0),
        starting_receipt_number: Number(form.startingReceiptNumber.value || 0),
        receptionist_id: Number(form.receptionistId.value),
        barber_ids: barberIds
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "No fue posible abrir el turno");
    currentShift = result;
    await loadAttendanceFromApi();
    renderAll();
    switchView("cashier");
    showToast("Turno abierto correctamente");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No fue posible abrir el turno");
  }
});

$("#expenseForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!currentShift) return;
  try {
    const response = await fetch(`${API_BASE_URL}/shifts/${currentShift.id}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        concept: form.concept.value.trim(),
        amount: Number(form.amount.value)
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "No fue posible registrar el gasto");
    form.reset();
    await loadCurrentShiftFromApi();
    renderAll();
    showToast("Gasto registrado");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No fue posible registrar el gasto");
  }
});

$("#closeShiftForm").addEventListener("input", renderShift);
$("#shiftEvidenceInput").addEventListener("change", event => {
  const file = event.currentTarget.files[0];
  $("#shiftEvidenceFileName").textContent = file ? file.name : "Ninguna imagen seleccionada";
  $("#removeSelectedEvidence").classList.toggle("hidden", !file);
});

$("#removeSelectedEvidence").addEventListener("click", () => {
  $("#shiftEvidenceInput").value = "";
  $("#shiftEvidenceFileName").textContent = "Ninguna imagen seleccionada";
  $("#removeSelectedEvidence").classList.add("hidden");
  showToast("Selección de imagen eliminada");
});

$("#shiftEvidenceForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentShift) return;
  const form = event.currentTarget;
  const closeForm = $("#closeShiftForm");
  const closeDraft = {
    cashSalesCounted: closeForm.cashSalesCounted.value,
    cardReported: closeForm.cardReported.value,
    transferReported: closeForm.transferReported.value,
    closingNotes: closeForm.closingNotes.value
  };
  const previousScrollPosition = window.scrollY;
  const file = form.evidence.files[0];
  if (!file) return showToast("Selecciona una imagen del checador");
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const body = new FormData();
    body.append("evidence", file);
    const response = await fetch(`${API_BASE_URL}/shifts/${currentShift.id}/evidence`, {
      method: "POST",
      body
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "No fue posible subir la evidencia");
    currentShift = result;
    form.reset();
    $("#shiftEvidenceFileName").textContent = "Ninguna imagen seleccionada";
    $("#removeSelectedEvidence").classList.add("hidden");
    renderShift();
    closeForm.cashSalesCounted.value = closeDraft.cashSalesCounted;
    closeForm.cardReported.value = closeDraft.cardReported;
    closeForm.transferReported.value = closeDraft.transferReported;
    closeForm.closingNotes.value = closeDraft.closingNotes;
    renderShift();
    switchView("shift");
    window.scrollTo({ top: previousScrollPosition, behavior: "instant" });
    showToast("Evidencia del checador guardada");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No fue posible subir la evidencia");
  } finally {
    button.disabled = false;
  }
});

$("#closeShiftForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentShift) return;
  if (!currentShift.evidence_url) {
    showToast("Adjunta la evidencia del checador antes de cerrar el turno");
    $("#shiftEvidenceForm").scrollIntoView({ behavior: "smooth", block: "center" });
    $("#shiftEvidenceInput").focus();
    return;
  }
  const form = event.currentTarget;
  const fundReserved = Number(currentShift.opening_cash || 0);
  const cashSalesCounted = Number(form.cashSalesCounted.value || 0);
  pendingCloseShiftData = {
    cash_counted: roundMoney(fundReserved + cashSalesCounted),
    card_reported: Number(form.cardReported.value || 0),
    transfer_reported: Number(form.transferReported.value || 0),
    closing_notes: form.closingNotes.value.trim() || null,
    receipt_gap_reason: form.receiptGapReason.value.trim() || null
  };
  $("#closeShiftConfirmationSummary").innerHTML = `
    <div class="cut-line"><span>Turno</span><strong>${currentShift.shift_type === "MORNING" ? "Matutino" : "Vespertino"}</strong></div>
    <div class="cut-line"><span>Fondo que queda en caja</span><strong>${money(fundReserved)}</strong></div>
    <div class="cut-line"><span>Efectivo de ventas entregado</span><strong>${money(cashSalesCounted)}</strong></div>
    <div class="cut-line"><span>Total efectivo contado</span><strong>${money(pendingCloseShiftData.cash_counted)}</strong></div>
    <div class="cut-line"><span>Corte de terminal</span><strong>${money(pendingCloseShiftData.card_reported)}</strong></div>
    <div class="cut-line"><span>Transferencias</span><strong>${money(pendingCloseShiftData.transfer_reported)}</strong></div>
    <div class="cut-line total"><span>Resultado</span><strong>${$("#reconciliationResult strong").textContent}</strong></div>
    <div class="closing-notes"><strong>Notas</strong><p>${escapeHtml(pendingCloseShiftData.closing_notes || "Sin notas")}</p></div>
    ${(currentShift.missing_receipt_numbers || []).length ? `<div class="closing-notes"><strong>Folios faltantes</strong><p>${currentShift.missing_receipt_numbers.map(number => String(number).padStart(4, "0")).join(", ")}</p><strong>Motivo</strong><p>${escapeHtml(pendingCloseShiftData.receipt_gap_reason || "Sin motivo")}</p></div>` : ""}
  `;
  $("#closeShiftModal").classList.remove("hidden");
});

function closeCloseShiftModal() {
  pendingCloseShiftData = null;
  $("#closeShiftModal").classList.add("hidden");
}

$("#closeShiftModalButton").addEventListener("click", closeCloseShiftModal);
$("#cancelCloseShift").addEventListener("click", closeCloseShiftModal);
$("#confirmCloseShift").addEventListener("click", async event => {
  if (!currentShift || !pendingCloseShiftData) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/shifts/${currentShift.id}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pendingCloseShiftData)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "No fue posible cerrar el turno");
    $("#closeShiftModal").classList.add("hidden");
    currentShift = null;
    pendingCloseShiftData = null;
    await Promise.all([loadShiftHistoryFromApi(), loadSuggestedReceiptFromApi(), loadAttendanceFromApi()]);
    $("#closeShiftForm").reset();
    renderAll();
    showToast("Turno cerrado correctamente");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No fue posible cerrar el turno");
  } finally {
    button.disabled = false;
  }
});

$("#appointmentForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const appointmentId = form.appointmentId.value;
  const saveAnother = !appointmentId && event.submitter?.dataset.saveAnother === "true";
  const retainedValues = saveAnother ? {
    phone: form.phone.value,
    date: form.date.value,
    time: form.time.value
  } : null;
  const serviceIds = checkedServiceIds("appointmentServiceOptions");
  const submitButton = event.submitter || form.querySelector('button[type="submit"]');
  const duplicate = appointmentConflicts(form, appointmentId || null);
  if (duplicate) {
    showToast("Ese barbero ya tiene una cita dentro de ese lapso de 15 minutos");
    return;
  }
  submitButton.disabled = true;
  try {
    const customer = appointmentId
      ? null
      : await ensureCustomer(
          form.customer.value,
          form.phone.value,
          form.birthDate.value,
          form.customer.dataset.customerId
        );
    const response = await fetch(
      appointmentId
        ? `${API_BASE_URL}/appointments/${appointmentId}`
        : `${API_BASE_URL}/appointments`, {
      method: appointmentId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(appointmentId
        ? {
            barber_id: form.barber.value ? Number(form.barber.value) : null,
            service_ids: serviceIds.map(Number),
            appointment_date: form.date.value,
            appointment_time: form.time.value
          }
        : {
            customer_id: Number(customer.id),
            barber_id: form.barber.value ? Number(form.barber.value) : null,
            service_ids: serviceIds.map(Number),
            appointment_date: form.date.value,
            appointment_time: form.time.value
          })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.detail || "No fue posible guardar la cita");
    }

    await loadAppointmentsFromApi();
    resetAppointmentForm();
    if (retainedValues) {
      form.phone.value = retainedValues.phone;
      form.date.value = retainedValues.date;
      form.time.value = retainedValues.time;
      autofillCustomerByPhone(form, true);
    }
    saveState();
    renderAll();
    if (retainedValues) form.customer.focus();
    showToast(
      appointmentId
        ? "Cita actualizada"
        : (saveAnother ? "Cita guardada. Agrega a la siguiente persona" : "Cita guardada")
    );
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo registrar la cita");
  } finally {
    submitButton.disabled = false;
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

$("#receptionistForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const receptionistId = form.receptionistId.value;
  const currentReceptionist = catalogReceptionists.find(item => item.id === receptionistId);
  try {
    const response = await fetch(
      receptionistId
        ? `${API_BASE_URL}/receptionists/${receptionistId}`
        : `${API_BASE_URL}/receptionists`,
      {
        method: receptionistId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.value.trim(),
          active: currentReceptionist?.active ?? true
        })
      }
    );
    if (!response.ok) throw new Error("No fue posible guardar la recepcionista");
    resetReceptionistForm();
    await loadReceptionistsFromApi();
    renderAll();
    showToast(receptionistId ? "Recepcionista actualizada" : "Recepcionista agregada");
  } catch (error) {
    console.error(error);
    showToast("No se pudo guardar la recepcionista");
  }
});

$("#userForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const userId = form.userId.value;
  const payload = {
    full_name: form.fullName.value.trim(),
    username: form.username.value.trim(),
    role: form.role.value,
    password: form.password.value || (userId ? null : "")
  };
  try {
    const response = await fetch(userId ? `${API_BASE_URL}/users/${userId}` : `${API_BASE_URL}/users`, {
      method: userId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "No fue posible guardar la cuenta");
    if (String(result.id) === String(authenticatedUser?.id)) {
      authenticatedUser = { ...authenticatedUser, ...result };
      $("#sessionUserName").textContent = result.full_name;
    }
    resetUserForm();
    await loadUsersFromApi();
    renderUsers();
    showToast(userId ? "Cuenta actualizada" : "Cuenta creada");
  } catch (error) {
    console.error(error);
    const detail = Array.isArray(error.message) ? "Revisa los datos de la cuenta" : error.message;
    showToast(detail || "No fue posible guardar la cuenta");
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
          birth_date: parseBirthDate(form.birthDate.value),
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
    showToast(error.message || "No se pudo guardar el cliente");
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
    if (!currentShift) throw new Error("Primero abre un turno en Corte de turno");
    const customer = await ensureCustomer(
      form.customer.value,
      form.phone.value,
      form.birthDate.value,
      form.customer.dataset.customerId
    );
    const total = getCartTotal();
    const birthdayDiscount = getBirthdayDiscount();
    const itemQuantities = new Map();
    cart.forEach(item => {
      itemQuantities.set(item.id, (itemQuantities.get(item.id) || 0) + 1);
    });
    const response = await fetch(`${API_BASE_URL}/sales`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customer ? Number(customer.id) : null,
        barber_id: Number(form.barber.value),
        appointment_id: pendingAppointmentId ? Number(pendingAppointmentId) : null,
        shift_id: Number(currentShift.id),
        receipt_number: Number(form.receiptNumber.value),
        discount: birthdayDiscount,
        birthday_discount: birthdayDiscountServiceId === "ALL",
        birthday_service_id: null,
        items: [...itemQuantities].map(([serviceId, quantity]) => ({
          service_id: Number(serviceId),
          quantity
        })),
        payments: buildPayments(form, total)
      })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.detail || "No fue posible registrar la venta");
    }
    const sale = mapSaleFromApi(await response.json());

    cart = [];
    birthdayDiscountServiceId = null;
    form.reset();
    form.customer.readOnly = false;
    delete form.customer.dataset.customerId;
    form.querySelector("[data-customer-choice-wrap]").classList.add("hidden");
    pendingAppointmentId = null;
    await Promise.all([
      loadSalesFromApi(),
      loadAppointmentsFromApi(),
      loadCurrentShiftFromApi()
    ]);
    renderAll();
    showToast(customer ? "Venta y cliente guardados" : "Venta registrada");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo registrar la venta");
  }
});

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  $("#loginError").classList.add("hidden");
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: form.username.value.trim(), password: form.password.value })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "No fue posible iniciar sesión");
    showApplication(result);
    form.reset();
    await loadApplicationData();
  } catch (error) {
    showLogin(error.message || "No fue posible iniciar sesión");
    $("#loginForm").username.focus();
  } finally {
    button.disabled = false;
  }
});

$("#logoutButton").addEventListener("click", async () => {
  await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST" }).catch(() => null);
  showLogin();
  $("#loginForm").username.focus();
});

async function initialize() {
  $("#appointmentForm").date.value = todayISO();
  $("#appointmentForm").time.value = nowTime();
  $("#salesDateFrom").value = currentWeekStartISO();
  $("#salesDateTo").value = todayISO();
  renderAll();
  switchView(sessionStorage.getItem(ACTIVE_VIEW_KEY) || "appointments");

  try {
    const authResponse = await fetch(`${API_BASE_URL}/auth/me`);
    if (!authResponse.ok) return showLogin();
    showApplication(await authResponse.json());
    await loadApplicationData();
  } catch (error) {
    console.error(error);
    showLogin("No fue posible conectar con el servidor");
  }
}

initialize();
