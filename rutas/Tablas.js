/* Rutas CRUD para las tablas restantes de la base de datos.
   Cada tabla queda disponible en /api/<nombre_de_la_tabla> */
const express = require("express");
const router = express.Router();
const { crearCrud } = require("../controlador/base");
const { requireAuth } = require("../controlador/seguridad");

const TABLAS = [
  "grados",
  "secciones",
  "proyectos",
  "estudiantes_proyectos",
  "registros",
  "validaciones",
  "anios_estudios",
  "tipos_bachillerato",
  "orientadores",
  "coordinadores_horas_sociales",
];

TABLAS.forEach((tabla) => {
  const crud = crearCrud(tabla);
  /* Solo profesores con sesión */
  router.use(`/${tabla}`, requireAuth("profesor"));
  router.get(`/${tabla}`, crud.listar);
  router.get(`/${tabla}/:id`, crud.obtenerUno);
  router.post(`/${tabla}`, crud.crear);
  router.put(`/${tabla}/:id`, crud.actualizar);
  router.delete(`/${tabla}/:id`, crud.eliminar);
});

module.exports = router;