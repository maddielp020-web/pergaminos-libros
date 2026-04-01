// ==================== IMPORTACIONES ====================
const axios = require('axios');
const { GUTENDEX_API_URL } = require('../config');

// ==================== CONFIGURACION ====================
const TIMEOUT_MS = 15000;
const MAX_RESULTADOS = 20; // Aumentado para mostrar todos, pero sin forzar límite inferior

console.log('🔌 Módulo gutendex.js cargado (FASE 3 - Almacén + normalización)');
console.log(`   ⏱️ Timeout: ${TIMEOUT_MS}ms`);

// ==================== DICCIONARIO_CORRECCIONES ====================
const CORRECCIONES = {
    "frankestein": "frankenstein",
    "quijote": "don quijote de la mancha",
    "principito": "el principito",
    "cien años": "cien años de soledad",
    "100 años": "cien años de soledad"
};

// ==================== PALABRAS_VACIAS ====================
const PALABRAS_VACIAS = [
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'de', 'del', 'en', 'por', 'para', 'con', 'sin', 'sobre',
    'libro', 'autor', 'escribio', 'escribió', 'escrito', 'escritor',
    'buscar', 'busca', 'buscando'
];

// ==================== FUNCION_NORMALIZAR_CONSULTA ====================
function normalizarConsulta(query) {
    const original = query.trim();
    console.log(`🔧 Normalizando consulta: "${original}"`);
    
    let texto = original.toLowerCase();
    texto = texto.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    let palabras = texto.split(/\s+/).filter(p => !PALABRAS_VACIAS.includes(p));
    let limpia = palabras.join(' ').trim();
    
    let corregida = limpia;
    for (const [error, correccion] of Object.entries(CORRECCIONES)) {
        if (corregida.includes(error)) {
            corregida = corregida.replace(error, correccion);
        }
    }
    
    if (limpia === '') {
        limpia = texto.replace(/[^\p{L}\p{N}]/gu, ' ').trim();
        corregida = limpia;
    }
    
    const modificada = (limpia !== original.toLowerCase() && limpia !== '') || corregida !== limpia;
    
    return { original, limpia, corregida, modificada };
}

// ==================== FUNCION_NORMALIZAR_TITULO ====================
/**
 * Normaliza título para deduplicación: elimina subtítulos, artículos, puntuación
 * @param {string} titulo - Título original
 * @returns {string} Título normalizado
 */
function normalizarTitulo(titulo) {
    if (!titulo) return '';
    
    let normalizado = titulo.toLowerCase();
    
    // Eliminar subtítulos (todo después de ; o :)
    normalizado = normalizado.split(';')[0];
    normalizado = normalizado.split(':')[0];
    
    // Eliminar artículos iniciales
    const articulos = ['the ', 'a ', 'an ', 'el ', 'la ', 'los ', 'las ', 'un ', 'una '];
    for (const art of articulos) {
        if (normalizado.startsWith(art)) {
            normalizado = normalizado.slice(art.length);
            break;
        }
    }
    
    // Eliminar puntuación
    normalizado = normalizado.replace(/[^\p{L}\p{N}\s]/gu, '');
    // Eliminar espacios extras
    normalizado = normalizado.trim().replace(/\s+/g, ' ');
    
    return normalizado;
}

// ==================== FUNCION_BUSCAR_POR_AUTOR ====================
/**
 * Busca libros por autor con fallback a formato "Apellido, Nombre"
 * @param {string} autor - Nombre del autor
 * @param {string} idioma - Código de idioma
 * @returns {Promise<Array>} Lista de libros
 */
