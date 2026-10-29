/* Rutas de estudiantes y autenticación */
const express = require("express");
const router = express.Router();
const c = require("../controlador/estudiantes");
const { requireAuth, limitarIntentos } = require("../controlador/seguridad");

/* Públicas (sin sesión) */
router.post("/login", limitarIntentos, c.loginEstudiante);
router.post("/google", c.loginGoogle);
router.post("/registrar", limitarIntentos, c.registrarEstudiante);

/* El estudiante ve sus propias horas (debe ir antes de "/:id") */
router.get("/mis-horas", requireAuth("estudiante"), c.misHoras);

/* Gestión */
router.get("/", requireAuth("profesor"), c.obtenerTodos);
router.get("/:id", requireAuth("profesor", "estudiante"), c.obtenerPorId);
router.put("/:id", requireAuth("profesor", "estudiante"), c.actualizar);
router.delete("/:id", requireAuth("profesor"), c.eliminar);

module.exports = router;
