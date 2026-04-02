// ==================== IMPORTACIONES ====================
const fs = require('fs');
const path = require('path');

// ==================== CONFIGURACION ====================
const RUTA_SESIONES = path.join(__dirname, 'sesionesAutor.json');
const TIEMPO_EXPIRACION = 30 * 60 * 1000; // 30 minutos

console.log('💾 Módulo sesionesAutor.js cargado');

// ==================== FUNCIONES INTERNAS ====================
function leerSesiones() {
    try {
        if (!fs.existsSync(RUTA_SESIONES)) {
            fs.writeFileSync(RUTA_SESIONES, JSON.stringify({}, null, 2));
            return {};
        }
        const data = fs.readFileSync(RUTA_SESIONES, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ Error leyendo sesiones:', error.message);
        return {};
    }
}

function escribirSesiones(sesiones) {
    try {
        fs.writeFileSync(RUTA_SESIONES, JSON.stringify(sesiones, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Error escribiendo sesiones:', error.message);
        return false;
    }
}

function limpiarSesionesExpiradas() {
    const sesiones = leerSesiones();
    let modificado = false;
    const ahora = Date.now();
    
    for (const [usuarioId, sesion] of Object.entries(sesiones)) {
        if (ahora - sesion.timestamp > TIEMPO_EXPIRACION) {
            delete sesiones[usuarioId];
            modificado = true;
            console.log(`🗑️ Sesión expirada para usuario: ${usuarioId}`);
        }
    }
    
    if (modificado) {
        escribirSesiones(sesiones);
    }
}

// ==================== FUNCIONES PÚBLICAS ====================

/**
 * Guarda o actualiza la sesión de paginación para un usuario
 * @param {number|string} usuarioId - ID de Telegram del usuario
 * @param {string} autor - Nombre del autor buscado
 * @param {Array} libros - Lista completa de libros (todos los resultados de Open Library)
 * @param {number} paginaActual - Página actual (0-indexada, 0 = primera página)
 * @param {number} totalLibros - Total de libros encontrados
 */
function guardarSesionAutor(usuarioId, autor, libros, paginaActual, totalLibros) {
    limpiarSesionesExpiradas();
    const sesiones = leerSesiones();
    
    sesiones[usuarioId] = {
        autor: autor,
        libros: libros,
        paginaActual: paginaActual,
        totalLibros: totalLibros,
        timestamp: Date.now()
    };
    
    escribirSesiones(sesiones);
    console.log(`💾 Sesión guardada para usuario ${usuarioId}: autor "${autor}", página ${paginaActual + 1}/${Math.ceil(totalLibros / 10)}`);
}

/**
 * Obtiene la sesión activa de un usuario
 * @param {number|string} usuarioId - ID de Telegram del usuario
 * @returns {Object|null} Sesión o null si no existe o expiró
 */
function obtenerSesionAutor(usuarioId) {
    limpiarSesionesExpiradas();
    const sesiones = leerSesiones();
    const sesion = sesiones[usuarioId];
    
    if (!sesion) {
        console.log(`⚠️ No hay sesión activa para usuario ${usuarioId}`);
        return null;
    }
    
    return sesion;
}

/**
 * Elimina la sesión de un usuario
 * @param {number|string} usuarioId - ID de Telegram del usuario
 */
function eliminarSesionAutor(usuarioId) {
    const sesiones = leerSesiones();
    if (sesiones[usuarioId]) {
        delete sesiones[usuarioId];
        escribirSesiones(sesiones);
        console.log(`🗑️ Sesión eliminada para usuario ${usuarioId}`);
    }
}

// ==================== EXPORTS ====================
module.exports = {
    guardarSesionAutor,
    obtenerSesionAutor,
    eliminarSesionAutor
};