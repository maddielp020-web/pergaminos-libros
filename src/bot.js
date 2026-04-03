// ==================== IMPORTACIONES ====================
const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config');
const { buscarPorAutor, buscarPorTitulo, normalizarConsulta, normalizarTitulo } = require('./buscar/gutendex');
const { formatearListaAutorConBotones, formatearLibroUnicoConBotones, formatearErrorGutendex, obtenerMensajeEspecial, formatearListaAutorPaginada } = require('./mensajes/formatear');
const { buscarPorAutor: buscarPorAutorOL, buscarPorTitulo: buscarPorTituloOL, buscarPorAutorConPaginacion } = require('./buscar/openLibrary');
const { guardarSesionAutor, obtenerSesionAutor, eliminarSesionAutor } = require('./almacen/sesionesAutor');
const {
    obtenerLibrosPorAutor,
    obtenerLibroPorTitulo,
    guardarLibrosPorAutor,
    guardarLibroPorTitulo,
    eliminarAutor,
    eliminarTitulo,
    obtenerEstadisticas,
    borrarTodo
} = require('./almacen/almacenManager');

// ==================== INICIALIZACION ====================
const bot = new Telegraf(BOT_TOKEN);
const ID_CREADOR = 2022025893;

// Cache en memoria para resultados de búsqueda (por usuario)
const busquedasUsuario = new Map();

console.log('🤖 Bot inicializado - Versión con botones y paginación de 5 libros');
console.log(`👑 ID Creador: ${ID_CREADOR}`);

// ==================== FUNCION_GUARDAR_BUSQUEDA ====================
function guardarBusqueda(usuarioId, autor, libros, paginaActual = 0) {
    busquedasUsuario.set(usuarioId, {
        autor,
        libros,
        paginaActual,
        timestamp: Date.now()
    });
    console.log(`💾 Búsqueda guardada para ${usuarioId}: "${autor}" (${libros.length} libros, página ${paginaActual + 1})`);
}

function obtenerBusqueda(usuarioId) {
    const busqueda = busquedasUsuario.get(usuarioId);
    if (busqueda && Date.now() - busqueda.timestamp < 30 * 60 * 1000) {
        return busqueda;
    }
    busquedasUsuario.delete(usuarioId);
    return null;
}

// ==================== FUNCION_MOSTRAR_PAGINA ====================
async function mostrarPagina(ctx, usuarioId, autor, libros, pagina) {
    const totalPaginas = Math.ceil(libros.length / 5);
    if (pagina >= totalPaginas) {
        await ctx.reply(`📚 *No hay más libros para* "${autor}"\n\nViste ${libros.length} libros en total.`);
        return;
    }
    
    const { mensaje, teclado, totalPaginas: _ } = formatearListaAutorConBotones(autor, libros, pagina, libros.length);
    guardarBusqueda(usuarioId, autor, libros, pagina);
    await ctx.reply(mensaje, { parse_mode: 'Markdown', ...teclado });
}

