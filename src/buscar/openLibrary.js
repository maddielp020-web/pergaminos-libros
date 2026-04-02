// ==================== IMPORTACIONES ====================
const axios = require('axios');

// ==================== CONFIGURACION ====================
const TIMEOUT_MS = 15000;
const LIMITE_RESULTADOS = 10;          // Suficiente para respuesta rápida
const MIN_CARACTERES_CONSULTA = 3;     // Evita consultas costosas

// Campos específicos que pedimos a Open Library (solo lo necesario)
const CAMPOS_SOLICITADOS = [
    'key',
    'title',
    'author_name',
    'first_publish_year',
    'language',
    'cover_i',
    'edition_count'
].join(',');

console.log('📚 Módulo openLibrary.js cargado (configuración optimizada)');
console.log(`   ⏱️ Timeout: ${TIMEOUT_MS}ms`);
console.log(`   📊 Límite: ${LIMITE_RESULTADOS} resultados`);
console.log(`   🔧 Campos solicitados: ${CAMPOS_SOLICITADOS}`);

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
 * Construye la URL de búsqueda con todos los parámetros óptimos
 * @param {string} tipo - 'autor' o 'titulo'
 * @param {string} valor - El término de búsqueda
 * @param {string} idioma - 'es' o 'en'
 * @returns {string} URL completa
 */
function construirURL(tipo, valor, idioma) {
    let url = `https://openlibrary.org/search.json?fields=${CAMPOS_SOLICITADOS}&limit=${LIMITE_RESULTADOS}`;
    
    // Ordenar por relevancia (más ediciones primero)
    url += `&sort=edition_count desc`;
    
    // Filtro de idioma ANTES de la búsqueda
    if (idioma === 'es') {
        url += `&language=spa`;
    } else if (idioma === 'en') {
        url += `&language=eng`;
    }
    
    // Término de búsqueda según tipo
    if (tipo === 'autor') {
        url += `&author=${encodeURIComponent(valor)}`;
    } else if (tipo === 'titulo') {
        url += `&title=${encodeURIComponent(valor)}`;
    }
    
    return url;
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
        // Es una edición, usamos la URL directa
        enlaceHTML = `https://openlibrary.org${key}`;
        console.log(`   📖 Libro es una edición: ${key}`);
    } else if (key) {
        // Cualquier otra clave, intentamos construir URL
        enlaceHTML = `https://openlibrary.org${key}`;
        console.log(`   📖 Clave no estándar: ${key}`);
    } else {
        console.log(`   ⚠️ Libro sin key válida`);
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
 * Busca libros por autor en Open Library
 * @param {string} autor - Nombre del autor
 * @param {string} idioma - 'es' o 'en'
 * @returns {Promise<Array>} Lista de libros en formato unificado
 */
async function buscarPorAutor(autor, idioma = 'es') {
    console.log(`👤 [Open Library] Buscando autor: "${autor}" (idioma: ${idioma})`);
    
    const validacion = validarConsulta(autor, 'autor');
    if (!validacion.valida) {
        if (validacion.razon === 'demasiado corta') {
            console.log(`   ⚠️ Búsqueda de autor ignorada: "${autor}" es muy corto`);
        }
        return [];
    }
    
    const autorLimpio = validacion.consultaLimpia;
    
    try {
        const url = construirURL('autor', autorLimpio, idioma);
        console.log(`   📡 URL: ${url}`);
        
        const response = await axios.get(url, {
            timeout: TIMEOUT_MS,
            headers: { 'User-Agent': 'PergaminosLibros_Bot/1.0' }
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
        if (validacion.razon === 'demasiado corta') {
            console.log(`   ⚠️ Búsqueda de título ignorada: "${titulo}" es muy corto`);
        }
        return [];
    }
    
    const tituloLimpio = validacion.consultaLimpia;
    const tituloNormalizadoConsulta = normalizarTituloParaComparacion(tituloLimpio);
    
    try {
        const url = construirURL('titulo', tituloLimpio, idioma);
        console.log(`   📡 URL: ${url}`);
        
        const response = await axios.get(url, {
            timeout: TIMEOUT_MS,
            headers: { 'User-Agent': 'PergaminosLibros_Bot/1.0' }
        });
        
        if (!response.data || !response.data.docs || response.data.docs.length === 0) {
            console.log(`   ⚠️ Sin resultados en Open Library para título: "${titulo}"`);
            return [];
        }
        
        let docs = response.data.docs;
        console.log(`   📚 Open Library devolvió ${docs.length} documentos`);
        
        // Transformar todos los resultados
        let librosFormateados = docs.map(item => transformarResultado(item, titulo, 'titulo'));
        
        // === COINCIDENCIA EXACTA: reordenar para que la mejor coincidencia sea la primera ===
        let mejorIndice = -1;
        let mejorPuntaje = -1;
        
        for (let i = 0; i < librosFormateados.length; i++) {
            const libro = librosFormateados[i];
            const tituloNormalizadoLibro = normalizarTituloParaComparacion(libro.titulo);
            
            // Coincidencia exacta después de normalización
            if (tituloNormalizadoLibro === tituloNormalizadoConsulta) {
                mejorIndice = i;
                mejorPuntaje = 100; // puntaje máximo
                console.log(`   🎯 Coincidencia EXACTA encontrada: "${libro.titulo}"`);
                break;
            }
            
            // Coincidencia parcial (uno contiene al otro)
            if (tituloNormalizadoLibro.includes(tituloNormalizadoConsulta) || 
                tituloNormalizadoConsulta.includes(tituloNormalizadoLibro)) {
                // Usar edition_count como criterio de desempate
                const puntaje = libro.edicionCount || 0;
                if (puntaje > mejorPuntaje) {
                    mejorPuntaje = puntaje;
                    mejorIndice = i;
                    console.log(`   📌 Coincidencia parcial: "${libro.titulo}" (ediciones: ${puntaje})`);
                }
            }
        }
        
        // Si encontramos una mejor coincidencia y no está ya en el primer lugar, la movemos al frente
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
            console.error(`   ❌ Open Library error ${error.response.status}: ${error.response.statusText}`);
        } else {
            console.error(`   ❌ Open Library error: ${error.message}`);
        }
        return [];
    }
}

// ==================== EXPORTS ====================
module.exports = {
    buscarPorAutor,
    buscarPorTitulo
};