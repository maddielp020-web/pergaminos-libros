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

// ==================== FUNCION_FORMATEAR_LISTA_AUTOR ====================
function formatearListaAutor(autor, libros) {
    console.log(`📝 Formateando lista de autor: "${autor}" (${libros.length} libros)`);
    
    if (!libros || libros.length === 0) {
        return `📚 *No encontré libros para* "${autor}"\n\n💡 Probá con otro nombre o usá "/titulo [título]".`;
    }
    
    // Título con cantidad
    let resultado = `📚 *${autor}* (${libros.length} libro${libros.length !== 1 ? 's' : ''})\n\n`;
    
    // Lista compacta de libros
    libros.forEach((libro, idx) => {
        const anio = libro.anio ? ` (${libro.anio})` : '';
        resultado += `${idx + 1}. *${libro.titulo}*${anio}\n`;
        
        // Enlaces compactos
        const enlaces = [];
        if (libro.enlaceHTML) enlaces.push(`[Leer](${libro.enlaceHTML})`);
        if (libro.enlaceEPUB) enlaces.push(`[EPUB](${libro.enlaceEPUB})`);
        if (enlaces.length > 0) {
            resultado += `   🔗 ${enlaces.join(' | ')}\n`;
        }
        resultado += '\n';
    });
    
    resultado += `👉 Usá /libro [número] para obtener el libro completo.`;
    
    return resultado;
}

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