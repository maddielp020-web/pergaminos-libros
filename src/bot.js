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

// Cache en memoria para resultados de búsqueda (por usuario)
const busquedasUsuario = new Map();

console.log('🤖 Bot inicializado - Versión con botones y paginación de 5 libros');
console.log(`👑 ID Creador: ${ID_CREADOR}`);

// ==================== FUNCIONES AUXILIARES ====================
function guardarBusqueda(usuarioId, autor, libros, paginaActual, totalLibros) {
    busquedasUsuario.set(usuarioId, {
        autor,
        libros,           // Array de libros (todos los que se han cargado hasta ahora)
        paginaActual,
        totalLibros,
        timestamp: Date.now()
    });
    console.log(`💾 Búsqueda guardada para ${usuarioId}: "${autor}" (${libros?.length || 0} libros cargados, total: ${totalLibros}, página ${paginaActual + 1})`);
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
    
    // Verificar caché local
    let librosCache = obtenerLibrosPorAutor(autor);
    
    if (librosCache && librosCache.length > 0) {
        console.log(`💾 Usando cache para "${autor}" (${librosCache.length} libros)`);
        const primeros5 = librosCache.slice(0, 5);
        const { mensaje, teclado } = formatearListaAutorConBotones(autor, primeros5, 0, librosCache.length);
        guardarBusqueda(usuarioId, autor, librosCache, 0, librosCache.length);
        await ctx.reply(mensaje, { parse_mode: 'Markdown', ...teclado });
        return;
    }
    
    // Buscar SOLO los primeros 5 libros
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
            console.log(`✅ Open Library encontró ${totalEncontrados} libros totales, mostrando primeros ${libros.length}`);
            
            // Guardar en caché
            guardarLibrosPorAutor(autor, libros);
            
            const { mensaje, teclado } = formatearListaAutorConBotones(autor, libros, 0, totalEncontrados);
            guardarBusqueda(usuarioId, autor, libros, 0, totalEncontrados);
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

// ==================== HANDLER_MAS ====================
bot.hears(/^más$|^mas$|^Mas$|^MÁS$/i, async (ctx) => {
    const usuarioId = ctx.from.id;
    const busqueda = obtenerBusqueda(usuarioId);
    
    if (!busqueda) {
        await ctx.reply('❓ *No tengo una búsqueda activa*\n\nPrimero buscá un autor con `/autor [nombre]` y luego escribí *"más"*.', { parse_mode: 'Markdown' });
        return;
    }
    
    const nuevaPagina = busqueda.paginaActual + 1;
    const offset = nuevaPagina * 5;
    
    if (offset >= busqueda.totalLibros) {
        await ctx.reply(`📚 *No hay más libros para* "${busqueda.autor}"\n\nViste ${busqueda.totalLibros} libros en total.`, { parse_mode: 'Markdown' });
        return;
    }
    
    try {
        const siguientePagina = await buscarPorAutorConPaginacion(busqueda.autor, 'es', offset);
        let nuevosLibros = siguientePagina.libros;
        
        if (nuevosLibros.length === 0) {
            const siguientePaginaEn = await buscarPorAutorConPaginacion(busqueda.autor, 'en', offset);
            nuevosLibros = siguientePaginaEn.libros;
        }
        
        if (nuevosLibros.length === 0) {
            await ctx.reply(`📚 *No hay más libros para* "${busqueda.autor}"`, { parse_mode: 'Markdown' });
            return;
        }
        
        // Acumular libros
        const librosActualizados = [...busqueda.libros, ...nuevosLibros];
        guardarLibrosPorAutor(busqueda.autor, librosActualizados);
        
        const { mensaje, teclado } = formatearListaAutorConBotones(busqueda.autor, nuevosLibros, nuevaPagina, busqueda.totalLibros);
        guardarBusqueda(usuarioId, busqueda.autor, librosActualizados, nuevaPagina, busqueda.totalLibros);
        await ctx.reply(mensaje, { parse_mode: 'Markdown', ...teclado });
        
    } catch (error) {
        console.error(`❌ Error en /mas: ${error.message}`);
        await ctx.reply(`⚠️ Error al cargar más libros. Intentá de nuevo.`, { parse_mode: 'Markdown' });
    }
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

// ==================== HANDLER_START ====================
bot.command('start', async (ctx) => {
    await ctx.reply(
        '📚 *Bienvenido a PergaminosLibros_Bot*\n\n' +
        '🔍 *Comandos:*\n' +
        '• `/autor [nombre]` - Busca libros por autor\n' +
        '• `/buscar [nombre]` - Lo mismo que /autor\n' +
        '• Escribí *"más"* para ver más libros\n' +
        '• Tocá los números azules para ver cada libro\n\n' +
        '✨ *Ejemplo:* `/autor Jose Marti`\n\n' +
        '📖 *100% legal* - Solo dominio público.',
        { parse_mode: 'Markdown' }
    );
});

bot.command('help', async (ctx) => {
    await ctx.reply(
        '📖 *Ayuda de PergaminosLibros_Bot*\n\n' +
        '🔍 *Buscar autor:*\n' +
        '`/autor Benito Perez Galdos`\n' +
        '`/buscar Ruben Dario`\n\n' +
        '📱 *Navegación:*\n' +
        '• Tocá los números azules para ver el libro\n' +
        '• Escribí *"más"* para ver los siguientes 5 libros\n\n' +
        '📚 *Proyecto en crecimiento*',
        { parse_mode: 'Markdown' }
    );
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