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

// ==================== BUSCAR_TITULO_PRINCIPAL ====================
async function buscarTituloPrincipal(ctx, titulo) {
    console.log(`🔍 Buscando título: "${titulo}"`);
    const usuarioId = ctx.from.id;
    
    // Verificar caché local (usando la misma estructura, pero con clave de título)
    let librosCache = obtenerLibrosPorAutor(`titulo_${titulo}`); // Namespace diferente
    
    if (librosCache && librosCache.length > 0) {
        const primeros5 = librosCache.slice(0, 5);
        const total = librosCache.length;
        
        let mensaje = `📚 BÚSQUEDA POR TÍTULO: "${titulo}"\n\n`;
        mensaje += `(${total} libros encontrados)\n\n`;
        
        primeros5.forEach((libro, idx) => {
            const numero = idx + 1;
            const año = libro.anio ? ` (${libro.anio})` : '';
            mensaje += `${numero}. ${libro.titulo} - ${libro.autor}${año}\n`;
        });
        
        mensaje += `\n👇 Toca el número del libro que quieres ver`;
        
        guardarBusqueda(usuarioId, `titulo_${titulo}`, librosCache, 0, total);
        const { teclado } = formatearListaAutorConBotones(titulo, primeros5, 0, total);
        await ctx.reply(mensaje, { ...teclado });
        return;
    }
    
    // Buscar en Open Library por título
    try {
        const libros = await buscarPorTitulo(titulo, 'es');
        
        if (libros.length === 0) {
            const librosEn = await buscarPorTitulo(titulo, 'en');
            if (librosEn.length > 0) {
                guardarLibrosPorAutor(`titulo_${titulo}`, librosEn);
                const primeros5 = librosEn.slice(0, 5);
                
                let mensaje = `📚 BÚSQUEDA POR TÍTULO: "${titulo}"\n\n`;
                mensaje += `(${librosEn.length} libros encontrados)\n\n`;
                
                primeros5.forEach((libro, idx) => {
                    const numero = idx + 1;
                    const año = libro.anio ? ` (${libro.anio})` : '';
                    mensaje += `${numero}. ${libro.titulo} - ${libro.autor}${año}\n`;
                });
                
                mensaje += `\n👇 Toca el número del libro que quieres ver`;
                
                guardarBusqueda(usuarioId, `titulo_${titulo}`, librosEn, 0, librosEn.length);
                const { teclado } = formatearListaAutorConBotones(titulo, primeros5, 0, librosEn.length);
                await ctx.reply(mensaje, { ...teclado });
                return;
            }
        }
        
        if (libros.length > 0) {
            guardarLibrosPorAutor(`titulo_${titulo}`, libros);
            const primeros5 = libros.slice(0, 5);
            
            let mensaje = `📚 BÚSQUEDA POR TÍTULO: "${titulo}"\n\n`;
            mensaje += `(${libros.length} libros encontrados)\n\n`;
            
            primeros5.forEach((libro, idx) => {
                const numero = idx + 1;
                const año = libro.anio ? ` (${libro.anio})` : '';
                mensaje += `${numero}. ${libro.titulo} - ${libro.autor}${año}\n`;
            });
            
            mensaje += `\n👇 Toca el número del libro que quieres ver`;
            
            guardarBusqueda(usuarioId, `titulo_${titulo}`, libros, 0, libros.length);
            const { teclado } = formatearListaAutorConBotones(titulo, primeros5, 0, libros.length);
            await ctx.reply(mensaje, { ...teclado });
            return;
        }
    } catch (error) {
        console.error(`❌ Error en Open Library (título): ${error.message}`);
    }
    
    // No se encontraron resultados
    let mensaje = `📚 BÚSQUEDA POR TÍTULO: "${titulo}"\n\n`;
    mensaje += `No encontré libros con ese título.\n\n`;
    mensaje += `📘 Sugerencias:\n`;
    mensaje += `- Revisa la ortografía del título\n`;
    mensaje += `- Prueba con palabras más cortas\n`;
    mensaje += `- Usa /autor si conoces el autor\n`;
    mensaje += `- Escribe /ayuda para ver ejemplos\n\n`;
    mensaje += `Ejemplo: /titulo El Principito`;
    
    await ctx.reply(mensaje);
}

