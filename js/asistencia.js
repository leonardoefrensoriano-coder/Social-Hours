/* ASISTENCIA (vista del profesor, sistema.html)
   Elige fecha y grado y marca quién asistió ese día. La hora de entrada y salida
   se escribe en el formulario "Registrar Alumno" (no aquí).
   Usa fetchAuth y escaparHTML, que ya existen en sistema.js. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const seccion = $("Asistencia");
  if (!seccion) return;

  const tbody = $("tablaAsistencia");
  let cargando = false;

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function mensaje(texto) {
    tbody.innerHTML = `<tr><td colspan="3">${escaparHTML(texto)}</td></tr>`;
    actualizarContador();
  }

  /* Los grados salen de los registros de estudiantes (incluye todos los grados registrados) */
  async function llenarGrados() {
    const sel = $("asistGrado");
    const previo = sel.value;
    try {
      const r = await fetchAuth(`${API_BASE}/api/registro_estudiante`);
      const registros = await r.json();
      if (!r.ok || !Array.isArray(registros)) {
        throw new Error(registros.error || "No se pudieron leer los registros");
      }
      // Obtener combinaciones únicas de grado|sección
      const combinaciones = new Set();
      registros.forEach((g) => {
        const grado = g.grado || "";
        const seccion = g.seccion || "";
        if (grado && seccion) {
          combinaciones.add(`${grado}|${seccion}`);
        }
      });
      sel.innerHTML = [...combinaciones]
        .map((c) => {
          const [grado, seccion] = c.split("|");
          return `<option value="${escaparHTML(c)}">${escaparHTML(grado)} "${escaparHTML(seccion)}"</option>`;
        })
        .join("");
      if ([...sel.options].some((o) => o.value === previo)) sel.value = previo;
    } catch (error) {
      console.error("Error al cargar grados:", error);
      // Fallback: cargar desde tarjetas si falla
      const tarjetas = [...document.querySelectorAll("#Grados .tarjeta-grado")];
      sel.innerHTML = tarjetas
        .map((t) => {
          const g = t.getAttribute("data-grado");
          const s = t.getAttribute("data-seccion");
          return `<option value="${escaparHTML(g + "|" + s)}">${escaparHTML(g)} "${escaparHTML(s)}"</option>`;
        })
        .join("");
      if ([...sel.options].some((o) => o.value === previo)) sel.value = previo;
    }
  }

  function filaHTML(alumno, reg, tieneCuenta) {
    const nie = String(alumno.nie ?? "").trim();
    /* La asistencia se guarda por cuenta de estudiante: sin NIE o sin cuenta no se puede marcar */
    const sinNie = !nie || !tieneCuenta;
    const nota = !nie ? "Sin NIE" : !tieneCuenta ? " (sin cuenta)" : "";
    const asistio = !!(reg && reg.asistio);
    return `<tr data-nie="${escaparHTML(nie)}">
      <td>${escaparHTML(alumno.nombre ?? "")}</td>
      <td>${nie ? escaparHTML(nie) : ""}${nota ? `<small title="El alumno aún no creó su cuenta; no se puede registrar su asistencia">${nota}</small>` : ""}</td>
      <td><input type="checkbox" class="chkAsistio" ${asistio ? "checked" : ""} ${sinNie ? "disabled" : ""} title="Asistió" /></td>
    </tr>`;
  }

  function actualizarContador() {
    const filas = [...tbody.querySelectorAll("tr[data-nie]")].filter(
      (f) => !f.querySelector(".chkAsistio").disabled,
    );
    const marcados = filas.filter(
      (f) => f.querySelector(".chkAsistio").checked,
    );
    const el = $("asistContador");
    if (el)
      el.textContent = filas.length
        ? `Asistieron ${marcados.length} de ${filas.length}`
        : "";
    const todos = $("asistTodos");
    if (todos)
      todos.checked = filas.length > 0 && marcados.length === filas.length;
  }

  async function cargar() {
    const fecha = $("asistFecha").value;
    const valor = $("asistGrado").value;
    if (!fecha || !valor) return mensaje("Elige una fecha y un grado.");
    const [grado, seccionGrado] = valor.split("|");
    if (cargando) return;
    cargando = true;
    mensaje("Cargando...");
    try {
      const [rAlumnos, rAsist] = await Promise.all([
        fetchAuth(
          `${API_BASE}/api/registro_estudiante/grado/${encodeURIComponent(grado)}/seccion/${encodeURIComponent(seccionGrado)}`,
        ),
        fetchAuth(
          `${API_BASE}/api/asistencia?fecha=${encodeURIComponent(fecha)}`,
        ),
      ]);
      const alumnos = await rAlumnos.json();
      const datosAsist = await rAsist.json();
      if (!rAlumnos.ok || !Array.isArray(alumnos)) {
        throw new Error(alumnos.error || "No se pudieron leer los alumnos");
      }
      if (!rAsist.ok || !Array.isArray(datosAsist.registros)) {
        throw new Error(datosAsist.error || "No se pudo leer la asistencia");
      }
      const porNie = new Map(
        datosAsist.registros.map((g) => [String(g.nie).trim(), g]),
      );
      const conCuenta = new Set((datosAsist.con_cuenta || []).map(String));
      if (alumnos.length === 0) return mensaje("Este grado no tiene alumnos.");
      /* Un alumno puede tener varios registros de horas (misma persona, mismo NIE):
         en la asistencia sale una sola vez */
      const vistos = new Set();
      const unicos = alumnos.filter((a) => {
        const nie = String(a.nie ?? "").trim();
        if (!nie) return true;
        if (vistos.has(nie)) return false;
        vistos.add(nie);
        return true;
      });
      tbody.innerHTML = unicos
        .map((a) => {
          const nie = String(a.nie ?? "").trim();
          return filaHTML(a, porNie.get(nie), conCuenta.has(nie));
        })
        .join("");
      actualizarContador();
    } catch (error) {
      console.error("Error al cargar asistencia:", error);
      mensaje("No se pudo cargar la asistencia.");
    } finally {
      cargando = false;
    }
  }

  async function guardar() {
    const fecha = $("asistFecha").value;
    const filas = [...tbody.querySelectorAll("tr[data-nie]")].filter(
      (f) =>
        f.getAttribute("data-nie") && !f.querySelector(".chkAsistio").disabled,
    );
    if (!fecha || filas.length === 0) {
      return Swal.fire({
        title: "Nada que guardar",
        text: "Elige una fecha y un grado con alumnos.",
        icon: "info",
        confirmButtonColor: "#00b4d8",
        scrollbarPadding: false,
        heightAuto: false,
      });
    }

    const registros = filas.map((fila) => ({
      nie: fila.getAttribute("data-nie"),
      asistio: fila.querySelector(".chkAsistio").checked,
    }));

    try {
      const r = await fetchAuth(`${API_BASE}/api/asistencia/lote`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, registros }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error || "No se pudo guardar");
      const sinCuenta = (datos.sin_cuenta || []).length;
      const sinProyecto = datos.sin_proyecto || [];
      const avisos = [];
      if (sinCuenta) avisos.push(`${sinCuenta} alumno(s) no tienen cuenta`);
      if (sinProyecto.length) {
        avisos.push(
          `${sinProyecto.length} alumno(s) tienen un servicio que no existe como proyecto (NIE: ${sinProyecto.join(", ")})`,
        );
      }
      await Swal.fire({
        title: avisos.length ? "Guardado con avisos" : "¡Guardado!",
        text: avisos.length
          ? `Asistencia guardada, pero no se guardó para: ${avisos.join("; ")}.`
          : "La asistencia del día quedó registrada.",
        icon: avisos.length ? "warning" : "success",
        confirmButtonColor: "#00b4d8",
        scrollbarPadding: false,
        heightAuto: false,
      });
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: error.message || "No se pudo guardar la asistencia",
        icon: "error",
        confirmButtonColor: "#00b4d8",
        scrollbarPadding: false,
        heightAuto: false,
      });
    }
  }

  /* ---- Formulario "Registrar Alumno": fecha por defecto y horas automáticas ---- */
  function ponerFechaDelFormulario() {
    const f = $("fechaRegistro");
    if (f) f.value = hoyISO();
  }

  /* Estado automático: 150 horas o más = Completo, menos = Incompleto
     (si el alumno ya existe, el servidor suma sus horas anteriores y decide el estado final) */
  const HORAS_META = 150;
  function actualizarEstadoDelFormulario() {
    const horas = $("horas");
    const estado = $("estado");
    if (!horas || !estado) return;
    const n = parseFloat(String(horas.value).replace(",", "."));
    estado.value = isNaN(n) ? "" : n >= HORAS_META ? "Completo" : "Incompleto";
  }

  /* Horas automáticas: salida - entrada (se recalcula cada vez que cambian) */
  function calcularHorasDelFormulario() {
    const e = $("horaEntradaRegistro");
    const s = $("horaSalidaRegistro");
    const horas = $("horas");
    if (!e || !s || !horas || !e.value || !s.value) return;
    const [h1, m1] = e.value.split(":").map(Number);
    const [h2, m2] = s.value.split(":").map(Number);
    const minutos = h2 * 60 + m2 - (h1 * 60 + m1);
    horas.value =
      minutos > 0 ? String(Math.round((minutos / 60) * 100) / 100) : "";
    actualizarEstadoDelFormulario();
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!$("asistFecha").value) $("asistFecha").value = hoyISO();
    ponerFechaDelFormulario();

    const formAlumno = $("formularioAlumno");
    if (formAlumno) {
      /* reset() vacía la fecha: se vuelve a poner la de hoy */
      formAlumno.addEventListener("reset", () =>
        setTimeout(ponerFechaDelFormulario, 0),
      );
    }
    ["horaEntradaRegistro", "horaSalidaRegistro"].forEach((id) => {
      const el = $(id);
      if (el) {
        el.addEventListener("change", calcularHorasDelFormulario);
        el.addEventListener("input", calcularHorasDelFormulario);
      }
    });
    /* Si se escriben las horas a mano, el estado también se ajusta solo */
    const campoHoras = $("horas");
    if (campoHoras)
      campoHoras.addEventListener("input", actualizarEstadoDelFormulario);

    /* Al entrar a la sección se actualizan los grados y se carga la lista */
    const enlace = document.querySelector(
      '.barraElemento[data-target="Asistencia"]',
    );
    if (enlace) {
      enlace.addEventListener("click", () => {
        llenarGrados();
        cargar();
      });
    }

    $("asistFecha").addEventListener("change", cargar);
    $("asistGrado").addEventListener("change", cargar);
    $("btnAsistGuardar").addEventListener("click", guardar);

    $("asistTodos").addEventListener("change", (e) => {
      tbody.querySelectorAll("tr[data-nie] .chkAsistio").forEach((chk) => {
        if (!chk.disabled) chk.checked = e.target.checked;
      });
      actualizarContador();
    });

    tbody.addEventListener("change", (e) => {
      if (e.target.classList.contains("chkAsistio")) actualizarContador();
    });
  });
})();
