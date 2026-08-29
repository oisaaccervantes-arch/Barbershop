const deploymentBasePath = window.location.pathname.startsWith("/bizantino/") ? "/bizantino" : "";
const API_URL = `${window.location.origin}${deploymentBasePath}/api/timeclock`;
const $ = selector => document.querySelector(selector);
const eventLabels = {
  CLOCK_IN: ["login", "Registrar entrada"],
  MEAL_OUT: ["restaurant", "Salir a comida"],
  MEAL_IN: ["keyboard_return", "Regresar de comida"],
  CLOCK_OUT: ["logout", "Registrar salida"]
};
let activePin = "";
let selectedEvent = null;
let capturedBlob = null;
let cameraStream = null;
const REMOTE_CAMERA_PATTERN = /(android|iphone|ipad|phone|tel[eé]fono|celular|continuity|droidcam|iriun|epoccam|camo|phone link|enlace m[oó]vil|v[ií]nculo m[oó]vil|windows virtual camera|virtual camera|remote camera|wireless camera|galaxy|pixel|motorola|xiaomi|redmi|oneplus|obs)/i;

function isRemoteCamera(label = "") {
  return REMOTE_CAMERA_PATTERN.test(label);
}

async function localCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
    throw new Error("Este navegador no permite utilizar la cámara de la PC");
  }

  const devices = (await navigator.mediaDevices.enumerateDevices())
    .filter(device => device.kind === "videoinput" && !isRemoteCamera(device.label));
  if (!devices.length) {
    throw new Error("No se encontró una cámara local. Desactiva la cámara del celular sincronizado y conecta la webcam de esta PC");
  }

  let lastError = null;
  for (const device of devices) {
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: device.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      const label = stream.getVideoTracks()[0]?.label || device.label;
      if (isRemoteCamera(label)) {
        stream.getTracks().forEach(track => track.stop());
        continue;
      }
      return stream;
    } catch (error) {
      if (stream) stream.getTracks().forEach(track => track.stop());
      lastError = error;
    }
  }
  throw lastError || new Error("No se encontró una cámara física disponible en esta PC");
}

function setStep(id) {
  ["pinStep", "actionStep", "cameraStep", "successStep"].forEach(step =>
    $(`#${step}`).classList.toggle("hidden", step !== id)
  );
}

