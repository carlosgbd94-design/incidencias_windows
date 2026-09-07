/* Campo de fecha inteligente: el usuario solo teclea dígitos (17072026) y el
   componente inserta "/" automáticamente (17/07/2026). Incluye un calendario
   flotante de vidrio como alternativa a teclear. Expone valores en ISO
   (YYYY-MM-DD) para hablar con el backend, y muestra DD/MM/AAAA al usuario. */

const MESES_CAL = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DOW_CAL = ["L", "M", "M", "J", "V", "S", "D"];

function diasEnMes(anio, mes) { return new Date(anio, mes + 1, 0).getDate(); }

function isoADisplay(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function displayAIso(display) {
  const limpio = display.replace(/\D/g, "");
  if (limpio.length !== 8) return null;
  const dia = limpio.slice(0, 2), mes = limpio.slice(2, 4), anio = limpio.slice(4, 8);
  const d = parseInt(dia, 10), m = parseInt(mes, 10), a = parseInt(anio, 10);
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > diasEnMes(a, m - 1)) return null;
  return `${anio}-${mes}-${dia}`;
}

function formatearMientrasEscribe(valorCrudo) {
  const digitos = valorCrudo.replace(/\D/g, "").slice(0, 8);
  let out = digitos.slice(0, 2);
  if (digitos.length > 2) out += "/" + digitos.slice(2, 4);
  if (digitos.length > 4) out += "/" + digitos.slice(4, 8);
  return out;
}

function crearCampoFecha(container, { valorInicial = "", onChange = () => {}, placeholder = "DD/MM/AAAA" } = {}) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "glass-input";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.inputMode = "numeric";
  input.value = isoADisplay(valorInicial);
  wrap.appendChild(input);

  const btnCal = document.createElement("button");
  btnCal.type = "button";
  btnCal.setAttribute("aria-label", "Abrir calendario");
  btnCal.style.cssText = "position:absolute; right:8px; top:50%; transform:translateY(-50%); border:none; background:transparent; cursor:pointer; padding:4px; color:var(--text-secondary);";
  btnCal.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';
  wrap.appendChild(btnCal);

  const pop = document.createElement("div");
  pop.className = "date-popover";
  wrap.appendChild(pop);

  let iso = valorInicial || null;
  let vistaAnio, vistaMes;
  const hoy = new Date();

  function sincronizarVista() {
    if (iso) {
      const [a, m] = iso.split("-").map(Number);
      vistaAnio = a; vistaMes = m - 1;
    } else {
      vistaAnio = hoy.getFullYear(); vistaMes = hoy.getMonth();
    }
  }

  function marcarValidez() {
    if (!input.value) { input.classList.remove("valid", "invalid"); return; }
    if (iso) { input.classList.add("valid"); input.classList.remove("invalid"); }
    else { input.classList.add("invalid"); input.classList.remove("valid"); }
  }

  function renderCalendario() {
    const primerDiaSemana = (new Date(vistaAnio, vistaMes, 1).getDay() + 6) % 7; // lunes=0
    const totalDias = diasEnMes(vistaAnio, vistaMes);
    let celdas = "";
    for (const d of DOW_CAL) celdas += `<div class="cal-dow">${d}</div>`;
    for (let i = 0; i < primerDiaSemana; i++) celdas += `<div class="cal-day muted"></div>`;
    for (let d = 1; d <= totalDias; d++) {
      const esHoy = d === hoy.getDate() && vistaMes === hoy.getMonth() && vistaAnio === hoy.getFullYear();
      const isoDia = `${vistaAnio}-${String(vistaMes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const esSel = isoDia === iso;
      celdas += `<div class="cal-day${esHoy ? " today" : ""}${esSel ? " selected" : ""}" data-dia="${d}">${d}</div>`;
    }
    pop.innerHTML = `
      <div class="cal-head">
        <button type="button" data-nav="-1">‹</button>
        <span class="cal-title">${MESES_CAL[vistaMes]} ${vistaAnio}</span>
        <button type="button" data-nav="1">›</button>
      </div>
      <div class="cal-grid">${celdas}</div>`;
    // e.stopPropagation() es imprescindible aquí: renderCalendario() vuelve
    // a escribir pop.innerHTML, así que el <button> que se acaba de pulsar
    // queda desconectado del documento ANTES de que el clic termine de
    // burbujear. El listener global de "cerrar si el clic fue afuera" (ver
    // document.addEventListener más abajo) entonces evalúa
    // wrap.contains(e.target) contra un nodo ya huérfano, que da false
    // aunque el clic haya sido claramente dentro del calendario -- por eso
    // el popover se cerraba solo al cambiar de mes.
    pop.querySelector('[data-nav="-1"]').onclick = (e) => {
      e.stopPropagation();
      vistaMes--; if (vistaMes < 0) { vistaMes = 11; vistaAnio--; }
      renderCalendario();
    };
    pop.querySelector('[data-nav="1"]').onclick = (e) => {
      e.stopPropagation();
      vistaMes++; if (vistaMes > 11) { vistaMes = 0; vistaAnio++; }
      renderCalendario();
    };
    pop.querySelectorAll(".cal-day[data-dia]").forEach((el) => {
      el.onclick = () => {
        const d = parseInt(el.dataset.dia, 10);
        iso = `${vistaAnio}-${String(vistaMes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        input.value = isoADisplay(iso);
        marcarValidez();
        cerrarPop();
        onChange(iso);
      };
    });
  }

  function abrirPop() { sincronizarVista(); renderCalendario(); pop.classList.add("open"); }
  function cerrarPop() { pop.classList.remove("open"); }

  btnCal.addEventListener("click", (e) => {
    e.stopPropagation();
    pop.classList.contains("open") ? cerrarPop() : abrirPop();
  });
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) cerrarPop(); });

  input.addEventListener("input", () => {
    const pos = input.selectionStart;
    const antes = input.value.length;
    input.value = formatearMientrasEscribe(input.value);
    const despues = input.value.length;
    input.selectionStart = input.selectionEnd = Math.max(0, pos + (despues - antes));
    iso = displayAIso(input.value);
    marcarValidez();
    if (iso) onChange(iso);
  });

  marcarValidez();

  container.appendChild(wrap);
  return {
    getValue: () => iso,
    setValue: (nuevoIso) => { iso = nuevoIso; input.value = isoADisplay(nuevoIso); marcarValidez(); },
    el: wrap,
    input,
  };
}

window.SmartDate = { crearCampoFecha, isoADisplay, displayAIso };