// ==================== BUSCAR_AUTOR_PRINCIPAL ====================
async function buscarAutorPrincipal(ctx, autor, esAdmin = false) {
    console.log(`🔍 Buscando autor: "${autor}"`);
    const usuarioId = ctx.from.id;
    
    // Verificar caché local
    let librosCache = obtenerLibrosPorAutor(autor);
    
    if (librosCache && !esAdmin) {
        console.log(`💾 Usando cache para "${autor}" (${librosCache.length} libros)`);
        const { mensaje, teclado } = formatearListaAutorConBotones(autor, librosCache, 0, librosCache.length);
        guardarBusqueda(usuarioId, autor, librosCache, 0);
        await ctx.reply(mensaje, { parse_mode: 'Markdown', ...teclado });
        return;
    }
    
    // Buscar en Open Library
    try {
        let libros = await buscarPorAutorOL(autor, 'es');
        
        if (libros.length === 0) {
            console.log(`🌎 Probando Open Library en inglés`);
            libros = await buscarPorAutorOL(autor, 'en');
        }
        
        if (libros.length > 0) {
            console.log(`✅ Open Library encontró ${libros.length} libros`);
            guardarLibrosPorAutor(autor, libros);
            const { mensaje, teclado } = formatearListaAutorConBotones(autor, libros, 0, libros.length);
            guardarBusqueda(usuarioId, autor, libros, 0);
            await ctx.reply(mensaje, { parse_mode: 'Markdown', ...teclado });
            return;
        }
    } catch (error) {
        console.error(`❌ Error en Open Library: ${error.message}`);
    }
    
    // Fallback a Gutendex
    try {
        let libros = await buscarPorAutor(autor, 'es');
        if (libros.length === 0) {
            libros = await buscarPorAutor(autor, 'en');
        }
        
        if (libros.length > 0) {
            console.log(`✅ Gutendex encontró ${libros.length} libros`);
            guardarLibrosPorAutor(autor, libros);
            const { mensaje, teclado } = formatearListaAutorConBotones(autor, libros, 0, libros.length);
            guardarBusqueda(usuarioId, autor, libros, 0);
            await ctx.reply(mensaje, { parse_mode: 'Markdown', ...teclado });
            return;
        }
    } catch (error) {
        console.error(`❌ Error en Gutendex: ${error.message}`);
    }
    
    // Sin resultados
    const mensajeEspecial = obtenerMensajeEspecial(autor);
    if (mensajeEspecial) {
        await ctx.reply(mensajeEspecial, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(`📚 *No encontré libros para* "${autor}"\n\n💡 Probá con otro nombre.`, { parse_mode: 'Markdown' });
    }
}

// ==================== HANDLER_AUTOR ====================
bot.command('autor', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply('❓ *Usá:* `/autor [nombre del autor]`\n\nEjemplo: `/autor Gabriel Garcia Marquez`', { parse_mode: 'Markdown' });
        return;
    }
    
    await buscarAutorPrincipal(ctx, query);
});

// ==================== HANDLER_TITULO ====================
bot.command('titulo', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply('❓ *Usá:* `/titulo [nombre del libro]`\n\nEjemplo: `/titulo Cien años de soledad`', { parse_mode: 'Markdown' });
        return;
    }
    
    // Buscar por título (simplificado - sin botones por ahora)
    const libro = obtenerLibroPorTitulo(query);
    if (libro) {
        const { mensaje } = formatearLibroUnicoConBotones(libro, true);
        await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
        return;
    }
    
    await ctx.reply(`📖 *Buscando:* "${query}"\n\n⚠️ Por ahora, use /autor para buscar por autor. La búsqueda por título exacta se implementará en la próxima versión.`, { parse_mode: 'Markdown' });
});

// ==================== HANDLER_BUSCAR (alias de autor) ====================
bot.command('buscar', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply('❓ *Usá:* `/buscar [nombre del autor]`\n\nEjemplo: `/buscar Jose Marti`\n\n📌 También puede usar `/autor [nombre]`', { parse_mode: 'Markdown' });
        return;
    }
    
    await buscarAutorPrincipal(ctx, query);
});

// ==================== HANDLER_MAS (texto plano) ====================
bot.hears(/^más$|^mas$|^Mas$|^MÁS$/i, async (ctx) => {
    const usuarioId = ctx.from.id;
    const busqueda = obtenerBusqueda(usuarioId);
    
    if (!busqueda) {
        await ctx.reply('❓ *No tengo una búsqueda activa*\n\nPrimero buscá un autor con `/autor [nombre]` y luego escribí *"más"* para ver más libros.', { parse_mode: 'Markdown' });
        return;
    }
    
    const nuevaPagina = busqueda.paginaActual + 1;
    const totalPaginas = Math.ceil(busqueda.libros.length / 5);
    
    if (nuevaPagina >= totalPaginas) {
        await ctx.reply(`📚 *No hay más libros para* "${busqueda.autor}"\n\nViste ${busqueda.libros.length} libros en total.\n\n👉 Para buscar otro autor: /autor [nombre]`, { parse_mode: 'Markdown' });
        return;
    }
    
    const { mensaje, teclado } = formatearListaAutorConBotones(busqueda.autor, busqueda.libros, nuevaPagina, busqueda.libros.length);
    guardarBusqueda(usuarioId, busqueda.autor, busqueda.libros, nuevaPagina);
    await ctx.reply(mensaje, { parse_mode: 'Markdown', ...teclado });
});

