require("dotenv").config();
const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();

/* Middlewares para parsear JSON y urlencoded */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* CORS: la página y la API salen del mismo servidor, así que no hace falta abrirlo a todos.
   Si algún día sirves el HTML desde otro dominio, pon en el .env:  CORS_ORIGIN=https://tu-dominio */
app.use((req, res, next) => {
  const permitido = process.env.CORS_ORIGIN;
  if (permitido && req.headers.origin === permitido) {
    res.header("Access-Control-Allow-Origin", permitido);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* Cargar la conexión a la base de datos */
require("./apis/conexion.js");

/* Transporter de Nodemailer usando las credenciales del .env */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* 1. RUTAS DE LA API (Deben procesarse antes que las estáticas) */
app.use("/api/profesores", require("./rutas/profesores"));
app.use("/api/estudiantes", require("./rutas/estudiantes"));
app.use("/api/registro_estudiante", require("./rutas/registro_estudiante"));
app.use("/api/asistencia", require("./rutas/asistencia"));
app.use("/api/validaciones", require("./rutas/validaciones"));
app.use("/api/notificaciones", require("./rutas/notificaciones"));
/* Resto de tablas: grados, secciones, proyectos, validaciones, etc. */
app.use("/api", require("./rutas/Tablas"));

/* 2. SERVIR RECURSOS ESTÁTICOS (Archivos CSS, JS e Imágenes) */
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/img", express.static(path.join(__dirname, "img")));
app.use(express.static(path.join(__dirname, "html"), { index: false }));

/* 3. RUTAS PARA NAVEGACIÓN EN PÁGINAS HTML */
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "html", "login.html"));
});

app.get("/sistema.html", (req, res) => {
  res.sendFile(path.join(__dirname, "html", "sistema.html"));
});

app.get("/estudiantes.html", (req, res) => {
  res.sendFile(path.join(__dirname, "html", "estudiantes.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "html", "index.html"));
});

/* Ruta raíz (Sirve el index.html) */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "html", "index.html"));
});

/* Manejo de errores 404 */
app.use((req, res) => {
  res.status(404).json({ error: "Página no encontrada" });
});

/* Manejo de errores 500 */
app.use((err, req, res, next) => {
  console.error("Error interno:", err.stack);
  res.status(500).json({ error: "Algo salió mal!" });
});

/* Puerto de escucha */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

/* Evitar caída del proceso por excepciones no capturadas */
process.on("uncaughtException", (err) => {
  console.error("Error no capturado:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Promesa rechazada no manejada:", reason);
});
