// ==================== IMPORTACIONES ====================
const { Markup } = require('telegraf');

// ==================== FUNCION_FORMATEAR_LISTA_AUTOR_CON_BOTONES ====================
function formatearListaAutorConBotones(autor, libros, pagina = 0, total = null) {
    const inicio = pagina * 5;
    const fin = inicio + 5;
    const librosPagina = libros.slice(inicio, fin);
    const totalLibros = total || libros.length;
    const totalPaginas = Math.ceil(totalLibros / 5);
    
    let mensaje = `📚 BÚSQUEDA EXACTA POR AUTOR: "${autor}"\n\n`;
    mensaje += `(${totalLibros} libros encontrados)\n\n`;
    
    librosPagina.forEach((libro, idx) => {
        const numero = inicio + idx + 1;
        const año = libro.anio ? ` (${libro.anio})` : '';
        mensaje += `${numero}. ${libro.titulo}${año}\n`;
    });
    
    mensaje += `\n👇 Toca el número del libro que quieres ver`;
    
    // Crear botones: 1 2 3 4 5 en una fila
    const botones = [];
    for (let i = 0; i < librosPagina.length; i++) {
        const numero = inicio + i + 1;
        botones.push(Markup.button.callback(`${numero}`, `libro_${numero}`));
    }
    
    // Si hay más páginas, añadir botón "📖 Ver más libros"
    const filas = [];
    if (botones.length > 0) {
        filas.push(botones);
    }
    if (pagina + 1 < totalPaginas) {
        filas.push([Markup.button.callback('📖 Ver más libros', `mas_autor_${autor}_${pagina + 1}`)]);
    }
    
    const teclado = Markup.inlineKeyboard(filas);
    
    return { mensaje, teclado, totalPaginas };
}

// ==================== FUNCION_FORMATEAR_LIBRO_UNICO_CON_BOTONES ====================
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
    
    // Mostrar enlaces de dominio público
    if (libro.enlaceHTML) {
        mensaje += `🌐 *Leer online:* [Versión web](${libro.enlaceHTML})\n`;
    }
    if (libro.enlaceEPUB) {
        mensaje += `📱 *Descargar EPUB:* [Para iPhone/Android](${libro.enlaceEPUB})\n`;
    }
    
    // Solo añadir salto de línea si hay enlaces
    if (libro.enlaceHTML || libro.enlaceEPUB) {
        mensaje += `\n`;
    }
    
    if (mostrarComandos) {
        mensaje += `🔍 *¿Quiere más libros de este autor?*\n`;
        mensaje += `👉 /autor ${libro.autor}\n`;
    }
    
    return { mensaje, tieneEnlaces: (libro.enlaceHTML || libro.enlaceEPUB) };
}

// ==================== FUNCION_FORMATEAR_ERROR ====================
function formatearErrorGutendex(autor) {
    return `⚠️ *No se pudo encontrar información para* "${autor}"\n\n💡 Intente con otro nombre o revise la ortografía.`;
}

// ==================== FUNCION_OBTENER_MENSAJE_ESPECIAL ====================
function obtenerMensajeEspecial(query) {
    const especiales = {
        "shakespeare": "📚 *William Shakespeare*\n\n¿Buscaba a Shakespeare? Pruebe con:\n`/autor William Shakespeare`",
        "cervantes": "📚 *Miguel de Cervantes*\n\n¿Buscaba a Cervantes? Pruebe con:\n`/autor Miguel de Cervantes`",
        "becquer": "📚 *Gustavo Adolfo Bécquer*\n\n¿Buscaba a Bécquer? Pruebe con:\n`/autor Gustavo Adolfo Becquer` (sin acento)"
    };
    
    const clave = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const [key, value] of Object.entries(especiales)) {
        if (clave.includes(key)) {
            return value;
        }
    }
    return null;
}

// ==================== EXPORTS ====================
module.exports = {
    formatearListaAutorConBotones,
    formatearLibroUnicoConBotones,
    formatearErrorGutendex,
    obtenerMensajeEspecial
};