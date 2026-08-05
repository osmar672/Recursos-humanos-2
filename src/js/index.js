/* ============================================================
   APP.JS — TalentIA
   Archivo JavaScript ÚNICO (todo el proyecto consolidado aquí,
   a pedido del usuario). Se conserva la separación por módulos
   mediante los bloques de comentarios originales de cada archivo,
   concatenados en este orden:

     1. dashboard.js   -> métricas y "mejor candidato"
     2. vacantes.js    -> alta, listado, búsqueda, eliminación
     3. candidatos.js  -> alta de CVs, listado, búsqueda, eliminación
     4. evaluador.js   -> motor de análisis heurístico + reporte
     5. historial.js   -> LocalStorage, filtros, edición, borrado
     6. app.js (núcleo)-> estado global, utilidades, navegación,
                          modales, notificaciones y arranque

   Cada función conserva exactamente el mismo nombre y
   comportamiento que en la versión separada por módulos.
============================================================ */

/* ============================================================
   DASHBOARD.JS
   Responsable únicamente de calcular y pintar las métricas
   del panel principal (Dashboard). Lee:
     - estadoApp.candidatos  -> total de CVs cargados.
     - historial (LocalStorage, vía obtenerHistorial() de historial.js)
       -> aprobados / rechazados / pendientes / mejor candidato.
============================================================ */

/**
 * Recalcula y vuelve a pintar todas las tarjetas del Dashboard.
 * Se llama al iniciar la app, al cambiar de vista al Dashboard,
 * y cada vez que se guarda/edita/elimina una evaluación.
 */
function actualizarDashboard() {
  const historial = obtenerHistorial();

  const totalCv = estadoApp.candidatos.length;
  const aprobados = historial.filter((evaluacion) => evaluacion.recomendacion === "contratar").length;
  const rechazados = historial.filter((evaluacion) => evaluacion.recomendacion === "no-recomendado").length;
  const pendientes = historial.filter((evaluacion) => evaluacion.recomendacion === "entrevistar").length;

  document.getElementById("valor-total-cv").textContent = totalCv;
  document.getElementById("valor-cv-aprobados").textContent = aprobados;
  document.getElementById("valor-cv-rechazados").textContent = rechazados;
  document.getElementById("valor-cv-pendientes").textContent = pendientes;

  pintarMejorCandidato(historial);
}

/**
 * Encuentra la evaluación con mayor porcentaje de compatibilidad
 * y la muestra en el panel "Mejor candidato" del Dashboard.
 */
function pintarMejorCandidato(historial) {
  const contenedor = document.getElementById("contenedor-mejor-candidato");
  if (!contenedor) return;

  if (!historial.length) {
    contenedor.innerHTML = '<p class="texto-vacio">Todavía no hay evaluaciones registradas.</p>';
    return;
  }

  const mejor = [...historial].sort((a, b) => b.compatibilidad - a.compatibilidad)[0];

  contenedor.innerHTML = `
    <div class="tarjeta-mejor-candidato">
      <div>
        <strong>${escaparHtml(mejor.candidatoNombre)}</strong>
        <p>${escaparHtml(mejor.vacanteTitulo)} · Calificación ${mejor.calificacion}/10</p>
      </div>
      <span class="etiqueta-semaforo ${mejor.recomendacion}">
        ${textoRecomendacion(mejor.recomendacion)} · ${mejor.compatibilidad}%
      </span>
    </div>
  `;
}

/**
 * Traduce el código interno de recomendación a una etiqueta
 * legible con su color de semáforo (usada en varios módulos).
 */
function textoRecomendacion(codigo) {
  switch (codigo) {
    case "contratar":
      return "🟢 Contratar";
    case "entrevistar":
      return "🟡 Entrevistar";
    case "no-recomendado":
      return "🔴 No recomendado";
    default:
      return codigo;
  }
}


/* ============================================================
   VACANTES.JS
   Gestión de vacantes: alta, listado, búsqueda en tiempo real
   y eliminación. Las vacantes viven en memoria (estadoApp.vacantes).
============================================================ */

/**
 * Maneja el envío del formulario de "Nueva vacante".
 * Valida los campos obligatorios, construye el objeto vacante
 * y lo agrega al estado en memoria.
 */
function crearVacante(evento) {
  evento.preventDefault();
  const formulario = evento.target;

  const campos = {
    titulo: formulario.titulo.value.trim(),
    empresa: formulario.empresa.value.trim(),
    departamento: formulario.departamento.value.trim(),
    experiencia: formulario.experiencia.value,
    habilidadesObligatorias: formulario.habilidadesObligatorias.value.trim(),
    nivelAcademico: formulario.nivelAcademico.value,
    idiomas: formulario.idiomas.value.trim(),
    descripcion: formulario.descripcion.value.trim()
  };

  if (!validarFormularioVacante(campos, formulario)) {
    mostrarNotificacion("Revisa los campos obligatorios de la vacante.", "error");
    return;
  }

  const vacante = {
    id: generarId("vac"),
    titulo: campos.titulo,
    empresa: campos.empresa,
    departamento: campos.departamento,
    experiencia: Number(campos.experiencia),
    habilidadesObligatorias: dividirLista(campos.habilidadesObligatorias),
    habilidadesDeseadas: dividirLista(formulario.habilidadesDeseadas.value.trim()),
    nivelAcademico: campos.nivelAcademico,
    idiomas: dividirLista(campos.idiomas),
    salario: formulario.salario.value.trim(),
    descripcion: campos.descripcion,
    fechaCreacion: new Date().toISOString()
  };

  estadoApp.vacantes.push(vacante);

  formulario.reset();
  limpiarErroresFormulario(formulario);
  renderizarListaVacantes();
  actualizarSelectoresComparacion();
  mostrarNotificacion(`Vacante "${vacante.titulo}" guardada correctamente.`, "exito");
}

/**
 * Valida los campos requeridos del formulario de vacante y
 * marca visualmente los campos con error.
 */
function validarFormularioVacante(campos, formulario) {
  let esValido = true;

  const requeridos = [
    ["titulo", campos.titulo],
    ["empresa", campos.empresa],
    ["departamento", campos.departamento],
    ["experiencia", campos.experiencia],
    ["habilidades-obligatorias", campos.habilidadesObligatorias],
    ["nivel-academico", campos.nivelAcademico],
    ["idiomas", campos.idiomas],
    ["descripcion", campos.descripcion]
  ];

  requeridos.forEach(([sufijoId, valor]) => {
    const idCampo = `vacante-${sufijoId}`;
    const contenedorCampo = document.getElementById(idCampo)?.closest(".campo");
    const mensajeError = document.querySelector(`[data-error-para="${idCampo}"]`);

    if (!valor || String(valor).trim() === "") {
      esValido = false;
      if (contenedorCampo) contenedorCampo.classList.add("con-error");
      if (mensajeError) mensajeError.textContent = "Este campo es obligatorio.";
    } else {
      if (contenedorCampo) contenedorCampo.classList.remove("con-error");
      if (mensajeError) mensajeError.textContent = "";
    }
  });

  return esValido;
}

