// ==================== IMPORTACIONES ====================
const fs = require('fs').promises;
const path = require('path');

// ==================== CONFIGURACION ====================
const RUTA_CACHE = path.join(__dirname, 'cache.json');

console.log('💾 AlmacenManager cargado (VERSIÓN ASÍNCRONA)');
console.log(`   📍 Ruta: ${RUTA_CACHE}`);

// ==================== FUNCIONES_INTERNAS_ASINCRONAS ====================
async function leerCache() {
    try {
        await fs.access(RUTA_CACHE);
        const data = await fs.readFile(RUTA_CACHE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('📁 Creando archivo cache.json...');
            const estructuraInicial = { autores: {}, titulos: {} };
            await fs.writeFile(RUTA_CACHE, JSON.stringify(estructuraInicial, null, 2));
            return estructuraInicial;
        }
        console.error('❌ Error leyendo cache:', error.message);
        return { autores: {}, titulos: {} };
    }
}

async function escribirCache(data) {
    try {
        await fs.writeFile(RUTA_CACHE, JSON.stringify(data, null, 2));
        console.log(`✅ Cache guardado (autores: ${Object.keys(data.autores).length}, titulos: ${Object.keys(data.titulos).length})`);
        return true;
    } catch (error) {
        console.error('❌ Error escribiendo cache:', error.message);
        return false;
    }
}

// ==================== FUNCIONES_PUBLICAS_ASINCRONAS ====================

/**
 * Obtiene libros de un autor desde el almacén
 * @param {string} autor - Nombre del autor
 * @returns {Promise<Array|null>} Libros del autor o null si no existe
 */
async function obtenerLibrosPorAutor(autor) {
    const cache = await leerCache();
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
 * @returns {Promise<Object|null>} Libro o null si no existe
 */
async function obtenerLibroPorTitulo(titulo) {
    const cache = await leerCache();
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
async function guardarLibrosPorAutor(autor, libros) {
    const cache = await leerCache();
    const clave = autor.toLowerCase().trim();
    cache.autores[clave] = {
        autor: autor,
        fecha: new Date().toISOString(),
        libros: libros
    };
    await escribirCache(cache);
    console.log(`💾 Guardados ${libros.length} libros para autor "${autor}"`);
}

/**
 * Elimina un autor del almacén
 * @param {string} autor - Nombre del autor
 * @returns {Promise<boolean>} True si se eliminó
 */
async function eliminarAutor(autor) {
    const cache = await leerCache();
    const clave = autor.toLowerCase().trim();
    if (cache.autores[clave]) {
        delete cache.autores[clave];
        await escribirCache(cache);
        console.log(`🗑️ Eliminado autor: "${autor}"`);
        return true;
    }
    console.log(`⚠️ Autor no encontrado: "${autor}"`);
    return false;
}

/**
 * Elimina un título del almacén
 * @param {string} titulo - Título del libro
 * @returns {Promise<boolean>} True si se eliminó
 */
async function eliminarTitulo(titulo) {
    const cache = await leerCache();
    const clave = titulo.toLowerCase().trim();
    if (cache.titulos[clave]) {
        delete cache.titulos[clave];
        await escribirCache(cache);
        console.log(`🗑️ Eliminado título: "${titulo}"`);
        return true;
    }
    console.log(`⚠️ Título no encontrado: "${titulo}"`);
    return false;
}

/**
 * Obtiene estadísticas del almacén
 * @returns {Promise<Object>} { autores: number, titulos: number }
 */
async function obtenerEstadisticas() {
    const cache = await leerCache();
    return {
        autores: Object.keys(cache.autores).length,
        titulos: Object.keys(cache.titulos).length
    };
}

/**
 * Borra TODO el almacén (con confirmación en función externa)
 * @returns {Promise<boolean>} True si se borró
 */
async function borrarTodo() {
    const estructuraInicial = { autores: {}, titulos: {} };
    const resultado = await escribirCache(estructuraInicial);
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
    eliminarAutor,
    eliminarTitulo,
    obtenerEstadisticas,
    borrarTodo
};