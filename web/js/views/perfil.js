window.Vistas = window.Vistas || {};

const TURNOS_OPC = ["MATUTINO", "VESPERTINO", "MIXTO", "NOCTURNO"].map((v) => ({ value: v, label: v }));
const RECURSOS_OPC = ["Base Federal", "Base Estatal", "Regularizado", "Formalizado", "Confianza"]
  .map((v) => ({ value: v, label: v }));
const RIESGO_OPC = [
  { value: "Ninguno", label: "Ninguno" },
  { value: "Bajo", label: "Bajo (5 días)" },
  { value: "Mediano", label: "Mediano (8 días)" },
  { value: "Alto", label: "Alto (12 días)" },
];
const DIAS_SEMANA = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];

function campoDDMM(container, valorInicial) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "glass-input";
  input.placeholder = "DD/MM";
  input.inputMode = "numeric";
  input.value = valorInicial || "";
  input.addEventListener("input", () => {
    const digitos = input.value.replace(/\D/g, "").slice(0, 4);
    input.value = digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos;
  });
  container.appendChild(input);
  return input;
}

window.Vistas.perfil = async function (container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Perfil del Trabajador</h1>
      <p class="page-subtitle">Estos datos se usan para calcular tus límites de pases, tus vacaciones y para generar los PDF de exportación.</p>
    </div>
    <div class="glass-card" style="max-width:1040px;">
      <div class="grid-2">
        <div class="stack">
          <div class="field"><label class="field-label">Nombre completo</label><div id="f-nombre"></div></div>
          <div class="row">
            <div class="field"><label class="field-label">Número de empleado</label><div id="f-no-empleado"></div></div>
            <div class="field"><label class="field-label">Turno</label><div id="f-turno"></div></div>
          </div>
          <div class="field"><label class="field-label">Centro de trabajo</label><div id="f-centro"></div></div>
          <div class="field"><label class="field-label">Área y Dirección a la que pertenece</label><div id="f-area"></div></div>
        </div>
        <div class="stack">
          <div class="row">
            <div class="field"><label class="field-label">Hora de entrada</label><div id="f-hora-entrada"></div></div>
            <div class="field"><label class="field-label">Hora de fin de turno</label><div id="f-hora-fin"></div></div>
          </div>
          <div class="field"><label class="field-label">Recurso</label><div id="f-recurso"></div></div>
          <div class="field">
            <label class="field-label">Días laborables</label>
            <div id="f-dias" style="display:flex; gap:6px; flex-wrap:wrap;"></div>
          </div>
          <div class="field"><label class="field-label">Nivel de riesgo</label><div id="f-riesgo" style="max-width:260px;"></div></div>
        </div>
      </div>
      <hr class="divider">
      <div class="row" style="align-items:flex-start;">
        <div class="field" style="flex:1;">
          <label class="field-label">Día de cumpleaños o santoral (Art. 141 Fracción I CGT)</label>
          <div id="f-tipo-dia" style="margin-bottom:10px;"></div>
        </div>
        <div class="field" style="max-width:140px;">
          <label class="field-label">Fecha (DD/MM)</label>
          <div id="f-fecha-dia"></div>
        </div>
      </div>
      <button class="btn btn-primary" id="btn-guardar-perfil" style="margin-top:8px;">Guardar Perfil</button>
    </div>
  `;

  try {
    await montarFormulario(container);
  } catch (e) {
    Api.mostrarErrorVista(container, e.message || "Ocurrió un error inesperado.");
  }
};

async function montarFormulario(container) {
  const perfil = await Api.llamar("perfil_obtener");

  const inNombre = document.createElement("input");
  inNombre.className = "glass-input"; inNombre.value = perfil.nombre || "";
  container.querySelector("#f-nombre").appendChild(inNombre);

  const inNoEmp = document.createElement("input");
  inNoEmp.className = "glass-input"; inNoEmp.value = perfil.no_empleado || "";
  container.querySelector("#f-no-empleado").appendChild(inNoEmp);

  const selTurno = GlassSelect.crearGlassSelect(container.querySelector("#f-turno"), {
    opciones: TURNOS_OPC, valorInicial: perfil.turno || "MATUTINO",
  });

  const inCentro = document.createElement("input");
  inCentro.className = "glass-input";
  inCentro.value = perfil.centro_trabajo || "JURISDICCION SANITARIA NO. 1";
  container.querySelector("#f-centro").appendChild(inCentro);

  const inArea = document.createElement("input");
  inArea.className = "glass-input";
  inArea.value = perfil.area_direccion || "OFICINAS DE LA JURISDICCION SANITARIA I, J1";
  container.querySelector("#f-area").appendChild(inArea);

  const horaEntrada = SmartTime.crearCampoHora(container.querySelector("#f-hora-entrada"), { valorInicial: perfil.hora_entrada || "09:00" });
  const horaFin = SmartTime.crearCampoHora(container.querySelector("#f-hora-fin"), { valorInicial: perfil.hora_fin_turno || "14:30" });
  const selRecurso = GlassSelect.crearGlassSelect(container.querySelector("#f-recurso"), {
    opciones: RECURSOS_OPC, valorInicial: perfil.recurso || "Regularizado",
  });

  const diasSeleccionados = new Set((perfil.dias_laborables || "LUN,MAR,MIE,JUE,VIE").split(","));
  const diasWrap = container.querySelector("#f-dias");
  DIAS_SEMANA.forEach((dia) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "btn btn-sm " + (diasSeleccionados.has(dia) ? "btn-primary" : "btn-ghost");
    chip.textContent = dia;
    chip.onclick = () => {
      if (diasSeleccionados.has(dia)) diasSeleccionados.delete(dia); else diasSeleccionados.add(dia);
      chip.className = "btn btn-sm " + (diasSeleccionados.has(dia) ? "btn-primary" : "btn-ghost");
    };
    diasWrap.appendChild(chip);
  });

  const selRiesgo = GlassSelect.crearGlassSelect(container.querySelector("#f-riesgo"), {
    opciones: RIESGO_OPC, valorInicial: perfil.nivel_riesgo || "Ninguno",
  });

  const segTipoDia = document.createElement("div");
  segTipoDia.className = "segmented";
  segTipoDia.innerHTML = `
    <button type="button" data-v="Cumpleaños">Cumpleaños</button>
    <button type="button" data-v="Santoral">Santoral</button>`;
  container.querySelector("#f-tipo-dia").appendChild(segTipoDia);
  const ctrlTipoDia = Segmented.montarSegmented(segTipoDia, {
    valorInicial: perfil.tipo_dia_especial || "Cumpleaños",
  });

  const inFechaDia = campoDDMM(container.querySelector("#f-fecha-dia"), perfil.fecha_dia_especial);

  container.querySelector("#btn-guardar-perfil").onclick = async () => {
    try {
      await Api.llamar("perfil_guardar", {
        nombre: inNombre.value, no_empleado: inNoEmp.value, centro_trabajo: inCentro.value,
        area_direccion: inArea.value, turno: selTurno.getValue(), recurso: selRecurso.getValue(),
        hora_entrada: horaEntrada.getValue(), hora_fin_turno: horaFin.getValue(),
        dias_laborables: Array.from(diasSeleccionados),
        nivel_riesgo: selRiesgo.getValue(), tipo_dia_especial: ctrlTipoDia.getValue(), fecha_dia_especial: inFechaDia.value,
      });
      Api.mostrarToast("Perfil guardado correctamente.", "success");
    } catch (e) { /* el toast de error ya se mostró */ }
  };
}