function limpiarErroresFormulario(formulario) {
  formulario.querySelectorAll(".campo.con-error").forEach((campo) => campo.classList.remove("con-error"));
  formulario.querySelectorAll(".mensaje-error").forEach((mensaje) => (mensaje.textContent = ""));
}

/**
 * Vuelve a pintar la lista de vacantes registradas.
 * filtro: texto opcional para búsqueda en tiempo real.
 */
function renderizarListaVacantes(filtro = "") {
  const lista = document.getElementById("lista-vacantes");
  if (!lista) return;

  const filtroNormalizado = filtro.trim().toLowerCase();
  const vacantesFiltradas = estadoApp.vacantes.filter((v) =>
    `${v.titulo} ${v.empresa} ${v.departamento}`.toLowerCase().includes(filtroNormalizado)
  );

  if (!vacantesFiltradas.length) {
    lista.innerHTML = estadoApp.vacantes.length
      ? '<li class="texto-vacio">No hay vacantes que coincidan con la búsqueda.</li>'
      : '<li class="texto-vacio">Aún no se han registrado vacantes.</li>';
    return;
  }

  lista.innerHTML = vacantesFiltradas
    .slice()
    .reverse()
    .map(
      (v) => `
      <li class="elemento-lista" data-id="${v.id}">
        <div class="elemento-lista-info">
          <span class="elemento-lista-titulo">${escaparHtml(v.titulo)}</span>
          <span class="elemento-lista-subtitulo">${escaparHtml(v.empresa)} · ${escaparHtml(v.departamento)} · ${v.experiencia} años</span>
        </div>
        <div class="elemento-lista-acciones">
          <button class="boton-mini peligro" title="Eliminar vacante" data-accion="eliminar-vacante" data-id="${v.id}" type="button">🗑️</button>
        </div>
      </li>
    `
    )
    .join("");
}

/**
 * Elimina una vacante del estado en memoria, previa confirmación.
 */
function eliminarVacante(id) {
  const vacante = estadoApp.vacantes.find((v) => v.id === id);
  if (!vacante) return;

  abrirConfirmacion(`¿Eliminar la vacante "${vacante.titulo}"? Esta acción no se puede deshacer.`, () => {
    estadoApp.vacantes = estadoApp.vacantes.filter((v) => v.id !== id);
    renderizarListaVacantes(document.getElementById("buscador-vacantes").value);
    actualizarSelectoresComparacion();
    mostrarNotificacion("Vacante eliminada.", "exito");
  });
}

/* ------------------------------------------------------------
   EVENTOS PROPIOS DEL MÓDULO DE VACANTES
------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("formulario-vacante").addEventListener("submit", crearVacante);

  document.getElementById("buscador-vacantes").addEventListener("input", (evento) => {
    renderizarListaVacantes(evento.target.value);
  });

  // Delegación de eventos para los botones "eliminar" generados dinámicamente.
  document.getElementById("lista-vacantes").addEventListener("click", (evento) => {
    const boton = evento.target.closest('[data-accion="eliminar-vacante"]');
    if (boton) eliminarVacante(boton.dataset.id);
  });
});


/* ============================================================
   CANDIDATOS.JS
   Gestión de CVs: alta (archivo TXT leído en el navegador, o
   texto pegado manualmente), listado, búsqueda y eliminación.
   Los CVs viven en memoria (estadoApp.candidatos).

   Nota sobre PDF/DOCX: sin librerías externas el navegador no
   puede extraer texto de esos formatos de forma confiable, por
   eso el archivo se adjunta como referencia (nombre guardado)
   y se pide al reclutador pegar el contenido de texto real en
   el campo correspondiente para que la IA pueda analizarlo.
============================================================ */

/**
 * Maneja el envío del formulario de "Nuevo candidato".
 * Si se adjuntó un archivo .txt, intenta leer su contenido
 * automáticamente; de lo contrario usa el texto pegado manualmente.
 */
function guardarCV(evento) {
  evento.preventDefault();
  const formulario = evento.target;

  const nombre = formulario.nombre.value.trim();
  const textoPegado = formulario.texto.value.trim();
  const archivo = formulario.archivo.files[0];

  limpiarErroresCandidato(formulario);

  if (!nombre) {
    marcarErrorCandidato("cv-nombre", "El nombre del candidato es obligatorio.");
    mostrarNotificacion("Completa el nombre del candidato.", "error");
    return;
  }

  // Si hay archivo .txt y no se pegó texto, lo leemos de forma asíncrona.
  if (archivo && archivo.name.toLowerCase().endsWith(".txt") && !textoPegado) {
    const lector = new FileReader();
    lector.onload = (eventoLectura) => {
      finalizarGuardadoCV(formulario, nombre, eventoLectura.target.result, archivo.name);
    };
    lector.onerror = () => {
      mostrarNotificacion("No se pudo leer el archivo. Pega el texto manualmente.", "error");
    };
    lector.readAsText(archivo);
    return;
  }

  if (!textoPegado) {
    marcarErrorCandidato("cv-texto", "Pega el contenido del CV o sube un archivo .txt.");
    mostrarNotificacion("Agrega el texto del CV para poder analizarlo.", "error");
    return;
  }

  finalizarGuardadoCV(formulario, nombre, textoPegado, archivo ? archivo.name : null);
}

/**
 * Crea el objeto candidato definitivo y actualiza la interfaz.
 * Separado de guardarCV() porque la lectura de archivo es asíncrona.
 */
function finalizarGuardadoCV(formulario, nombre, texto, nombreArchivo) {
  const candidato = {
    id: generarId("cv"),
    nombre,
    texto: texto.trim(),
    nombreArchivo: nombreArchivo || null,
    fechaCreacion: new Date().toISOString()
  };

  estadoApp.candidatos.push(candidato);

  formulario.reset();
  renderizarListaCandidatos();
  actualizarSelectoresComparacion();
  actualizarDashboard();
  mostrarNotificacion(`CV de "${candidato.nombre}" guardado correctamente.`, "exito");
}

function marcarErrorCandidato(idCampo, mensaje) {
  const campo = document.getElementById(idCampo)?.closest(".campo");
  const mensajeError = document.querySelector(`[data-error-para="${idCampo}"]`);
  if (campo) campo.classList.add("con-error");
  if (mensajeError) mensajeError.textContent = mensaje;
}

function limpiarErroresCandidato(formulario) {
  formulario.querySelectorAll(".campo.con-error").forEach((campo) => campo.classList.remove("con-error"));
  formulario.querySelectorAll(".mensaje-error").forEach((mensaje) => (mensaje.textContent = ""));
}

/**
 * Vuelve a pintar la lista de CVs almacenados.
 * filtro: texto opcional para búsqueda en tiempo real.
 */
