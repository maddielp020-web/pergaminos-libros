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
    
    mensaje += `\n📖 Si ves el mismo título varias veces, mirá el autor y el año. Ahí está la diferencia. La elección es tuya. Es un placer ayudarte.\n`;
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
    
    mensaje += `\n📖 Si ves el mismo título varias veces, mirá el autor y el año. Ahí está la diferencia. La elección es tuya. Es un placer ayudarte.\n`;
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
        '📖 PergaminosAbiertos\n' +
        'Un lugar sin ruido para leer lo que el tiempo no pudo borrar.\n\n' +
        '📚 Busca entre el polvo y la tinta:\n' +
        '/autor Antonio Machado — Para escuchar al poeta.\n' +
        '/titulo Drácula — Para sentir el frío de Transilvania.\n\n' +
        '👇 Si prefieres dejarte sorprender, los botones numéricos esconden una historia distinta cada vez.\n\n' +
        '🕯️ Aquí solo guardamos lo que ya es de todos. Lo eterno. Lo libre.\n\n' +
        '📘 ¿No sabes por dónde empezar? Toca /ayuda.\n\n' +
        '📬 ¿Echas de menos algún olor a papel viejo? Escríbeme /feedback. Esto lo cuidamos entre todos.'
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
        await ctx.reply(
            '🕯️ Silencio en la estantería... pero necesito saber a quién buscas.\n\n' +
            'Prueba con: /autor Nombre Apellido\n' +
            '(Como cuando le dices al bibliotecario el nombre completo del autor).\n\n' +
            'Ejemplo: /autor Emily Dickinson — La poeta del guion largo.'
        );
        return;
    }
    
    limpiarSesion(usuarioId);
    
    // FIX: token para evitar race condition entre búsquedas consecutivas rápidas
    const token = Date.now();
    pendientes.set(usuarioId, token);
    
    const autorNormalizado = query;
    console.log(`🔍 /autor: "${autorNormalizado}"`);
    
    // Verificar caché en disco
    let librosCache = await obtenerLibrosPorAutor(autorNormalizado);
    
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
    
    // Buscar en Open Library — acumular hasta 300 libros para paginación completa
    try {
        const MAX_LIBROS = 300;
        let idioma = 'es';
        let primeraPagina = await buscarPorAutorConPaginacion(autorNormalizado, 'es', 0);
        let libros = primeraPagina.libros;
        let totalEncontrados = primeraPagina.totalEncontrados;

        if (libros.length === 0) {
            const paginaEn = await buscarPorAutorConPaginacion(autorNormalizado, 'en', 0);
            libros = paginaEn.libros;
            totalEncontrados = paginaEn.totalEncontrados;
            idioma = 'en';
        }

        // Si hay más páginas en la API, seguir pidiendo hasta MAX_LIBROS
        if (libros.length > 0 && totalEncontrados > libros.length) {
            let paginaApi = 1;
            while (libros.length < MAX_LIBROS && libros.length < totalEncontrados && paginaApi < 20) {
                if (pendientes.get(usuarioId) !== token) { await borrarCarga(); return; }
                try {
                    const siguiente = await buscarPorAutorConPaginacion(autorNormalizado, idioma, paginaApi);
                    if (!siguiente.libros || siguiente.libros.length === 0) break;
                    libros = libros.concat(siguiente.libros);
                    paginaApi++;
                } catch (_) { break; }
            }
            libros = libros.slice(0, MAX_LIBROS);
        }

        if (libros.length > 0) {
            if (pendientes.get(usuarioId) !== token) { await borrarCarga(); return; }
            await guardarLibrosPorAutor(autorNormalizado, libros);
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
            await guardarLibrosPorAutor(autorNormalizado, libros);
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
        await ctx.reply(
            '🕯️ Silencio en la estantería... pero necesito saber qué libro buscas.\n\n' +
            'Prueba con: /titulo Nombre del Libro\n' +
            '(Como cuando le dices al bibliotecario el título exacto).\n\n' +
            'Ejemplo: /titulo Moby Dick — La ballena blanca te espera.'
        );
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
    let librosCache = await obtenerLibrosPorAutor(`titulo_${tituloNormalizado}`);
    
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
        msgCarga = await ctx.reply('🔍 Buscando título exacto...');
    } catch (_) {}
    
    const borrarCarga = async () => {
        if (msgCarga) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, msgCarga.message_id); } catch (_) {}
            msgCarga = null;
        }
    };
    
    let libros = [];
    
    // Buscar en Open Library (SOLO TÍTULO EXACTO)
    try {
        libros = await buscarPorTitulo(tituloNormalizado, 'es');
        if (libros.length === 0) libros = await buscarPorTitulo(tituloNormalizado, 'en');
        
        if (libros.length > 0) {
            if (pendientes.get(usuarioId) !== token) { await borrarCarga(); return; }
            await guardarLibrosPorAutor(`titulo_${tituloNormalizado}`, libros);
            const mensaje = formatearMensajeTitulo(tituloOriginal, libros, 0, libros.length);
            const teclado = crearTeclado(libros.slice(0, 5), 0, libros.length, tituloOriginal, 0, 'titulo');
            guardarSesion(usuarioId, 'titulo', tituloNormalizado, libros, libros.length);
            await borrarCarga();
            await ctx.reply(mensaje, teclado);
            return;
        }
    } catch (error) {
        console.error(`❌ Error Open Library: ${error.message}`);
    }
    
    // Si no hay coincidencia exacta, NO buscar automáticamente.
    // Mostrar mensaje de confirmación con palabra clave.
    await borrarCarga();
    
    const palabraClave = extraerPalabrasClave(tituloNormalizado, 'simple');
    
    // Guardar estado temporal para los callbacks
    guardarSesion(usuarioId, 'pendiente_confirmacion', tituloNormalizado, {
        tituloOriginal: tituloOriginal,
        palabraClave: palabraClave,
        token: token
    }, 1);
    
    const mensajeConfirmacion = 
        `🕯️ He revisado los estantes altos y bajos... y no encuentro un ejemplar exacto de "${tituloOriginal}".\n\n` +
        `A veces los títulos viajan con erratas, o duermen con otro nombre en los registros antiguos.\n\n` +
        `¿Quieres que busque entre los lomos cercanos? Podría encontrar algo con la palabra "${palabraClave}".`;
    
    const tecladoConfirmacion = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔍 Sí, busca entre los lomos cercanos', callback_data: `confirmar_titulo_palabra_clave` }],
                [{ text: '🕯️ No, gracias. Volveré a mirar yo.', callback_data: `cancelar_titulo_palabra_clave` }]
            ]
        }
    };
    
    await ctx.reply(mensajeConfirmacion, tecladoConfirmacion);
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

