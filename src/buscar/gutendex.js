// ==================== IMPORTACIONES ====================
const axios = require('axios');
const { GUTENDEX_API_URL } = require('../config');

// ==================== CONFIGURACION ====================
const TIMEOUT_MS = 15000;
const MAX_RESULTADOS = 5;

console.log('🔌 Módulo gutendex.js cargado (FASE 2.1 - Búsqueda inteligente)');
console.log(`   ⏱️ Timeout: ${TIMEOUT_MS}ms`);
console.log(`   📊 Límite: ${MAX_RESULTADOS} resultados`);

// ==================== DICCIONARIO_CORRECCIONES ====================
const CORRECCIONES = {
    // Errores comunes de tipeo
    "frankestein": "frankenstein",
    "frankestein": "frankenstein",
    "quijote": "quijote",
    "don quijote": "don quijote de la mancha",
    "principito": "el principito",
    "cien años": "cien años de soledad",
    "100 años": "cien años de soledad",
    "harry potter": "harry potter",
    "sherlock holmes": "sherlock holmes",
    "sherlock": "sherlock holmes",
    "moby dick": "moby dick",
    "moby": "moby dick",
    // Clásicos españoles
    "la celestina": "la celestina",
    "celestina": "la celestina",
    "lazarillo": "lazarillo de tormes",
    "el lazarillo": "lazarillo de tormes",
    "poema del mío cid": "el cantar de mío cid",
    "el cid": "el cantar de mío cid",
    "rinconete": "rinconete y cortadillo",
    "cortadillo": "rinconete y cortadillo"
};

// ==================== PALABRAS_VACIAS ====================
const PALABRAS_VACIAS = [
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'de', 'del', 'en', 'por', 'para', 'con', 'sin', 'sobre',
    'libro', 'autor', 'escribio', 'escribió', 'escrito', 'escritor',
    'buscar', 'busca', 'buscando', 'de', 'y', 'o', 'pero', 'que',
    'cual', 'como', 'cuando', 'donde', 'porque', 'aunque', 'mientras'
];

// ==================== FUNCION_NORMALIZAR_CONSULTA ====================
/**
 * Normaliza la consulta: elimina palabras vacías, corrige errores, limpia puntuación
 * @param {string} query - Consulta original
 * @returns {Object} { original, limpia, corregida, modificada }
 */
function normalizarConsulta(query) {
    const original = query.trim();
    console.log(`🔧 Normalizando consulta: "${original}"`);
    
    // Paso 1: Minúsculas
    let texto = original.toLowerCase();
    
    // Paso 2: Eliminar signos de puntuación excepto espacios y letras
    texto = texto.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    
    // Paso 3: Eliminar palabras vacías
    let palabras = texto.split(/\s+/).filter(p => !PALABRAS_VACIAS.includes(p));
    let limpia = palabras.join(' ').trim();
    
    // Paso 4: Corregir errores ortográficos (aplicar en orden)
    let corregida = limpia;
    for (const [error, correccion] of Object.entries(CORRECCIONES)) {
        if (corregida.includes(error)) {
            console.log(`   ✏️ Corrigiendo: "${error}" → "${corregida.replace(error, correccion)}"`);
            corregida = corregida.replace(error, correccion);
        }
    }
    
    // Si después de limpiar quedó vacío, devolver original limpio de puntuación
    if (limpia === '') {
        limpia = texto.replace(/[^\p{L}\p{N}]/gu, ' ').trim();
        corregida = limpia;
    }
    
    const modificada = (limpia !== original.toLowerCase() && limpia !== '') || corregida !== limpia;
    
    console.log(`   📝 Resultado: limpia="${limpia}", corregida="${corregida}", modificada=${modificada}`);
    
    return {
        original,
        limpia,
        corregida,
        modificada
    };
}

// ==================== FUNCION_DETECTAR_TIPO_CONSULTA ====================
/**
 * Detecta si la consulta es probablemente un autor o un título
 * @param {string} query - Consulta limpia
 * @returns {string} 'autor' o 'titulo'
 */