// ==================== CALLBACKS (botones) ====================
bot.action(/^libro_(\d+)$/, async (ctx) => {
    const numero = parseInt(ctx.match[1]);
    const usuarioId = ctx.from.id;
    const busqueda = obtenerBusqueda(usuarioId);
    
    if (!busqueda) {
        await ctx.answerCbQuery('No tengo una lista activa');
        await ctx.reply('❓ Primero buscá un autor con `/autor [nombre]`');
        return;
    }
    
    const indice = numero - 1;
    if (indice >= busqueda.libros.length) {
        await ctx.answerCbQuery('Número inválido');
        return;
    }
    
    const libro = busqueda.libros[indice];
    const { mensaje } = formatearLibroUnicoConBotones(libro, false);
    
    await ctx.answerCbQuery(`📖 ${libro.titulo}`);
    await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

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
    const totalPaginas = Math.ceil(busqueda.libros.length / 5);
    
    if (nuevaPagina >= totalPaginas) {
        await ctx.answerCbQuery('No hay más libros');
        await ctx.reply(`📚 *No hay más libros para* "${autor}"`);
        return;
    }
    
    const { mensaje, teclado } = formatearListaAutorConBotones(autor, busqueda.libros, nuevaPagina, busqueda.libros.length);
    guardarBusqueda(usuarioId, autor, busqueda.libros, nuevaPagina);
    
    await ctx.answerCbQuery(`Página ${nuevaPagina + 1}`);
    await ctx.reply(mensaje, { parse_mode: 'Markdown', ...teclado });
});

// ==================== HANDLER_START ====================
bot.command('start', async (ctx) => {
    await ctx.reply(
        '📚 *Bienvenido a PergaminosLibros_Bot*\n\n' +
        '🔍 *Comandos:*\n' +
        '• `/autor [nombre]` - Busca libros por autor\n' +
        '• `/buscar [nombre]` - Lo mismo que /autor\n' +
        '• Escribí *"más"* para ver más libros\n' +
        '• Tocá los números azules para ver cada libro\n\n' +
        '✨ *Ejemplo:*\n' +
        '`/autor Jose Marti`\n\n' +
        '📖 *100% legal* - Solo dominio público.',
        { parse_mode: 'Markdown' }
    );
});

bot.command('help', async (ctx) => {
    await ctx.reply(
        '📖 *Ayuda de PergaminosLibros_Bot*\n\n' +
        '🔍 *Buscar autor:*\n' +
        '`/autor Jose Marti`\n' +
        '`/buscar Ruben Dario`\n\n' +
        '📱 *Navegación:*\n' +
        '• Tocá los números azules para ver el libro\n' +
        '• Escribí *"más"* para ver los siguientes 5 libros\n\n' +
        '📌 *Notas:*\n' +
        '• Solo libros de dominio público\n' +
        '• Los enlaces EPUB se pueden abrir en la app Libros de iPhone\n\n' +
        '📚 *Proyecto en crecimiento* - Pronto: búsqueda por título',
        { parse_mode: 'Markdown' }
    );
});

// ==================== HANDLERS_ADMIN ====================
bot.command('actualizar', async (ctx) => {
    if (ctx.from.id !== ID_CREADOR) return;
    const args = ctx.message.text.split(' ').slice(1);
    const autor = args.join(' ');
    if (!autor) return;
    
    eliminarAutor(autor);
    await ctx.reply(`🔄 Actualizando "${autor}"...`);
    await buscarAutorPrincipal(ctx, autor, true);
});

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
    await ctx.reply('✅ Almacén vaciado');
});

// ==================== EXPORTS ====================
module.exports = bot;