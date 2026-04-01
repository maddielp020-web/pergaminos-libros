// ==================== IMPORTACIONES ====================
// No hay imports externos en este módulo

// ==================== CONFIGURACION ====================
console.log('📝 Módulo formatear.js cargado (FASE 2.1 - Mensajes mejorados)');

// ==================== LIBROS_NO_DISPONIBLES ====================
const MENSAJES_ESPECIALES = [
    {
        palabrasClave: ['principito', 'el principito', 'little prince'],
        mensaje: `ℹ️ *Sobre "El Principito":*\n\n` +
                 `Este libro de Antoine de Saint-Exupéry fue publicado en 1943 y ` +
                 `**no es de dominio público en Estados Unidos** (fuente de Project Gutenberg).\n\n` +
                 `📚 *Alternativas:*\n` +
                 `• Busca en tu biblioteca local\n` +
                 `• Consulta Archive.org\n` +
                 `• Versiones digitales pueden estar disponibles en otras plataformas\n\n` +
                 `🔍 *Sugiero probar con:*\n` +
                 `• "/buscar Antoine de Saint-Exupéry" (para ver otros libros del autor)\n` +
                 `• Otros clásicos que SÍ están en dominio público: El Quijote, Frankenstein, Drácula`
    },
    {
        palabrasClave: ['harry potter', 'potter'],
        mensaje: `ℹ️ *Sobre "Harry Potter":*\n\n` +
                 `Las obras de J.K. Rowling están protegidas por derechos de autor ` +
                 `y **no son de dominio público**.\n\n` +
                 `📚 *Alternativas:*\n` +
                 `• Compra los libros en librerías\n` +
                 `• Consulta tu biblioteca local\n` +
                 `• Explora libros de fantasía en dominio público: "El Hobbit" no está, ` +
                 `pero puedes probar con "La Divina Comedia", "El Mago de Oz" o "Las Mil y Una Noches"`
    },
    {
        palabrasClave: ['1984', 'orwell'],
        mensaje: `ℹ️ *Sobre "1984" de George Orwell:*\n\n` +
                 `Este libro fue publicado en 1949 y **no es de dominio público** en muchos países.\n\n` +
                 `📚 *Alternativas:*\n` +
                 `• Puedes encontrar versiones de pago en librerías digitales\n` +
                 `• En Project Gutenberg hay libros relacionados como "Un Mundo Feliz" de Aldous Huxley ` +
                 `(depende del país, puede no estar disponible)\n` +
                 `• Busca ensayos de Orwell que sí son de dominio público\n\n` +
                 `🔍 *Prueba con:* "/buscar George Orwell" para ver qué hay disponible`
    }
];

// ==================== FUNCION_FORMATEAR_RESULTADOS ====================
/**
 * Formatea una lista de libros para mostrarla en Telegram
 * @param {Array} libros - Lista de libros de Gutendex
 * @param {string} query - Término de búsqueda original
 * @param {Object} normalizada - Resultado de normalizarConsulta (opcional)
 * @returns {string} Mensaje formateado con Markdown
 */
function formatearResultados(libros, query, normalizada = null) {
    console.log(`📝 Formateando ${libros.length} resultados para: "${query}"`);
    
    // Verificar si hay mensaje especial para esta consulta
    const mensajeEspecial = obtenerMensajeEspecial(query);
    if (mensajeEspecial && libros.length === 0) {
        console.log(`📝 Mostrando mensaje especial para: "${query}"`);
        return mensajeEspecial;
    }
    
    if (!libros || libros.length === 0) {
        let mensaje = `📚 *No encontré libros para* "${query}"\n\n`;
        
        if (normalizada && normalizada.limpia !== query && normalizada.limpia !== '') {
            mensaje += `💡 *Probaste buscando:* "${normalizada.limpia}"\n`;
            mensaje += `🔍 Si no funciona, intenta con otro término.\n\n`;
        } else {
            mensaje += `💡 *Sugerencias:*\n` +
                       `• Verifica la ortografía\n` +
                       `• Prueba con otro título\n` +
                       `• Busca por autor si conoces el nombre\n` +
                       `• Prueba en inglés si es un autor clásico\n\n`;
        }
        
        mensaje += `🔗 *Fuente:* Project Gutenberg (Gutendex)`;
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
    
    // Añadir instrucciones para iPhone si hay libros con EPUB
    const tieneEPUB = libros.some(libro => libro.enlaceEPUB);
    if (tieneEPUB) {
        mensaje += obtenerInstruccionesIPhone();
    }
    
    console.log(`📝 Mensaje generado con ${libros.length} libros`);
    return mensaje;
}

// ==================== FUNCION_FORMATEAR_LIBRO ====================
/**
 * Formatea un solo libro con Markdown de Telegram
 * @param {Object} libro - Objeto libro con titulo, autor, idioma, enlaces
 * @param {number} numero - Número del libro en la lista (opcional)
 * @returns {string} Libro formateado
 */
function formatearLibro(libro, numero = null) {
    const { titulo, autor, idioma, enlaceHTML, enlaceEPUB } = libro;
    
    let resultado = '';
    
    // Número opcional
    if (numero) {
        resultado += `${numero}. `;
    }
    
    // Título en negrita
    resultado += `*${titulo}*\n`;
    
    // Autor
    resultado += `👤 ${autor}\n`;
    
    // Idioma (mapear código a nombre)
    let idiomaNombre = idioma;
    if (idioma === 'es') idiomaNombre = 'español';
    else if (idioma === 'en') idiomaNombre = 'inglés';
    else if (idioma === 'fr') idiomaNombre = 'francés';
    else if (idioma === 'de') idiomaNombre = 'alemán';
    else if (idioma === 'it') idiomaNombre = 'italiano';
    else if (idioma === 'pt') idiomaNombre = 'portugués';
    
    resultado += `🌐 *Idioma:* ${idiomaNombre}\n\n`;
    
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

// ==================== FUNCION_MENSAJE_ESPECIAL ====================
/**
 * Obtiene un mensaje especial para libros conocidos no disponibles
 * @param {string} query - Consulta original
 * @returns {string|null} Mensaje especial o null
 */
function obtenerMensajeEspecial(query) {
    const queryLower = query.toLowerCase();
    
    for (const item of MENSAJES_ESPECIALES) {
        for (const palabra of item.palabrasClave) {
            if (queryLower.includes(palabra)) {
                console.log(`📝 Mensaje especial activado para: "${palabra}"`);
                return item.mensaje;
            }
        }
    }
    
    return null;
}

// ==================== FUNCION_INSTRUCCIONES_IPHONE ====================
/**
 * Genera instrucciones para descarga en iPhone
 * @returns {string} Instrucciones formateadas
 */
function obtenerInstruccionesIPhone() {
    return `\n\n📱 *Para descargar en iPhone:*\n` +
           `1. Toca el enlace EPUB\n` +
           `2. Abre en Safari (si no se abre automáticamente)\n` +
           `3. Espera a que termine la descarga\n` +
           `4. Abre en la app "Libros" para leerlo\n\n` +
           `💡 *Consejo:* Si la descarga no empieza, mantén presionado el enlace y selecciona "Descargar archivo"`;
}

// ==================== EXPORTS ====================
module.exports = {
    formatearResultados,
    formatearLibro,
    obtenerMensajeEspecial,
    obtenerInstruccionesIPhone
};