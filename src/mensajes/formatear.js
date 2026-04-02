// ==================== IMPORTACIONES ====================
const { normalizarTitulo } = require('../buscar/gutendex');

console.log('📝 Módulo formatear.js cargado (FASE 3 - Formato compacto)');

// ==================== MENSAJES_ESPECIALES ====================
const MENSAJES_ESPECIALES = [
    {
        palabrasClave: ['principito', 'el principito'],
        mensaje: `ℹ️ *El Principito* no es de dominio público en EE.UU. (fuente de Project Gutenberg).\n\n📚 Prueba con "/autor Antoine de Saint-Exupéry" para ver otros libros del autor.`
    },
    {
        palabrasClave: ['harry potter', 'potter'],
        mensaje: `ℹ️ *Harry Potter* está protegido por derechos de autor.\n\n📚 Prueba con libros de fantasía en dominio público: "El Mago de Oz", "Alicia en el País de las Maravillas".`
    }
];

// ==================== FUNCION_FORMATEAR_LISTA_AUTOR_PAGINADA ====================
/**
 * Formatea una lista de libros con numeración y año (para paginación)
 * @param {string} autor - Nombre del autor
 * @param {Array} libros - Lista de libros (máximo 10 para una página)
 * @param {number} paginaInicio - Número inicial para la numeración (ej: 1, 11, 21)
 * @param {number} totalLibros - Total de libros encontrados
 * @returns {string} Mensaje formateado
 */
function formatearListaAutorPaginada(autor, libros, paginaInicio, totalLibros) {
    console.log(`📝 Formateando lista paginada: "${autor}" (${libros.length} libros, inicio #${paginaInicio})`);
    
    if (!libros || libros.length === 0) {
        return `📚 *No encontré libros para* "${autor}"\n\n💡 Probá con otro nombre.`;
    }
    
    let resultado = `📚 *${autor}* (${totalLibros} libro${totalLibros !== 1 ? 's' : ''})\n\n`;
    
    libros.forEach((libro, idx) => {
        const numero = paginaInicio + idx;
        const anio = libro.anio ? ` (${libro.anio})` : '';
        resultado += `${numero}. *${libro.titulo}*${anio}\n`;
    });
    
    resultado += `\n👉 Para ver detalles de un libro, usá: /titulo "nombre exacto del libro"`;
    
    return resultado;
}

// Exportar la nueva función junto con las existentes
module.exports = {
    formatearListaAutor,
    formatearListaAutorPaginada,  // NUEVA
    formatearLibroUnico,
    formatearErrorGutendex,
    obtenerMensajeEspecial
};

// ==================== FUNCION_FORMATEAR_LIBRO_UNICO ====================
function formatearLibroUnico(libro, sugerirAutor = null) {
    console.log(`📝 Formateando libro único: "${libro.titulo}"`);
    
    let resultado = `📖 *${libro.titulo}*\n`;
    resultado += `👤 ${libro.autor}`;
    if (libro.anio) resultado += ` (${libro.anio})`;
    resultado += `\n\n`;
    
    // Enlaces
    const enlaces = [];
    if (libro.enlaceHTML) enlaces.push(`🌐 [Leer online](${libro.enlaceHTML})`);
    if (libro.enlaceEPUB) enlaces.push(`📱 [Descargar EPUB](${libro.enlaceEPUB})`);
    
    if (enlaces.length > 0) {
        resultado += enlaces.join('  |  ');
        resultado += `\n\n`;
    } else {
        resultado += `📖 *Sin enlaces disponibles*\n\n`;
    }
    
    resultado += `🔗 Fuente: Project Gutenberg (Gutendex)`;
    
    // Sugerir búsqueda por autor
    if (sugerirAutor) {
        resultado += `\n\n👉 ¿Querés ver otros libros de ${libro.autor}? Usá /autor ${libro.autor}`;
    }
    
    return resultado;
}

// ==================== FUNCION_MENSAJE_ERROR_GUTENDEX ====================
function formatearErrorGutendex() {
    return `⚠️ La biblioteca no está disponible en este momento. Intentá más tarde.`;
}

// ==================== FUNCION_MENSAJE_ESPECIAL ====================
function obtenerMensajeEspecial(query) {
    const queryLower = query.toLowerCase();
    for (const item of MENSAJES_ESPECIALES) {
        for (const palabra of item.palabrasClave) {
            if (queryLower.includes(palabra)) {
                return item.mensaje;
            }
        }
    }
    return null;
}

// ==================== EXPORTS ====================
module.exports = {
    formatearListaAutor,
    formatearLibroUnico,
    formatearErrorGutendex,
    obtenerMensajeEspecial
};