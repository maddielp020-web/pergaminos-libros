// ==================== IMPORTACIONES ====================
const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config');
const { buscarPorAutor, buscarPorTitulo } = require('./buscar/gutendex');
const { formatearListaAutorConBotones, formatearLibroUnicoConBotones, obtenerMensajeEspecial } = require('./mensajes/formatear');
const { buscarPorAutorConPaginacion } = require('./buscar/openLibrary');
const {
    obtenerLibrosPorAutor,
    guardarLibrosPorAutor,
    obtenerEstadisticas,
    borrarTodo
} = require('./almacen/almacenManager');

// ==================== INICIALIZACION ====================
const bot = new Telegraf(BOT_TOKEN);
const ID_CREADOR = 2022025893;

// Cache en memoria para resultados de búsqueda
const busquedasUsuario = new Map();

console.log('🤖 Bot inicializado - Versión con botones y paginación de 5 libros');
console.log(`👑 ID Creador: ${ID_CREADOR}`);

// ==================== FUNCIONES AUXILIARES ====================
function guardarBusqueda(usuarioId, autor, libros, paginaActual, totalLibros) {
    busquedasUsuario.set(usuarioId, {
        autor,
        libros,
        paginaActual,
        totalLibros,
        timestamp: Date.now()
    });
}

function obtenerBusqueda(usuarioId) {
    const busqueda = busquedasUsuario.get(usuarioId);
    if (busqueda && Date.now() - busqueda.timestamp < 30 * 60 * 1000) {
        return busqueda;
    }
    busquedasUsuario.delete(usuarioId);
    return null;
}

// ==================== BUSCAR_AUTOR_PRINCIPAL ====================
async function buscarAutorPrincipal(ctx, autor) {
    console.log(`🔍 Buscando autor: "${autor}"`);
    const usuarioId = ctx.from.id;
    
    let librosCache = obtenerLibrosPorAutor(autor);
    
    if (librosCache && librosCache.length > 0) {
        const primeros5 = librosCache.slice(0, 5);
        const { mensaje, teclado } = formatearListaAutorConBotones(autor, primeros5, 0, librosCache.length);
        guardarBusqueda(usuarioId, autor, librosCache, 0, librosCache.length);
        await ctx.reply(mensaje, { parse_mode: 'Markdown', ...teclado });
        return;
    }
    
    try {
        const primeraPagina = await buscarPorAutorConPaginacion(autor, 'es', 0);
        let totalEncontrados = primeraPagina.totalEncontrados;
        let libros = primeraPagina.libros;
        
        if (libros.length === 0) {
            const primeraPaginaEn = await buscarPorAutorConPaginacion(autor, 'en', 0);
            libros = primeraPaginaEn.libros;
            totalEncontrados = primeraPaginaEn.totalEncontrados;
        }
        
        if (libros.length > 0) {
            guardarLibrosPorAutor(autor, libros);
            const { mensaje, teclado } = formatearListaAutorConBotones(autor, libros, 0, totalEncontrados);
            guardarBusqueda(usuarioId, autor, libros, 0, totalEncontrados);
            await ctx.reply(mensaje, { parse_mode: 'Markdown', ...teclado });
            return;
        }
    } catch (error) {
        console.error(`❌ Error en Open Library: ${error.message}`);
    }
    
    try {
        let libros = await buscarPorAutor(autor, 'es');
        if (libros.length === 0) {
            libros = await buscarPorAutor(autor, 'en');
        }
        
        if (libros.length > 0) {
            guardarLibrosPorAutor(autor, libros);
            const primeros5 = libros.slice(0, 5);
            const { mensaje, teclado } = formatearListaAutorConBotones(autor, primeros5, 0, libros.length);
            guardarBusqueda(usuarioId, autor, libros, 0, libros.length);
            await ctx.reply(mensaje, { parse_mode: 'Markdown', ...teclado });
            return;
        }
    } catch (error) {
        console.error(`❌ Error en Gutendex: ${error.message}`);
    }
    
    await ctx.reply(`📚 *No encontré libros para* "${autor}"\n\n💡 Probá con otro nombre.`, { parse_mode: 'Markdown' });
}

// ==================== HANDLER_START ====================
bot.command('start', async (ctx) {
    await ctx.reply(
        '📖 ¡Bienvenido a PergaminosAbiertos!\n\n' +
        'Aquí encuentras libros en dominio público al instante.\n\n' +
        'Pruébalo ahora:\n' +
        '<code>/autor Jose Marti</code>\n\n' +
        '¿Ves los botones? Elige uno y el libro aparece.\n\n' +
        '📘 ¿Dudas? Escribe /ayuda y te explico cómo leer o descargar.',
        { parse_mode: 'HTML' }
    );
});

// ==================== HANDLER_AYUDA ====================
bot.command('ayuda', async (ctx) {
    await ctx.reply(
        '📘 <b>AYUDA DE PERGAMINOSLIBROS_BOT</b>\n\n' +
        '🔹 <b>COMANDOS DISPONIBLES:</b>\n\n' +
        '<code>/autor [nombre]</code>\n' +
        'Ejemplo: <code>/autor Jose Marti</code>\n' +
        '→ Búsqueda EXACTA por autor. Devuelve 5 libros.\n\n' +
        '<code>/titulo [nombre]</code>\n' +
        'Ejemplo: <code>/titulo El Principito</code>\n' +
        '→ Búsqueda EXACTA por título.\n\n' +
        '<code>/busqueda-amplia [nombre]</code>\n' +
        'Ejemplo: <code>/busqueda-amplia Jose Marti</code>\n' +
        '→ Búsqueda AMPLIA en autor, título y descripción. Devuelve más resultados.\n\n' +
        '🔹 <b>CÓMO FUNCIONA:</b>\n\n' +
        '1. Usa cualquier comando\n' +
        '2. El bot te mostrará libros con botones numéricos\n' +
        '3. Toca el número del libro que quieras\n' +
        '4. Si hay más de 5, toca "📖 Siguientes 5 →"\n\n' +
        '🔹 <b>¿PUEDO LEER O DESCARGAR?</b>\n\n' +
        'Sí. Cuando el bot te muestre un libro, toca "📖 Ver libro" y podrás leer online o descargar gratis.\n\n' +
        '📌 <i>Los años de publicación pueden variar según biblioteca.</i>',
        { parse_mode: 'HTML' }
    );
});

