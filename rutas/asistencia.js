/* Rutas de asistencia */
const express = require("express");
const router = express.Router();
const c = require("../controlador/Asistencia");
const { requireAuth } = require("../controlador/seguridad");

/* El estudiante ve su propia asistencia */
router.get("/mia", requireAuth("estudiante"), c.mia);

/* El profesor ve y guarda la asistencia de un día */
router.get("/", requireAuth("profesor"), c.listarPorFecha);
router.get("/dia", requireAuth("profesor"), c.listarDia);
router.put("/lote", requireAuth("profesor"), c.guardarLote);
router.put("/horario", requireAuth("profesor"), c.guardarHorario);

module.exports = router;