function detectarTipoConsulta(query) {
    console.log(`🔍 Detectando tipo de consulta: "${query}"`);
    
    // Palabras clave que indican búsqueda por autor
    const palabrasAutor = ['by', 'por', 'de', 'del', 'escrito', 'author', 'autor'];
    const tienePalabraAutor = palabrasAutor.some(p => query.toLowerCase().includes(p));
    
    if (tienePalabraAutor) {
        console.log(`   ✅ Detectado como AUTOR (palabra clave)`);
        return 'autor';
    }
    
    // Patrón: nombre y apellido (dos palabras con mayúscula en cada una)
    // En texto ya está en minúsculas, pero podemos detectar por longitud y estructura
    const palabras = query.split(/\s+/);
    
    // Nombres de autores conocidos (para casos especiales)
    const autoresConocidos = [
        'mary shelley', 'jane austen', 'charles dickens', 'mark twain',
        'jules verne', 'gabriel garcía márquez', 'miguel de cervantes',
        'franz kafka', 'edgar allan poe', 'oscar wilde', 'lewis carroll'
    ];
    
    const esAutorConocido = autoresConocidos.some(autor => 
        query.toLowerCase().includes(autor)
    );
    
    if (esAutorConocido) {
        console.log(`   ✅ Detectado como AUTOR (autor conocido)`);
        return 'autor';
    }
    
    // Si tiene 2-3 palabras y ninguna es artículo muy común, puede ser nombre
    if (palabras.length >= 2 && palabras.length <= 4) {
        // Si todas las palabras tienen más de 3 letras, probablemente nombre
        const todasLargas = palabras.every(p => p.length > 3);
        if (todasLargas) {
            console.log(`   ✅ Detectado como AUTOR (patrón nombre/apellido)`);
            return 'autor';
        }
    }
    
    console.log(`   ✅ Detectado como TITULO (default)`);
    return 'titulo';
}

// ==================== FUNCION_BUSCAR_LIBROS ====================
/**
 * Busca libros en Gutendex con soporte para título/autor
 * @param {string} query - Término de búsqueda
 * @param {string} idioma - Código de idioma (es, en)
 * @param {string} tipo - 'titulo' o 'autor'
 * @returns {Promise<Array>} Lista de libros encontrados
 */
async function buscarLibros(query, idioma = 'es', tipo = 'titulo') {
    console.log(`📡 Buscando en Gutendex: "${query}" (idioma: ${idioma}, tipo: ${tipo})`);
    
    try {
        // Construir URL según tipo de búsqueda
        let url = `${GUTENDEX_API_URL}/?languages=${idioma}`;
        
        if (tipo === 'autor') {
            url += `&search_author=${encodeURIComponent(query)}`;
            console.log(`   👤 Búsqueda por autor: "${query}"`);
        } else {
            url += `&search=${encodeURIComponent(query)}`;
            console.log(`   📖 Búsqueda por título: "${query}"`);
        }
        
        console.log(`📍 URL: ${url}`);
        
        const response = await axios.get(url, {
            timeout: TIMEOUT_MS,
            headers: {
                'User-Agent': 'PergaminosLibros_Bot/1.0'
            }
        });
        
        console.log(`✅ Respuesta recibida. Código: ${response.status}`);
        
        if (!response.data || !response.data.results) {
            console.log(`⚠️ Respuesta sin resultados para idioma: ${idioma}`);
            return [];
        }
        
        const librosRaw = response.data.results.slice(0, MAX_RESULTADOS);
        console.log(`📚 Encontrados ${librosRaw.length} libros (limitado a ${MAX_RESULTADOS})`);
        
        // Procesar cada libro
        const librosProcesados = librosRaw.map(libro => {
            const { id, title, authors, languages, formats } = libro;
            
            // Extraer autor
            const autor = authors && authors.length > 0 
                ? authors[0].name 
                : 'Autor desconocido';
            
            // Extraer idioma (primer idioma de la lista)
            const idiomaLibro = languages && languages.length > 0 
                ? languages[0] 
                : 'desconocido';
            
            // Extraer enlaces
            const { enlaceHTML, enlaceEPUB } = extraerEnlaces(formats);
            
            console.log(`   📖 Procesado: "${title}" (ID: ${id}) - Idioma: ${idiomaLibro}, HTML: ${!!enlaceHTML}, EPUB: ${!!enlaceEPUB}`);
            
            return {
                id,
                titulo: title,
                autor,
                idioma: idiomaLibro,
                enlaceHTML,
                enlaceEPUB
            };
        });
        
        console.log(`✅ Procesados ${librosProcesados.length} libros correctamente`);
        return librosProcesados;
        
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            console.error(`⏰ Timeout (${TIMEOUT_MS}ms) en búsqueda: "${query}"`);
        } else if (error.response) {
            console.error(`❌ Error en Gutendex: ${error.response.status} - ${error.response.statusText}`);
        } else {
            console.error(`❌ Error en búsqueda: ${error.message}`);
        }
        return [];
    }
}

