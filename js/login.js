/* la dirección base del servidor backend */
const API_BASE = ""; /* misma dirección del servidor que sirve la página */

/* ID DE GOOGLE CLOUD */
const GOOGLE_CLIENT_ID =
  "350662208126-ia7fnb078dk7gf5f3b2bs6lelitg25tb.apps.googleusercontent.com";

let googleTokenClient;

/* Estudiante = NIE de 7 dígitos + @clases.edu.sv (ej. 4658411@clases.edu.sv).
   Cualquier otro correo (gmail o nombre.apellido@clases.edu.sv) es de profesor. */
const RE_ESTUDIANTE = /^\d{7}@clases\.edu\.sv$/i;
const RE_NIE_SOLO = /^\d{7}$/;

/* ------------------------------------------------------------------
   1. ANIMACIÓN Y TOGGLE ENTRE LOGIN Y REGISTRO
   ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  const loginContenedor = document.getElementById("loginContenedor");
  const crearCuentaBtn = document.getElementById("crearCuenta");
  const iniciarSesionBtn = document.getElementById("iniciarSesion");
  const formLogin = document.getElementById("formLogin");
  const formRegistro = document.getElementById("formRegistro");

  console.log("Elementos:", { loginContenedor, crearCuentaBtn, iniciarSesionBtn });

  if (crearCuentaBtn) {
    crearCuentaBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Click en Crear Cuenta");
      loginContenedor.classList.add("active");
      console.log("Clases:", loginContenedor.className);
    });
  } else {
    console.error("No se encontró el botón crearCuenta");
  }

  if (iniciarSesionBtn) {
    iniciarSesionBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Click en Iniciar Sesión");
      loginContenedor.classList.remove("active");
      console.log("Clases:", loginContenedor.className);
    });
  } else {
    console.error("No se encontró el botón iniciarSesion");
  }
});

/* ------------------------------------------------------------------
   2. INICIALIZACIÓN DE GOOGLE OAUTH (API EXTERNA)
   ------------------------------------------------------------------ */
window.addEventListener("load", () => {
  if (window.google) {
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "email profile openid",
      callback: async (response) => {
        if (response.access_token) {
          await autenticarConGoogle(response.access_token);
        }
      },
    });

    const botonesGoogle = document.querySelectorAll(".btnGoogleTrigger");
    botonesGoogle.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        googleTokenClient.requestAccessToken();
      });
    });
  }
});

async function obtenerFotoGoogle(token) {
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u.picture || null;
  } catch (e) {
    return null;
  }
}

