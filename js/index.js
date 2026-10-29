document.addEventListener("DOMContentLoaded", () => {
    const botonesMenu = document.querySelectorAll(".menuElemento");
    const secciones = document.querySelectorAll("main section");
    function mostrarSeccion(id) {
        secciones.forEach(seccion => {
            if (seccion.id === id) {
                seccion.style.display = "block";
            } else {
                seccion.style.display = "none";
            }
        });
    }
    mostrarSeccion("Inicio");
    botonesMenu.forEach(boton => {
        boton.addEventListener("click", (e) => {
            e.preventDefault();
            const destino = boton.getAttribute("data-target");
            mostrarSeccion(destino);
        });
    });
});
/*funcion del active*/
document.addEventListener("DOMContentLoaded", () => {
    const botonesMenu = document.querySelectorAll(".menuElemento");
    const botonInicial = document.querySelector(".menuElemento[data-target='Inicio']");
    if (botonInicial) {
        botonInicial.classList.add("active");
    }
    botonesMenu.forEach(boton => {
        boton.addEventListener("click", () => {
            botonesMenu.forEach(b => {
                b.classList.remove("active");
            });
            boton.classList.add("active");
        });
    });
});