// ==================== HANDLER_START ====================
bot.command('start', async (ctx) => {
    await ctx.reply(
        '📖 ¡Bienvenido a PergaminosAbiertos!\n\n' +
        'Aquí encuentras libros en dominio público al instante.\n\n' +
        'Pruébalo ahora:\n' +
        '/autor Jose Marti\n\n' +
        '¿Ves los botones? Elige uno y el libro aparece.\n\n' +
        '📘 ¿Dudas? Escribe /ayuda y te explico cómo leer o descargar.'
    );
});

// ==================== HANDLER_AYUDA ====================
bot.command('ayuda', async (ctx) => {
    await ctx.reply(
        '📘 AYUDA DE PERGAMINOSLIBROS_BOT\n\n' +
        '🔹 COMANDOS DISPONIBLES:\n\n' +
        '/autor [nombre]\n' +
        'Ejemplo: /autor Jose Marti\n' +
        '→ Búsqueda por autor. Devuelve 5 libros.\n\n' +
        '/titulo [nombre]\n' +
        'Ejemplo: /titulo El Principito\n' +
        '→ Búsqueda por título.\n\n' +
        '/busqueda_amplia [nombre]\n' +
        'Ejemplo: /busqueda_amplia Jose Marti\n' +
        '→ Búsqueda AMPLIA en autor, título y descripción. Devuelve más resultados.\n\n' +
        '🔹 CÓMO FUNCIONA:\n\n' +
        '1. Usa cualquier comando\n' +
        '2. El bot te mostrará libros con botones numéricos\n' +
        '3. Toca el número del libro que quieras\n' +
        '4. Si hay más de 5, toca "📖 Siguientes 5 →"\n\n' +
        '🔹 ¿PUEDO LEER O DESCARGAR?\n\n' +
        'Sí. Cuando el bot te muestre un libro, toca "📖 Ver libro" y podrás leer online o descargar gratis.\n\n' +
        '📌 Los años de publicación pueden variar según biblioteca.'
    );
});

// ==================== HANDLER_BUSQUEDA_AMPLIA (temporal) ====================
bot.command('busqueda_amplia', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply('❓ Usá: /busqueda_amplia [nombre]\n\nEjemplo: /busqueda_amplia Jose Marti');
        return;
    }
    
    await ctx.reply(
        `🔍 Búsqueda amplia: "${query}"\n\n` +
        `⚠️ Este comando estará disponible pronto.\n\n` +
        `💡 Mientras tanto, probá con:\n` +
        `/autor "${query}"`
    );
});