/* Petición enviada al endpoint de Google en la API */
async function autenticarConGoogle(token) {
  try {
    const response = await fetch(`${API_BASE}/api/profesores/google`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    const data = await response.json();

    /* Si el correo no es de un profesor, se entra como estudiante */
    if (response.status === 403 && data.noEsProfesor) {
      const resEst = await fetch(`${API_BASE}/api/estudiantes/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const dataEst = await resEst.json();
      if (resEst.ok) {
        await Swal.fire({
          title: "¡Éxito!",
          text: "Autenticación de Google exitosa",
          icon: "success",
          confirmButtonColor: "#00b4d8",
          backdrop: "rgba(0,0,0,0.5)",
          scrollbarPadding: false,
          heightAuto: false,
        });
        const foto = await obtenerFotoGoogle(token);
        localStorage.setItem(
          "estudiante",
          JSON.stringify({
            ...dataEst.estudiante,
            foto: foto || dataEst.estudiante.foto,
          }),
        );
        window.location.href = `${API_BASE}/estudiantes.html`;
      } else {
        Swal.fire({
          title: "Error",
          text: dataEst.error || "Error al autenticar con Google",
          icon: "error",
          confirmButtonColor: "#00b4d8",
          scrollbarPadding: false,
          heightAuto: false,
        });
      }
      return;
    }

    if (response.ok) {
      await Swal.fire({
        title: "¡Éxito!",
        text: "Autenticación de Google exitosa",
        icon: "success",
        confirmButtonColor: "#00b4d8",
        backdrop: "rgba(0,0,0,0.5)",
        scrollbarPadding: false,
        heightAuto: false,
      });
      localStorage.setItem("profesor", JSON.stringify(data.profesor));
      window.location.href = `${API_BASE}/sistema.html`;
    } else {
      Swal.fire({
        title: "Error",
        text: data.error || "Error al autenticar con Google",
        icon: "error",
        confirmButtonColor: "#00b4d8",
        backdrop: "rgba(0,0,0,0.5)",
        scrollbarPadding: false,
        heightAuto: false,
      });
    }
  } catch (error) {
    console.error("Error al conectar con el servidor:", error);
    Swal.fire({
      title: "Error de conexión",
      text: "Error de conexión con el servidor",
      icon: "error",
      confirmButtonColor: "#00b4d8",
      backdrop: "rgba(0,0,0,0.5)",
      scrollbarPadding: false,
      heightAuto: false,
    });
  }
}

/* ------------------------------------------------------------------
   3. INICIO DE SESIÓN TRADICIONAL
   ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  const formLogin = document.getElementById("formLogin");
  if (formLogin) {
    formLogin.addEventListener("submit", async (e) => {
    e.preventDefault(); // Evita recargar la pantalla

    const correo = document.getElementById("loginCorreo").value.trim();
    const contrasena = document.getElementById("loginContrasena").value;

    try {
      /* Correo/NIE de estudiante -> solo sistema de estudiantes.
         Cualquier otro correo -> primero profesor y, si no es, estudiante
         (por si hay estudiantes antiguos con correo normal). */
      const esCorreoEstudiante =
        RE_ESTUDIANTE.test(correo) || RE_NIE_SOLO.test(correo);
      const orden = esCorreoEstudiante
        ? ["estudiante"]
        : ["profesor", "estudiante"];

      let response, data, esEstudiante;
      for (const tipo of orden) {
        esEstudiante = tipo === "estudiante";
        response = await fetch(
          `${API_BASE}/api/${esEstudiante ? "estudiantes" : "profesores"}/login`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ correo, contraseña: contrasena }),
          },
        );
        data = await response.json();
        if (response.ok) break;
      }

      const localStorageKey = esEstudiante ? "estudiante" : "profesor";
      const dataKey = esEstudiante ? "estudiante" : "profesor";
      const redirectPage = esEstudiante ? "estudiantes.html" : "sistema.html";

      /* redirección según el tipo de usuario */
      if (response.ok) {
        await Swal.fire({
          title: "¡Bienvenido!",
          text: "Inicio de sesion exitoso!",
          icon: "success",
          confirmButtonColor: "#00b4d8",
          backdrop: "rgba(0,0,0,0.5)",
          scrollbarPadding: false,
          heightAuto: false,
        });
        localStorage.setItem(localStorageKey, JSON.stringify(data[dataKey]));
        window.location.href = `${API_BASE}/${redirectPage}`;
      } else {
        Swal.fire({
          title: "Error",
          text: data.error || "Error al iniciar sesión",
          icon: "error",
          confirmButtonColor: "#00b4d8",
          backdrop: "rgba(0,0,0,0.5)",
          scrollbarPadding: false,
          heightAuto: false,
        });
      }
    } catch (error) {
      console.error("Error de conexión:", error);
      Swal.fire({
        title: "Error de conexión",
        text: "Error de conexión con el servidor",
        icon: "error",
        confirmButtonColor: "#00b4d8",
        backdrop: "rgba(0,0,0,0.5)",
        scrollbarPadding: false,
        heightAuto: false,
      });
    }
  });
  }
});

/* ------------------------------------------------------------------
   4. REGISTRO TRADICIONAL
   ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  const formRegistro = document.getElementById("formRegistro");
  if (formRegistro) {
    formRegistro.addEventListener("submit", async (e) => {
    e.preventDefault();

    const correo = document.getElementById("regCorreo").value.trim();
    const contrasena = document.getElementById("regContrasena").value;

    console.log("Registro - Correo:", correo);

    try {
      /* El correo decide el sistema: NIE@clases.edu.sv -> estudiante, otro -> profesor */
      const esEstudiante = RE_ESTUDIANTE.test(correo);
      const endpoint = esEstudiante
        ? "/api/estudiantes/registrar"
        : "/api/profesores/registrarse";
      const localStorageKey = esEstudiante ? "estudiante" : "profesor";
      const dataKey = localStorageKey;
      const redirectPage = esEstudiante ? "estudiantes.html" : "sistema.html";

      console.log("Registro - Endpoint:", endpoint);

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ correo, contraseña: contrasena }),
      });

      console.log("Registro - Status:", response.status);
      const data = await response.json();
      console.log("Registro - Datos:", data);

      if (response.ok) {
        await Swal.fire({
          title: "¡Registro exitoso!",
          text: "Iniciando sesión...",
          icon: "success",
          confirmButtonColor: "#00b4d8",
          backdrop: "rgba(0,0,0,0.5)",
          scrollbarPadding: false,
          heightAuto: false,
        });
        localStorage.setItem(localStorageKey, JSON.stringify(data[dataKey]));
        window.location.href = `${API_BASE}/${redirectPage}`;
      } else {
        if (data.error && data.error.includes("ya está registrado")) {
          Swal.fire({
            title: "Correo registrado",
            text: "Este correo ya está registrado. Usa otro correo o inicia sesión.",
            icon: "warning",
            confirmButtonColor: "#00b4d8",
            backdrop: "rgba(0,0,0,0.5)",
            scrollbarPadding: false,
            heightAuto: false,
          });
        } else {
          Swal.fire({
            title: "Error",
            text: data.error || "Error al registrar",
            icon: "error",
            confirmButtonColor: "#00b4d8",
            backdrop: "rgba(0,0,0,0.5)",
            scrollbarPadding: false,
            heightAuto: false,
          });
        }
      }
    } catch (error) {
      console.error("Error de conexión:", error);
      Swal.fire({
        title: "Error",
        text: "Error al registrar cuenta",
        icon: "error",
        confirmButtonColor: "#00b4d8",
        backdrop: "rgba(0,0,0,0.5)",
        scrollbarPadding: false,
        heightAuto: false,
      });
    }
  });
  }
});