function renderizarListaCandidatos(filtro = "") {
  const lista = document.getElementById("lista-candidatos");
  if (!lista) return;

  const filtroNormalizado = filtro.trim().toLowerCase();
  const candidatosFiltrados = estadoApp.candidatos.filter((c) =>
    c.nombre.toLowerCase().includes(filtroNormalizado)
  );

  if (!candidatosFiltrados.length) {
    lista.innerHTML = estadoApp.candidatos.length
      ? '<li class="texto-vacio">No hay candidatos que coincidan con la búsqueda.</li>'
      : '<li class="texto-vacio">Aún no se han cargado CVs.</li>';
    return;
  }

  lista.innerHTML = candidatosFiltrados
    .slice()
    .reverse()
    .map(
      (c) => `
      <li class="elemento-lista" data-id="${c.id}">
        <div class="elemento-lista-info">
          <span class="elemento-lista-titulo">${escaparHtml(c.nombre)}</span>
          <span class="elemento-lista-subtitulo">${c.nombreArchivo ? "📎 " + escaparHtml(c.nombreArchivo) : "Texto pegado manualmente"} · ${c.texto.length} caracteres</span>
        </div>
        <div class="elemento-lista-acciones">
          <button class="boton-mini peligro" title="Eliminar CV" data-accion="eliminar-candidato" data-id="${c.id}" type="button">🗑️</button>
        </div>
      </li>
    `
    )
    .join("");
}

/**
 * Elimina un candidato del estado en memoria, previa confirmación.
 */
function eliminarCandidato(id) {
  const candidato = estadoApp.candidatos.find((c) => c.id === id);
  if (!candidato) return;

  abrirConfirmacion(`¿Eliminar el CV de "${candidato.nombre}"? Esta acción no se puede deshacer.`, () => {
    estadoApp.candidatos = estadoApp.candidatos.filter((c) => c.id !== id);
    renderizarListaCandidatos(document.getElementById("buscador-candidatos").value);
    actualizarSelectoresComparacion();
    actualizarDashboard();
    mostrarNotificacion("CV eliminado.", "exito");
  });
}

/* ------------------------------------------------------------
   EVENTOS PROPIOS DEL MÓDULO DE CANDIDATOS
------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("formulario-cv").addEventListener("submit", guardarCV);

  document.getElementById("buscador-candidatos").addEventListener("input", (evento) => {
    renderizarListaCandidatos(evento.target.value);
  });

  document.getElementById("lista-candidatos").addEventListener("click", (evento) => {
    const boton = evento.target.closest('[data-accion="eliminar-candidato"]');
    if (boton) eliminarCandidato(boton.dataset.id);
  });

  // Si el usuario adjunta un archivo, avisamos que puede requerir texto pegado.
  document.getElementById("cv-archivo").addEventListener("change", (evento) => {
    const archivo = evento.target.files[0];
    if (archivo && !archivo.name.toLowerCase().endsWith(".txt")) {
      mostrarNotificacion("Para PDF/DOCX, pega también el texto del CV para un análisis preciso.", "advertencia");
    }
  });
});


/* ============================================================
   EVALUADOR.JS
   Motor de análisis que compara un CV contra una vacante y
   genera una recomendación completamente justificada.

   IMPORTANTE (transparencia técnica): dado que el stack permitido
   es solo HTML/CSS/JS sin backend ni librerías externas, este
   motor NO llama a un modelo de lenguaje real: implementa un
   análisis heurístico basado en reglas (coincidencia de palabras
   clave, expresiones regulares y ponderación por categorías) que
   simula el criterio de un analista de RRHH. Todo el cálculo es
   determinístico y explicable, lo cual también facilita justificar
   cada recomendación ante el reclutador.

   Diccionario de soft skills y utilidades de análisis de texto
   están al inicio del archivo; las funciones principales
   (analizarCV, calcularPuntaje, compararVacante, mostrarReporte)
   están más abajo.
============================================================ */

/* ------------------------------------------------------------
   DICCIONARIOS DE APOYO PARA EL ANÁLISIS
------------------------------------------------------------ */
const DICCIONARIO_SOFT_SKILLS = [
  "comunicación", "liderazgo", "trabajo en equipo", "adaptabilidad",
  "proactividad", "resolución de problemas", "pensamiento crítico",
  "gestión del tiempo", "creatividad", "empatía", "negociación",
  "orientación a resultados", "colaboración", "flexibilidad", "iniciativa"
];

const DICCIONARIO_NIVEL_ACADEMICO = {
  "no requerido": 0,
  "bachillerato": 1,
  "técnico": 2,
  "universitario": 3,
  "postgrado": 4
};

const PALABRAS_CLAVE_NIVEL_EN_CV = {
  0: [],
  1: ["bachillerato", "colegio", "secundaria"],
  2: ["técnico", "tecnólogo", "diplomado"],
  3: ["licenciatura", "ingeniería", "universidad", "universitario", "bachiller universitario", "grado"],
  4: ["maestría", "máster", "mba", "postgrado", "posgrado", "doctorado", "especialización"]
};

/* ------------------------------------------------------------
   UTILIDADES DE ANÁLISIS DE TEXTO
------------------------------------------------------------ */

/**
 * Verifica si una palabra/frase clave aparece en el texto del CV,
 * ignorando mayúsculas/acentos básicos.
 */
function textoContiene(textoCompleto, palabraClave) {
  const normalizar = (str) =>
    str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  return normalizar(textoCompleto).includes(normalizar(palabraClave));
}

/**
 * Intenta extraer los años de experiencia mencionados en el CV
 * mediante expresiones regulares comunes en español.
 * Ej: "5 años de experiencia", "3+ años", "experiencia: 4 años"
 */
function extraerAniosExperiencia(texto) {
  const patrones = [
    /(\d{1,2})\s*\+?\s*años? de experiencia/i,
    /experiencia de\s*(\d{1,2})\s*\+?\s*años?/i,
    /(\d{1,2})\s*\+?\s*años? en/i
  ];

  for (const patron of patrones) {
    const coincidencia = texto.match(patron);
    if (coincidencia) return Number(coincidencia[1]);
  }
  return 0;
}

