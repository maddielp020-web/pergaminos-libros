// ==================== IMPORTACIONES ====================
const axios = require('axios');
const { GUTENDEX_API_URL } = require('../config');

// ==================== CONFIGURACION ====================
const TIMEOUT_MS = 15000;
const MAX_RESULTADOS = 5;

console.log('🔌 Módulo gutendex.js cargado (FASE 2 - Implementación real)');
console.log(`   ⏱️ Timeout: ${TIMEOUT_MS}ms`);
console.log(`   📊 Límite: ${MAX_RESULTADOS} resultados`);

// ==================== FUNCION_BUSCAR_LIBROS ====================
/**
 * Busca libros en Gutendex por título
 * @param {string} query - Título a buscar
 * @param {string} idioma - Código de idioma (es, en)
 * @returns {Promise<Array>} Lista de libros encontrados
 */
async function buscarLibros(query, idioma = 'es') {
    console.log(`📡 Iniciando búsqueda en Gutendex: "${query}" (idioma: ${idioma})`);
    
    try {
        // Construir URL con parámetros
        const url = `${GUTENDEX_API_URL}/?search=${encodeURIComponent(query)}&languages=${idioma}`;
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
            const { id, title, authors, subjects, download_count, formats } = libro;
            
            // Extraer autor
            const autor = authors && authors.length > 0 
                ? authors[0].name 
                : 'Autor desconocido';
            
            // Extraer año (intentar desde subjects, download_count, o dejar como string)
            let anio = 'Año desconocido';
            if (subjects && subjects.length > 0) {
                const anioMatch = subjects[0].match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
                if (anioMatch) anio = anioMatch[0];
            }
            
            // Extraer enlaces
            const { enlaceHTML, enlaceEPUB } = extraerEnlaces(formats);
            
            console.log(`   📖 Procesado: "${title}" (ID: ${id}) - HTML: ${!!enlaceHTML}, EPUB: ${!!enlaceEPUB}`);
            
            return {
                id,
                titulo: title,
                autor,
                anio,
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
    buscarLibros
};