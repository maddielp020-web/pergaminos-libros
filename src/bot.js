// ==================== IMPORTACIONES ====================
const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config');
const { 
    buscarPorAutor: buscarPorAutorGutendex, 
    buscarPorTitulo: buscarPorTituloGutendex, 
    normalizarTexto 
} = require('./buscar/gutendex');
const { 
    formatearLibroUnicoConBotones 
} = require('./mensajes/formatear');
const { 
    buscarPorAutorConPaginacion, 
    buscarPorTitulo 
} = require('./buscar/openLibrary');
const {
    obtenerLibrosPorAutor,
    guardarLibrosPorAutor,
    obtenerEstadisticas,
    borrarTodo
} = require('./almacen/almacenManager');

// ==================== CONFIGURACION ====================
const bot = new Telegraf(BOT_TOKEN);
const ID_CREADOR = 2022025893;
const TIEMPO_EXPIRACION = 30 * 60 * 1000;

console.log('🤖 PergaminosLibros_Bot - Versión LIMPIA');
console.log('✅ Handlers separados | editMessageText | Sin duplicación');
console.log(`👑 ID Creador: ${ID_CREADOR}`);

// ==================== ESTADO_EN_MEMORIA ====================
const sesionesActivas = new Map();
const pendientes = new Map(); // FIX: evita race conditions

function guardarSesion(usuarioId, tipo, queryNormalizado, libros, totalLibros) {
    sesionesActivas.set(usuarioId, {
        tipo,
        query: queryNormalizado,
        libros,
        totalLibros,
        timestamp: Date.now()
    });
    console.log(`💾 Sesión: ${usuarioId} | ${tipo} | "${queryNormalizado}" | ${totalLibros} libros`);
}

function obtenerSesion(usuarioId) {
    const sesion = sesionesActivas.get(usuarioId);
    if (!sesion) return null;
    if (Date.now() - sesion.timestamp > TIEMPO_EXPIRACION) {
        sesionesActivas.delete(usuarioId);
        return null;
    }
    return sesion;
}

function limpiarSesion(usuarioId) {
    sesionesActivas.delete(usuarioId);
    pendientes.delete(usuarioId); // FIX: limpiar token pendiente también
}

// FIX: limpieza periódica para evitar fuga de memoria
setInterval(() => {
    const ahora = Date.now();
    for (const [id, s] of sesionesActivas) {
        if (ahora - s.timestamp > TIEMPO_EXPIRACION) {
            sesionesActivas.delete(id);
        }
    }
}, 10 * 60 * 1000);

// ==================== FUNCIONES_AUXILIARES ====================
function extraerPalabrasClave(frase, modo = 'simple') {
    const palabrasIgnorar = ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 
                              'de', 'del', 'y', 'a', 'ante', 'bajo', 'cabe', 'con', 
                              'contra', 'desde', 'durante', 'en', 'entre', 'hacia', 
                              'hasta', 'mediante', 'para', 'por', 'según', 'sin', 
                              'so', 'sobre', 'tras', 'vs', 'e', 'ni', 'o', 'u'];
    
    const palabras = frase.toLowerCase()
        .split(' ')
        .filter(p => /^\d+$/.test(p) || (p.length >= 3 && !palabrasIgnorar.includes(p)));
    
    if (modo === 'simple') {
        if (palabras.length === 0) return frase.toLowerCase().split(' ')[0] || '';
        return palabras.reduce((a, b) => a.length >= b.length ? a : b);
    }
    return palabras.slice(0, 3).join(' ');
}

// FIX: función unificada para crear teclados (elimina duplicación exacta)
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
        // FIX: callback_data usa solo el número de página (evita superar límite 64 bytes de Telegram)
        // La query se recupera desde la sesión en memoria
        const label = tipo === 'autor' ? '📖 Ver más libros' : '📖 Ver más títulos';
        const cbPrefix = tipo === 'autor' ? 'mas_autor' : 'mas_titulo';
        inline_keyboard.push([{
            text: label,
            callback_data: `${cbPrefix}_${paginaActual + 1}`
        }]);
    }
    
    return { reply_markup: { inline_keyboard } };
}

