/* rutas de notificaciones: cada estudiante ve solo las suyas */
const express = require("express");
const router = express.Router();
const { requireAuth } = require("../controlador/seguridad");
const notificaciones = require("../controlador/notificaciones");

router.use(requireAuth("estudiante"));

router.get("/", notificaciones.misNotificaciones);
router.put("/leer-todas", notificaciones.leerTodas);
router.put("/:id/leer", notificaciones.leerUna);

module.exports = router;
