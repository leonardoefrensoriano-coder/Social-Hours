/* SEGURIDAD: contraseñas cifradas, sesiones firmadas (token) y protección de rutas.
   No necesita instalar nada: usa el módulo "crypto" que ya trae Node. */
const crypto = require("crypto");

/* ---------- Clave secreta para firmar los tokens ----------
   Agrega en tu .env una línea:  AUTH_SECRET=una_frase_larga_y_aleatoria
   Si no existe, se genera una al arrancar (las sesiones se cierran al reiniciar). */
let SECRETO = process.env.AUTH_SECRET;
if (!SECRETO) {
  SECRETO = crypto.randomBytes(32).toString("hex");
  console.warn(
    "AVISO: falta AUTH_SECRET en el .env. Se usa una clave temporal; las sesiones se cerrarán al reiniciar el servidor.",
  );
}

const DURACION_SESION_MS = 8 * 60 * 60 * 1000; /* 8 horas */
const PREFIJO_HASH = "s1$";

/* ---------- Tipo de cuenta según el correo ----------
   Estudiante  = NIE de 7 dígitos + @clases.edu.sv   (ej. 4658411@clases.edu.sv)
   Profesor    = cualquier otro correo (gmail, o nombre.apellido@clases.edu.sv)
   Esta es la ÚNICA regla; el servidor la usa para aceptar o rechazar registros. */
const RE_CORREO_ESTUDIANTE = /^(\d{7})@clases\.edu\.sv$/i;
const RE_CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizarCorreo(correo) {
  return String(correo || "")
    .trim()
    .toLowerCase();
}

/* Devuelve el NIE (7 dígitos) si es correo de estudiante; si no, null */
function nieDeCorreo(correo) {
  const m = RE_CORREO_ESTUDIANTE.exec(normalizarCorreo(correo));
  return m ? m[1] : null;
}

function tipoDeCuenta(correo) {
  return nieDeCorreo(correo) ? "estudiante" : "profesor";
}

/* ---------- Contraseñas ----------
   Formato corto (48 caracteres) para que quepa en columnas varchar(50). */
function hashContrasena(plana) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plana), sal, 16);
  return `${PREFIJO_HASH}${sal.toString("base64url")}$${hash.toString("base64url")}`;
}

function iguales(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* Devuelve { ok, actualizar }.
   - Si en la BD todavía hay contraseña en texto plano y coincide, ok=true y
     actualizar=<nuevo hash> para que el controlador la guarde cifrada. */
function verificarContrasena(plana, guardada) {
  if (!guardada || guardada === "GOOGLE_OAUTH_USER") return { ok: false };
  if (guardada.startsWith(PREFIJO_HASH)) {
    const [, sal, hash] = guardada.split("$");
    if (!sal || !hash) return { ok: false };
    const calculado = crypto
      .scryptSync(String(plana), Buffer.from(sal, "base64url"), 16)
      .toString("base64url");
    return { ok: iguales(calculado, hash) };
  }
  if (iguales(plana, guardada)) {
    return { ok: true, actualizar: hashContrasena(plana) };
  }
  return { ok: false };
}

/* Quita la contraseña de cualquier fila que se envíe al navegador */
function limpiarUsuario(fila) {
  if (!fila) return fila;
  const { contraseña, contrasena, password, ...resto } = fila;
  return resto;
}

/* ---------- Tokens de sesión ---------- */
function firmar(texto) {
  return crypto.createHmac("sha256", SECRETO).update(texto).digest("base64url");
}

function crearToken(id, rol) {
  const cuerpo = Buffer.from(
    JSON.stringify({ id, rol, exp: Date.now() + DURACION_SESION_MS }),
  ).toString("base64url");
  return `${cuerpo}.${firmar(cuerpo)}`;
}

function leerToken(token) {
  if (!token || !token.includes(".")) return null;
  const [cuerpo, firma] = token.split(".");
  if (!iguales(firma, firmar(cuerpo))) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString());
    return datos.exp > Date.now() ? datos : null;
  } catch {
    return null;
  }
}

/* Middleware: exige sesión válida y uno de los roles indicados */
function requireAuth(...roles) {
  return (req, res, next) => {
    const cabecera = req.headers.authorization || "";
    const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
    const datos = leerToken(token);
    if (!datos)
      return res
        .status(401)
        .json({ error: "Sesión no válida o vencida. Inicia sesión de nuevo." });
    if (roles.length && !roles.includes(datos.rol))
      return res.status(403).json({ error: "No tienes permiso para esto" });
    req.usuario = datos; /* { id, rol, exp } */
    next();
  };
}

/* ---------- Límite de intentos de login (contra adivinar contraseñas) ---------- */
const intentos = new Map();
function limitarIntentos(req, res, next) {
  const clave =
    `${req.ip}|${(req.body && req.body.correo) || ""}`.toLowerCase();
  const ahora = Date.now();
  const ventana = 15 * 60 * 1000;
  const lista = (intentos.get(clave) || []).filter((t) => ahora - t < ventana);
  if (lista.length >= 10)
    return res
      .status(429)
      .json({ error: "Demasiados intentos. Espera unos minutos." });
  lista.push(ahora);
  intentos.set(clave, lista);
  next();
}

module.exports = {
  normalizarCorreo,
  nieDeCorreo,
  tipoDeCuenta,
  RE_CORREO_VALIDO,
  hashContrasena,
  verificarContrasena,
  limpiarUsuario,
  crearToken,
  requireAuth,
  limitarIntentos,
};