function formatearMensajeAutor(autor, libros, offset, totalLibros) {
    const librosPagina = libros.slice(offset, offset + 5);
    let mensaje = `📚 BÚSQUEDA POR AUTOR: "${autor}"\n\n`;
    mensaje += `(${totalLibros} libros encontrados)\n\n`;
    
    librosPagina.forEach((libro, idx) => {
        const numero = offset + idx + 1;
        const año = libro.anio ? ` (${libro.anio})` : '';
        mensaje += `${numero}. ${libro.titulo}${año}\n`;
    });
    
    mensaje += `\n👇 Toca el número del libro que quieres ver`;
    return mensaje;
}

function formatearMensajeTitulo(titulo, libros, offset, totalLibros, prefijo = '') {
    const librosPagina = libros.slice(offset, offset + 5);
    let mensaje = prefijo + `📚 BÚSQUEDA POR TÍTULO: "${titulo}"\n\n`;
    mensaje += `(${totalLibros} libros encontrados)\n\n`;
    
    librosPagina.forEach((libro, idx) => {
        const numero = offset + idx + 1;
        const año = libro.anio ? ` (${libro.anio})` : '';
        mensaje += `${numero}. ${libro.titulo} - ${libro.autor}${año}\n`;
    });
    
    mensaje += `\n👇 Toca el número del libro que quieres ver`;
    return mensaje;
}

// FIX: helper para editar mensajes sin crashear si el mensaje fue borrado
async function editarMensajeSeguro(ctx, mensaje, teclado) {
    try {
        await ctx.editMessageText(mensaje, teclado);
    } catch (e) {
        if (
            e.message.includes('message is not modified') ||
            e.message.includes('message to edit not found') ||
            e.message.includes('MESSAGE_ID_INVALID')
        ) {
            // ignorar silenciosamente — el mensaje ya no existe o no cambió
            return;
        }
        throw e;
    }
}

// ==================== HANDLER_START ====================
bot.command('start', async (ctx) => {
    limpiarSesion(ctx.from.id);
    await ctx.reply(
        '📖 ¡Bienvenido a PergaminosAbiertos!\n\n' +
        'Aquí encuentras libros en dominio público al instante.\n\n' +
        '📚 COMANDOS PRINCIPALES:\n\n' +
        '/autor Jose Marti\n→ Busca libros por autor\n\n' +
        '/titulo El Principito\n→ Busca libros por título\n\n' +
        '👇 Toca los botones numéricos para ver cada libro\n\n' +
        '📘 ¿Dudas? Escribe /ayuda\n\n' +
        '🔒 Solo mostramos libros en dominio público.'
    );
});

// ==================== HANDLER_AYUDA ====================
bot.command('ayuda', async (ctx) => {
    await ctx.reply(
        '📘 AYUDA DE PERGAMINOSLIBROS_BOT\n\n' +
        '🔹 COMANDOS DISPONIBLES:\n\n' +
        '/autor [nombre]\n→ Búsqueda por autor. Devuelve 5 libros.\n\n' +
        '/titulo [nombre]\n→ Búsqueda por título.\n\n' +
        '🔹 CÓMO FUNCIONA:\n\n' +
        '1. Usa cualquier comando\n' +
        '2. Toca el número del libro que quieras\n' +
        '3. Si hay más de 5, toca "📖 Ver más libros/títulos"\n\n' +
        '🔹 ¿PUEDO LEER O DESCARGAR?\n\n' +
        'Sí. Toca el enlace para leer online o descargar gratis.'
    );
});

