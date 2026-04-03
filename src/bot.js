// ==================== IMPORTACIONES ====================
const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config');
const { buscarPorAutor, buscarPorTitulo, normalizarConsulta, normalizarTitulo } = require('./buscar/gutendex');
const { formatearListaAutor, formatearListaAutorPaginada, formatearLibroUnico, formatearErrorGutendex, obtenerMensajeEspecial } = require('./mensajes/formatear');
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
    const usuarioId = ctx.from.id;
    
    // 1. Verificar caché local
    let librosCache = obtenerLibrosPorAutor(autor);
    
    if (librosCache && !esAdmin) {
        console.log(`💾 Usando cache para autor: "${autor}" (${librosCache.length} libros)`);
        const mensaje = formatearListaAutor(autor, librosCache);
        guardarSesionAutor(usuarioId, autor, librosCache, 0, librosCache.length);
        await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
        return;
    }
    
    // 2. Buscar en Open Library usando buscarPorAutorOL (que existe y funciona)
    console.log(`📚 Buscando en Open Library: "${autor}"`);
    try {
        let libros = await buscarPorAutorOL(autor, 'es');
        
        if (libros.length === 0) {
            console.log(`🌎 Buscando en Open Library (inglés): "${autor}"`);
            libros = await buscarPorAutorOL(autor, 'en');
        }
        
        if (libros.length > 0) {
            console.log(`✅ Open Library encontró ${libros.length} libros para "${autor}"`);
            // Guardar en caché permanente
            guardarLibrosPorAutor(autor, libros);
            // Guardar sesión para paginación (aunque no implementemos /mas todavía)
            guardarSesionAutor(usuarioId, autor, libros, 0, libros.length);
            const mensaje = formatearListaAutor(autor, libros);
            await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
            return;
        }
        
        // 3. Fallback a Gutendex
        console.log(`⚠️ Open Library no encontró resultados. Fallback a Gutendex: "${autor}"`);
        const { buscarPorAutor: buscarPorAutorGUT } = require('./buscar/gutendex');
        libros = await buscarPorAutorGUT(autor, 'es');
        
        if (libros.length === 0) {
            libros = await buscarPorAutorGUT(autor, 'en');
        }
        
        if (libros.length > 0) {
            console.log(`✅ Gutendex encontró ${libros.length} libros para "${autor}"`);
            guardarLibrosPorAutor(autor, libros);
            guardarSesionAutor(usuarioId, autor, libros, 0, libros.length);
            const mensaje = formatearListaAutor(autor, libros);
            await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
            return;
        }
        
        // 4. Sin resultados
        const mensajeEspecial = obtenerMensajeEspecial(autor);
        if (mensajeEspecial) {
            await ctx.reply(mensajeEspecial, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply(`📚 *No encontré libros para* "${autor}"\n\n💡 Probá con otro nombre.`, { parse_mode: 'Markdown' });
        }
        
    } catch (error) {
        console.error(`❌ Error en buscarAutorConAlmacen: ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
        await ctx.reply(`⚠️ Error al buscar "${autor}". Por favor intentá más tarde.`, { parse_mode: 'Markdown' });
    }
}

// ==================== FUNCION_BUSCAR_POR_TITULO_CON_ALMACEN ====================
async function buscarTituloConAlmacen(ctx, titulo) {
    console.log(`🔍 Buscando título: "${titulo}"`);
    
    const tituloNormalizado = normalizarTitulo(titulo);
    
    // 1. Verificar caché local
    let libro = obtenerLibroPorTitulo(tituloNormalizado);
    
    if (libro) {
        console.log(`💾 Usando cache para título: "${titulo}"`);
        const mensaje = formatearLibroUnico(libro, true);
        guardarSesion(ctx.from.id, { tipo: 'libro', libro: libro });
        await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
        return;
    }
    
    // 2. Buscar en Open Library (fuente principal)
    console.log(`📚 Buscando en Open Library: "${titulo}"`);
    try {
        let libros = await buscarPorTituloOL(titulo, 'es');
        
        if (libros.length === 0) {
            console.log(`🌎 Buscando en Open Library (inglés): "${titulo}"`);
            libros = await buscarPorTituloOL(titulo, 'en');
        }
        
        if (libros.length > 0) {
            const libroPrincipal = libros[0];
            console.log(`✅ Open Library encontró libro: "${libroPrincipal.titulo}"`);
            
            const claveNormalizada = normalizarTitulo(libroPrincipal.titulo);
            const libroParaGuardar = { ...libroPrincipal, tituloNormalizado: claveNormalizada };
            guardarLibroPorTitulo(libroParaGuardar);
            
            const mensaje = formatearLibroUnico(libroPrincipal, true);
            guardarSesion(ctx.from.id, { tipo: 'libro', libro: libroPrincipal });
            await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
            return;
        }
    } catch (error) {
        console.error(`❌ Error en Open Library: ${error.message}`);
    }
    
    // 3. Fallback a Gutendex
    console.log(`⚠️ Open Library no encontró resultados. Fallback a Gutendex: "${titulo}"`);
    try {
        const { buscarPorTitulo } = require('./buscar/gutendex');
        let libros = await buscarPorTitulo(titulo, 'es');
        
        if (libros.length === 0) {
            libros = await buscarPorTitulo(titulo, 'en');
        }
        
        if (libros.length > 0) {
            const libroPrincipal = libros[0];
            console.log(`✅ Gutendex encontró libro: "${libroPrincipal.titulo}"`);
            
            const claveNormalizada = normalizarTitulo(libroPrincipal.titulo);
            const libroParaGuardar = { ...libroPrincipal, tituloNormalizado: claveNormalizada };
            guardarLibroPorTitulo(libroParaGuardar);
            
            const mensaje = formatearLibroUnico(libroPrincipal, true);
            guardarSesion(ctx.from.id, { tipo: 'libro', libro: libroPrincipal });
            await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
            return;
        }
    } catch (error) {
        console.error(`❌ Error en Gutendex: ${error.message}`);
    }
    
    // 4. Sin resultados
    const mensajeEspecial = obtenerMensajeEspecial(titulo);
    if (mensajeEspecial) {
        await ctx.reply(mensajeEspecial, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(`📚 *No encontré libros para* "${titulo}"\n\n💡 Probá con otro título o usá "/autor [nombre]".`, { parse_mode: 'Markdown' });
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
    console.log(`🔍 Comando /buscar de: ${ctx.from.id}`);
    
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply(
            '❓ *¿Qué querés buscar?*\n\n' +
            'Usá el comando seguido del nombre:\n' +
            '`/buscar Miguel de Cervantes` (busca como autor)\n' +
            '`/buscar Don Quijote` (busca como título)\n\n' +
            '📌 *Comandos específicos:*\n' +
            '• `/titulo [título]` - Busca solo por título\n' +
            '• `/autor [nombre]` - Busca solo por autor',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // Intentar como autor primero
    console.log(`   🔍 Intentando como autor: "${query}"`);
    
    // Necesitamos una versión que no envíe mensaje automático si falla
    const usuarioId = ctx.from.id;
    let librosEncontrados = null;
    
    // Buscar en caché primero
    let librosCache = obtenerLibrosPorAutor(query);
    if (librosCache) {
        librosEncontrados = librosCache;
    } else {
        // Buscar en Open Library
        try {
            let libros = await buscarPorAutorOL(query, 'es');
            if (libros.length === 0) {
                libros = await buscarPorAutorOL(query, 'en');
            }
            if (libros.length > 0) {
                librosEncontrados = libros;
                guardarLibrosPorAutor(query, libros);
            }
        } catch (error) {
            console.log(`   ⚠️ Error en Open Library: ${error.message}`);
        }
        
        // Si no, Gutendex
        if (!librosEncontrados) {
            let libros = await buscarPorAutorGUT(query, 'es');
            if (libros.length === 0) {
                libros = await buscarPorAutorGUT(query, 'en');
            }
            if (libros.length > 0) {
                librosEncontrados = libros;
                guardarLibrosPorAutor(query, libros);
            }
        }
    }
    
    // Si encontró como autor, mostrar
    if (librosEncontrados && librosEncontrados.length > 0) {
        console.log(`   ✅ Como autor: ${librosEncontrados.length} libros`);
        guardarSesionAutor(usuarioId, query, librosEncontrados, 0, librosEncontrados.length);
        const mensaje = formatearListaAutor(query, librosEncontrados);
        await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
        return;
    }
    
    // Si no encontró como autor, intentar como título
    console.log(`   🔍 Intentando como título: "${query}"`);
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

// ==================== HANDLER_MAS ====================
bot.command('mas', async (ctx) => {
    console.log(`📖 Comando /mas de: ${ctx.from.id}`);
    
    const args = ctx.message.text.split(' ').slice(1);
    const autor = args.join(' ');
    
    if (!autor) {
        await ctx.reply(
            '❓ *Usá así:* `/mas [nombre del autor]`\n\n' +
            'Ejemplo: `/mas Jane Austen`\n\n' +
            '💡 Este comando muestra la página siguiente de libros del autor que buscaste antes.',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const usuarioId = ctx.from.id;
    const sesion = obtenerSesionAutor(usuarioId);
    
    // Verificar que la sesión exista y coincida con el autor solicitado
    if (!sesion || sesion.autor.toLowerCase() !== autor.toLowerCase()) {
        await ctx.reply(
            `❓ *No tengo una búsqueda activa para "${autor}"*\n\n` +
            `Primero usá: /autor ${autor}\n` +
            `Después podés usar /mas ${autor} para ver más libros.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const paginaActual = sesion.paginaActual;
    const totalLibros = sesion.totalLibros;
    const proximaPagina = paginaActual + 1;
    const offset = proximaPagina * 10;
    
    // Verificar si hay más páginas
    if (offset >= totalLibros) {
        await ctx.reply(
            `📚 *No hay más libros para* "${autor}"\n\n` +
            `Viste ${totalLibros} libro${totalLibros !== 1 ? 's' : ''} en total.\n\n` +
            `👉 Para buscar otro autor, usá /autor [nombre]`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    console.log(`📚 Cargando página ${proximaPagina + 1} para "${autor}" (offset ${offset})`);
    
    try {
        // Usar SOLO Open Library (sin fallback a Gutendex)
        const { libros: nuevosLibros, totalEncontrados } = await buscarPorAutorConPaginacion(autor, 'es', offset);
        
        if (nuevosLibros.length === 0) {
            await ctx.reply(
                `⚠️ No pude cargar más libros para "${autor}".\n\n` +
                `Open Library no tiene más resultados para este autor.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        // Actualizar sesión: agregar nuevos libros a la lista completa
        const librosActualizados = [...sesion.libros, ...nuevosLibros];
        guardarSesionAutor(usuarioId, autor, librosActualizados, proximaPagina, totalEncontrados);
        
        // Mostrar la nueva página
        const numeroInicio = offset + 1;
        const mensaje = formatearListaAutorPaginada(autor, nuevosLibros, numeroInicio, totalEncontrados);
        await ctx.reply(mensaje, { parse_mode: 'Markdown', disable_web_page_preview: true });
        
        const restantes = totalEncontrados - (offset + nuevosLibros.length);
        if (restantes > 0) {
            await ctx.reply(`📖 ${restantes} libros más. Escribí /mas ${autor} para seguir viendo.`);
        }
        
    } catch (error) {
        console.error(`❌ Error en /mas: ${error.message}`);
        await ctx.reply(
            `⚠️ Error al cargar más libros.\n\n` +
            `Open Library puede estar temporalmente no disponible.\n` +
            `Intentá de nuevo con /mas ${autor} más tarde.`,
            { parse_mode: 'Markdown' }
        );
    }
});

// ==================== EXPORTS ====================
module.exports = bot;