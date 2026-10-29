/* Página del estudiante: menú y horas reales desde la base de datos */
const API_BASE = "";

function escaparHTML(valor) {
  return String(valor ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function leerEstudiante() {
  try {
    return JSON.parse(localStorage.getItem("estudiante"));
  } catch (e) {
    return null;
  }
}

async function cargarMisHoras() {
  const tbodyHistorial = document.getElementById("registroAlumno");
  const tbodyHoras = document.getElementById("registroHoras");
  const est = leerEstudiante();

  if (!est || !est.token) {
    window.location.href = "login.html";
    return;
  }

  try {
    const respuesta = await fetch(`${API_BASE}/api/estudiantes/mis-horas`, {
      headers: { Authorization: "Bearer " + est.token },
    });

    if (respuesta.status === 401) {
      localStorage.removeItem("estudiante");
      window.location.href = "login.html";
      return;
    }

    const datos = await respuesta.json();

    if (!respuesta.ok) throw new Error(datos.error || "Error al cargar");

    if (!datos.vinculado || datos.registros.length === 0) {
      const mensaje = !datos.vinculado
        ? "Tu cuenta aún no está vinculada a un NIE. Pide a tu profesor que lo registre."
        : "Todavía no tienes horas registradas.";
      tbodyHistorial.innerHTML = `<tr><td colspan="7">${mensaje}</td></tr>`;
      tbodyHoras.innerHTML = `<tr><td colspan="3">${mensaje}</td></tr>`;
      return;
    }

    /* Historial: una fila por cada día que vino (el más reciente arriba) y,
       al final, la fila del total acumulado que ya tenía. */
    const base = datos.registros[0] || {};
    const dias = Array.isArray(datos.dias) ? datos.dias : [];

    const filasDias = dias
      .map((d) => {
        return `<tr>
          <td>${escaparHTML(base.nombre)}</td>
          <td>${escaparHTML(base.nie)}</td>
          <td>${escaparHTML(base.grado)}</td>
          <td>${escaparHTML(base.seccion)}</td>
          <td>${escaparHTML(d.servicio || base.servicio)}</td>
          <td>${escaparHTML(Number(d.horas || 0).toFixed(2))}</td>
          <td>Asistió</td>
        </tr>`;
      })
      .join("");

    const filasTotal = datos.registros
      .map(
        (r) => `<tr>
          <td>${escaparHTML(r.nombre)}</td>
          <td>${escaparHTML(r.nie)}</td>
          <td>${escaparHTML(r.grado)}</td>
          <td>${escaparHTML(r.seccion)}</td>
          <td>${escaparHTML(r.servicio)}</td>
          <td>${escaparHTML(r.horas)}</td>
          <td>${escaparHTML(r.estado)}</td>
        </tr>`,
      )
      .join("");

    /* Si ya hay días registrados se muestra una fila por día;
       si todavía no hay ninguno, se muestra la fila que ya tenía. */
    tbodyHistorial.innerHTML = dias.length > 0 ? filasDias : filasTotal;

    tbodyHoras.innerHTML = datos.registros
      .map(
        (r) => `<tr>
          <td>${escaparHTML(r.nombre)}</td>
          <td>${escaparHTML(r.nie)}</td>
          <td>${escaparHTML(r.horas)}</td>
        </tr>`,
      )
      .join("");
  } catch (error) {
    console.error("Error al cargar tus horas:", error);
    tbodyHistorial.innerHTML = `<tr><td colspan="7">No se pudieron cargar tus horas.</td></tr>`;
  }
}

/* ---------- ALERTAS: las mismas notificaciones que llegan al correo ---------- */
const ICONOS_ALERTA = {
  completas: "fa-circle-check",
  incompletas: "fa-hourglass-half",
  aviso: "fa-bell",
};

function fechaAlerta(texto) {
  const f = new Date(texto);
  if (isNaN(f)) return "";
  return f.toLocaleString("es-SV", { dateStyle: "medium", timeStyle: "short" });
}

async function marcarAlertaLeida(id) {
  const est = leerEstudiante();
  if (!est || !est.token) return;
  try {
    await fetch(
      `${API_BASE}/api/notificaciones/${encodeURIComponent(id)}/leer`,
      {
        method: "PUT",
        headers: { Authorization: "Bearer " + est.token },
      },
    );
  } catch (e) {
    console.error("No se pudo marcar la alerta:", e);
  }
  cargarAlertas();
}

async function marcarTodasLeidas() {
  const est = leerEstudiante();
  if (!est || !est.token) return;
  try {
    await fetch(`${API_BASE}/api/notificaciones/leer-todas`, {
      method: "PUT",
      headers: { Authorization: "Bearer " + est.token },
    });
  } catch (e) {
    console.error("No se pudieron marcar las alertas:", e);
  }
  cargarAlertas();
}

async function cargarAlertas() {
  const lista = document.getElementById("listaAlertas");
  const badge = document.getElementById("badgeAlertas");
  const btnTodas = document.getElementById("btnLeerTodas");
  const est = leerEstudiante();
  if (!lista || !est || !est.token) return;

  try {
    const respuesta = await fetch(`${API_BASE}/api/notificaciones`, {
      headers: { Authorization: "Bearer " + est.token },
    });
    if (respuesta.status === 401) {
      localStorage.removeItem("estudiante");
      window.location.href = "login.html";
      return;
    }
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || "Error al cargar");

    /* Globito con la cantidad de alertas sin leer, junto al menú */
    if (badge) {
      badge.textContent = datos.noLeidas > 9 ? "9+" : String(datos.noLeidas);
      badge.style.display = datos.noLeidas > 0 ? "inline-block" : "none";
    }
    if (btnTodas) btnTodas.style.display = datos.noLeidas > 0 ? "" : "none";

    if (!datos.vinculado) {
      lista.innerHTML =
        '<p class="alertasVacio">Tu cuenta aún no está vinculada a un NIE. Pide a tu profesor que lo registre.</p>';
      return;
    }
    if (datos.notificaciones.length === 0) {
      lista.innerHTML =
        '<p class="alertasVacio">No tienes alertas por ahora.</p>';
      return;
    }

    lista.innerHTML = datos.notificaciones
      .map((n) => {
        const icono = ICONOS_ALERTA[n.tipo] || ICONOS_ALERTA.aviso;
        return `<article class="alertaItem ${n.leida ? "" : "alertaNueva"} alerta-${escaparHTML(n.tipo || "aviso")}" data-id="${escaparHTML(n.id_notificacion)}" data-leida="${n.leida ? "1" : "0"}">
          <i class="fas ${icono} alertaIcono"></i>
          <div class="alertaCuerpo">
            <h3>${escaparHTML(n.asunto)}${n.leida ? "" : ' <span class="alertaEtiqueta">Nueva</span>'}</h3>
            <p>${escaparHTML(n.mensaje)}</p>
            <small>${escaparHTML(fechaAlerta(n.fecha))}</small>
          </div>
        </article>`;
      })
      .join("");
  } catch (error) {
    console.error("Error al cargar tus alertas:", error);
    lista.innerHTML =
      '<p class="alertasVacio">No se pudieron cargar tus alertas.</p>';
  }
}

/* ---------- VALIDACIÓN: solo aparece cuando el estudiante ya completó sus horas ---------- */
let datosValidacion = null;

function fechaLarga(d = new Date()) {
  return d.toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/* "2026-10-28" -> Date local (evita que la zona horaria cambie el día) */
function fechaDesdeISO(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto || "");
  return m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date();
}

function textoGrado(d) {
  const grado = String(d.grado ?? "").trim();
  const seccion = String(d.seccion ?? "").trim();
  return seccion ? `${grado} (Sección ${seccion})` : grado;
}

function cerrarModalValidacion() {
  const modal = document.getElementById("modalValidacion");
  if (modal) modal.style.display = "none";
}

function limpiarValidacion() {
  datosValidacion = null;
  [
    "valNombre",
    "valNie",
    "valGrado",
    "valHoras",
    "valFecha",
    "valServicio",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
}

async function cargarValidacion() {
  const est = leerEstudiante();
  if (!est || !est.token) return;

  try {
    const respuesta = await fetch(
      `${API_BASE}/api/validaciones/mi-validacion`,
      {
        headers: { Authorization: "Bearer " + est.token },
      },
    );
    if (respuesta.status === 401) {
      localStorage.removeItem("estudiante");
      window.location.href = "login.html";
      return;
    }
    const d = await respuesta.json();
    if (!respuesta.ok) throw new Error(d.error || "Error al cargar");

    /* Si todavía no completa las horas, el documento se queda vacío */
    if (!d.completo) {
      limpiarValidacion();
      return;
    }

    datosValidacion = d;
    const fecha = d.fecha_validacion
      ? fechaLarga(fechaDesdeISO(d.fecha_validacion))
      : fechaLarga();
    document.getElementById("valNombre").textContent = d.nombre || "";
    document.getElementById("valNie").textContent = d.nie || "";
    document.getElementById("valGrado").textContent = textoGrado(d);
    document.getElementById("valHoras").textContent = d.horas + " horas";
    document.getElementById("valFecha").textContent = fecha;
    document.getElementById("valServicio").textContent = d.servicio || "";
  } catch (error) {
    console.error("Error al cargar tu validación:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  /* Sin sesión de estudiante se vuelve al login */
  const est = leerEstudiante();
  if (!est || !est.token) {
    window.location.href = "login.html";
    return;
  }

  /* Foto de Google (si la hay) en lugar del icono de usuario */
  const fotoPerfil = document.getElementById("fotoPerfil");
  const iconoPerfil = document.getElementById("iconoPerfil");
  const urlFoto = est.foto || est.picture;
  if (fotoPerfil && urlFoto) {
    fotoPerfil.onload = () => {
      fotoPerfil.style.display = "inline-block";
      if (iconoPerfil) iconoPerfil.style.display = "none";
    };
    fotoPerfil.onerror = () => {
      fotoPerfil.style.display = "none";
      if (iconoPerfil) iconoPerfil.style.display = "";
    };
    fotoPerfil.src = urlFoto;
  }

  /* Menú desplegable del perfil */
  const btnPerfil = document.getElementById("btnPerfil");
  const menuDesplegable = document.getElementById("menuDesplegable");
  if (btnPerfil && menuDesplegable) {
    btnPerfil.addEventListener("click", (e) => {
      e.stopPropagation();
      const abierto = menuDesplegable.classList.toggle("activo");
      btnPerfil.setAttribute("aria-expanded", abierto);
    });
    document.addEventListener("click", (e) => {
      if (!menuDesplegable.contains(e.target)) {
        menuDesplegable.classList.remove("activo");
        btnPerfil.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* Modo oscuro: se guarda la preferencia en el navegador (la misma que en sistema.html) */
  const btnModoOscuro = document.getElementById("btnModoOscuro");
  const iconoModo = document.getElementById("iconoModo");

  function aplicarModo(oscuro) {
    document.body.classList.toggle("modo-oscuro", oscuro);
    if (iconoModo) iconoModo.className = oscuro ? "fas fa-sun" : "fas fa-moon";
    if (btnModoOscuro) {
      btnModoOscuro.setAttribute("aria-pressed", oscuro);
      btnModoOscuro.title = oscuro ? "Modo claro" : "Modo oscuro";
    }
  }

  let modoOscuroGuardado = false;
  try {
    modoOscuroGuardado = localStorage.getItem("modoOscuro") === "1";
  } catch (e) {}
  aplicarModo(modoOscuroGuardado);

  if (btnModoOscuro) {
    btnModoOscuro.addEventListener("click", () => {
      const oscuro = !document.body.classList.contains("modo-oscuro");
      aplicarModo(oscuro);
      try {
        localStorage.setItem("modoOscuro", oscuro ? "1" : "0");
      } catch (e) {}
    });
  }

  /* Cerrar sesión */
  const btnCerrarSesion = document.getElementById("btnCerrarSesion");
  if (btnCerrarSesion) {
    btnCerrarSesion.addEventListener("click", () => {
      localStorage.removeItem("estudiante");
      window.location.href = "login.html";
    });
  }

  const botonesMenu = document.querySelectorAll(".barraElemento");
  const secciones = document.querySelectorAll("main section");
  function mostrarSeccion(id) {
    secciones.forEach((seccion) => {
      seccion.style.display = seccion.id === id ? "block" : "none";
    });
  }
  mostrarSeccion("Historial");
  botonesMenu.forEach((boton) => {
    boton.addEventListener("click", (e) => {
      e.preventDefault();
      const destino = boton.getAttribute("data-target");
      mostrarSeccion(destino);
      if (destino === "Alertas") cargarAlertas();
    });
  });

  /* Alertas: clic en una alerta nueva la marca como leída; botón para marcar todas */
  const listaAlertas = document.getElementById("listaAlertas");
  if (listaAlertas) {
    listaAlertas.addEventListener("click", (e) => {
      const item = e.target.closest(".alertaItem");
      if (item && item.dataset.leida === "0")
        marcarAlertaLeida(item.dataset.id);
    });
  }
  const btnLeerTodas = document.getElementById("btnLeerTodas");
  if (btnLeerTodas) btnLeerTodas.addEventListener("click", marcarTodasLeidas);

  /* Validación: ventana emergente (solo para ver; abrir / cerrar) */
  const modalValidacion = document.getElementById("modalValidacion");
  const btnAbrirValidacion = document.getElementById("btnAbrirValidacion");
  if (btnAbrirValidacion && modalValidacion) {
    btnAbrirValidacion.addEventListener("click", () => {
      modalValidacion.style.display = "flex";
    });
    modalValidacion.addEventListener("click", (e) => {
      if (e.target === modalValidacion) cerrarModalValidacion();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cerrarModalValidacion();
    });
  }
  const btnCerrarValidacion = document.getElementById("btnCerrarValidacion");
  if (btnCerrarValidacion)
    btnCerrarValidacion.addEventListener("click", cerrarModalValidacion);

  cargarMisHoras();
  cargarAlertas();
  cargarValidacion();
  /* Se revisa cada 30 segundos para que las alertas y la validación aparezcan sin recargar */
  setInterval(() => {
    cargarAlertas();
    cargarValidacion();
  }, 30000);
});
