// ==================== IMPORTACIONES ====================
const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config');
const { buscarPorAutor, buscarPorTitulo, normalizarConsulta, normalizarTitulo } = require('./buscar/gutendex');
const { formatearListaAutor, formatearLibroUnico, formatearErrorGutendex, obtenerMensajeEspecial } = require('./mensajes/formatear');
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

// Sesión en memoria para /libro (por usuario)
const sesiones = new Map();

console.log('🤖 Bot inicializado (FASE 3 - Almacén permanente + comandos admin)');
console.log(`👑 ID Creador: ${ID_CREADOR}`);

// ==================== FUNCION_AUXILIAR_GUARDAR_SESION ====================
function guardarSesion(usuarioId, datos) {
    sesiones.set(usuarioId, {
        ...datos,
        timestamp: Date.now()
    });
    console.log(`💾 Sesión guardada para usuario ${usuarioId}: ${datos.tipo} con ${datos.libros?.length || 0} items`);
}

function obtenerSesion(usuarioId) {
    const sesion = sesiones.get(usuarioId);
    if (sesion && Date.now() - sesion.timestamp < 30 * 60 * 1000) { // 30 min expiración
        return sesion;
    }
    sesiones.delete(usuarioId);
    return null;
}

// ==================== FUNCION_BUSCAR_POR_AUTOR_CON_ALMACEN ====================
async function buscarAutorConAlmacen(ctx, autor, esAdmin = false) {
    console.log(`🔍 Buscando autor: "${autor}" (admin: ${esAdmin})`);
    
    // Verificar almacén primero
    let libros = obtenerLibrosPorAutor(autor);
    
    if (libros && !esAdmin) {
        console.log(`💾 Usando cache para autor: "${autor}"`);
        const mensaje = formatearListaAutor(autor, libros);
        guardarSesion(ctx.from.id, { tipo: 'autor', autor: autor, libros: libros });
        await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
        return;
    }
    
    // Buscar en Gutendex
    try {
        console.log(`🌐 Buscando en Gutendex autor: "${autor}"`);
        libros = await buscarPorAutor(autor, 'es');
        
        if (libros.length === 0) {
            // Intentar en inglés
            libros = await buscarPorAutor(autor, 'en');
        }
        
        if (libros.length === 0) {
            const mensajeEspecial = obtenerMensajeEspecial(autor);
            if (mensajeEspecial) {
                await ctx.reply(mensajeEspecial, { parse_mode: 'Markdown' });
            } else {
                await ctx.reply(`📚 *No encontré libros para* "${autor}"\n\n💡 Probá con otro nombre o usá "/titulo [título]".`, { parse_mode: 'Markdown' });
            }
            return;
        }
        
        // Guardar en almacén
        guardarLibrosPorAutor(autor, libros);
        
        const mensaje = formatearListaAutor(autor, libros);
        guardarSesion(ctx.from.id, { tipo: 'autor', autor: autor, libros: libros });
        await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
        
    } catch (error) {
        console.error(`❌ Error buscando autor "${autor}":`, error.message);
        await ctx.reply(formatearErrorGutendex(), { parse_mode: 'Markdown' });
    }
}

// ==================== FUNCION_BUSCAR_POR_TITULO_CON_ALMACEN ====================
async function buscarTituloConAlmacen(ctx, titulo) {
    console.log(`🔍 Buscando título: "${titulo}"`);
    
    // Normalizar título para búsqueda en almacén
    const tituloNormalizado = normalizarTitulo(titulo);
    
    // Verificar almacén primero
    let libro = obtenerLibroPorTitulo(tituloNormalizado);
    
    if (libro) {
        console.log(`💾 Usando cache para título: "${titulo}"`);
        const mensaje = formatearLibroUnico(libro, true);
        guardarSesion(ctx.from.id, { tipo: 'libro', libro: libro });
        await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
        return;
    }
    
    // Buscar en Gutendex
    try {
        console.log(`🌐 Buscando en Gutendex título: "${titulo}"`);
        let libros = await buscarPorTitulo(titulo, 'es');
        
        if (libros.length === 0) {
            libros = await buscarPorTitulo(titulo, 'en');
        }
        
        if (libros.length === 0) {
            const mensajeEspecial = obtenerMensajeEspecial(titulo);
            if (mensajeEspecial) {
                await ctx.reply(mensajeEspecial, { parse_mode: 'Markdown' });
            } else {
                await ctx.reply(`📚 *No encontré libros para* "${titulo}"\n\n💡 Probá con otro título o usá "/autor [nombre]".`, { parse_mode: 'Markdown' });
            }
            return;
        }
        
        // Tomar el primer resultado como el más relevante
        const libroPrincipal = libros[0];
        
        // Normalizar y guardar en almacén
        const claveNormalizada = normalizarTitulo(libroPrincipal.titulo);
        const libroParaGuardar = {
            ...libroPrincipal,
            tituloNormalizado: claveNormalizada
        };
        guardarLibroPorTitulo(libroParaGuardar);
        
        const mensaje = formatearLibroUnico(libroPrincipal, true);
        guardarSesion(ctx.from.id, { tipo: 'libro', libro: libroPrincipal });
        await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
        
    } catch (error) {
        console.error(`❌ Error buscando título "${titulo}":`, error.message);
        await ctx.reply(formatearErrorGutendex(), { parse_mode: 'Markdown' });
    }
}