/* ------------------------------------------------------------
   ANÁLISIS PRINCIPAL: analizarCV()
   Compara el texto de un candidato contra los requisitos de
   una vacante y devuelve un objeto con todos los hallazgos.
------------------------------------------------------------ */
function analizarCV(vacante, candidato) {
  const texto = candidato.texto;

  /* --- Experiencia --- */
  const aniosDetectados = extraerAniosExperiencia(texto);
  const experienciaCumplida = aniosDetectados >= vacante.experiencia;
  const puntajeExperiencia = vacante.experiencia === 0
    ? 100
    : Math.min(100, Math.round((aniosDetectados / vacante.experiencia) * 100));

  /* --- Tecnologías / habilidades --- */
  const habilidadesEncontradas = vacante.habilidadesObligatorias.filter((h) => textoContiene(texto, h));
  const habilidadesFaltantes = vacante.habilidadesObligatorias.filter((h) => !textoContiene(texto, h));
  const deseadasEncontradas = vacante.habilidadesDeseadas.filter((h) => textoContiene(texto, h));

  const baseObligatorias = vacante.habilidadesObligatorias.length
    ? (habilidadesEncontradas.length / vacante.habilidadesObligatorias.length) * 100
    : 100;
  const bonoDeseadas = vacante.habilidadesDeseadas.length
    ? (deseadasEncontradas.length / vacante.habilidadesDeseadas.length) * 10
    : 0;
  const puntajeTecnologias = Math.min(100, Math.round(baseObligatorias * 0.9 + bonoDeseadas));

  /* --- Educación --- */
  const nivelRequerido = DICCIONARIO_NIVEL_ACADEMICO[vacante.nivelAcademico.toLowerCase()] ?? 0;
  const palabrasNivel = PALABRAS_CLAVE_NIVEL_EN_CV[nivelRequerido] || [];
  const educacionCumplida = nivelRequerido === 0 || palabrasNivel.some((p) => textoContiene(texto, p));
  // También revisamos si el CV menciona un nivel superior al requerido.
  const nivelMaximoEncontrado = Object.entries(PALABRAS_CLAVE_NIVEL_EN_CV)
    .reverse()
    .find(([, palabras]) => palabras.some((p) => textoContiene(texto, p)));
  const puntajeEducacion = educacionCumplida ? 100 : (nivelMaximoEncontrado ? 60 : 30);

  /* --- Idiomas --- */
  const idiomasEncontrados = vacante.idiomas.filter((idioma) => {
    const nombreIdioma = idioma.split(" ")[0]; // separa "Inglés B2" -> "Inglés"
    return textoContiene(texto, nombreIdioma);
  });
  const idiomasFaltantes = vacante.idiomas.filter((idioma) => !idiomasEncontrados.includes(idioma));
  const puntajeIdiomas = vacante.idiomas.length
    ? Math.round((idiomasEncontrados.length / vacante.idiomas.length) * 100)
    : 100;

  /* --- Soft skills --- */
  const softSkillsEncontradas = DICCIONARIO_SOFT_SKILLS.filter((skill) => textoContiene(texto, skill));
  const puntajeSoftSkills = Math.min(100, Math.round((softSkillsEncontradas.length / 4) * 100));

  const puntajes = {
    experiencia: puntajeExperiencia,
    tecnologias: puntajeTecnologias,
    educacion: puntajeEducacion,
    idiomas: puntajeIdiomas,
    softSkills: puntajeSoftSkills
  };

  const compatibilidad = calcularPuntaje(puntajes);

  return {
    vacante,
    candidato,
    aniosDetectados,
    experienciaCumplida,
    habilidadesEncontradas,
    habilidadesFaltantes,
    deseadasEncontradas,
    educacionCumplida,
    idiomasEncontrados,
    idiomasFaltantes,
    softSkillsEncontradas,
    puntajes,
    compatibilidad,
    ...generarConclusiones(puntajes, compatibilidad, {
      habilidadesFaltantes,
      idiomasFaltantes,
      experienciaCumplida,
      educacionCumplida
    })
  };
}

/**
 * Calcula el puntaje total ponderado según los pesos definidos
 * en el requerimiento:
 *   Experiencia 30% · Tecnologías 30% · Educación 15%
 *   Idiomas 10% · Soft Skills 15%
 */
function calcularPuntaje(puntajes) {
  const total =
    puntajes.experiencia * 0.30 +
    puntajes.tecnologias * 0.30 +
    puntajes.educacion * 0.15 +
    puntajes.idiomas * 0.10 +
    puntajes.softSkills * 0.15;

  return Math.round(total);
}

/**
 * A partir de los puntajes por categoría, deriva fortalezas,
 * debilidades, riesgos, recomendación final, calificación 1-10
 * y un párrafo de justificación completa.
 */
function generarConclusiones(puntajes, compatibilidad, contexto) {
  const fortalezas = [];
  const debilidades = [];
  const riesgos = [];

  if (puntajes.experiencia >= 80) fortalezas.push("Cumple o supera los años de experiencia solicitados.");
  else if (puntajes.experiencia < 50) debilidades.push("La experiencia detectada está por debajo de lo requerido.");

  if (puntajes.tecnologias >= 80) fortalezas.push("Domina la mayoría de las tecnologías obligatorias del puesto.");
  else if (puntajes.tecnologias < 50) debilidades.push("Le faltan varias tecnologías clave solicitadas en la vacante.");

  if (puntajes.educacion >= 80) fortalezas.push("Cumple con el nivel académico requerido.");
  else if (puntajes.educacion < 50) debilidades.push("El nivel académico detectado no cumple lo solicitado.");

  if (puntajes.idiomas >= 80) fortalezas.push("Cumple con los idiomas requeridos para el puesto.");
  else if (puntajes.idiomas < 50) debilidades.push("No se detectó dominio de uno o más idiomas requeridos.");

  if (puntajes.softSkills >= 60) fortalezas.push("El CV evidencia varias habilidades blandas relevantes.");
  else debilidades.push("El CV menciona pocas o ninguna habilidad blanda de forma explícita.");

  if (contexto.habilidadesFaltantes.length > 0) {
    riesgos.push(`Podría requerir capacitación en: ${contexto.habilidadesFaltantes.join(", ")}.`);
  }
  if (!contexto.experienciaCumplida) {
    riesgos.push("La curva de aprendizaje podría ser mayor a la esperada por la brecha de experiencia.");
  }
  if (contexto.idiomasFaltantes.length > 0) {
    riesgos.push(`La comunicación podría verse limitada por el idioma: ${contexto.idiomasFaltantes.join(", ")}.`);
  }

  if (fortalezas.length === 0) fortalezas.push("No se identificaron fortalezas destacadas frente a los requisitos.");
  if (debilidades.length === 0) debilidades.push("No se identificaron debilidades relevantes frente a los requisitos.");
  if (riesgos.length === 0) riesgos.push("No se identifican riesgos significativos para la contratación.");

  let recomendacion;
  if (compatibilidad >= 75) recomendacion = "contratar";
  else if (compatibilidad >= 50) recomendacion = "entrevistar";
  else recomendacion = "no-recomendado";

  const calificacion = Math.max(1, Math.min(10, Math.round(compatibilidad / 10)));

  const justificacion = construirJustificacion(compatibilidad, recomendacion, puntajes, contexto);

  return { fortalezas, debilidades, riesgos, recomendacion, calificacion, justificacion };
}

/**
 * Redacta el párrafo de justificación completa que explica,
 * en lenguaje natural, por qué se llegó a la recomendación final.
 */
function construirJustificacion(compatibilidad, recomendacion, puntajes, contexto) {
  const fraseRecomendacion = {
    contratar: "se recomienda avanzar con una oferta de contratación",
    entrevistar: "se recomienda continuar con una entrevista para profundizar en los puntos pendientes",
    "no-recomendado": "no se recomienda continuar con el proceso en esta vacante"
  }[recomendacion];

  return (
    `El candidato obtuvo una compatibilidad global del ${compatibilidad}% respecto a los requisitos de la vacante. ` +
    `Los puntajes por categoría fueron: experiencia ${puntajes.experiencia}%, tecnologías ${puntajes.tecnologias}%, ` +
    `educación ${puntajes.educacion}%, idiomas ${puntajes.idiomas}% y habilidades blandas ${puntajes.softSkills}%. ` +
    `${contexto.habilidadesFaltantes.length ? "Se detectaron brechas técnicas en: " + contexto.habilidadesFaltantes.join(", ") + ". " : ""}` +
    `Con base en este análisis, ${fraseRecomendacion}.`
  );
}

