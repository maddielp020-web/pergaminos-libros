// ==================== IMPORTACIONES ====================
const axios = require('axios');
const { GUTENDEX_API_URL } = require('../config');

// ==================== CONFIGURACION ====================
const TIMEOUT_MS = 15000;
const MAX_RESULTADOS = 20;

console.log('🔌 Módulo gutendex.js cargado (FASE CORREGIDA - Parámetro oficial "search=author:")');
console.log(`   ⏱️ Timeout: ${TIMEOUT_MS}ms`);
console.log(`   📡 API: ${GUTENDEX_API_URL}`);

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
function normalizarTitulo(titulo) {
    if (!titulo) return '';
    
    let normalizado = titulo.toLowerCase();
    normalizado = normalizado.split(';')[0];
    normalizado = normalizado.split(':')[0];
    
    const articulos = ['the ', 'a ', 'an ', 'el ', 'la ', 'los ', 'las ', 'un ', 'una '];
    for (const art of articulos) {
        if (normalizado.startsWith(art)) {
            normalizado = normalizado.slice(art.length);
            break;
        }
    }
    
    normalizado = normalizado.replace(/[^\p{L}\p{N}\s]/gu, '');
    normalizado = normalizado.trim().replace(/\s+/g, ' ');
    
    return normalizado;
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

// ==================== FUNCION_BUSCAR_EN_GUTENDEX ====================
/**
 * Busca libros en Gutendex usando parámetros oficiales
 * @param {string} query - Término de búsqueda
 * @param {string} idioma - Código de idioma (es, en)
 * @param {string} tipo - 'titulo' o 'autor'
 * @returns {Promise<Array>} Lista de libros
 */
async function buscarLibrosEnGutendex(query, idioma = 'es', tipo = 'titulo') {
    try {
        let url = `${GUTENDEX_API_URL}/?languages=${idioma}`;
        
        if (tipo === 'autor') {
            // PARÁMETRO OFICIAL: search=author:Nombre
            url += `&search=author:${encodeURIComponent(query)}`;
            console.log(`   👤 URL autor (oficial): ${url}`);
        } else {
            url += `&search=${encodeURIComponent(query)}`;
            console.log(`   📖 URL título: ${url}`);
        }
        
        const response = await axios.get(url, {
            timeout: TIMEOUT_MS,
            headers: { 'User-Agent': 'PergaminosLibros_Bot/1.0' }
        });
        
        console.log(`   📊 Status: ${response.status}`);
        
        if (!response.data || !response.data.results) {
            console.log(`   ⚠️ Sin resultados (respuesta vacía)`);
            return [];
        }
        
        const librosRaw = response.data.results;
        console.log(`   📚 Gutendex devolvió: ${librosRaw.length} libros`);
        
        const librosProcesados = librosRaw.map(libro => {
            const { id, title, authors, languages, formats, subjects } = libro;
            
            const autor = authors && authors.length > 0 
                ? authors[0].name 
                : 'Autor desconocido';
            
            const idiomaLibro = languages && languages.length > 0 
                ? languages[0] 
                : 'desconocido';
            
            let anio = null;
            if (subjects) {
                const anioMatch = subjects.join(' ').match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
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
        // NO lanzar excepción - devolver array vacío para que el fallback continúe
        if (error.code === 'ECONNABORTED') {
            console.error(`   ⏰ TIMEOUT: "${query}" después de ${TIMEOUT_MS}ms`);
        } else if (error.response) {
            console.error(`   ❌ HTTP ${error.response.status}: ${error.response.statusText}`);
        } else if (error.request) {
            console.error(`   ❌ Sin respuesta: ${error.message}`);
        } else {
            console.error(`   ❌ Error: ${error.message}`);
        }
        return [];
    }
}

// ==================== FUNCION_BUSCAR_POR_AUTOR ====================
/**
 * Busca libros por autor con fallback de formatos e idioma
 * @param {string} autor - Nombre del autor
 * @param {string} idioma - Código de idioma inicial
 * @returns {Promise<Array>} Lista de libros
 */
async function buscarPorAutor(autor, idioma = 'es') {
    console.log(`👤 BUSCAR POR AUTOR: "${autor}" (idioma inicial: ${idioma})`);
    
    // Generar todos los formatos posibles del nombre
    const formatos = [];
    const autorOriginal = autor.trim();
    
    // Formato 1: Original
    formatos.push(autorOriginal);
    
    // Formato 2: "Apellido, Nombre" si tiene espacio y no tiene coma
    if (autorOriginal.includes(' ') && !autorOriginal.includes(',')) {
        const partes = autorOriginal.split(' ');
        const apellido = partes[partes.length - 1];
        const nombres = partes.slice(0, -1).join(' ');
        formatos.push(`${apellido}, ${nombres}`);
    }
    
    // Formato 3: Solo apellido (última palabra)
    if (autorOriginal.includes(' ')) {
        const partes = autorOriginal.split(' ');
        formatos.push(partes[partes.length - 1]);
    }
    
    // Eliminar duplicados
    const formatosUnicos = [...new Set(formatos)];
    console.log(`   📝 Formatos a probar: ${formatosUnicos.join(' | ')}`);
    
    // Probar cada formato en español
    for (const formato of formatosUnicos) {
        console.log(`   🔍 Español: "${formato}"`);
        const libros = await buscarLibrosEnGutendex(formato, 'es', 'autor');
        if (libros.length > 0) {
            console.log(`   ✅ ENCONTRADOS ${libros.length} libros con formato "${formato}" en español`);
            return libros;
        }
    }
    
    // Si nada funciona en español, probar en inglés con los mismos formatos
    console.log(`   🌎 Sin resultados en español, probando en inglés...`);
    for (const formato of formatosUnicos) {
        console.log(`   🔍 Inglés: "${formato}"`);
        const libros = await buscarLibrosEnGutendex(formato, 'en', 'autor');
        if (libros.length > 0) {
            console.log(`   ✅ ENCONTRADOS ${libros.length} libros con formato "${formato}" en inglés`);
            return libros;
        }
    }
    
    console.log(`   ❌ No se encontraron libros para "${autor}" en ningún formato`);
    return [];
}

// ==================== FUNCION_BUSCAR_POR_TITULO ====================
/**
 * Busca libros por título con fallback de idioma
 * @param {string} titulo - Título del libro
 * @param {string} idioma - Código de idioma inicial
 * @returns {Promise<Array>} Lista de libros
 */
async function buscarPorTitulo(titulo, idioma = 'es') {
    console.log(`📖 BUSCAR POR TÍTULO: "${titulo}" (idioma inicial: ${idioma})`);
    
    // Probar en español
    let libros = await buscarLibrosEnGutendex(titulo, 'es', 'titulo');
    if (libros.length > 0) {
        console.log(`   ✅ ENCONTRADOS ${libros.length} libros en español`);
        return libros;
    }
    
    // Probar en inglés si español falla
    console.log(`   🌎 Sin resultados en español, probando en inglés...`);
    libros = await buscarLibrosEnGutendex(titulo, 'en', 'titulo');
    if (libros.length > 0) {
        console.log(`   ✅ ENCONTRADOS ${libros.length} libros en inglés`);
        return libros;
    }
    
    console.log(`   ❌ No se encontraron libros para "${titulo}"`);
    return [];
}

// ==================== EXPORTS ====================
module.exports = {
    buscarPorAutor,
    buscarPorTitulo,
    normalizarConsulta,
    normalizarTitulo
};