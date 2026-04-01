// ==================== IMPORTACIONES ====================
// No hay imports externos en este módulo

// ==================== CONFIGURACION ====================
console.log('📝 Módulo formatear.js cargado (FASE 2 - Formateo real)');

// ==================== FUNCION_FORMATEAR_RESULTADOS ====================
/**
 * Formatea una lista de libros para mostrarla en Telegram
 * @param {Array} libros - Lista de libros de Gutendex
 * @param {string} query - Término de búsqueda original
 * @returns {string} Mensaje formateado con Markdown
 */
function formatearResultados(libros, query) {
    console.log(`📝 Formateando ${libros.length} resultados para: "${query}"`);
    
    if (!libros || libros.length === 0) {
        const mensaje = `📚 *No encontré libros para* "${query}"\n\n` +
                       `💡 *Sugerencias:*\n` +
                       `• Verifica la ortografía\n` +
                       `• Prueba con otro título\n` +
                       `• Busca en inglés si es un autor clásico\n\n` +
                       `🔗 *Fuente:* Project Gutenberg (Gutendex)`;
        console.log(`📝 Mensaje: Sin resultados`);
        return mensaje;
    }
    
    // Encabezado
    let mensaje = `📚 *Resultados para* "${query}":\n\n`;
    
    // Procesar cada libro
    libros.forEach((libro, index) => {
        mensaje += formatearLibro(libro, index + 1);
        mensaje += '\n\n';
    });
    
    // Pie de página
    mensaje += `🔗 *Fuente:* Project Gutenberg (Gutendex)\n`;
    mensaje += `📖 *Total:* ${libros.length} libros encontrados`;
    
    console.log(`📝 Mensaje generado con ${libros.length} libros`);
    return mensaje;
}

// ==================== FUNCION_FORMATEAR_LIBRO ====================
/**
 * Formatea un solo libro con Markdown de Telegram
 * @param {Object} libro - Objeto libro con titulo, autor, anio, enlaces
 * @param {number} numero - Número del libro en la lista (opcional)
 * @returns {string} Libro formateado
 */
function formatearLibro(libro, numero = null) {
    const { titulo, autor, anio, enlaceHTML, enlaceEPUB } = libro;
    
    let resultado = '';
    
    // Número opcional
    if (numero) {
        resultado += `${numero}. `;
    }
    
    // Título en negrita
    resultado += `*${titulo}*\n`;
    
    // Autor y año
    resultado += `👤 ${autor}`;
    if (anio && anio !== 'Año desconocido') {
        resultado += ` (${anio})`;
    }
    resultado += '\n\n';
    
    // Enlaces
    const enlaces = [];
    
    if (enlaceHTML) {
        enlaces.push(`🌐 [Leer online](${enlaceHTML})`);
    }
    
    if (enlaceEPUB) {
        enlaces.push(`📱 [Descargar EPUB](${enlaceEPUB})`);
    }
    
    if (enlaces.length === 0) {
        resultado += `📖 *Sin enlaces disponibles* - Visita Project Gutenberg para buscar este libro.`;
    } else {
        resultado += enlaces.join('  |  ');
    }
    
    return resultado;
}

// ==================== EXPORTS ====================
module.exports = {
    formatearResultados
};