/* ------------------------------------------------------------
   FLUJO DE COMPARACIÓN (botón "Evaluar candidato")
------------------------------------------------------------ */

/**
 * Función disparada por el botón "Evaluar candidato". Obtiene la
 * vacante y candidato seleccionados, simula el progreso del
 * análisis con una barra visual y finalmente muestra el reporte.
 */
function compararVacante() {
  const idVacante = document.getElementById("seleccion-vacante").value;
  const idCandidato = document.getElementById("seleccion-candidato").value;

  const vacante = estadoApp.vacantes.find((v) => v.id === idVacante);
  const candidato = estadoApp.candidatos.find((c) => c.id === idCandidato);

  if (!vacante || !candidato) {
    mostrarNotificacion("Selecciona una vacante y un candidato válidos.", "error");
    return;
  }

  const botonEvaluar = document.getElementById("boton-evaluar");
  botonEvaluar.disabled = true;

  mostrarProgreso(`Analizando a ${candidato.nombre} contra "${vacante.titulo}"…`);

  // Simulación de progreso por etapas para reforzar la sensación
  // de un análisis real (extracción, comparación, cálculo final).
  const etapas = [20, 45, 70, 90, 100];
  let paso = 0;

  const intervalo = setInterval(() => {
    actualizarProgreso(etapas[paso]);
    paso += 1;

    if (paso >= etapas.length) {
      clearInterval(intervalo);
      setTimeout(() => {
        const resultado = analizarCV(vacante, candidato);
        mostrarReporte(resultado);
        guardarHistorial(resultado);
        ocultarProgreso();
        botonEvaluar.disabled = false;
        mostrarNotificacion("Evaluación completada.", "exito");
      }, 250);
    }
  }, 350);
}

/**
 * Renderiza el reporte de resultado completo dentro de
 * #contenedor-resultado, incluyendo semáforo, anillo de
 * compatibilidad, tabla de puntaje y todos los bloques pedidos.
 */
function mostrarReporte(resultado) {
  const contenedor = document.getElementById("contenedor-resultado");
  if (!contenedor) return;

  contenedor.classList.remove("oculto");
  contenedor.innerHTML = construirHtmlReporte(resultado);

  // Conecta el botón de impresión del reporte recién insertado.
  const botonImprimir = contenedor.querySelector('[data-accion="imprimir-reporte"]');
  if (botonImprimir) {
    botonImprimir.addEventListener("click", () => imprimirReporte(resultado));
  }
}

/**
 * Construye el marcado HTML del reporte a partir del resultado
 * del análisis. Reutilizado tanto para pantalla como para impresión.
 */
function construirHtmlReporte(resultado) {
  const { vacante, candidato, puntajes, compatibilidad, recomendacion, calificacion, justificacion } = resultado;

  const chipsEncontradas = resultado.habilidadesEncontradas
    .map((h) => `<span class="chip chip-encontrada">✔ ${escaparHtml(h)}</span>`)
    .join("");
  const chipsFaltantes = resultado.habilidadesFaltantes
    .map((h) => `<span class="chip chip-faltante">✘ ${escaparHtml(h)}</span>`)
    .join("");
  const chipsDeseadas = resultado.deseadasEncontradas
    .map((h) => `<span class="chip chip-encontrada">✔ ${escaparHtml(h)}</span>`)
    .join("");
  const chipsIdiomasOk = resultado.idiomasEncontrados
    .map((i) => `<span class="chip chip-encontrada">✔ ${escaparHtml(i)}</span>`)
    .join("");
  const chipsIdiomasFaltan = resultado.idiomasFaltantes
    .map((i) => `<span class="chip chip-faltante">✘ ${escaparHtml(i)}</span>`)
    .join("");

  return `
    <div class="tarjeta-resultado">
      <div class="resultado-encabezado">
        <div class="resultado-candidato">
          <h2>${escaparHtml(candidato.nombre)}</h2>
          <p>Vacante: ${escaparHtml(vacante.titulo)} · ${escaparHtml(vacante.empresa)}</p>
        </div>
        <div class="resultado-compatibilidad">
          <div class="anillo-compatibilidad" style="--porcentaje:${compatibilidad}">
            <span>${compatibilidad}%</span>
          </div>
          <span class="etiqueta-semaforo ${recomendacion}">${textoRecomendacion(recomendacion)}</span>
        </div>
      </div>

      <div class="resultado-cuerpo">
        <div class="resultado-bloque">
          <h3>📈 Puntaje por categoría</h3>
          <table class="tabla-puntaje">
            <tbody>
              <tr><td>Experiencia (30%)</td><td>${puntajes.experiencia}%</td></tr>
              <tr><td>Tecnologías (30%)</td><td>${puntajes.tecnologias}%</td></tr>
              <tr><td>Educación (15%)</td><td>${puntajes.educacion}%</td></tr>
              <tr><td>Idiomas (10%)</td><td>${puntajes.idiomas}%</td></tr>
              <tr><td>Soft skills (15%)</td><td>${puntajes.softSkills}%</td></tr>
            </tbody>
          </table>
        </div>

        <div class="resultado-bloque">
          <h3>💼 Experiencia encontrada</h3>
          <p>${resultado.aniosDetectados > 0 ? `${resultado.aniosDetectados} años detectados` : "No se detectaron años de experiencia explícitos en el texto."} (requerido: ${vacante.experiencia} años).</p>
        </div>

        <div class="resultado-bloque">
          <h3>🛠️ Habilidades obligatorias</h3>
          <div class="chips">${chipsEncontradas || '<span class="chip">Sin coincidencias</span>'}${chipsFaltantes}</div>
        </div>

        ${vacante.habilidadesDeseadas.length ? `
        <div class="resultado-bloque">
          <h3>✨ Habilidades deseadas encontradas</h3>
          <div class="chips">${chipsDeseadas || '<span class="chip">Ninguna detectada</span>'}</div>
        </div>` : ""}

        <div class="resultado-bloque">
          <h3>🎓 Educación</h3>
          <p>Nivel requerido: ${escaparHtml(vacante.nivelAcademico)}. ${resultado.educacionCumplida ? "El CV evidencia un nivel académico acorde o superior." : "No se encontró evidencia clara del nivel académico requerido."}</p>
        </div>

        <div class="resultado-bloque">
          <h3>🌐 Idiomas</h3>
          <div class="chips">${chipsIdiomasOk || ""}${chipsIdiomasFaltan || ""}${!vacante.idiomas.length ? '<span class="chip">No se requerían idiomas específicos</span>' : ""}</div>
        </div>

        <div class="resultado-bloque">
          <h3>🤝 Habilidades blandas detectadas</h3>
          <div class="chips">${resultado.softSkillsEncontradas.map((s) => `<span class="chip chip-encontrada">${escaparHtml(s)}</span>`).join("") || '<span class="chip">No se detectaron explícitamente</span>'}</div>
        </div>

        <div class="resultado-bloque">
          <h3>💪 Fortalezas</h3>
          <ul>${resultado.fortalezas.map((f) => `<li>${escaparHtml(f)}</li>`).join("")}</ul>
        </div>

        <div class="resultado-bloque">
          <h3>⚠️ Debilidades</h3>
          <ul>${resultado.debilidades.map((d) => `<li>${escaparHtml(d)}</li>`).join("")}</ul>
        </div>

        <div class="resultado-bloque">
          <h3>🚧 Riesgos</h3>
          <ul>${resultado.riesgos.map((r) => `<li>${escaparHtml(r)}</li>`).join("")}</ul>
        </div>

        <div class="resultado-bloque" style="grid-column: 1 / -1;">
          <h3>📝 Justificación completa</h3>
          <p>${escaparHtml(justificacion)}</p>
        </div>
      </div>

      <div class="resultado-pie">
        <span class="calificacion-final">⭐ Calificación: ${calificacion}/10</span>
        <button class="boton boton-secundario" type="button" data-accion="imprimir-reporte">
          <span aria-hidden="true">🖨️</span> Generar reporte imprimible
        </button>
      </div>
    </div>
  `;
}