// ==================== CALLBACK_CONFIRMAR_TITULO ====================
bot.action('confirmar_titulo_palabra_clave', async (ctx) => {
    const usuarioId = ctx.from.id;
    const sesion = obtenerSesion(usuarioId);
    
    if (!sesion || sesion.tipo !== 'pendiente_confirmacion') {
        await ctx.answerCbQuery('Sesión expirada');
        await ctx.reply('❓ Primero buscá un título con /titulo [nombre]');
        return;
    }
    
    const { tituloOriginal, palabraClave, token } = sesion.libros;
    
    await ctx.answerCbQuery();
    
    // Mensaje de transición
    await ctx.reply(
        `🕯️ Me adentro en los pasillos de títulos parecidos...\n\n` +
        `Buscaré todo lo que contenga "${palabraClave}". A veces los tesoros están mal etiquetados.\n\n` +
        `Aquí va lo que encontré:`
    );
        
    // Limpiar sesión anterior
    limpiarSesion(usuarioId);
    
    // FIX: feedback visual mientras se busca
    let msgCarga;
    try {
        msgCarga = await ctx.reply('🔍 Buscando por palabra clave...');
    } catch (_) {}
    
    const borrarCarga = async () => {
        if (msgCarga) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, msgCarga.message_id); } catch (_) {}
            msgCarga = null;
        }
    };
    
    let libros = [];
    let prefijo = `📚 Estos son los libros que contienen "${palabraClave}" en el título.\n\n` +
        `(No son exactos, pero algo de su esencia comparten).\n\n` +
        `📖 Si ves el mismo título repetido, fíjate en el autor y el año. Ahí vive la diferencia. La elección es tuya.\n\n` +
        `👇 Toca el número del que quieras abrir:\n\n`;
    
    // Buscar en Open Library por palabra clave
    try {
        libros = await buscarPorTitulo(palabraClave, 'es');
        if (libros.length === 0) libros = await buscarPorTitulo(palabraClave, 'en');
        
        if (libros.length > 0) {
            const tituloClave = `titulo_${normalizarTexto(palabraClave)}`;
            await guardarLibrosPorAutor(tituloClave, libros);
            const mensaje = formatearMensajeTitulo(palabraClave, libros, 0, libros.length, prefijo);
            const teclado = crearTeclado(libros.slice(0, 5), 0, libros.length, palabraClave, 0, 'titulo');
            guardarSesion(usuarioId, 'titulo', normalizarTexto(palabraClave), libros, libros.length);
            await borrarCarga();
            await ctx.reply(mensaje, teclado);
            return;
        }
    } catch (error) {
        console.error(`❌ Error Open Library (palabra clave): ${error.message}`);
    }
    
    // Fallback a Gutendex
    try {
        console.log(`🔄 Intentando Gutendex para palabra clave: "${palabraClave}"`);
        let librosGutendex = await buscarPorTituloGutendex(palabraClave, 'es');
        if (librosGutendex.length === 0) librosGutendex = await buscarPorTituloGutendex(palabraClave, 'en');
        
        if (librosGutendex.length > 0) {
            const tituloClave = `titulo_${normalizarTexto(palabraClave)}`;
            await guardarLibrosPorAutor(tituloClave, librosGutendex);
            const mensaje = formatearMensajeTitulo(palabraClave, librosGutendex, 0, librosGutendex.length, '📚 BÚSQUEDA POR PALABRA CLAVE (Gutendex):\n\n');
            const teclado = crearTeclado(librosGutendex.slice(0, 5), 0, librosGutendex.length, palabraClave, 0, 'titulo');
            guardarSesion(usuarioId, 'titulo', normalizarTexto(palabraClave), librosGutendex, librosGutendex.length);
            await borrarCarga();
            await ctx.reply(mensaje, teclado);
            return;
        }
    } catch (error) {
        console.error(`❌ Error Gutendex (palabra clave): ${error.message}`);
    }
    
    await borrarCarga();
    await ctx.reply(
        `🕯️ Silencio también en los pasillos cercanos... ni rastro de "${palabraClave}".\n\n` +
        `A veces ocurre. Puede que el libro aún no sea de todos (dominio público), o que use otro nombre en esta biblioteca.\n\n` +
        `Si sabes quién lo escribió, prueba con /autor Nombre.\n` +
        `O si quieres, volvemos a intentarlo con otra palabra.\n\n` +
        `Estoy aquí, entre el polvo y la tinta.`
    );
});

