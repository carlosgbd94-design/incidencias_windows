/* Campo de hora inteligente: el usuario teclea solo dígitos (1430) y el
   componente inserta ":" automáticamente (14:30). Valida 00-23 / 00-59. */

function formatearHoraMientrasEscribe(valorCrudo) {
  const digitos = valorCrudo.replace(/\D/g, "").slice(0, 4);
  let out = digitos.slice(0, 2);
  if (digitos.length > 2) out += ":" + digitos.slice(2, 4);
  return out;
}

function horaValida(valor) {
  const m = /^([0-2][0-9]):([0-5][0-9])$/.exec(valor);
  if (!m) return false;
  return parseInt(m[1], 10) <= 23;
}

function crearCampoHora(container, { valorInicial = "", onChange = () => {}, placeholder = "HH:MM" } = {}) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "glass-input";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.inputMode = "numeric";
  input.value = valorInicial || "";

  function marcarValidez() {
    if (!input.value) { input.classList.remove("valid", "invalid"); return; }
    if (horaValida(input.value)) { input.classList.add("valid"); input.classList.remove("invalid"); }
    else { input.classList.add("invalid"); input.classList.remove("valid"); }
  }

  input.addEventListener("input", () => {
    const pos = input.selectionStart;
    const antes = input.value.length;
    input.value = formatearHoraMientrasEscribe(input.value);
    const despues = input.value.length;
    input.selectionStart = input.selectionEnd = Math.max(0, pos + (despues - antes));
    marcarValidez();
    if (horaValida(input.value)) onChange(input.value);
  });

  marcarValidez();
  container.appendChild(input);
  return {
    getValue: () => (horaValida(input.value) ? input.value : null),
    setValue: (v) => { input.value = v || ""; marcarValidez(); },
    el: input,
    input,
  };
}

window.SmartTime = { crearCampoHora, horaValida };