function updateClock() {
  const now = new Date();
  $("#currentTime").textContent = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  $("#currentDate").textContent = now.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

function renderPinDots() {
  $("#pinDots").innerHTML = Array.from({ length: 8 }, (_, index) =>
    `<span class="${index < $("#pinInput").value.length ? "filled" : ""}"></span>`
  ).join("");
}

function errorMessage(target, message = "") {
  target.textContent = message;
  target.classList.toggle("hidden", !message);
}

async function lookupPin(pin) {
  const response = await fetch(`${API_URL}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.detail || "No fue posible consultar el checador");
  return result;
}

function localTime(value) {
  return value ? new Date(value).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—";
}

function showActions(status) {
  $("#employeeName").textContent = status.person_name;
  const shift = status.shift_type === "MORNING" ? "Matutino" : "Vespertino";
  $("#scheduleSummary").textContent = `${shift} · Horario ${status.scheduled_start || "sin hora"}–${status.scheduled_end || "sin hora"} · Entrada real ${localTime(status.clock_in)}`;
  if (!status.available_events.length) {
    $("#actionOptions").innerHTML = `<p class="clock-error">Ya completaste todos tus movimientos de este turno.</p>`;
  } else {
    $("#actionOptions").innerHTML = status.available_events.map(event => {
      const [icon, label] = eventLabels[event];
      const warning = event === "MEAL_OUT" && !status.meal_scheduled ? " · fuera del horario asignado" : "";
      return `<button class="action-button ${event.includes("MEAL") ? "meal" : ""}" type="button" data-event="${event}"><span class="material-symbols-outlined">${icon}</span>${label}${warning}</button>`;
    }).join("");
  }
  setStep("actionStep");
}

async function startCamera() {
  capturedBlob = null;
  $("#photoPreview").classList.add("hidden");
  $("#cameraVideo").classList.remove("hidden");
  $("#capturePhoto").classList.remove("hidden");
  $("#retakePhoto").classList.add("hidden");
  $("#submitPunch").classList.add("hidden");
  errorMessage($("#cameraError"));
  setStep("cameraStep");
  try {
    cameraStream = await localCameraStream();
    $("#cameraVideo").srcObject = cameraStream;
  } catch (error) {
    errorMessage($("#cameraError"), error.message || "No fue posible abrir la cámara local. Autoriza el permiso de cámara en el navegador.");
    $("#capturePhoto").classList.add("hidden");
  }
}

function stopCamera() {
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  cameraStream = null;
  $("#cameraVideo").srcObject = null;
}

function resetClock() {
  stopCamera();
  activePin = "";
  selectedEvent = null;
  capturedBlob = null;
  $("#pinInput").value = "";
  renderPinDots();
  errorMessage($("#pinError"));
  setStep("pinStep");
  $("#pinInput").focus();
}

$("#pinForm").addEventListener("submit", async event => {
  event.preventDefault();
  const pin = $("#pinInput").value;
  if (pin.length < 4) return errorMessage($("#pinError"), "Ingresa tu PIN completo");
  errorMessage($("#pinError"));
  try {
    const status = await lookupPin(pin);
    activePin = pin;
    showActions(status);
  } catch (error) {
    $("#pinInput").value = "";
    renderPinDots();
    errorMessage($("#pinError"), error.message);
  }
});

document.addEventListener("click", event => {
  const digit = event.target.closest("[data-digit]");
  if (digit && $("#pinInput").value.length < 8) {
    $("#pinInput").value += digit.dataset.digit;
    renderPinDots();
  }
  if (event.target.closest("[data-clear]")) {
    $("#pinInput").value = $("#pinInput").value.slice(0, -1);
    renderPinDots();
  }
  const action = event.target.closest("[data-event]");
  if (action) {
    selectedEvent = action.dataset.event;
    $("#cameraTitle").textContent = eventLabels[selectedEvent][1];
    startCamera();
  }
});

$("#pinInput").addEventListener("input", () => {
  $("#pinInput").value = $("#pinInput").value.replace(/\D/g, "").slice(0, 8);
  renderPinDots();
});
$("#cancelAction").addEventListener("click", resetClock);
$("#cancelCamera").addEventListener("click", resetClock);

$("#capturePhoto").addEventListener("click", () => {
  const video = $("#cameraVideo");
  if (!video.videoWidth) return errorMessage($("#cameraError"), "Espera un momento mientras inicia la cámara");
  const scale = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight);
  const canvas = $("#captureCanvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(blob => {
    if (!blob) return errorMessage($("#cameraError"), "No fue posible capturar la fotografía");
    capturedBlob = blob;
    $("#photoPreview").src = URL.createObjectURL(blob);
    $("#photoPreview").classList.remove("hidden");
    video.classList.add("hidden");
    $("#capturePhoto").classList.add("hidden");
    $("#retakePhoto").classList.remove("hidden");
    $("#submitPunch").classList.remove("hidden");
    stopCamera();
  }, "image/webp", 0.72);
});

$("#retakePhoto").addEventListener("click", startCamera);
$("#submitPunch").addEventListener("click", async event => {
  if (!capturedBlob || !activePin || !selectedEvent) return;
  const button = event.currentTarget;
  button.disabled = true;
  const data = new FormData();
  data.append("pin", activePin);
  data.append("event", selectedEvent);
  data.append("photo", capturedBlob, "evidencia.webp");
  try {
    const response = await fetch(`${API_URL}/punch`, { method: "POST", body: data });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "No fue posible guardar el movimiento");
    $("#successTitle").textContent = result.message;
    $("#successDetail").textContent = `${result.person_name} · ${new Date(result.occurred_at).toLocaleString("es-MX")}`;
    $("#incidentWarning").classList.toggle("hidden", result.incident_type !== "UNSCHEDULED_MEAL");
    setStep("successStep");
    setTimeout(resetClock, 6000);
  } catch (error) {
    errorMessage($("#cameraError"), error.message);
  } finally {
    button.disabled = false;
  }
});

$("#nextPerson").addEventListener("click", resetClock);
$("#returnToSystem").href = deploymentBasePath ? `${deploymentBasePath}/` : "/";
window.addEventListener("beforeunload", stopCamera);
updateClock();
setInterval(updateClock, 1000);
renderPinDots();
