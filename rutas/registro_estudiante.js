/*rutas de registro_estudiante*/
const express = require("express");
const router = express.Router();
const { requireAuth } = require("../controlador/seguridad");

/* Todo este módulo es solo para profesores con sesión */
router.use(requireAuth("profesor"));
const registro_estudiante = require("../controlador/registro_estudiante");

router.post("/registrar", registro_estudiante.registrarEstudiante);
router.get("/", registro_estudiante.obtenerTodos);
/* Debe ir antes de "/:id" para que no se confunda con un id */
router.get(
  "/grado/:grado/seccion/:seccion",
  registro_estudiante.obtenerPorGradoSeccion,
);
router.get("/:id", registro_estudiante.obtenerPorId);
router.put("/actualizar-horas", registro_estudiante.actualizarHorasPorNie);
router.put(
  "/actualizar-horas-nombre",
  registro_estudiante.actualizarHorasPorNombre,
);
router.put("/:id", registro_estudiante.actualizar);
router.delete("/:id", registro_estudiante.eliminar);

module.exports = router;