async function buscarPorAutor(autor, idioma = 'es') {
    console.log(`👤 Buscando por autor: "${autor}" (idioma: ${idioma})`);
    
    const intentos = [autor];
    
    // Intentar formato "Apellido, Nombre" si el original tiene espacios
    if (autor.includes(' ') && !autor.includes(',')) {
        const partes = autor.split(' ');
        const apellido = partes[partes.length - 1];
        const nombres = partes.slice(0, -1).join(' ');
        intentos.push(`${apellido}, ${nombres}`);
    }
    
    for (const intento of intentos) {
        console.log(`   🔍 Intentando: "${intento}"`);
        const libros = await buscarLibrosEnGutendex(intento, idioma, 'autor');
        if (libros.length > 0) {
            console.log(`✅ Encontrados ${libros.length} libros para "${intento}"`);
            return libros;
        }
    }
    
    return [];
}

// ==================== FUNCION_BUSCAR_POR_TITULO ====================
/**
 * Busca libros por título
 * @param {string} titulo - Título del libro
 * @param {string} idioma - Código de idioma
 * @returns {Promise<Array>} Lista de libros
 */
async function buscarPorTitulo(titulo, idioma = 'es') {
    console.log(`📖 Buscando por título: "${titulo}" (idioma: ${idioma})`);
    return await buscarLibrosEnGutendex(titulo, idioma, 'titulo');
}

// ==================== FUNCION_BUSCAR_EN_GUTENDEX ====================
async function buscarLibrosEnGutendex(query, idioma = 'es', tipo = 'titulo') {
    try {
        let url = `${GUTENDEX_API_URL}/?languages=${idioma}`;
        
        if (tipo === 'autor') {
            url += `&search_author=${encodeURIComponent(query)}`;
        } else {
            url += `&search=${encodeURIComponent(query)}`;
        }
        
        console.log(`📍 URL: ${url}`);
        
        const response = await axios.get(url, {
            timeout: TIMEOUT_MS,
            headers: { 'User-Agent': 'PergaminosLibros_Bot/1.0' }
        });
        
        if (!response.data || !response.data.results) {
            return [];
        }
        
        // Mostrar TODOS los resultados, sin forzar límite
        const librosRaw = response.data.results;
        console.log(`📚 Encontrados ${librosRaw.length} libros en Gutendex`);
        
        const librosProcesados = librosRaw.map(libro => {
            const { id, title, authors, languages, formats } = libro;
            
            const autor = authors && authors.length > 0 
                ? authors[0].name 
                : 'Autor desconocido';
            
            const idiomaLibro = languages && languages.length > 0 
                ? languages[0] 
                : 'desconocido';
            
            // Extraer año del libro (desde texto o metadata)
            let anio = null;
            if (libro.subjects) {
                const anioMatch = libro.subjects.join(' ').match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
                if (anioMatch) anio = parseInt(anioMatch[0]);
            }
            
            const { enlaceHTML, enlaceEPUB } = extraerEnlaces(formats);
            
            return {
                id,
                titulo: title,
                autor,
                idioma: idiomaLibro,
                anio,
                enlaceHTML,
                enlaceEPUB
            };
        });
        
        return librosProcesados;
        
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            console.error(`⏰ Timeout en búsqueda: "${query}"`);
        } else if (error.response) {
            console.error(`❌ Error Gutendex: ${error.response.status}`);
        } else {
            console.error(`❌ Error: ${error.message}`);
        }
        throw new Error('Gutendex no disponible');
    }
}

// ==================== FUNCION_EXTRAER_ENLACES ====================
function extraerEnlaces(formats) {
    let enlaceHTML = null;
    let enlaceEPUB = null;
    
    if (!formats) return { enlaceHTML, enlaceEPUB };
    
    for (const [key, value] of Object.entries(formats)) {
        if (key === 'text/html; charset=utf-8' || key === 'text/html') {
            enlaceHTML = value;
        }
        if (key === 'application/epub+zip') {
            enlaceEPUB = value;
        }
    }
    
    return { enlaceHTML, enlaceEPUB };
}

// ==================== EXPORTS ====================
module.exports = {
    buscarPorAutor,
    buscarPorTitulo,
    normalizarConsulta,
    normalizarTitulo
};