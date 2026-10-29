/* REGISTROS DEL DÍA (sistema.html, sección Alumnos)
   Muestra quién asistió en una fecha, con su entrada, salida y horas de ese día.
   Arranca en la fecha de hoy: cuando pasan las 12 AM la fecha cambia sola y la tabla
   queda vacía hasta que haya registros del nuevo día. Con el selector se ve cualquier día anterior.
   Usa fetchAuth, API_BASE y escaparHTML, que ya existen en sistema.js. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const panel = $("registroDia");
  if (!panel) return;

  const pad = (n) => String(n).padStart(2, "0");
  function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /* "14:30" -> "2:30 PM" */
  function hora12(h) {
    if (!h) return "—";
    const [hh, mm] = h.split(":").map(Number);
    return `${hh % 12 || 12}:${pad(mm)} ${hh >= 12 ? "PM" : "AM"}`;
  }

  /* Si el selector está en "hoy", al cambiar el día se mueve solo a la fecha nueva */
  let fechaHoyVista = hoyISO();
  let cargando = false;

  async function cargar() {
    const fecha = $("diaFecha").value;
    const tbody = $("tablaDia");
    if (!fecha) {
      tbody.innerHTML = '<tr><td colspan="7">Elige una fecha.</td></tr>';
      return;
    }
    if (cargando) return;
    cargando = true;
    try {
      const r = await fetchAuth(
        `${API_BASE}/api/asistencia/dia?fecha=${encodeURIComponent(fecha)}`,
      );
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error || "No se pudo cargar el día");
      const resumen = $("diaResumen");
      if (datos.registros.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="7">No hay registros en esta fecha.</td></tr>';
        resumen.textContent = "";
        return;
      }
      tbody.innerHTML = datos.registros
        .map(
          (x) => `<tr>
          <td>${escaparHTML(x.nombre || "(sin nombre)")}</td>
          <td>${escaparHTML(x.nie)}</td>
          <td>${escaparHTML(x.grado)}</td>
          <td>${escaparHTML(x.seccion)}</td>
          <td>${escaparHTML(x.servicio)}</td>
          <td>${hora12(x.hora_entrada)}</td>
          <td>${hora12(x.hora_salida)}</td>
        </tr>`,
        )
        .join("");
      resumen.textContent = "";
    } catch (error) {
      console.error("Registros del día:", error);
      tbody.innerHTML = `<tr><td colspan="7">${escaparHTML(error.message)}</td></tr>`;
    } finally {
      cargando = false;
    }
  }

  /* Botón "Registros del día": abre/cierra el panel (y cierra los formularios) */
  window.abrirRegistrosDia = function (evento) {
    const boton = evento.currentTarget || evento.target;
    const abierto = panel.style.display === "block";
    ["registro", "registroLatas"].forEach((id) => {
      const f = $(id);
      if (f) f.style.display = "none";
    });
    document.querySelectorAll(".btnRegistrar").forEach((b) => {
      const o = b.getAttribute("onclick") || "";
      if (o.includes("abrirFormularioLatas")) b.textContent = "Registrar Latas";
      else if (o.includes("abrirFormulario(")) b.textContent = "Registrar Alumno";
    });
    if (abierto) {
      panel.style.display = "none";
      boton.textContent = "Registros del día";
      return;
    }
    panel.style.display = "block";
    boton.textContent = "Cerrar registros del día";
    fechaHoyVista = hoyISO();
    $("diaFecha").value = fechaHoyVista;
    cargar();
  };

  window.recargarRegistrosDia = function () {
    if (panel.style.display === "block") cargar();
  };

  document.addEventListener("DOMContentLoaded", () => {
    $("diaFecha").addEventListener("change", cargar);
    $("diaHoy").addEventListener("click", () => {
      $("diaFecha").value = hoyISO();
      cargar();
    });

    /* Cada minuto: si pasó la medianoche y se estaba viendo "hoy", salta al día nuevo;
       si se ve el día actual, se refresca la lista */
    setInterval(() => {
      if (panel.style.display !== "block") return;
      const hoy = hoyISO();
      if (hoy !== fechaHoyVista) {
        if ($("diaFecha").value === fechaHoyVista) $("diaFecha").value = hoy;
        fechaHoyVista = hoy;
      }
      if ($("diaFecha").value === hoy) cargar();
    }, 60000);
  });
})();