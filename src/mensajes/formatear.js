// ==================== IMPORTACIONES ====================
const { Markup } = require('telegraf');

console.log('📦 Módulo formatear.js cargado (VERSIÓN LIMPIA - Solo funciones vivas)');

// ==================== FORMATEAR_LIBRO_UNICO_CON_BOTONES ====================
function formatearLibroUnicoConBotones(libro, mostrarComandos = true) {
    let mensaje = `📖 *${libro.titulo}*\n`;
    mensaje += `👤 *${libro.autor}*`;
    
    if (libro.anio) {
        mensaje += ` (${libro.anio})`;
    }
    mensaje += `\n\n`;
    
    // Descripción si existe
    if (libro.descripcion) {
        mensaje += `${libro.descripcion}\n\n`;
    }
    
    // Mostrar solo enlace HTML (lectura online) - EPUB eliminado porque nunca funcionó
    if (libro.enlaceHTML) {
        mensaje += `🌐 *Leer online:* [Versión web](${libro.enlaceHTML})\n`;
    }
    
    // Solo añadir salto de línea si hay enlace
    if (libro.enlaceHTML) {
        mensaje += `\n`;
    }
    
    if (mostrarComandos) {
        mensaje += `🔍 *¿Quiere más libros de este autor?*\n`;
        mensaje += `👉 /autor ${libro.autor}\n`;
    }
    
    return { mensaje, tieneEnlaces: !!libro.enlaceHTML };
}

// ==================== FORMATEAR_MENSAJE_AUTOR ====================
function formatearMensajeAutor(autor, libros, offset, totalLibros) {
    const librosPagina = libros.slice(offset, offset + 5);
    let mensaje = `📚 BÚSQUEDA POR AUTOR: "${autor}"\n\n`;
    mensaje += `(${totalLibros} libros encontrados)\n\n`;
    
    librosPagina.forEach((libro, idx) => {
        const numero = offset + idx + 1;
        const año = libro.anio ? ` (${libro.anio})` : '';
        mensaje += `${numero}. ${libro.titulo}${año}\n`;
    });
    
    mensaje += `\n📖 Si ves el mismo título varias veces, mirá el autor y el año. Ahí está la diferencia. La elección es tuya. Es un placer ayudarte.\n`;
    mensaje += `\n👇 Toca el número del libro que quieres ver`;
    return mensaje;
}

// ==================== FORMATEAR_MENSAJE_TITULO ====================
function formatearMensajeTitulo(titulo, libros, offset, totalLibros, prefijo = '') {
    const librosPagina = libros.slice(offset, offset + 5);
    let mensaje = prefijo + `📚 BÚSQUEDA POR TÍTULO: "${titulo}"\n\n`;
    mensaje += `(${totalLibros} libros encontrados)\n\n`;
    
    librosPagina.forEach((libro, idx) => {
        const numero = offset + idx + 1;
        const año = libro.anio ? ` (${libro.anio})` : '';
        mensaje += `${numero}. ${libro.titulo} - ${libro.autor}${año}\n`;
    });
    
    mensaje += `\n📖 Si ves el mismo título varias veces, mirá el autor y el año. Ahí está la diferencia. La elección es tuya. Es un placer ayudarte.\n`;
    mensaje += `\n👇 Toca el número del libro que quieres ver`;
    return mensaje;
}

// ==================== CREAR_TECLADO ====================
function crearTeclado(librosMostrados, offset, totalLibros, key, paginaActual, tipo) {
    const inline_keyboard = [];
    const botonesNumericos = [];
    
    for (let i = 0; i < librosMostrados.length; i++) {
        botonesNumericos.push({
            text: `${offset + i + 1}`,
            callback_data: `libro_${offset + i + 1}`
        });
    }
    inline_keyboard.push(botonesNumericos);
    
    if (offset + librosMostrados.length < totalLibros) {
        const label = tipo === 'autor' ? '📖 Ver más libros' : '📖 Ver más títulos';
        const cbPrefix = tipo === 'autor' ? 'mas_autor' : 'mas_titulo';
        inline_keyboard.push([{
            text: label,
            callback_data: `${cbPrefix}_${paginaActual + 1}`
        }]);
    }
    
    return { reply_markup: { inline_keyboard } };
}

// ==================== EDITAR_MENSAJE_SEGURO ====================
async function editarMensajeSeguro(ctx, mensaje, teclado) {
    try {
        await ctx.editMessageText(mensaje, teclado);
    } catch (e) {
        if (
            e.message.includes('message is not modified') ||
            e.message.includes('message to edit not found') ||
            e.message.includes('MESSAGE_ID_INVALID')
        ) {
            return;
        }
        throw e;
    }
}

// ==================== EXPORTS ====================
module.exports = {
    formatearLibroUnicoConBotones,
    formatearMensajeAutor,
    formatearMensajeTitulo,
    crearTeclado,
    editarMensajeSeguro
};