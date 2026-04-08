// ==================== IMPORTACIONES ====================
const axios = require('axios');

// ==================== CONFIGURACION ====================
const TIMEOUT_MS = 15000;
const LIMITE_RESULTADOS = 5;           // 5 libros por página para experiencia móvil
const MIN_CARACTERES_CONSULTA = 3;     // Evita consultas costosas

console.log('📚 Módulo openLibrary.js cargado (VERSIÓN LIMPIA - PAGINACIÓN 5 en 5)');
console.log(`   ⏱️ Timeout: ${TIMEOUT_MS}ms`);
console.log(`   📊 Límite por página: ${LIMITE_RESULTADOS} resultados`);

// ==================== FUNCIONES AUXILIARES INTERNAS ====================

/**
 * Valida que la consulta no sea vacía ni demasiado corta
 * @param {string} consulta - Texto a validar
 * @param {string} tipo - 'autor' o 'título' (para logs)
 * @returns {Object} { valida, razon, consultaLimpia }
 */
function validarConsulta(consulta, tipo) {
    if (!consulta || consulta.trim().length === 0) {
        console.log(`   ⚠️ Consulta vacía para ${tipo}`);
        return { valida: false, razon: 'vacía' };
    }
    
    const trimmed = consulta.trim();
    if (trimmed.length < MIN_CARACTERES_CONSULTA) {
        console.log(`   ⚠️ Consulta demasiado corta (${trimmed.length} < ${MIN_CARACTERES_CONSULTA}) para ${tipo}`);
        return { valida: false, razon: 'demasiado corta', longitud: trimmed.length };
    }
    
    return { valida: true, consultaLimpia: trimmed };
}

/**
 * Normaliza un título para comparación (coincidencia exacta)
 * @param {string} titulo - Título original
 * @returns {string} Título normalizado (minúsculas, sin puntuación, sin artículos)
 */
function normalizarTituloParaComparacion(titulo) {
    if (!titulo) return '';
    
    let normalizado = titulo.toLowerCase();
    
    // Eliminar puntuación (conserva letras, números, espacios)
    normalizado = normalizado.replace(/[^\p{L}\p{N}\s]/gu, '');
    
    // Eliminar artículos iniciales comunes
    const articulos = ['the ', 'a ', 'an ', 'el ', 'la ', 'los ', 'las ', 'un ', 'una '];
    for (const art of articulos) {
        if (normalizado.startsWith(art)) {
            normalizado = normalizado.slice(art.length);
            break;
        }
    }
    
    // Eliminar espacios extras
    normalizado = normalizado.trim().replace(/\s+/g, ' ');
    
    return normalizado;
}

/**
 * Transforma un documento de Open Library al formato unificado que usa el bot
 * @param {Object} item - Documento de Open Library (de response.data.docs)
 * @param {string} queryOriginal - Término de búsqueda original (para autor por defecto)
 * @param {string} tipo - 'autor' o 'titulo'
 * @returns {Object} Libro en formato unificado
 */
function transformarResultado(item, queryOriginal, tipo) {
    // === EXTRACCIÓN ROBUSTA DE KEY Y ENLACE HTML ===
    let key = item.key;
    let enlaceHTML = null;
    
    if (key && key.startsWith('/works/')) {
        const workId = key.replace('/works/', '');
        enlaceHTML = `https://openlibrary.org/works/${workId}`;
    } else if (key && key.startsWith('/books/')) {
        enlaceHTML = `https://openlibrary.org${key}`;
    } else if (key) {
        enlaceHTML = `https://openlibrary.org${key}`;
    }
    
    // === AÑO ===
    let anio = item.first_publish_year || null;
    
    // === IDIOMA ===
    let idiomaLibro = 'desconocido';
    if (item.language) {
        if (Array.isArray(item.language) && item.language.length > 0) {
            const langCode = item.language[0];
            if (langCode === 'spa') idiomaLibro = 'es';
            else if (langCode === 'eng') idiomaLibro = 'en';
            else idiomaLibro = langCode;
        } else if (typeof item.language === 'string') {
            if (item.language === 'spa') idiomaLibro = 'es';
            else if (item.language === 'eng') idiomaLibro = 'en';
            else idiomaLibro = item.language;
        }
    }
    
    // === AUTOR ===
    const autorNombre = item.author_name && item.author_name.length > 0 
        ? item.author_name[0] 
        : (tipo === 'autor' ? queryOriginal : 'Autor desconocido');
    
    // === ENLACE EPUB: Open Library NO ofrece EPUB directo en search.json ===
    const enlaceEPUB = null;
    
    return {
        id: item.key,
        titulo: item.title,
        autor: autorNombre,
        idioma: idiomaLibro,
        anio: anio,
        enlaceHTML: enlaceHTML,
        enlaceEPUB: enlaceEPUB,
        edicionCount: item.edition_count || 0,
        fuente: 'Open Library'
    };
}

// ==================== FUNCIONES PÚBLICAS PRINCIPALES ====================

/**
 * Busca libros por autor en Open Library (versión simple - primeros 5)
 * @param {string} autor - Nombre del autor
 * @param {string} idioma - 'es' o 'en'
 * @returns {Promise<Array>} Lista de libros en formato unificado
 */