// ==================== HANDLER_AUTOR ====================
bot.command('autor', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    const usuarioId = ctx.from.id;
    
    if (!query) {
        await ctx.reply('📖 Dame un nombre y te ayudo.\n\nEscribe /autor seguido del autor.\n\nPor ejemplo: /autor Jose Marti');
        return;
    }
    
    limpiarSesion(usuarioId);
    
    // FIX: token para evitar race condition entre búsquedas consecutivas rápidas
    const token = Date.now();
    pendientes.set(usuarioId, token);
    
    const autorNormalizado = query;
    console.log(`🔍 /autor: "${autorNormalizado}"`);
    
    // Verificar caché en disco
    let librosCache = obtenerLibrosPorAutor(autorNormalizado);
    
    if (librosCache && librosCache.length > 0) {
        if (pendientes.get(usuarioId) !== token) return;
        const mensaje = formatearMensajeAutor(autorNormalizado, librosCache, 0, librosCache.length);
        const teclado = crearTeclado(librosCache.slice(0, 5), 0, librosCache.length, autorNormalizado, 0, 'autor');
        guardarSesion(usuarioId, 'autor', autorNormalizado, librosCache, librosCache.length);
        await ctx.reply(mensaje, teclado);
        return;
    }
    
    // FIX: feedback visual mientras se busca
    let msgCarga;
    try {
        msgCarga = await ctx.reply('🔍 Buscando libros...');
    } catch (_) {}
    
    const borrarCarga = async () => {
        if (msgCarga) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, msgCarga.message_id); } catch (_) {}
            msgCarga = null;
        }
    };
    
    // Buscar en Open Library
    try {
        let primeraPagina = await buscarPorAutorConPaginacion(autorNormalizado, 'es', 0);
        let totalEncontrados = primeraPagina.totalEncontrados;
        let libros = primeraPagina.libros;
        
        if (libros.length === 0) {
            const paginaEn = await buscarPorAutorConPaginacion(autorNormalizado, 'en', 0);
            libros = paginaEn.libros;
            totalEncontrados = paginaEn.totalEncontrados;
        }
        
        if (libros.length > 0) {
            if (pendientes.get(usuarioId) !== token) { await borrarCarga(); return; }
            guardarLibrosPorAutor(autorNormalizado, libros);
            // FIX: usar libros.length como totalLibros — totalEncontrados viene de la API
            // pero en sesión solo tenemos los libros descargados realmente, no todos los de la API.
            // Si se paginara con totalEncontrados y libros.length < totalEncontrados, el slice devolvería vacío.
            const totalReal = libros.length;
            const mensaje = formatearMensajeAutor(autorNormalizado, libros, 0, totalReal);
            const teclado = crearTeclado(libros.slice(0, 5), 0, totalReal, autorNormalizado, 0, 'autor');
            guardarSesion(usuarioId, 'autor', autorNormalizado, libros, totalReal);
            await borrarCarga();
            await ctx.reply(mensaje, teclado);
            return;
        }
    } catch (error) {
        console.error(`❌ Error Open Library: ${error.message}`);
    }
    
    // Fallback a Gutendex
    try {
        let libros = await buscarPorAutorGutendex(autorNormalizado, 'es');
        if (libros.length === 0) libros = await buscarPorAutorGutendex(autorNormalizado, 'en');
        
        if (libros.length > 0) {
            if (pendientes.get(usuarioId) !== token) { await borrarCarga(); return; }
            guardarLibrosPorAutor(autorNormalizado, libros);
            const mensaje = formatearMensajeAutor(autorNormalizado, libros, 0, libros.length);
            const teclado = crearTeclado(libros.slice(0, 5), 0, libros.length, autorNormalizado, 0, 'autor');
            guardarSesion(usuarioId, 'autor', autorNormalizado, libros, libros.length);
            await borrarCarga();
            await ctx.reply(mensaje, teclado);
            return;
        }
    } catch (error) {
        console.error(`❌ Error Gutendex: ${error.message}`);
    }
    
    await borrarCarga();
    await ctx.reply(`📚 No encontré libros para "${query}"\n\n💡 Probá con otro nombre.`);
});