// ==================== HANDLER_TITULO ====================
bot.command('titulo', async (ctx) => {
    console.log(`📚 Comando /titulo de: ${ctx.from.id}`);
    
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply(
            '❓ *¿Qué libro buscas?*\n\n' +
            'Usá el comando seguido del título:\n' +
            '`/titulo Frankenstein`\n' +
            '`/titulo El Quijote`\n\n' +
            '💡 También podés buscar por autor con `/autor [nombre]`',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    await buscarTituloConAlmacen(ctx, query);
});

// ==================== HANDLER_AUTOR ====================
bot.command('autor', async (ctx) => {
    console.log(`👤 Comando /autor de: ${ctx.from.id}`);
    
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply(
            '❓ *¿Qué autor buscas?*\n\n' +
            'Usá el comando seguido del nombre:\n' +
            '`/autor Mary Shelley`\n' +
            '`/autor Jane Austen`\n\n' +
            '💡 También podés buscar por título con `/titulo [título]`',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    await buscarAutorConAlmacen(ctx, query, false);
});

// ==================== HANDLER_BUSCAR (alias) ====================
bot.command('buscar', async (ctx) => {
    console.log(`🔍 Comando /buscar (alias) de: ${ctx.from.id}`);
    
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply(
            '❓ *¿Qué libro buscas?*\n\n' +
            'Usá el comando seguido del título:\n' +
            '`/buscar Frankenstein`\n\n' +
            '📌 *Comandos específicos:*\n' +
            '• `/titulo [título]` - Busca por título\n' +
            '• `/autor [nombre]` - Busca por autor\n\n' +
            'Escribí `/help` para ver todos los comandos.',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    await buscarTituloConAlmacen(ctx, query);
});

// ==================== HANDLER_LIBRO ====================
bot.command('libro', async (ctx) => {
    console.log(`📖 Comando /libro de: ${ctx.from.id}`);
    
    const args = ctx.message.text.split(' ').slice(1);
    const numero = parseInt(args[0]);
    
    if (isNaN(numero) || numero < 1) {
        await ctx.reply(
            '❓ *¿Qué libro querés ver?*\n\n' +
            'Usá el número que aparece en la lista:\n' +
            '`/libro 1`\n\n' +
            '💡 Primero buscá libros con `/autor [nombre]` o `/titulo [título]`',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const sesion = obtenerSesion(ctx.from.id);
    
    if (!sesion || sesion.tipo !== 'autor' || !sesion.libros) {
        await ctx.reply(
            '❓ *No tengo una lista guardada*\n\n' +
            'Primero buscá libros con:\n' +
            '• `/autor Mary Shelley`\n' +
            '• `/titulo Frankenstein`\n\n' +
            'Después usá `/libro [número]` para ver el libro completo.',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const indice = numero - 1;
    if (indice >= sesion.libros.length) {
        await ctx.reply(
            `❓ *Número inválido*\n\n` +
            `La lista tiene ${sesion.libros.length} libro${sesion.libros.length !== 1 ? 's' : ''}. ` +
            `Usá un número entre 1 y ${sesion.libros.length}.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const libro = sesion.libros[indice];
    const mensaje = formatearLibroUnico(libro, false);
    await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
    console.log(`✅ Enviado libro ${numero} a usuario ${ctx.from.id}: "${libro.titulo}"`);
});

// ==================== HANDLER_START ====================
bot.command('start', async (ctx) => {
    console.log(`📩 /start de: ${ctx.from.id}`);
    
    await ctx.reply(
        '📚 *Bienvenido a PergaminosLibros_Bot*\n\n' +
        'Buscá libros de dominio público en Project Gutenberg.\n\n' +
        '🔍 *Comandos:*\n' +
        '• `/titulo [título]` - Busca por título\n' +
        '• `/autor [nombre]` - Busca por autor\n' +
        '• `/libro [número]` - Ver libro de la lista\n' +
        '• `/help` - Ayuda completa\n\n' +
        '✨ *Ejemplos:*\n' +
        '`/titulo Frankenstein`\n' +
        '`/autor Mary Shelley`\n\n' +
        '📖 *100% legal* - Solo enlaces a bibliotecas públicas.',
        { parse_mode: 'Markdown' }
    );
});

// ==================== HANDLER_HELP ====================
bot.command('help', async (ctx) => {
    console.log(`❓ /help de: ${ctx.from.id}`);
    
    await ctx.reply(
        '📖 *PergaminosLibros_Bot - Ayuda completa*\n\n' +
        '🔍 *Comandos de búsqueda:*\n' +
        '• `/titulo [título]` - Busca libros por título\n' +
        '• `/autor [nombre]` - Busca libros por autor\n' +
        '• `/buscar [título]` - Alias de /titulo\n\n' +
        '📱 *Comandos de navegación:*\n' +
        '• `/libro [número]` - Muestra el libro completo de la lista\n\n' +
        '📚 *Ejemplos:*\n' +
        '`/titulo Frankenstein`\n' +
        '`/autor Mary Shelley`\n' +
        '`/libro 1`\n\n' +
        '💡 *Consejos para iPhone:*\n' +
        '• Los enlaces EPUB se descargan automáticamente\n' +
        '• Abrí los enlaces en Safari para mejor compatibilidad\n' +
        '• Los archivos se guardan en la app "Libros"\n\n' +
        '🌐 *Fuente:* Project Gutenberg (dominio público)\n' +
        '✨ *100% gratuito y legal*',
        { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
});

// ==================== HANDLERS_ADMIN ====================
bot.command('actualizar', async (ctx) => {
    if (ctx.from.id !== ID_CREADOR) {
        console.log(`⛔ Intento de /actualizar por usuario no autorizado: ${ctx.from.id}`);
        return;
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    const autor = args.join(' ');
    
    if (!autor) {
        await ctx.reply('❓ Usá: `/actualizar [nombre del autor]`', { parse_mode: 'Markdown' });
        return;
    }
    
    console.log(`🔄 Admin: actualizando autor "${autor}"`);
    await ctx.reply(`🔄 Actualizando "${autor}"...`);
    
    // Eliminar del almacén
    const eliminado = eliminarAutor(autor);
    if (eliminado) {
        await ctx.reply(`🗑️ Eliminado del cache. Buscando en Gutendex...`);
    }
    
    // Buscar de nuevo
    await buscarAutorConAlmacen(ctx, autor, true);
});

bot.command('borrar_autor', async (ctx) => {
    if (ctx.from.id !== ID_CREADOR) return;
    
    const args = ctx.message.text.split(' ').slice(1);
    const autor = args.join(' ');
    
    if (!autor) {
        await ctx.reply('❓ Usá: `/borrar_autor [nombre del autor]`', { parse_mode: 'Markdown' });
        return;
    }
    
    const eliminado = eliminarAutor(autor);
    if (eliminado) {
        await ctx.reply(`✅ Autor "${autor}" eliminado del almacén.`, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(`⚠️ No encontré al autor "${autor}" en el almacén.`, { parse_mode: 'Markdown' });
    }
});

bot.command('ver_almacen', async (ctx) => {
    if (ctx.from.id !== ID_CREADOR) return;
    
    const stats = obtenerEstadisticas();
    await ctx.reply(
        `📊 *Estado del almacén*\n\n` +
        `📚 *Autores guardados:* ${stats.autores}\n` +
        `📖 *Títulos guardados:* ${stats.titulos}\n\n` +
        `💾 Los resultados se guardan para evitar llamadas repetidas a Gutendex.`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('borrar_todo', async (ctx) => {
    if (ctx.from.id !== ID_CREADOR) return;
    
    const args = ctx.message.text.split(' ').slice(1);
    const confirmacion = args.join(' ');
    
    if (confirmacion !== 'CONFIRMAR') {
        await ctx.reply(
            '⚠️ *¿Seguro que querés borrar TODO el almacén?*\n\n' +
            'Esta acción no se puede deshacer.\n\n' +
            'Para confirmar, enviá:\n' +
            '`/borrar_todo CONFIRMAR`',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const resultado = borrarTodo();
    if (resultado) {
        await ctx.reply('✅ *Almacén completamente vaciado.*', { parse_mode: 'Markdown' });
        console.log('🗑️ Admin: borró TODO el almacén');
    } else {
        await ctx.reply('❌ *Error al borrar el almacén.*', { parse_mode: 'Markdown' });
    }
});

// ==================== EXPORTS ====================
module.exports = bot;