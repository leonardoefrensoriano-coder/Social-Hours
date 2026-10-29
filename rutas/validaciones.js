/* rutas para validaciones */
const express = require("express");
const router = express.Router();
const { requireAuth } = require("../controlador/seguridad");
const validaciones = require("../controlador/validaciones");

/* El estudiante ve SU propia validación (debe ir antes de la regla de profesores) */
router.get(
  "/mi-validacion",
  requireAuth("estudiante"),
  validaciones.miValidacion,
);

/* Todo lo demás: solo profesores con sesión */
router.use(requireAuth("profesor"));

router.get("/completos", validaciones.listarCompletos);
router.get("/estudiante/:nie", validaciones.obtenerEstudiante);
router.post("/emitir", validaciones.emitir);

/* Lo demás (GET /api/validaciones, /:id, PUT, DELETE) lo sigue atendiendo rutas/Tablas.js */
module.exports = router;