// ==================== HANDLER_TITULO ====================
bot.command('titulo', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    const usuarioId = ctx.from.id;
    
    if (!query) {
        await ctx.reply('📖 Dame un título y lo busco.\n\nEscribe /titulo seguido del libro.\n\nPor ejemplo: /titulo El Principito');
        return;
    }
    
    limpiarSesion(usuarioId);
    
    // FIX: token para evitar race condition
    const token = Date.now();
    pendientes.set(usuarioId, token);
    
    const tituloOriginal = query;
    const tituloNormalizado = normalizarTexto(tituloOriginal);
    console.log(`🔍 /titulo: "${tituloOriginal}" → normalizado: "${tituloNormalizado}"`);
    
    // Verificar caché en disco
    let librosCache = obtenerLibrosPorAutor(`titulo_${tituloNormalizado}`);
    
    if (librosCache && librosCache.length > 0) {
        if (pendientes.get(usuarioId) !== token) return;
        const mensaje = formatearMensajeTitulo(tituloOriginal, librosCache, 0, librosCache.length);
        const teclado = crearTeclado(librosCache.slice(0, 5), 0, librosCache.length, tituloOriginal, 0, 'titulo');
        guardarSesion(usuarioId, 'titulo', tituloNormalizado, librosCache, librosCache.length);
        await ctx.reply(mensaje, teclado);
        return;
    }
    
    // FIX: feedback visual mientras se busca
    let msgCarga;
    try {
        msgCarga = await ctx.reply('🔍 Buscando título...');
    } catch (_) {}
    
    const borrarCarga = async () => {
        if (msgCarga) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, msgCarga.message_id); } catch (_) {}
            msgCarga = null;
        }
    };
    
    let libros = [];
    let prefijo = '';
    
    // Buscar en Open Library
    try {
        libros = await buscarPorTitulo(tituloNormalizado, 'es');
        if (libros.length === 0) libros = await buscarPorTitulo(tituloNormalizado, 'en');
        
        if (libros.length === 0) {
            const palabraClave = extraerPalabrasClave(tituloNormalizado, 'simple');
            if (palabraClave && palabraClave !== tituloNormalizado) {
                console.log(`🔄 Reintentando con palabra clave: "${palabraClave}"`);
                libros = await buscarPorTitulo(palabraClave, 'es');
                if (libros.length === 0) libros = await buscarPorTitulo(palabraClave, 'en');
                prefijo = `📌 No encontré el título exacto. Mostrando resultados para "${palabraClave}".\n\n`;
            }
        }
        
        if (libros.length > 0) {
            if (pendientes.get(usuarioId) !== token) { await borrarCarga(); return; }
            guardarLibrosPorAutor(`titulo_${tituloNormalizado}`, libros);
            const mensaje = formatearMensajeTitulo(tituloOriginal, libros, 0, libros.length, prefijo);
            const teclado = crearTeclado(libros.slice(0, 5), 0, libros.length, tituloOriginal, 0, 'titulo');
            guardarSesion(usuarioId, 'titulo', tituloNormalizado, libros, libros.length);
            await borrarCarga();
            await ctx.reply(mensaje, teclado);
            return;
        }
    } catch (error) {
        console.error(`❌ Error Open Library: ${error.message}`);
    }
    
    // Fallback a Gutendex
    try {
        console.log(`🔄 Intentando Gutendex para: "${tituloNormalizado}"`);
        let librosGutendex = await buscarPorTituloGutendex(tituloNormalizado, 'es');
        if (librosGutendex.length === 0) librosGutendex = await buscarPorTituloGutendex(tituloNormalizado, 'en');
        
        if (librosGutendex.length > 0) {
            if (pendientes.get(usuarioId) !== token) { await borrarCarga(); return; }
            guardarLibrosPorAutor(`titulo_${tituloNormalizado}`, librosGutendex);
            const mensaje = formatearMensajeTitulo(tituloOriginal, librosGutendex, 0, librosGutendex.length, '📚 BÚSQUEDA POR TÍTULO (Gutendex):\n\n');
            const teclado = crearTeclado(librosGutendex.slice(0, 5), 0, librosGutendex.length, tituloOriginal, 0, 'titulo');
            guardarSesion(usuarioId, 'titulo', tituloNormalizado, librosGutendex, librosGutendex.length);
            await borrarCarga();
            await ctx.reply(mensaje, teclado);
            return;
        }
    } catch (error) {
        console.error(`❌ Error Gutendex: ${error.message}`);
    }
    
    await borrarCarga();
    await ctx.reply(
        `📚 No encontré libros para "${query}"\n\n` +
        `📘 Posibles razones:\n- El libro no está en dominio público\n- El título tiene otra edición\n\n` +
        `🔍 Sugerencias:\n- Usa /autor si conoces el autor\n- Prueba con palabras más cortas`
    );
});

// ==================== CALLBACK_MAS_AUTOR ====================
// FIX: callback_data simplificado — solo lleva el número de página, la query viene de la sesión
bot.action(/^mas_autor_(\d+)$/, async (ctx) => {
    const paginaActual = parseInt(ctx.match[1]);
    const usuarioId = ctx.from.id;
    const sesion = obtenerSesion(usuarioId);
    
    if (!sesion || sesion.tipo !== 'autor') {
        await ctx.answerCbQuery('Sesión expirada');
        await ctx.reply('❓ Primero buscá al autor con: /autor [nombre]');
        return;
    }
    
    const offset = paginaActual * 5;
    if (offset >= sesion.totalLibros) {
        await ctx.answerCbQuery('No hay más libros');
        return;
    }
    
    const librosPagina = sesion.libros.slice(offset, offset + 5);
    if (librosPagina.length === 0) {
        await ctx.answerCbQuery('No hay más libros');
        return;
    }
    
    const mensaje = formatearMensajeAutor(sesion.query, sesion.libros, offset, sesion.totalLibros);
    const teclado = crearTeclado(librosPagina, offset, sesion.totalLibros, sesion.query, paginaActual, 'autor');
    guardarSesion(usuarioId, 'autor', sesion.query, sesion.libros, sesion.totalLibros);
    
    await ctx.answerCbQuery(`Página ${paginaActual + 1}`);
    await editarMensajeSeguro(ctx, mensaje, teclado);
});