async function buscarPorAutor(autor, idioma = 'es') {
    console.log(`👤 [Open Library] Buscando autor: "${autor}" (idioma: ${idioma})`);
    
    const validacion = validarConsulta(autor, 'autor');
    if (!validacion.valida) {
        return [];
    }
    
    const autorLimpio = validacion.consultaLimpia;
    const codigoIdioma = idioma === 'es' ? 'spa' : 'eng';
    
    try {
        const url = `https://openlibrary.org/search.json?author=${encodeURIComponent(autorLimpio)}&public_scan_b=true&limit=5&language=${codigoIdioma}`;
        console.log(`   📡 URL: ${url}`);
        
        const response = await axios.get(url, {
            timeout: TIMEOUT_MS,
            headers: { 'User-Agent': 'PergaminosAbiertosBot (maddielp020@gmail.com)' }
        });
        
        if (!response.data || !response.data.docs || response.data.docs.length === 0) {
            console.log(`   ⚠️ Sin resultados en Open Library para autor: "${autor}"`);
            return [];
        }
        
        const docs = response.data.docs;
        console.log(`   📚 Open Library devolvió ${docs.length} documentos`);
        
        const librosFormateados = docs.map(item => transformarResultado(item, autor, 'autor'));
        
        console.log(`   ✅ [Open Library] Encontrados ${librosFormateados.length} libros para autor "${autor}"`);
        return librosFormateados;
        
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            console.error(`   ⏰ Timeout en Open Library: "${autor}"`);
        } else if (error.response) {
            console.error(`   ❌ Open Library error ${error.response.status}: ${error.response.statusText}`);
        } else {
            console.error(`   ❌ Open Library error: ${error.message}`);
        }
        return [];
    }
}

// ==================== FUNCION_BUSCAR_POR_AUTOR_CON_PAGINACION ====================
/**
 * Busca libros por autor en Open Library con paginación (5 por página)
 * @param {string} autor - Nombre del autor
 * @param {string} idioma - 'es' o 'en'
 * @param {number} offset - Desplazamiento para paginación (0, 5, 10, 15...)
 * @returns {Promise<Object>} { libros, totalEncontrados }
 */
async function buscarPorAutorConPaginacion(autor, idioma = 'es', offset = 0) {
    console.log(`👤 [Open Library] Buscando autor con paginación: "${autor}" (idioma: ${idioma}, offset: ${offset})`);
    
    const validacion = validarConsulta(autor, 'autor');
    if (!validacion.valida) {
        return { libros: [], totalEncontrados: 0 };
    }
    
    const autorLimpio = validacion.consultaLimpia;
    const codigoIdioma = idioma === 'es' ? 'spa' : 'eng';
    const limite = LIMITE_RESULTADOS; // 5 libros por página
    
    try {
        const url = `https://openlibrary.org/search.json?author=${encodeURIComponent(autorLimpio)}&public_scan_b=true&limit=${limite}&language=${codigoIdioma}&offset=${offset}`;
        console.log(`   📡 URL: ${url}`);
        
        const response = await axios.get(url, {
            timeout: TIMEOUT_MS,
            headers: { 'User-Agent': 'PergaminosAbiertosBot (maddielp020@gmail.com)' }
        });
        
        if (!response.data || !response.data.docs || response.data.docs.length === 0) {
            console.log(`   ⚠️ Sin resultados en Open Library para autor: "${autor}"`);
            return { libros: [], totalEncontrados: 0 };
        }
        
        const totalEncontrados = response.data.numFound || 0;
        const docs = response.data.docs;
        console.log(`   📚 Open Library devolvió ${docs.length} libros (total: ${totalEncontrados})`);
        
        // UNIFICADO: Usar transformarResultado para mantener consistencia
        const librosFormateados = docs.map(item => transformarResultado(item, autor, 'autor'));
        
        console.log(`   ✅ [Open Library] Encontrados ${librosFormateados.length} libros (offset ${offset})`);
        return { libros: librosFormateados, totalEncontrados };
        
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            console.error(`   ⏰ Timeout en Open Library: "${autor}"`);
        } else if (error.response) {
            console.error(`   ❌ Open Library error ${error.response.status}`);
        } else {
            console.error(`   ❌ Open Library error: ${error.message}`);
        }
        return { libros: [], totalEncontrados: 0 };
    }
}

// ==================== FUNCION_BUSCAR_TODOS_LOS_LIBROS_POR_AUTOR ====================
/**
 * Busca TODOS los libros de un autor (múltiples páginas de 5 en 5)
 * @param {string} autor - Nombre del autor
 * @param {string} idioma - 'es' o 'en'
 * @param {number} maxLibros - Máximo de libros a recuperar (por defecto 50, para no saturar)
 * @returns {Promise<Array>} Lista completa de libros
 */