// ==================== FUNCION_FORMATEAR_AUTOR ====================
/**
 * Convierte "Nombre Apellido" a "Apellido, Nombre" para búsqueda en Gutendex
 * @param {string} nombre - Nombre completo del autor
 * @returns {string} Nombre formateado para búsqueda
 */
function formatearNombreAutor(nombre) {
    const partes = nombre.trim().split(/\s+/);
    if (partes.length >= 2) {
        const apellido = partes[partes.length - 1];
        const nombres = partes.slice(0, -1).join(' ');
        return `${apellido}, ${nombres}`;
    }
    return nombre;
}

// ==================== FUNCION_BUSCAR_POR_AUTOR_CON_FALLBACK ====================
/**
 * Busca libros por autor con fallback a formato "Apellido, Nombre"
 * @param {string} autor - Nombre del autor
 * @param {string} idioma - Código de idioma
 * @returns {Promise<Array>} Lista de libros encontrados
 */
async function buscarPorAutorConFallback(autor, idioma = 'es') {
    console.log(`🔍 Buscando por autor con fallback: "${autor}"`);
    
    // Primer intento: con el nombre original
    let libros = await buscarLibros(autor, idioma, 'autor');
    
    // Si no hay resultados, intentar con formato "Apellido, Nombre"
    if (libros.length === 0) {
        const autorFormateado = formatearNombreAutor(autor);
        if (autorFormateado !== autor) {
            console.log(`🔄 Intentando con formato alternativo: "${autorFormateado}"`);
            libros = await buscarLibros(autorFormateado, idioma, 'autor');
        }
    }
    
    return libros;
}

// ==================== FUNCION_EXTRAER_ENLACES ====================
/**
 * Extrae enlaces HTML y EPUB de los formats de Gutendex
 * @param {Object} formats - Objeto de formats de Gutendex
 * @returns {Object} { enlaceHTML, enlaceEPUB }
 */
function extraerEnlaces(formats) {
    let enlaceHTML = null;
    let enlaceEPUB = null;
    
    if (!formats) {
        return { enlaceHTML, enlaceEPUB };
    }
    
    // Buscar HTML (text/html)
    for (const [key, value] of Object.entries(formats)) {
        if (key === 'text/html; charset=utf-8' || key === 'text/html') {
            enlaceHTML = value;
            break;
        }
    }
    
    // Buscar EPUB (application/epub+zip)
    for (const [key, value] of Object.entries(formats)) {
        if (key === 'application/epub+zip') {
            enlaceEPUB = value;
            break;
        }
    }
    
    return { enlaceHTML, enlaceEPUB };
}

// ==================== EXPORTS ====================
module.exports = {
    buscarLibros,
    buscarPorAutorConFallback,
    normalizarConsulta,
    detectarTipoConsulta,
    formatearNombreAutor
};