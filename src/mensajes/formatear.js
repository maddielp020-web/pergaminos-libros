// ==================== IMPORTACIONES ====================
// No hay imports externos en FASE 1

// ==================== CONFIGURACION ====================
console.log('📝 Módulo formatear.js cargado (FASE 1 - Placeholder)');

// ==================== FUNCION_FORMATEAR ====================
/**
 * Formatea una lista de libros para mostrarla en Telegram
 * @param {Array} libros - Lista de libros de Gutendex
 * @returns {string} Mensaje formateado
 */
function formatearResultados(libros) {
    console.log(`📝 [PLACEHOLDER] Formateando ${libros.length} resultados`);
    
    if (!libros || libros.length === 0) {
        return '📚 *No se encontraron libros*\n\nIntenta con otro título.';
    }
    
    // TEMPORAL: Estructura básica para FASE 2
    // En la siguiente orden operativa se implementará formateo completo
    return `📚 *Resultados:* ${libros.length} libros encontrados.\n\n(FASE 2 - Formateo completo en desarrollo)`;
}

// ==================== EXPORTS ====================
module.exports = {
    formatearResultados
};