async function buscarTodosLosLibrosPorAutor(autor, idioma = 'es', maxLibros = 50) {
    console.log(`🔍 [Open Library] Buscando TODOS los libros de "${autor}" (máx: ${maxLibros})`);
    
    let offset = 0;
    let todosLosLibros = [];
    let totalEncontrados = 0;
    
    try {
        // Primera petición para obtener el total
        const primeraPagina = await buscarPorAutorConPaginacion(autor, idioma, 0);
        if (primeraPagina.libros.length === 0) {
            return [];
        }
        
        totalEncontrados = primeraPagina.totalEncontrados;
        todosLosLibros.push(...primeraPagina.libros);
        
        console.log(`   📊 Total de libros encontrados: ${totalEncontrados}`);
        
        // Seguir trayendo páginas hasta tener todos (o llegar al máximo)
        while (todosLosLibros.length < totalEncontrados && todosLosLibros.length < maxLibros) {
            offset += LIMITE_RESULTADOS;
            const siguientePagina = await buscarPorAutorConPaginacion(autor, idioma, offset);
            
            if (siguientePagina.libros.length === 0) {
                break;
            }
            
            todosLosLibros.push(...siguientePagina.libros);
            console.log(`   📚 Progreso: ${todosLosLibros.length}/${Math.min(totalEncontrados, maxLibros)} libros`);
        }
        
        console.log(`   ✅ Total recuperado: ${todosLosLibros.length} libros de "${autor}"`);
        return todosLosLibros;
        
    } catch (error) {
        console.error(`   ❌ Error buscando todos los libros: ${error.message}`);
        return todosLosLibros.length > 0 ? todosLosLibros : [];
    }
}

// ==================== FUNCION_BUSCAR_POR_TITULO ====================
/**
 * Busca libros por título en Open Library
 * @param {string} titulo - Título del libro
 * @param {string} idioma - 'es' o 'en'
 * @returns {Promise<Array>} Lista de libros en formato unificado (priorizando coincidencia exacta)
 */
async function buscarPorTitulo(titulo, idioma = 'es') {
    console.log(`📖 [Open Library] Buscando título: "${titulo}" (idioma: ${idioma})`);
    
    const validacion = validarConsulta(titulo, 'título');
    if (!validacion.valida) {
        return [];
    }
    
    const tituloLimpio = validacion.consultaLimpia;
    const tituloNormalizadoConsulta = normalizarTituloParaComparacion(tituloLimpio);
    const codigoIdioma = idioma === 'es' ? 'spa' : 'eng';
    
    try {
        const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(tituloLimpio)}&public_scan_b=true&language=${codigoIdioma}`;
        console.log(`   📡 URL: ${url}`);
        
        const response = await axios.get(url, {
            timeout: TIMEOUT_MS,
            headers: { 'User-Agent': 'PergaminosAbiertosBot (maddielp020@gmail.com)' }
        });
        
        if (!response.data || !response.data.docs || response.data.docs.length === 0) {
            console.log(`   ⚠️ Sin resultados en Open Library para título: "${titulo}"`);
            return [];
        }
        
        let docs = response.data.docs;
        console.log(`   📚 Open Library devolvió ${docs.length} documentos`);
        
        let librosFormateados = docs.map(item => transformarResultado(item, titulo, 'titulo'));
        
        // Coincidencia exacta: reordenar para que la mejor coincidencia sea la primera
        let mejorIndice = -1;
        let mejorPuntaje = -1;
        
        for (let i = 0; i < librosFormateados.length; i++) {
            const libro = librosFormateados[i];
            const tituloNormalizadoLibro = normalizarTituloParaComparacion(libro.titulo);
            
            if (tituloNormalizadoLibro === tituloNormalizadoConsulta) {
                mejorIndice = i;
                mejorPuntaje = 100;
                console.log(`   🎯 Coincidencia EXACTA encontrada: "${libro.titulo}"`);
                break;
            }
            
            if (tituloNormalizadoLibro.includes(tituloNormalizadoConsulta) || 
                tituloNormalizadoConsulta.includes(tituloNormalizadoLibro)) {
                const puntaje = libro.edicionCount || 0;
                if (puntaje > mejorPuntaje) {
                    mejorPuntaje = puntaje;
                    mejorIndice = i;
                }
            }
        }
        
        if (mejorIndice > 0) {
            const mejorLibro = librosFormateados[mejorIndice];
            librosFormateados.splice(mejorIndice, 1);
            librosFormateados.unshift(mejorLibro);
            console.log(`   🔄 Reordenado: "${mejorLibro.titulo}" ahora es el primer resultado`);
        }
        
        console.log(`   ✅ [Open Library] Encontrados ${librosFormateados.length} libros para título "${titulo}"`);
        return librosFormateados;
        
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            console.error(`   ⏰ Timeout en Open Library: "${titulo}"`);
        } else if (error.response) {
            console.error(`   ❌ Open Library error ${error.response.status}`);
        } else {
            console.error(`   ❌ Open Library error: ${error.message}`);
        }
        return [];
    }
}

// ==================== EXPORTS ====================
module.exports = {
    buscarPorAutor,
    buscarPorTitulo,
    buscarPorAutorConPaginacion,
    buscarTodosLosLibrosPorAutor
    // buscarAmplia  ← ELIMINAR ESTA LÍNEA
};