// ==================== CALLBACK_CANCELAR_TITULO ====================
bot.action('cancelar_titulo_palabra_clave', async (ctx) => {
    const usuarioId = ctx.from.id;
    const sesion = obtenerSesion(usuarioId);
    
    // Limpiar sesión de confirmación
    limpiarSesion(usuarioId);
    
    await ctx.answerCbQuery();
    
    const mensajeCancelacion = 
        `🕯️ Sin prisa. No siempre encontramos el libro a la primera.\n\n` +
        `Si quieres, podemos intentarlo de nuevo:\n` +
        `- Dime el autor con /autor Nombre\n` +
        `- O acortemos la búsqueda con menos palabras en /titulo\n\n` +
        `Si ya estás completamente perdido entre tanto estante, escribe /ayuda_extendida. Te enviaré una guía más detallada a tu privado (si tú me lo permites).\n\n` +
        `Aquí sigo, custodiando lo eterno. 🙏`;
    
    await ctx.reply(mensajeCancelacion);
});

// ==================== HANDLERS_ADMIN ====================
bot.command('ver_almacen', async (ctx) => {
    if (ctx.from.id !== ID_CREADOR) return;
    const stats = await obtenerEstadisticas();
    await ctx.reply(`📊 *Almacén:* ${stats.autores} autores, ${stats.titulos} títulos`, { parse_mode: 'Markdown' });
});

bot.command('borrar_todo', async (ctx) => {
    if (ctx.from.id !== ID_CREADOR) return;
    const args = ctx.message.text.split(' ').slice(1);
    if (args[0] !== 'CONFIRMAR') {
        await ctx.reply('⚠️ Usá `/borrar_todo CONFIRMAR` para confirmar');
        return;
    }
    await borrarTodo();
    sesionesActivas.clear();
    pendientes.clear();
    await ctx.reply('✅ Almacén y sesiones vaciados');
});

// ==================== EXPORTS ====================
module.exports = bot;