// ==================== HANDLER_AUTOR (modificado) ====================
bot.command('autor', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply(
            '❓ Usá: /autor [nombre del autor]\n\n' +
            'Ejemplo: /autor Jose Marti'
        );
        return;
    }
    
    // Buscar el autor
    const usuarioId = ctx.from.id;
    let librosCache = obtenerLibrosPorAutor(query);
    
    if (librosCache && librosCache.length > 0) {
        // Mostrar resultados encontrados
        const primeros5 = librosCache.slice(0, 5);
        const total = librosCache.length;
        
        let mensaje = `📚 BÚSQUEDA EXACTA POR AUTOR: "${query}"\n\n`;
        mensaje += `(${total} libros encontrados)\n\n`;
        
        primeros5.forEach((libro, idx) => {
            const numero = idx + 1;
            const año = libro.anio ? ` (${libro.anio})` : '';
            mensaje += `${numero}. ${libro.titulo}${año}\n`;
        });
        
        mensaje += `\n👇 Toca el número del libro que quieres ver`;
        
        // Guardar sesión y enviar con botones
        guardarBusqueda(usuarioId, query, librosCache, 0, total);
        
        const { teclado } = formatearListaAutorConBotones(query, primeros5, 0, total);
        await ctx.reply(mensaje, { ...teclado });
        return;
    }
    
    // Si no hay caché, buscar en Open Library
    try {
        const primeraPagina = await buscarPorAutorConPaginacion(query, 'es', 0);
        let totalEncontrados = primeraPagina.totalEncontrados;
        let libros = primeraPagina.libros;
        
        if (libros.length === 0) {
            const primeraPaginaEn = await buscarPorAutorConPaginacion(query, 'en', 0);
            libros = primeraPaginaEn.libros;
            totalEncontrados = primeraPaginaEn.totalEncontrados;
        }
        
        if (libros.length > 0) {
            // Guardar en caché
            guardarLibrosPorAutor(query, libros);
            
            const primeros5 = libros.slice(0, 5);
            
            let mensaje = `📚 BÚSQUEDA EXACTA POR AUTOR: "${query}"\n\n`;
            mensaje += `(${totalEncontrados} libros encontrados)\n\n`;
            
            primeros5.forEach((libro, idx) => {
                const numero = idx + 1;
                const año = libro.anio ? ` (${libro.anio})` : '';
                mensaje += `${numero}. ${libro.titulo}${año}\n`;
            });
            
            mensaje += `\n👇 Toca el número del libro que quieres ver`;
            
            guardarBusqueda(usuarioId, query, libros, 0, totalEncontrados);
            const { teclado } = formatearListaAutorConBotones(query, primeros5, 0, totalEncontrados);
            await ctx.reply(mensaje, { ...teclado });
            return;
        }
    } catch (error) {
        console.error(`❌ Error en Open Library: ${error.message}`);
    }
    
    // No se encontraron resultados
    let mensaje = `📚 BÚSQUEDA EXACTA POR AUTOR: "${query}"\n\n`;
    mensaje += `No encontré libros de ese autor.\n\n`;
    mensaje += `📘 Sugerencias:\n`;
    mensaje += `- Revisa la ortografía del nombre\n`;
    mensaje += `- Prueba con /busqueda_amplia para buscar en todo el texto\n`;
    mensaje += `- Escribe /ayuda para ver ejemplos\n\n`;
    mensaje += `Ejemplo: /autor Jose Marti`;
    
    await ctx.reply(mensaje);
});

// ==================== HANDLER_TITULO ====================
bot.command('titulo', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply(
            '❓ Escribe /titulo seguido del nombre del libro.\n\n' +
            'Ejemplo: /titulo El Principito'
        );
        return;
    }
    
    await buscarTituloPrincipal(ctx, query);
});

// ==================== HANDLER_BUSQUEDA_AMPLIA (temporal - Parte 2 vendrá después) ====================
bot.command('busqueda_amplia', async (ctx) => {
    await ctx.reply(
        '🔍 Búsqueda amplia\n\n' +
        'Este comando estará disponible pronto.\n\n' +
        '📘 Mientras tanto, usá /autor para buscar por autor exacto.'
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
        
        // Actualizar la lista completa de libros
        const librosActualizados = [...busqueda.libros, ...nuevosLibros];
        guardarLibrosPorAutor(autor, librosActualizados);
        
        // Usar librosActualizados (no nuevosLibros) para formatear
        const { mensaje, teclado } = formatearListaAutorConBotones(autor, librosActualizados, nuevaPagina, busqueda.totalLibros);
        guardarBusqueda(usuarioId, autor, librosActualizados, nuevaPagina, busqueda.totalLibros);
        
        await ctx.answerCbQuery(`Página ${nuevaPagina + 1}`);
        await ctx.reply(mensaje, { ...teclado });
        
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
        await ctx.reply('❓ Primero buscá un autor con /autor [nombre] o un título con /titulo [nombre]');
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