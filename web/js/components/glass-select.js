/* Dropdown de vidrio: reemplaza al <select> nativo. options: [{value,label}] */

function crearGlassSelect(container, { opciones = [], valorInicial = null, onChange = () => {}, placeholder = "Selecciona…" } = {}) {
  const root = document.createElement("div");
  root.className = "glass-select";

  const trigger = document.createElement("div");
  trigger.className = "glass-input trigger";
  trigger.tabIndex = 0;
  const labelSpan = document.createElement("span");
  const chev = document.createElement("span");
  chev.className = "chev";
  chev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  trigger.appendChild(labelSpan);
  trigger.appendChild(chev);
  root.appendChild(trigger);

  const menu = document.createElement("div");
  menu.className = "menu";
  root.appendChild(menu);

  let valor = valorInicial;
  let lista = opciones;

  function etiquetaDe(v) {
    const o = lista.find((x) => x.value === v);
    return o ? o.label : placeholder;
  }

  function render() {
    labelSpan.textContent = etiquetaDe(valor);
    menu.innerHTML = "";
    lista.forEach((op) => {
      const item = document.createElement("div");
      item.className = "opt" + (op.value === valor ? " selected" : "");
      item.textContent = op.label;
      item.onclick = () => {
        valor = op.value;
        render();
        cerrar();
        onChange(valor);
      };
      menu.appendChild(item);
    });
  }

  function abrir() { root.classList.add("open"); }
  function cerrar() { root.classList.remove("open"); }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    root.classList.contains("open") ? cerrar() : abrir();
  });
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
    if (e.key === "Escape") cerrar();
  });
  document.addEventListener("click", (e) => { if (!root.contains(e.target)) cerrar(); });

  render();
  container.appendChild(root);

  return {
    getValue: () => valor,
    setValue: (v) => { valor = v; render(); },
    setOpciones: (nuevas) => { lista = nuevas; render(); },
    el: root,
  };
}

window.GlassSelect = { crearGlassSelect };
