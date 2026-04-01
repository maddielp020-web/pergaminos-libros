// ==================== IMPORTACIONES ====================
const fs = require('fs');
const path = require('path');

// ==================== CONFIGURACION ====================
const RUTA_CACHE = path.join(__dirname, 'cache.json');

console.log('💾 AlmacenManager cargado');
console.log(`   📍 Ruta: ${RUTA_CACHE}`);

// ==================== FUNCIONES_INTERNAS ====================
function leerCache() {
    try {
        if (!fs.existsSync(RUTA_CACHE)) {
            console.log('📁 Creando archivo cache.json...');
            const estructuraInicial = { autores: {}, titulos: {} };
            fs.writeFileSync(RUTA_CACHE, JSON.stringify(estructuraInicial, null, 2));
            return estructuraInicial;
        }
        const data = fs.readFileSync(RUTA_CACHE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ Error leyendo cache:', error.message);
        return { autores: {}, titulos: {} };
    }
}

function escribirCache(data) {
    try {
        fs.writeFileSync(RUTA_CACHE, JSON.stringify(data, null, 2));
        console.log(`✅ Cache guardado (autores: ${Object.keys(data.autores).length}, titulos: ${Object.keys(data.titulos).length})`);
        return true;
    } catch (error) {
        console.error('❌ Error escribiendo cache:', error.message);
        return false;
    }
}

// ==================== FUNCIONES_PUBLICAS ====================

/**
 * Obtiene libros de un autor desde el almacén
 * @param {string} autor - Nombre del autor
 * @returns {Array|null} Libros del autor o null si no existe
 */
function obtenerLibrosPorAutor(autor) {
    const cache = leerCache();
    const clave = autor.toLowerCase().trim();
    if (cache.autores[clave]) {
        console.log(`💾 Cache HIT: autor "${autor}" (${cache.autores[clave].libros.length} libros)`);
        return cache.autores[clave].libros;
    }
    console.log(`💾 Cache MISS: autor "${autor}"`);
    return null;
}

/**
 * Obtiene un libro por título desde el almacén
 * @param {string} titulo - Título del libro
 * @returns {Object|null} Libro o null si no existe
 */
function obtenerLibroPorTitulo(titulo) {
    const cache = leerCache();
    const clave = titulo.toLowerCase().trim();
    if (cache.titulos[clave]) {
        console.log(`💾 Cache HIT: título "${titulo}"`);
        return cache.titulos[clave];
    }
    console.log(`💾 Cache MISS: título "${titulo}"`);
    return null;
}

/**
 * Guarda libros de un autor en el almacén
 * @param {string} autor - Nombre del autor
 * @param {Array} libros - Lista de libros
 */
function guardarLibrosPorAutor(autor, libros) {
    const cache = leerCache();
    const clave = autor.toLowerCase().trim();
    cache.autores[clave] = {
        autor: autor,
        fecha: new Date().toISOString(),
        libros: libros
    };
    escribirCache(cache);
    console.log(`💾 Guardados ${libros.length} libros para autor "${autor}"`);
}

/**
 * Guarda un libro por título en el almacén
 * @param {Object} libro - Libro con titulo, autor, enlaces
 */
function guardarLibroPorTitulo(libro) {
    const cache = leerCache();
    const clave = libro.titulo.toLowerCase().trim();
    cache.titulos[clave] = {
        ...libro,
        fecha: new Date().toISOString()
    };
    escribirCache(cache);
    console.log(`💾 Guardado título "${libro.titulo}"`);
}

/**
 * Elimina un autor del almacén
 * @param {string} autor - Nombre del autor
 * @returns {boolean} True si se eliminó
 */
function eliminarAutor(autor) {
    const cache = leerCache();
    const clave = autor.toLowerCase().trim();
    if (cache.autores[clave]) {
        delete cache.autores[clave];
        escribirCache(cache);
        console.log(`🗑️ Eliminado autor: "${autor}"`);
        return true;
    }
    console.log(`⚠️ Autor no encontrado: "${autor}"`);
    return false;
}

/**
 * Elimina un título del almacén
 * @param {string} titulo - Título del libro
 * @returns {boolean} True si se eliminó
 */
function eliminarTitulo(titulo) {
    const cache = leerCache();
    const clave = titulo.toLowerCase().trim();
    if (cache.titulos[clave]) {
        delete cache.titulos[clave];
        escribirCache(cache);
        console.log(`🗑️ Eliminado título: "${titulo}"`);
        return true;
    }
    console.log(`⚠️ Título no encontrado: "${titulo}"`);
    return false;
}

/**
 * Obtiene estadísticas del almacén
 * @returns {Object} { autores: number, titulos: number }
 */
function obtenerEstadisticas() {
    const cache = leerCache();
    return {
        autores: Object.keys(cache.autores).length,
        titulos: Object.keys(cache.titulos).length
    };
}

/**
 * Borra TODO el almacén (con confirmación en función externa)
 * @returns {boolean} True si se borró
 */
function borrarTodo() {
    const estructuraInicial = { autores: {}, titulos: {} };
    const resultado = escribirCache(estructuraInicial);
    if (resultado) {
        console.log('🗑️ TODO el almacén ha sido borrado');
    }
    return resultado;
}

// ==================== EXPORTS ====================
module.exports = {
    obtenerLibrosPorAutor,
    obtenerLibroPorTitulo,
    guardarLibrosPorAutor,
    guardarLibroPorTitulo,
    eliminarAutor,
    eliminarTitulo,
    obtenerEstadisticas,
    borrarTodo
};