/**
 * Prepara la plantilla oculta de impresión con el contenido del
 * reporte (incluyendo cabecera con logo y fecha) y lanza el
 * diálogo de impresión del navegador.
 */
function imprimirReporte(resultado) {
  const plantilla = document.getElementById("plantilla-reporte");
  if (!plantilla) return;

  plantilla.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:2px solid #1d4e89; padding-bottom:12px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:1.6rem;">🧭</span>
        <strong style="font-size:1.2rem;">TalentIA · Reporte de evaluación</strong>
      </div>
      <span>${escaparHtml(new Date().toLocaleString("es-CR"))}</span>
    </div>
    <p><strong>Vacante:</strong> ${escaparHtml(resultado.vacante.titulo)} — ${escaparHtml(resultado.vacante.empresa)}</p>
    <p><strong>Candidato:</strong> ${escaparHtml(resultado.candidato.nombre)}</p>
    ${construirHtmlReporte(resultado)}
  `;

  plantilla.classList.add("imprimiendo");
  window.print();

  // Restaura el estado oculto después de imprimir (o cancelar).
  const limpiar = () => {
    plantilla.classList.remove("imprimiendo");
    window.removeEventListener("afterprint", limpiar);
  };
  window.addEventListener("afterprint", limpiar);
}


/* ============================================================
   HISTORIAL.JS
   Persistencia de evaluaciones en LocalStorage y gestión de la
   vista "Historial": búsqueda, filtro por resultado, orden,
   edición y eliminación.
============================================================ */

const CLAVE_LOCALSTORAGE_HISTORIAL = "rrhh_historial";

/**
 * Lee el historial completo desde LocalStorage.
 * Devuelve un arreglo vacío si no hay datos o si están corruptos.
 */
function obtenerHistorial() {
  try {
    const datos = localStorage.getItem(CLAVE_LOCALSTORAGE_HISTORIAL);
    return datos ? JSON.parse(datos) : [];
  } catch (error) {
    console.error("No se pudo leer el historial de LocalStorage:", error);
    return [];
  }
}

/**
 * Sobrescribe el historial completo en LocalStorage.
 */
function guardarHistorialCompleto(historial) {
  localStorage.setItem(CLAVE_LOCALSTORAGE_HISTORIAL, JSON.stringify(historial));
}

/**
 * Agrega una nueva evaluación (resultado de analizarCV) al
 * historial persistente y refresca las vistas dependientes.
 */
function guardarHistorial(resultado) {
  const historial = obtenerHistorial();

  const entrada = {
    id: generarId("eval"),
    candidatoId: resultado.candidato.id,
    candidatoNombre: resultado.candidato.nombre,
    vacanteId: resultado.vacante.id,
    vacanteTitulo: resultado.vacante.titulo,
    fecha: new Date().toISOString(),
    compatibilidad: resultado.compatibilidad,
    puntajes: resultado.puntajes,
    habilidadesEncontradas: resultado.habilidadesEncontradas,
    habilidadesFaltantes: resultado.habilidadesFaltantes,
    recomendacion: resultado.recomendacion,
    calificacion: resultado.calificacion,
    justificacion: resultado.justificacion,
    notas: ""
  };

  historial.push(entrada);
  guardarHistorialCompleto(historial);

  renderizarHistorial();
  actualizarDashboard();
}

/**
 * Vuelve a pintar la tabla de historial aplicando el término de
 * búsqueda actual, el filtro por resultado y el orden seleccionado.
 */
function renderizarHistorial() {
  const cuerpoTabla = document.getElementById("cuerpo-tabla-historial");
  if (!cuerpoTabla) return;

  const textoBusqueda = (document.getElementById("buscador-historial")?.value || "").toLowerCase();
  const filtroResultado = document.getElementById("filtro-resultado")?.value || "todos";
  const orden = document.getElementById("orden-historial")?.value || "fecha-desc";

  let historial = obtenerHistorial();

  if (textoBusqueda) {
    historial = historial.filter(
      (e) =>
        e.candidatoNombre.toLowerCase().includes(textoBusqueda) ||
        e.vacanteTitulo.toLowerCase().includes(textoBusqueda)
    );
  }

  if (filtroResultado !== "todos") {
    historial = historial.filter((e) => e.recomendacion === filtroResultado);
  }

  historial = ordenarHistorial(historial, orden);

  if (!historial.length) {
    cuerpoTabla.innerHTML = '<tr><td colspan="6" class="texto-vacio">No hay evaluaciones que coincidan con los filtros.</td></tr>';
    return;
  }

  cuerpoTabla.innerHTML = historial
    .map(
      (e) => `
      <tr data-id="${e.id}">
        <td>${escaparHtml(e.candidatoNombre)}</td>
        <td>${escaparHtml(e.vacanteTitulo)}</td>
        <td>${formatearFecha(e.fecha)}</td>
        <td>${e.compatibilidad}%</td>
        <td><span class="pastilla-resultado ${e.recomendacion}">${textoRecomendacion(e.recomendacion)}</span></td>
        <td>
          <div class="elemento-lista-acciones">
            <button class="boton-mini" title="Editar evaluación" data-accion="editar-evaluacion" data-id="${e.id}" type="button">✏️</button>
            <button class="boton-mini peligro" title="Eliminar evaluación" data-accion="eliminar-evaluacion" data-id="${e.id}" type="button">🗑️</button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

function ordenarHistorial(historial, criterio) {
  const copia = [...historial];
  switch (criterio) {
    case "fecha-asc":
      return copia.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    case "puntaje-desc":
      return copia.sort((a, b) => b.compatibilidad - a.compatibilidad);
    case "puntaje-asc":
      return copia.sort((a, b) => a.compatibilidad - b.compatibilidad);
    case "fecha-desc":
    default:
      return copia.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }
}

/**
 * Filtra el historial según el texto ingresado en el buscador.
 * Es un envoltorio semántico sobre renderizarHistorial() para
 * cumplir con el nombre de función solicitado en el requerimiento.
 */
function buscarEvaluaciones() {
  renderizarHistorial();
}

/**
 * Elimina una evaluación del historial, previa confirmación.
 */
function eliminarEvaluacion(id) {
  const historial = obtenerHistorial();
  const evaluacion = historial.find((e) => e.id === id);
  if (!evaluacion) return;

  abrirConfirmacion(
    `¿Eliminar la evaluación de "${evaluacion.candidatoNombre}" para "${evaluacion.vacanteTitulo}"?`,
    () => {
      const historialActualizado = historial.filter((e) => e.id !== id);
      guardarHistorialCompleto(historialActualizado);
      renderizarHistorial();
      actualizarDashboard();
      mostrarNotificacion("Evaluación eliminada del historial.", "exito");
    }
  );
}

// Guarda temporalmente el id de la evaluación que se está editando.
let idEvaluacionEnEdicion = null;

/**
 * Abre el modal de edición precargado con los datos de la
 * evaluación seleccionada (calificación, recomendación y notas).
 */
function editarEvaluacion(id) {
  const historial = obtenerHistorial();
  const evaluacion = historial.find((e) => e.id === id);
  if (!evaluacion) return;

  idEvaluacionEnEdicion = id;

  document.getElementById("edicion-calificacion").value = evaluacion.calificacion;
  document.getElementById("edicion-recomendacion").value = evaluacion.recomendacion;
  document.getElementById("edicion-notas").value = evaluacion.notas || "";

  document.getElementById("modal-edicion").classList.remove("oculto");
}

/**
 * Guarda los cambios realizados en el modal de edición sobre la
 * evaluación correspondiente en LocalStorage.
 */
function guardarEdicionEvaluacion(evento) {
  evento.preventDefault();
  if (!idEvaluacionEnEdicion) return;

  const historial = obtenerHistorial();
  const indice = historial.findIndex((e) => e.id === idEvaluacionEnEdicion);
  if (indice === -1) return;

  historial[indice].calificacion = Number(document.getElementById("edicion-calificacion").value);
  historial[indice].recomendacion = document.getElementById("edicion-recomendacion").value;
  historial[indice].notas = document.getElementById("edicion-notas").value.trim();

  guardarHistorialCompleto(historial);
  renderizarHistorial();
  actualizarDashboard();
  cerrarModales();
  idEvaluacionEnEdicion = null;
  mostrarNotificacion("Evaluación actualizada correctamente.", "exito");
}

/* ------------------------------------------------------------
   EVENTOS PROPIOS DEL MÓDULO DE HISTORIAL
------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("buscador-historial").addEventListener("input", buscarEvaluaciones);
  document.getElementById("filtro-resultado").addEventListener("change", renderizarHistorial);
  document.getElementById("orden-historial").addEventListener("change", renderizarHistorial);

  document.getElementById("cuerpo-tabla-historial").addEventListener("click", (evento) => {
    const botonEditar = evento.target.closest('[data-accion="editar-evaluacion"]');
    const botonEliminar = evento.target.closest('[data-accion="eliminar-evaluacion"]');
    if (botonEditar) editarEvaluacion(botonEditar.dataset.id);
    if (botonEliminar) eliminarEvaluacion(botonEliminar.dataset.id);
  });

  document.getElementById("formulario-edicion-evaluacion").addEventListener("submit", guardarEdicionEvaluacion);
});


/* ============================================================
   APP.JS
   Orquestador principal de TalentIA.
   Contiene:
     - Estado global de la aplicación (vacantes y CVs en memoria).
     - Utilidades compartidas (ids, fechas, listas, notificaciones, modales).
     - Navegación entre vistas.
     - Modo oscuro.
     - Arranque (inicializarApp) que conecta todos los módulos.
   Este archivo se carga AL FINAL en index.html a propósito: los demás
   módulos (dashboard.js, vacantes.js, candidatos.js, evaluador.js,
   historial.js) solo declaran funciones; esas funciones se EJECUTAN
   más tarde, disparadas por eventos, momento en el cual este archivo
   ya se ha cargado y el estado global ya existe.
============================================================ */

/* ------------------------------------------------------------
   ESTADO GLOBAL EN MEMORIA
   - Las vacantes y los CVs viven solo en memoria (variables JS),
     tal como pide el requerimiento ("cada CV debe almacenarse en
     memoria"). Al recargar la página se pierden.
   - El historial de evaluaciones sí persiste en LocalStorage
     (ver historial.js).
------------------------------------------------------------ */
const estadoApp = {
  vacantes: [],
  candidatos: [],
  vistaActual: "dashboard"
};

/* ------------------------------------------------------------
   UTILIDADES GENERALES
------------------------------------------------------------ */

/**
 * Genera un identificador único simple basado en tiempo + azar.
 * Suficiente para uso en memoria/LocalStorage sin librerías externas.
 */
function generarId(prefijo) {
  return `${prefijo}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/**
 * Convierte un texto separado por comas en un arreglo limpio,
 * sin espacios sobrantes ni elementos vacíos.
 * Ej: "JavaScript, CSS,  HTML" -> ["JavaScript", "CSS", "HTML"]
 */
function dividirLista(texto) {
  if (!texto) return [];
  return texto
    .split(",")
    .map((elemento) => elemento.trim())
    .filter((elemento) => elemento.length > 0);
}

/**
 * Formatea una fecha ISO a un formato legible en español (es-CR).
 */
function formatearFecha(fechaISO) {
  const fecha = new Date(fechaISO);
  return fecha.toLocaleDateString("es-CR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Escapa HTML básico para evitar que el texto de un CV o vacante
 * rompa el marcado al insertarse con innerHTML.
 */
function escaparHtml(texto) {
  if (texto === undefined || texto === null) return "";
  const div = document.createElement("div");
  div.textContent = String(texto);
  return div.innerHTML;
}

/* ------------------------------------------------------------
   NOTIFICACIONES (toasts)
------------------------------------------------------------ */

/**
 * Muestra una notificación flotante temporal.
 * tipo: "exito" | "error" | "advertencia" | "info"
 */
function mostrarNotificacion(mensaje, tipo = "info") {
  const contenedor = document.getElementById("contenedor-notificaciones");
  if (!contenedor) return;

  const iconos = {
    exito: "✅",
    error: "⛔",
    advertencia: "⚠️",
    info: "ℹ️"
  };

  const notificacion = document.createElement("div");
  notificacion.className = `notificacion ${tipo}`;
  notificacion.innerHTML = `
    <span aria-hidden="true">${iconos[tipo] || iconos.info}</span>
    <span>${escaparHtml(mensaje)}</span>
  `;

  contenedor.appendChild(notificacion);

  // La animación CSS "desvanecer" dura 400ms e inicia a los 2.6s.
  // Eliminamos el nodo del DOM una vez terminó de desvanecerse.
  setTimeout(() => {
    notificacion.remove();
  }, 3100);
}

/* ------------------------------------------------------------
   MODAL DE CONFIRMACIÓN (reutilizable para cualquier eliminación)
------------------------------------------------------------ */

// Guarda temporalmente la acción a ejecutar si el usuario confirma.
let accionConfirmacionPendiente = null;

/**
 * Abre el modal de confirmación con un mensaje personalizado.
 * alConfirmar: función que se ejecuta solo si el usuario acepta.
 */
function abrirConfirmacion(mensaje, alConfirmar) {
  const modal = document.getElementById("modal-confirmacion");
  const mensajeEl = document.getElementById("modal-confirmacion-mensaje");
  if (!modal || !mensajeEl) return;

  mensajeEl.textContent = mensaje;
  accionConfirmacionPendiente = alConfirmar;
  modal.classList.remove("oculto");
}

function cerrarModales() {
  document.querySelectorAll(".fondo-modal").forEach((modal) => {
    modal.classList.add("oculto");
  });
  accionConfirmacionPendiente = null;
}

/* ------------------------------------------------------------
   NAVEGACIÓN ENTRE VISTAS
------------------------------------------------------------ */

function cambiarVista(nombreVista) {
  // Oculta todas las vistas y desmarca todos los botones de nav.
  document.querySelectorAll(".vista").forEach((vista) => {
    vista.classList.remove("activa");
  });
  document.querySelectorAll(".nav-boton").forEach((boton) => {
    boton.classList.remove("activo");
  });

  const vista = document.getElementById(`vista-${nombreVista}`);
  const boton = document.querySelector(`.nav-boton[data-vista="${nombreVista}"]`);

  if (vista) vista.classList.add("activa");
  if (boton) boton.classList.add("activo");

  estadoApp.vistaActual = nombreVista;

  // Refresca datos relevantes al entrar a cada vista.
  if (nombreVista === "dashboard") actualizarDashboard();
  if (nombreVista === "historial") renderizarHistorial();
  if (nombreVista === "comparacion") actualizarSelectoresComparacion();
}

/* ------------------------------------------------------------
   SELECTORES DE LA VISTA "COMPARACIÓN IA"
   Se repueblan cada vez que cambian las vacantes o los candidatos.
------------------------------------------------------------ */
function actualizarSelectoresComparacion() {
  const selectVacante = document.getElementById("seleccion-vacante");
  const selectCandidato = document.getElementById("seleccion-candidato");
  const botonEvaluar = document.getElementById("boton-evaluar");
  if (!selectVacante || !selectCandidato || !botonEvaluar) return;

  const vacanteSeleccionada = selectVacante.value;
  const candidatoSeleccionado = selectCandidato.value;

  selectVacante.innerHTML = '<option value="">Selecciona una vacante</option>' +
    estadoApp.vacantes
      .map((v) => `<option value="${v.id}">${escaparHtml(v.titulo)} · ${escaparHtml(v.empresa)}</option>`)
      .join("");

  selectCandidato.innerHTML = '<option value="">Selecciona un candidato</option>' +
    estadoApp.candidatos
      .map((c) => `<option value="${c.id}">${escaparHtml(c.nombre)}</option>`)
      .join("");

  // Intenta restaurar la selección previa si el elemento sigue existiendo.
  if (estadoApp.vacantes.some((v) => v.id === vacanteSeleccionada)) {
    selectVacante.value = vacanteSeleccionada;
  }
  if (estadoApp.candidatos.some((c) => c.id === candidatoSeleccionado)) {
    selectCandidato.value = candidatoSeleccionado;
  }

  botonEvaluar.disabled = !(selectVacante.value && selectCandidato.value);
}

/* ------------------------------------------------------------
   BARRA DE PROGRESO GLOBAL (usada durante el análisis IA)
------------------------------------------------------------ */
function mostrarProgreso(texto) {
  const barra = document.getElementById("barra-progreso-global");
  const relleno = document.getElementById("barra-progreso-relleno");
  const textoEl = document.getElementById("barra-progreso-texto");
  if (!barra || !relleno || !textoEl) return;

  barra.classList.remove("oculto");
  barra.setAttribute("aria-hidden", "false");
  textoEl.textContent = texto || "Analizando candidato…";
  relleno.style.width = "0%";
}

function actualizarProgreso(porcentaje) {
  const relleno = document.getElementById("barra-progreso-relleno");
  if (relleno) relleno.style.width = `${porcentaje}%`;
}

function ocultarProgreso() {
  const barra = document.getElementById("barra-progreso-global");
  if (!barra) return;
  barra.classList.add("oculto");
  barra.setAttribute("aria-hidden", "true");
}

/* ------------------------------------------------------------
   MODO OSCURO
------------------------------------------------------------ */
function alternarModoOscuro() {
  const body = document.body;
  const boton = document.getElementById("boton-modo-oscuro");
  const esOscuro = body.getAttribute("data-theme") === "oscuro";

  body.setAttribute("data-theme", esOscuro ? "claro" : "oscuro");
  boton.setAttribute("aria-pressed", String(!esOscuro));
  boton.innerHTML = esOscuro
    ? '<span aria-hidden="true">🌙</span>'
    : '<span aria-hidden="true">☀️</span>';

  localStorage.setItem("rrhh_tema", esOscuro ? "claro" : "oscuro");
}

function cargarTemaGuardado() {
  const temaGuardado = localStorage.getItem("rrhh_tema");
  if (temaGuardado === "oscuro") {
    document.body.setAttribute("data-theme", "oscuro");
    const boton = document.getElementById("boton-modo-oscuro");
    if (boton) {
      boton.setAttribute("aria-pressed", "true");
      boton.innerHTML = '<span aria-hidden="true">☀️</span>';
    }
  }
}

/* ------------------------------------------------------------
   INICIALIZACIÓN DE LA APLICACIÓN
------------------------------------------------------------ */
function inicializarApp() {
  // Tema guardado.
  cargarTemaGuardado();
  document.getElementById("boton-modo-oscuro")
    .addEventListener("click", alternarModoOscuro);

  // Navegación.
  document.querySelectorAll(".nav-boton").forEach((boton) => {
    boton.addEventListener("click", () => cambiarVista(boton.dataset.vista));
  });

  // Modal de confirmación genérico.
  document.getElementById("modal-confirmacion-cancelar")
    .addEventListener("click", cerrarModales);
  document.getElementById("modal-confirmacion-aceptar")
    .addEventListener("click", () => {
      if (typeof accionConfirmacionPendiente === "function") {
        accionConfirmacionPendiente();
      }
      cerrarModales();
    });

  // Cierra modales al hacer clic en el fondo oscuro.
  document.querySelectorAll(".fondo-modal").forEach((fondo) => {
    fondo.addEventListener("click", (evento) => {
      if (evento.target === fondo) cerrarModales();
    });
  });

  // Modal de edición.
  document.getElementById("modal-edicion-cancelar")
    .addEventListener("click", cerrarModales);

  // Selectores de la vista de comparación.
  document.getElementById("seleccion-vacante")
    .addEventListener("change", actualizarSelectoresComparacion);
  document.getElementById("seleccion-candidato")
    .addEventListener("change", actualizarSelectoresComparacion);
  document.getElementById("boton-evaluar")
    .addEventListener("click", compararVacante);

  // Estado inicial de las vistas dependientes de datos.
  actualizarDashboard();
  renderizarListaVacantes();
  renderizarListaCandidatos();
  renderizarHistorial();
  actualizarSelectoresComparacion();
}

document.addEventListener("DOMContentLoaded", inicializarApp);