// ==================== HANDLER_AUTOR ====================
bot.command('autor', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply('❓ *Usá:* `/autor [nombre del autor]`\n\nEjemplo: `/autor Benito Perez Galdos`', { parse_mode: 'Markdown' });
        return;
    }
    
    await buscarAutorPrincipal(ctx, query);
});

// ==================== HANDLER_BUSCAR ====================
bot.command('buscar', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply('❓ *Usá:* `/buscar [nombre del autor]`\n\nEjemplo: `/buscar Jose Marti`', { parse_mode: 'Markdown' });
        return;
    }
    
    await buscarAutorPrincipal(ctx, query);
});

// ==================== HANDLER_TITULO (placeholder) ====================
bot.command('titulo', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply('❓ *Usá:* `/titulo [nombre del libro]`\n\nEjemplo: `/titulo El Principito`', { parse_mode: 'Markdown' });
        return;
    }
    
    await ctx.reply(
        `📖 *Buscando:* "${query}"\n\n` +
        `⚠️ La búsqueda por título estará disponible pronto.\n\n` +
        `💡 Mientras tanto, probá con:\n` +
        `/autor "${query}"`,
        { parse_mode: 'Markdown' }
    );
});

// ==================== HANDLER_BUSQUEDA_AMPLIA (placeholder) ====================
bot.command('busqueda-amplia', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply('❓ *Usá:* `/busqueda-amplia [nombre]`\n\nEjemplo: `/busqueda-amplia Jose Marti`', { parse_mode: 'Markdown' });
        return;
    }
    
    await ctx.reply(
        `🔍 *Búsqueda amplia:* "${query}"\n\n` +
        `⚠️ Esta función estará disponible pronto.\n\n` +
        `💡 Mientras tanto, probá con:\n` +
        `/autor "${query}"`,
        { parse_mode: 'Markdown' }
    );
});

// ==================== BOTÓN SIGUIENTES 5 ====================
bot.action(/^mas_(.+)_(\d+)$/, async (ctx) => {
    const autor = ctx.match[1];
    const paginaActual = parseInt(ctx.match[2]);
    const usuarioId = ctx.from.id;
    const busqueda = obtenerBusqueda(usuarioId);
    
    if (!busqueda || busqueda.autor !== autor) {
        await ctx.answerCbQuery('Búsqueda no encontrada');
        await ctx.reply(`❓ Primero buscá al autor con: /autor ${autor}`);
        return;
    }
    
    const nuevaPagina = paginaActual;
    const offset = nuevaPagina * 5;
    
    if (offset >= busqueda.totalLibros) {
        await ctx.answerCbQuery('No hay más libros');
        await ctx.reply(`📚 *No hay más libros para* "${autor}"`);
        return;
    }
    
    try {
        const siguientePagina = await buscarPorAutorConPaginacion(autor, 'es', offset);
        let nuevosLibros = siguientePagina.libros;
        
        if (nuevosLibros.length === 0) {
            const siguientePaginaEn = await buscarPorAutorConPaginacion(autor, 'en', offset);
            nuevosLibros = siguientePaginaEn.libros;
        }
        
        if (nuevosLibros.length === 0) {
            await ctx.answerCbQuery('No hay más libros');
            return;
        }
        
        const librosActualizados = [...busqueda.libros, ...nuevosLibros];
        guardarLibrosPorAutor(autor, librosActualizados);
        
        const { mensaje, teclado } = formatearListaAutorConBotones(autor, nuevosLibros, nuevaPagina, busqueda.totalLibros);
        guardarBusqueda(usuarioId, autor, librosActualizados, nuevaPagina, busqueda.totalLibros);
        
        await ctx.answerCbQuery(`Página ${nuevaPagina + 1}`);
        await ctx.reply(mensaje, { parse_mode: 'Markdown', ...teclado });
        
    } catch (error) {
        console.error(`❌ Error en paginación: ${error.message}`);
        await ctx.answerCbQuery('Error al cargar');
    }
});

// ==================== CALLBACK LIBROS ====================
bot.action(/^libro_(\d+)$/, async (ctx) => {
    const numero = parseInt(ctx.match[1]);
    const usuarioId = ctx.from.id;
    const busqueda = obtenerBusqueda(usuarioId);
    
    if (!busqueda) {
        await ctx.answerCbQuery('No tengo una lista activa');
        await ctx.reply('❓ Primero buscá un autor con `/autor [nombre]`', { parse_mode: 'Markdown' });
        return;
    }
    
    const indice = numero - 1;
    if (!busqueda.libros || indice >= busqueda.libros.length) {
        await ctx.answerCbQuery('Número inválido');
        return;
    }
    
    const libro = busqueda.libros[indice];
    if (!libro || !libro.titulo) {
        await ctx.answerCbQuery('Error al obtener el libro');
        return;
    }
    
    const { mensaje } = formatearLibroUnicoConBotones(libro, false);
    
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
    busquedasUsuario.clear();
    await ctx.reply('✅ Almacén vaciado');
});

// ==================== EXPORTS ====================
module.exports = bot;