// ==================== CALLBACK_MAS_TITULO ====================
// FIX: callback_data simplificado — solo lleva el número de página, la query viene de la sesión
bot.action(/^mas_titulo_(\d+)$/, async (ctx) => {
    const paginaActual = parseInt(ctx.match[1]);
    const usuarioId = ctx.from.id;
    const sesion = obtenerSesion(usuarioId);
    
    if (!sesion || sesion.tipo !== 'titulo') {
        await ctx.answerCbQuery('Sesión expirada');
        await ctx.reply('❓ Primero buscá el título con: /titulo [nombre]');
        return;
    }
    
    const offset = paginaActual * 5;
    if (offset >= sesion.totalLibros) {
        await ctx.answerCbQuery('No hay más títulos');
        return;
    }
    
    const librosPagina = sesion.libros.slice(offset, offset + 5);
    if (librosPagina.length === 0) {
        await ctx.answerCbQuery('No hay más títulos');
        return;
    }
    
    const tituloMostrado = sesion.query;
    const mensaje = formatearMensajeTitulo(tituloMostrado, sesion.libros, offset, sesion.totalLibros);
    const teclado = crearTeclado(librosPagina, offset, sesion.totalLibros, tituloMostrado, paginaActual, 'titulo');
    guardarSesion(usuarioId, 'titulo', sesion.query, sesion.libros, sesion.totalLibros);
    
    await ctx.answerCbQuery(`Página ${paginaActual + 1}`);
    await editarMensajeSeguro(ctx, mensaje, teclado);
});

// ==================== CALLBACK_LIBRO ====================
bot.action(/^libro_(\d+)$/, async (ctx) => {
    const numero = parseInt(ctx.match[1]);
    const usuarioId = ctx.from.id;
    const sesion = obtenerSesion(usuarioId);
    
    if (!sesion) {
        await ctx.answerCbQuery('Sesión expirada');
        await ctx.reply('❓ Primero buscá con /autor o /titulo');
        return;
    }
    
    const indice = numero - 1;
    if (indice >= sesion.libros.length) {
        await ctx.answerCbQuery('Libro no disponible');
        return;
    }
    
    const libro = sesion.libros[indice];

    // FIX: protección ante retorno inesperado de formatearLibroUnicoConBotones
    const resultado = formatearLibroUnicoConBotones(libro, false);
    const mensaje = typeof resultado === 'string' ? resultado : resultado?.mensaje;

    if (!mensaje) {
        await ctx.answerCbQuery('Error al formatear libro');
        console.error(`❌ formatearLibroUnicoConBotones retornó valor inesperado:`, resultado);
        return;
    }
    
    await ctx.answerCbQuery(`📖 ${libro.titulo.substring(0, 50)}`);
    await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// ==================== HANDLERS_ADMIN ====================
bot.command('ver_almacen', async (ctx) => {
    if (ctx.from.id !== ID_CREADOR) return;
    const stats = obtenerEstadisticas();
    await ctx.reply(`📊 *Almacén:* ${stats.autores} autores, ${stats.titulos} títulos`, { parse_mode: 'Markdown' });
});

bot.command('borrar_todo', async (ctx) => {
    if (ctx.from.id !== ID_CREADOR) return;
    const args = ctx.message.text.split(' ').slice(1);
    if (args[0] !== 'CONFIRMAR') {
        await ctx.reply('⚠️ Usá `/borrar_todo CONFIRMAR` para confirmar');
        return;
    }
    borrarTodo();
    sesionesActivas.clear();
    pendientes.clear();
    await ctx.reply('✅ Almacén y sesiones vaciados');
});

// ==================== EXPORTS ====================
module.exports = bot;