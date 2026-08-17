window.Vistas = window.Vistas || {};

const MESES_PASES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
  "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function opcionesAnios() {
  const actual = new Date().getFullYear();
  const out = [];
  for (let y = actual - 2; y <= actual + 2; y++) out.push({ value: String(y), label: String(y) });
  return out;
}
function opcionesMeses() { return MESES_PASES.map((m, i) => ({ value: String(i + 1), label: m })); }

window.Vistas.pases = async function (container) {
  const hoy = new Date();
  let anio = hoy.getFullYear();
  let mes = hoy.getMonth() + 1;
  let seccion = "particulares";

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Pases de Salida</h1>
      <p class="page-subtitle">Límite: 6 horas al mes, máximo 2 horas por día (Art. 92 fracciones I, III CGT).</p>
    </div>
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:18px;">
      <div class="segmented" id="seg-tipo">
        <button type="button" data-v="particulares">Particulares</button>
        <button type="button" data-v="oficiales">Oficiales</button>
      </div>
      <div style="display:flex; gap:8px;">
        <div id="sel-mes" style="width:150px;"></div>
        <div id="sel-anio" style="width:100px;"></div>
      </div>
    </div>
    <div id="pases-body"></div>
  `;

  const selMes = GlassSelect.crearGlassSelect(container.querySelector("#sel-mes"), {
    opciones: opcionesMeses(), valorInicial: String(mes), onChange: (v) => { mes = parseInt(v, 10); render(); },
  });
  const selAnio = GlassSelect.crearGlassSelect(container.querySelector("#sel-anio"), {
    opciones: opcionesAnios(), valorInicial: String(anio), onChange: (v) => { anio = parseInt(v, 10); render(); },
  });

  Segmented.montarSegmented(container.querySelector("#seg-tipo"), {
    valorInicial: seccion, onChange: (v) => { seccion = v; render(); },
  });

  const body = container.querySelector("#pases-body");

  async function render() {
    try {
      if (seccion === "particulares") await renderParticulares(); else await renderOficiales();
    } catch (e) {
      Api.mostrarErrorVista(body, e.message || "Ocurrió un error inesperado.");
    }
  }

  async function renderParticulares() {
    const { pases, resumen } = await Api.llamar("pases_listar", anio, mes);
    const totalMin = resumen.usado_min + resumen.restante_min;
    const pctMes = totalMin > 0 ? Math.min(100, Math.round((resumen.usado_min / totalMin) * 100)) : 0;
    const claseAnillo = pctMes >= 100 ? "danger" : pctMes > 70 ? "warn" : "";
    const RADIO = 52, CIRC = 2 * Math.PI * RADIO;
    const dashoffset = CIRC * (1 - pctMes / 100);
    let editId = null;

    body.innerHTML = `
      <div class="grid-2">
        <div class="glass-card">
          <h3 class="section-title" id="np-titulo">Registrar pase particular</h3>
          <div class="field"><label class="field-label">Fecha</label><div id="np-fecha"></div></div>
          <div class="field"><label class="field-label">Hora de salida</label><div id="np-salida"></div></div>
          <div class="field">
            <label class="field-label">¿Regresa a trabajar ese día?</label>
            <div class="segmented" id="np-regresa" style="margin-top:4px;">
              <button type="button" data-v="si">Sí</button>
              <button type="button" data-v="no">No</button>
            </div>
          </div>
          <div class="field"><label class="field-label">Hora de regreso</label><div id="np-regreso"></div></div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary" id="np-guardar">Registrar Pase</button>
            <button class="btn btn-ghost" id="np-cancelar" style="display:none;">Cancelar</button>
          </div>
        </div>
        <div class="glass-card">
          <h3 class="section-title">Resumen del mes</h3>
          <div class="stat-row">
            <div class="stat-ring-wrap">
              <svg class="stat-ring" viewBox="0 0 128 128">
                <circle class="ring-track" cx="64" cy="64" r="${RADIO}"></circle>
                <circle class="ring-fill ${claseAnillo}" cx="64" cy="64" r="${RADIO}"
                        stroke-dasharray="${CIRC}" stroke-dashoffset="${dashoffset}"></circle>
              </svg>
              <div class="ring-center">
                <div class="ring-value">${pctMes}%</div>
                <div class="ring-label">usado</div>
              </div>
            </div>
            <div class="stat-tiles">
              <div class="stat-tile"><span class="stat-tile-label">Usado este mes</span><span class="stat-tile-value">${resumen.usado_texto}</span></div>
              <div class="stat-tile"><span class="stat-tile-label">Disponible</span><span class="stat-tile-value">${resumen.restante_texto}</span></div>
              <div class="stat-tile"><span class="stat-tile-label">Pases registrados</span><span class="stat-tile-value">${pases.length}</span></div>
            </div>
          </div>
          <div style="font-size:11.5px; color:var(--text-secondary); margin-top:14px;">
            Límite: ${resumen.limite_dia_texto} por día, ${resumen.limite_mes_texto} al mes (Art. 92 CGT).
          </div>
        </div>
      </div>
      <div class="glass-card" style="margin-top:16px;">
        <h3 class="section-title">Pases de ${MESES_PASES[mes - 1]} ${anio}</h3>
        <div id="tabla-particulares"></div>
      </div>
    `;

    const fFecha = SmartDate.crearCampoFecha(body.querySelector("#np-fecha"), {});
    const fSalida = SmartTime.crearCampoHora(body.querySelector("#np-salida"), {});
    const fRegreso = SmartTime.crearCampoHora(body.querySelector("#np-regreso"), {});
    function actualizarRegreso(v) {
      const activo = v === "si";
      fRegreso.input.disabled = !activo;
      fRegreso.input.style.opacity = activo ? "1" : ".45";
    }
    const ctrlRegresa = Segmented.montarSegmented(body.querySelector("#np-regresa"), {
      valorInicial: "si", onChange: actualizarRegreso,
    });
    actualizarRegreso("si");

    const btnGuardar = body.querySelector("#np-guardar");
    const btnCancelar = body.querySelector("#np-cancelar");
    const titulo = body.querySelector("#np-titulo");

    function entrarModoEdicion(p) {
      editId = p.id;
      titulo.textContent = "Editar pase particular";
      btnGuardar.textContent = "Guardar cambios";
      btnCancelar.style.display = "";
      fFecha.setValue(p.fecha);
      fSalida.setValue(p.hora_salida);
      ctrlRegresa.setValue(p.regresa ? "si" : "no");
      actualizarRegreso(p.regresa ? "si" : "no");
      fRegreso.setValue(p.hora_regreso || "");
      body.querySelector(".glass-card").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function salirModoEdicion() {
      editId = null;
      titulo.textContent = "Registrar pase particular";
      btnGuardar.textContent = "Registrar Pase";
      btnCancelar.style.display = "none";
    }

    btnCancelar.onclick = () => { salirModoEdicion(); renderParticulares(); };

    btnGuardar.onclick = async () => {
      const regresa = ctrlRegresa.getValue() === "si";
      const datos = {
        fecha: fFecha.getValue(), hora_salida: fSalida.getValue(),
        regresa, hora_regreso: regresa ? fRegreso.getValue() : null,
      };
      const editando = editId !== null;
      if (editando) {
        const original = pases.find((p) => p.id === editId);
        if (original && original.exportado && !confirm(
          "Este pase ya fue exportado en un PDF. Corregirlo aquí no actualiza ese PDF ya generado. ¿Continuar?"
        )) return;
      }
      try {
        const r = editando
          ? await Api.llamar("pases_editar", editId, datos)
          : await Api.llamar("pases_registrar", datos);
        Api.mostrarToast(`${editando ? "Pase actualizado" : "Pase registrado"}: ${r.duracion_texto}.`, "success");
        renderParticulares();
      } catch (e) { /* toast ya mostrado */ }
    };

    const tabla = body.querySelector("#tabla-particulares");
    if (!pases.length) {
      tabla.innerHTML = `<div class="empty-hint">Aún no hay pases registrados este mes.</div>`;
    } else {
      tabla.innerHTML = `<div style="overflow-x:auto;"><table class="glass-table">
        <thead><tr><th>#</th><th>Fecha</th><th>Salida</th><th>Regresa</th><th>Regreso</th><th>Tiempo</th><th>Exportado</th><th></th></tr></thead>
        <tbody>${pases.map((p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${SmartDate.isoADisplay(p.fecha)}</td>
            <td>${p.hora_salida}</td>
            <td>${p.regresa ? "Sí" : "No"}</td>
            <td>${p.hora_regreso || "—"}</td>
            <td>${p.duracion_texto}</td>
            <td>${p.exportado ? '<span class="badge badge-ok">Sí</span>' : '<span class="badge badge-muted">No</span>'}</td>
            <td style="display:flex; gap:6px;">
              <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Editar</button>
              <button class="btn btn-ghost btn-sm" data-del="${p.id}">Eliminar</button>
            </td>
          </tr>`).join("")}</tbody>
      </table></div>`;
      tabla.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.onclick = () => {
          const p = pases.find((x) => x.id === parseInt(btn.dataset.edit, 10));
          if (p) entrarModoEdicion(p);
        };
      });
      tabla.querySelectorAll("[data-del]").forEach((btn) => {
        btn.onclick = async () => {
          const p = pases.find((x) => x.id === parseInt(btn.dataset.del, 10));
          if (p && p.exportado && !confirm(
            "Este pase ya fue exportado en un PDF. Eliminarlo aquí no actualiza ese PDF ya generado. ¿Continuar?"
          )) return;
          try { await Api.llamar("pases_eliminar", parseInt(btn.dataset.del, 10)); renderParticulares(); }
          catch (e) { /* toast ya mostrado */ }
        };
      });
    }
  }

  async function renderOficiales() {
    const oficiales = await Api.llamar("oficiales_listar", anio, mes);
    let editId = null;
    body.innerHTML = `
      <div class="glass-card">
        <h3 class="section-title" id="no-titulo">Registrar comisión oficial</h3>
        <div class="row">
          <div class="field"><label class="field-label">Fecha</label><div id="no-fecha"></div></div>
          <div class="field"><label class="field-label">Horario de comisión</label><div id="no-horario"></div></div>
        </div>
        <div class="field"><label class="field-label">Asunto</label><div id="no-asunto"></div></div>
        <div class="field"><label class="field-label">Dependencia a la que asiste</label><div id="no-dependencia"></div></div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary" id="no-guardar">Registrar Comisión</button>
          <button class="btn btn-ghost" id="no-cancelar" style="display:none;">Cancelar</button>
        </div>
      </div>
      <div class="glass-card" style="margin-top:16px;">
        <h3 class="section-title">Comisiones de ${MESES_PASES[mes - 1]} ${anio}</h3>
        <div id="tabla-oficiales"></div>
      </div>
    `;
    const fFecha = SmartDate.crearCampoFecha(body.querySelector("#no-fecha"), {});
    const inHorario = document.createElement("input");
    inHorario.className = "glass-input"; inHorario.placeholder = "09:00-13:00";
    body.querySelector("#no-horario").appendChild(inHorario);
    const inAsunto = document.createElement("input");
    inAsunto.className = "glass-input";
    body.querySelector("#no-asunto").appendChild(inAsunto);
    const inDependencia = document.createElement("input");
    inDependencia.className = "glass-input";
    body.querySelector("#no-dependencia").appendChild(inDependencia);

    const btnGuardar = body.querySelector("#no-guardar");
    const btnCancelar = body.querySelector("#no-cancelar");
    const titulo = body.querySelector("#no-titulo");

    function entrarModoEdicion(o) {
      editId = o.id;
      titulo.textContent = "Editar comisión oficial";
      btnGuardar.textContent = "Guardar cambios";
      btnCancelar.style.display = "";
      fFecha.setValue(o.fecha);
      inHorario.value = o.horario_comision;
      inAsunto.value = o.asunto;
      inDependencia.value = o.dependencia;
      body.querySelector(".glass-card").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function salirModoEdicion() {
      editId = null;
      titulo.textContent = "Registrar comisión oficial";
      btnGuardar.textContent = "Registrar Comisión";
      btnCancelar.style.display = "none";
    }

    btnCancelar.onclick = () => { salirModoEdicion(); renderOficiales(); };

    btnGuardar.onclick = async () => {
      const datos = {
        fecha: fFecha.getValue(), asunto: inAsunto.value, dependencia: inDependencia.value,
        horario_comision: inHorario.value,
      };
      const editando = editId !== null;
      if (editando) {
        const original = oficiales.find((o) => o.id === editId);
        if (original && original.exportado && !confirm(
          "Esta comisión ya fue exportada en un PDF. Corregirla aquí no actualiza ese PDF ya generado. ¿Continuar?"
        )) return;
      }
      try {
        if (editando) await Api.llamar("oficiales_editar", editId, datos);
        else await Api.llamar("oficiales_registrar", datos);
        Api.mostrarToast(editando ? "Comisión oficial actualizada." : "Comisión oficial guardada.", "success");
        renderOficiales();
      } catch (e) { /* toast ya mostrado */ }
    };

    const tabla = body.querySelector("#tabla-oficiales");
    if (!oficiales.length) {
      tabla.innerHTML = `<div class="empty-hint">Aún no hay comisiones registradas este mes.</div>`;
    } else {
      tabla.innerHTML = `<div style="overflow-x:auto;"><table class="glass-table">
        <thead><tr><th>Fecha</th><th>Asunto</th><th>Dependencia</th><th>Horario</th><th>Exportado</th><th></th></tr></thead>
        <tbody>${oficiales.map((o) => `
          <tr>
            <td>${SmartDate.isoADisplay(o.fecha)}</td><td>${o.asunto}</td><td>${o.dependencia}</td><td>${o.horario_comision}</td>
            <td>${o.exportado ? '<span class="badge badge-ok">Sí</span>' : '<span class="badge badge-muted">No</span>'}</td>
            <td style="display:flex; gap:6px;">
              <button class="btn btn-ghost btn-sm" data-edit="${o.id}">Editar</button>
              <button class="btn btn-ghost btn-sm" data-del="${o.id}">Eliminar</button>
            </td>
          </tr>`).join("")}</tbody>
      </table></div>`;
      tabla.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.onclick = () => {
          const o = oficiales.find((x) => x.id === parseInt(btn.dataset.edit, 10));
          if (o) entrarModoEdicion(o);
        };
      });
      tabla.querySelectorAll("[data-del]").forEach((btn) => {
        btn.onclick = async () => {
          const o = oficiales.find((x) => x.id === parseInt(btn.dataset.del, 10));
          if (o && o.exportado && !confirm(
            "Esta comisión ya fue exportada en un PDF. Eliminarla aquí no actualiza ese PDF ya generado. ¿Continuar?"
          )) return;
          try { await Api.llamar("oficiales_eliminar", parseInt(btn.dataset.del, 10)); renderOficiales(); }
          catch (e) { /* toast ya mostrado */ }
        };
      });
    }
  }

  render();
};
