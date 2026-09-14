window.Vistas = window.Vistas || {};

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

window.Vistas.exportar = async function (container) {
  const hoy = new Date();
  let tipo = "Pases";
  let anio = window.Vistas.exportar.anioSugerido || hoy.getFullYear();
  if (window.Vistas.exportar.anioSugerido) { tipo = "Vacaciones"; delete window.Vistas.exportar.anioSugerido; }
  let fechaInicio = isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  let fechaFin = isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 15));
  let incluirExportados = false;
  const ORDEN_TIPOS_EXP = ["primero", "segundo", "riesgo_alto", "riesgo_mediano", "riesgo_bajo", "extraordinario"];
  const seleccionPeriodos = new Set();
  let seleccionDiaEspecial = null;

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Exportar a PDF</h1>
      <p class="page-subtitle">El único dato que se pide aquí es el nombre del jefe inmediato que autoriza. La plantilla oficial no se modifica, solo se llena con tus datos.</p>
    </div>
    <div class="glass-card" style="max-width:560px;">
      <div class="segmented" id="seg-exp-tipo" style="margin-bottom:18px;">
        <button type="button" data-v="Pases">Pases</button>
        <button type="button" data-v="Vacaciones">Vacaciones</button>
      </div>
      <div id="campo-rango" style="margin-bottom:14px;">
        <div class="row" style="margin-bottom:10px;">
          <div class="field"><label class="field-label">Del</label><div id="exp-desde"></div></div>
          <div class="field"><label class="field-label">Al</label><div id="exp-hasta"></div></div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-ghost btn-sm" id="exp-q1">Quincena 1 (1-15)</button>
          <button type="button" class="btn btn-ghost btn-sm" id="exp-q2">Quincena 2 (16-fin)</button>
          <button type="button" class="btn btn-ghost btn-sm" id="exp-mescompleto">Mes completo</button>
        </div>
        <p style="font-size:11.5px; color:var(--text-secondary); margin-top:8px;">
          El formato oficial es mensual, así que "Del" y "Al" deben caer dentro del mismo mes.
        </p>
      </div>
      <div class="field" id="campo-anio" style="margin-bottom:14px;"><label class="field-label">Año</label><div id="exp-anio"></div></div>
      <div class="empty-hint" id="exp-pendientes" style="margin-bottom:10px;"></div>
      <div id="exp-lista-vac" style="margin-bottom:10px;"></div>
      <label style="display:flex; align-items:center; gap:10px; margin-bottom:18px; cursor:pointer; font-size:13px; color:var(--text-secondary);">
        <span class="toggle"><input type="checkbox" id="exp-incluir"><span class="track"><span class="thumb"></span></span></span>
        Incluir ya exportados (para reimprimir)
      </label>
      <div class="field">
        <label class="field-label">Autorización Nombre y Firma Jefe Inmediato</label>
        <div id="exp-jefe"></div>
      </div>
      <button class="btn btn-primary" id="exp-generar" style="margin-top:8px;">Generar PDF</button>
    </div>
  `;

  const opcionesAnios = [];
  for (let y = hoy.getFullYear() - 2; y <= hoy.getFullYear() + 2; y++) opcionesAnios.push({ value: String(y), label: String(y) });

  const fDesde = SmartDate.crearCampoFecha(container.querySelector("#exp-desde"), {
    valorInicial: fechaInicio, onChange: (v) => { fechaInicio = v; actualizarPendientes(); },
  });
  const fHasta = SmartDate.crearCampoFecha(container.querySelector("#exp-hasta"), {
    valorInicial: fechaFin, onChange: (v) => { fechaFin = v; actualizarPendientes(); },
  });
  const selAnio = GlassSelect.crearGlassSelect(container.querySelector("#exp-anio"), {
    opciones: opcionesAnios, valorInicial: String(anio), onChange: (v) => { anio = parseInt(v, 10); actualizarPendientes(); },
  });
  const inJefe = document.createElement("input");
  inJefe.className = "glass-input";
  inJefe.value = "Dra. Claudia Elizabeth Vázquez Robledo";
  container.querySelector("#exp-jefe").appendChild(inJefe);

  function aplicarRango(desde, hasta) {
    fechaInicio = isoLocal(desde); fechaFin = isoLocal(hasta);
    fDesde.setValue(fechaInicio); fHasta.setValue(fechaFin);
    actualizarPendientes();
  }
  container.querySelector("#exp-q1").onclick = () => {
    const base = fDesde.getValue() ? new Date(fDesde.getValue() + "T00:00:00") : hoy;
    aplicarRango(new Date(base.getFullYear(), base.getMonth(), 1), new Date(base.getFullYear(), base.getMonth(), 15));
  };
  container.querySelector("#exp-q2").onclick = () => {
    const base = fDesde.getValue() ? new Date(fDesde.getValue() + "T00:00:00") : hoy;
    const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    aplicarRango(new Date(base.getFullYear(), base.getMonth(), 16), new Date(base.getFullYear(), base.getMonth(), ultimoDia));
  };
  container.querySelector("#exp-mescompleto").onclick = () => {
    const base = fDesde.getValue() ? new Date(fDesde.getValue() + "T00:00:00") : hoy;
    const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    aplicarRango(new Date(base.getFullYear(), base.getMonth(), 1), new Date(base.getFullYear(), base.getMonth(), ultimoDia));
  };

  function actualizarVisibilidad() {
    container.querySelector("#campo-rango").style.display = tipo === "Pases" ? "" : "none";
    container.querySelector("#campo-anio").style.display = tipo === "Vacaciones" ? "" : "none";
    container.querySelector("#exp-pendientes").style.display = tipo === "Pases" ? "" : "none";
    container.querySelector("#exp-lista-vac").style.display = tipo === "Vacaciones" ? "" : "none";
  }
  Segmented.montarSegmented(container.querySelector("#seg-exp-tipo"), {
    valorInicial: tipo,
    onChange: (v) => { tipo = v; actualizarVisibilidad(); actualizarPendientes(); },
  });
  actualizarVisibilidad();

  container.querySelector("#exp-incluir").addEventListener("change", (e) => {
    incluirExportados = e.target.checked; actualizarPendientes();
  });

  function renderListaVacaciones(datos) {
    const listaEl = container.querySelector("#exp-lista-vac");
    seleccionPeriodos.clear();
    seleccionDiaEspecial = null;

    const items = [];
    ORDEN_TIPOS_EXP.forEach((t) => {
      (datos.periodos[t] || []).forEach((p) => {
        items.push({
          id: p.id, exportado: p.exportado,
          texto: `${TIPO_ETIQUETA_JS[t]}: ${SmartDate.isoADisplay(p.fecha_inicio)} al ${SmartDate.isoADisplay(p.fecha_fin)} `
            + `(${p.dias_habiles} días hábiles)${p.motivo ? " — " + p.motivo : ""}`,
        });
      });
    });
    let itemDia = null;
    if (datos.dia_especial) {
      itemDia = {
        id: datos.dia_especial.id, exportado: datos.dia_especial.exportado,
        texto: `Día de cumpleaños/santoral: ${datos.dia_especial.aplico
          ? SmartDate.isoADisplay(datos.dia_especial.fecha_otorgada) : "no aplica este año"}`,
      };
      items.push(itemDia);
    }

    const visibles = items.filter((it) => incluirExportados || !it.exportado);
    if (!visibles.length) {
      listaEl.innerHTML = `<div class="empty-hint">${items.length
        ? "No hay periodos pendientes por exportar (activa \"Incluir ya exportados\" para reimprimir)."
        : `No hay periodos vacacionales registrados en ${anio}.`}</div>`;
      return;
    }

    listaEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <label class="field-label" style="margin:0;">Periodos a incluir en el PDF</label>
        <div style="display:flex; gap:10px;">
          <a href="#" id="exp-sel-todo" style="font-size:12px;">Todos</a>
          <a href="#" id="exp-sel-ninguno" style="font-size:12px;">Ninguno</a>
        </div>
      </div>
      <div class="stack" id="exp-filas-vac" style="gap:6px;"></div>
    `;
    const filasEl = listaEl.querySelector("#exp-filas-vac");
    visibles.forEach((it) => {
      const esDia = it === itemDia;
      const fila = document.createElement("label");
      fila.style.cssText = "display:flex; align-items:center; gap:10px; font-size:13px; cursor:pointer; padding:4px 0;";
      const marcado = !it.exportado;
      fila.innerHTML = `
        <input type="checkbox" ${marcado ? "checked" : ""} style="width:16px; height:16px; flex-shrink:0;">
        <span style="flex:1;">${it.texto}</span>
        ${it.exportado ? '<span class="badge badge-ok">Ya exportado</span>' : ""}
      `;
      const chk = fila.querySelector("input");
      const marcarSeleccion = (activo) => {
        if (esDia) { seleccionDiaEspecial = activo ? it.id : null; }
        else if (activo) { seleccionPeriodos.add(it.id); }
        else { seleccionPeriodos.delete(it.id); }
      };
      marcarSeleccion(marcado);
      chk.addEventListener("change", () => marcarSeleccion(chk.checked));
      filasEl.appendChild(fila);
    });

    listaEl.querySelector("#exp-sel-todo").onclick = (e) => {
      e.preventDefault();
      filasEl.querySelectorAll("input[type=checkbox]").forEach((c) => { if (!c.checked) c.click(); });
    };
    listaEl.querySelector("#exp-sel-ninguno").onclick = (e) => {
      e.preventDefault();
      filasEl.querySelectorAll("input[type=checkbox]").forEach((c) => { if (c.checked) c.click(); });
    };
  }

  async function actualizarPendientes() {
    const el = container.querySelector("#exp-pendientes");
    try {
      if (tipo === "Pases") {
        if (!fechaInicio || !fechaFin) { el.textContent = "Captura un rango de fechas válido."; return; }
        if (fechaFin < fechaInicio) { el.textContent = "La fecha final debe ser posterior a la inicial."; return; }
        if (fechaInicio.slice(0, 7) !== fechaFin.slice(0, 7)) { el.textContent = "El rango debe caer dentro del mismo mes."; return; }
        const [anioIni, mesIni] = fechaInicio.split("-").map(Number);
        const { pases } = await Api.llamar("pases_listar", anioIni, mesIni);
        const oficiales = await Api.llamar("oficiales_listar", anioIni, mesIni);
        const enRango = (f) => f >= fechaInicio && f <= fechaFin;
        const pendPart = pases.filter((p) => enRango(p.fecha) && (incluirExportados || !p.exportado)).length;
        const pendOf = oficiales.filter((o) => enRango(o.fecha) && (incluirExportados || !o.exportado)).length;
        el.textContent = `${pendPart} pase(s) particular(es) y ${pendOf} comisión(es) oficial(es) por exportar en ese rango.`;
      } else {
        const datos = await Api.llamar("vacaciones_listar", anio);
        renderListaVacaciones(datos);
      }
    } catch (e) {
      if (tipo === "Pases") el.textContent = "No se pudo consultar lo pendiente por exportar.";
      else container.querySelector("#exp-lista-vac").innerHTML = `<div class="empty-hint">No se pudo consultar lo pendiente por exportar.</div>`;
    }
  }
  actualizarPendientes();

  container.querySelector("#exp-generar").onclick = async () => {
    if (!inJefe.value.trim()) { Api.mostrarToast("Ingresa el nombre del jefe inmediato.", "error"); return; }
    if (tipo === "Pases" && (!fechaInicio || !fechaFin)) {
      Api.mostrarToast("Captura un rango de fechas válido.", "error"); return;
    }
    if (tipo === "Vacaciones" && !seleccionPeriodos.size && !seleccionDiaEspecial) {
      Api.mostrarToast("Selecciona al menos un periodo para exportar.", "error"); return;
    }
    try {
      const r = tipo === "Pases"
        ? await Api.llamar("exportar_pases", fechaInicio, fechaFin, inJefe.value, incluirExportados)
        : await Api.llamar("exportar_vacaciones", anio, inJefe.value, [...seleccionPeriodos], seleccionDiaEspecial);
      if (r.cancelado) return;
      Api.mostrarToast(`PDF generado y abierto: ${r.ruta}`, "success");
      actualizarPendientes();
    } catch (e) { /* toast ya mostrado */ }
  };
};
