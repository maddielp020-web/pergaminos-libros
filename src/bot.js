// ==================== IMPORTACIONES ====================
const { Telegraf, Markup } = require('telegraf');
const { BOT_TOKEN } = require('./config');
const { buscarPorAutor, buscarPorTitulo, normalizarTexto } = require('./buscar/gutendex');
const { formatearListaAutorConBotones, formatearLibroUnicoConBotones, obtenerMensajeEspecial } = require('./mensajes/formatear');
const { buscarPorAutorConPaginacion } = require('./buscar/openLibrary');
const {
    obtenerLibrosPorAutor,
    guardarLibrosPorAutor,
    obtenerEstadisticas,
    borrarTodo
} = require('./almacen/almacenManager');

// ==================== VARIABLES GLOBALES ====================
// Sesiones temporales para feedback
global.feedbackSesiones = new Map();

// ==================== EXTRAER PALABRAS CLAVE ====================
function extraerPalabrasClave(frase) {
    // Palabras muy cortas o comunes que se ignoran
    const palabrasIgnorar = ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 
                              'de', 'del', 'y', 'a', 'ante', 'bajo', 'cabe', 'con', 
                              'contra', 'desde', 'durante', 'en', 'entre', 'hacia', 
                              'hasta', 'mediante', 'para', 'por', 'según', 'sin', 
                              'so', 'sobre', 'tras', 'vs'];
    
    const palabras = frase.toLowerCase()
        .split(' ')
        .filter(palabra => palabra.length > 3 && !palabrasIgnorar.includes(palabra));
    
    return palabras.join(' ');
}

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
    let usoPalabrasClave = false;
    let libros = [];
    let totalEncontrados = 0;
    
    // Normalizar el título para búsqueda
    const tituloNormalizado = normalizarTexto(titulo);
    console.log(`   📝 Título normalizado: "${tituloNormalizado}"`);
    
    // Verificar caché local
    let librosCache = obtenerLibrosPorAutor(`titulo_${tituloNormalizado}`);
    
    if (librosCache && librosCache.length > 0) {
        const primeros5 = librosCache.slice(0, 5);
        const total = librosCache.length;
        
        let mensaje = '';
        
        // Si viene de caché, no sabemos si usó palabras clave, así que no mostramos aviso
        mensaje = `📚 BÚSQUEDA POR TÍTULO: "${titulo}"\n\n`;
        mensaje += `(${total} libros encontrados)\n\n`;
        
        primeros5.forEach((libro, idx) => {
            const numero = idx + 1;
            const año = libro.anio ? ` (${libro.anio})` : '';
            mensaje += `${numero}. ${libro.titulo} - ${libro.autor}${año}\n`;
        });
        
        mensaje += `\n👇 Toca el número del libro que quieres ver`;
        
        guardarBusqueda(usuarioId, `titulo_${tituloNormalizado}`, librosCache, 0, total);
        const { teclado } = formatearListaAutorConBotones(tituloNormalizado, primeros5, 0, total);
        
        // Añadir botones de feedback
        const feedbackKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback('👍 Sí', `feedback_ok_${Date.now()}`),
             Markup.button.callback('👎 No', `feedback_bad_${Date.now()}`)]
        ]);
        
        await ctx.reply(mensaje, { ...teclado });
        await ctx.reply('¿Te fue útil esta búsqueda?', feedbackKeyboard);
        return;
    }
    
    // Buscar en Open Library por título - PASO 1: Normalizado
    try {
        let resultados = await buscarPorTitulo(tituloNormalizado, 'es');
        libros = resultados;
        
        if (libros.length === 0) {
            resultados = await buscarPorTitulo(tituloNormalizado, 'en');
            libros = resultados;
        }
        
        // PASO 2: Si no hay resultados, extraer palabras clave
        if (libros.length === 0) {
            const palabrasClave = extraerPalabrasClave(tituloNormalizado);
            
            if (palabrasClave && palabrasClave !== tituloNormalizado && palabrasClave.length > 0) {
                console.log(`🔄 Reintentando con palabras clave: "${palabrasClave}"`);
                usoPalabrasClave = true;
                
                let resultadosClave = await buscarPorTitulo(palabrasClave, 'es');
                libros = resultadosClave;
                
                if (libros.length === 0) {
                    resultadosClave = await buscarPorTitulo(palabrasClave, 'en');
                    libros = resultadosClave;
                }
            }
        }
        
        if (libros.length > 0) {
            // Guardar en caché
            guardarLibrosPorAutor(`titulo_${tituloNormalizado}`, libros);
            const primeros5 = libros.slice(0, 5);
            totalEncontrados = libros.length;
            
            let mensaje = '';
            
            // Aviso si se usaron palabras clave
            if (usoPalabrasClave) {
                mensaje = `📌 No encontré el título exacto que buscabas. Te muestro resultados relacionados con las palabras clave de tu solicitud.\n\n`;
            }
            
            mensaje += `📚 BÚSQUEDA POR TÍTULO: "${titulo}"\n\n`;
            mensaje += `(${totalEncontrados} libros encontrados)\n\n`;
            
            primeros5.forEach((libro, idx) => {
                const numero = idx + 1;
                const año = libro.anio ? ` (${libro.anio})` : '';
                mensaje += `${numero}. ${libro.titulo} - ${libro.autor}${año}\n`;
            });
            
            mensaje += `\n👇 Toca el número del libro que quieres ver`;
            
            guardarBusqueda(usuarioId, `titulo_${tituloNormalizado}`, libros, 0, totalEncontrados);
            const { teclado } = formatearListaAutorConBotones(tituloNormalizado, primeros5, 0, totalEncontrados);
            
            // Añadir botones de feedback
            const feedbackKeyboard = Markup.inlineKeyboard([
                [Markup.button.callback('👍 Sí', `feedback_ok_${Date.now()}_${tituloNormalizado.substring(0, 20)}`),
                 Markup.button.callback('👎 No', `feedback_bad_${Date.now()}_${tituloNormalizado.substring(0, 20)}`)]
            ]);
            
            await ctx.reply(mensaje, { ...teclado });
            await ctx.reply('¿Te fue útil esta búsqueda?', feedbackKeyboard);
            return;
        }
    } catch (error) {
        console.error(`❌ Error en Open Library (título): ${error.message}`);
    }
    
    // No se encontraron resultados
    let mensaje = `📚 BÚSQUEDA POR TÍTULO: "${titulo}"\n\n`;
    mensaje += `No encontré libros con ese título.\n\n`;
    mensaje += `📘 Posibles razones:\n`;
    mensaje += `- El libro no está en dominio público\n`;
    mensaje += `- El título tiene otra edición o traducción\n`;
    mensaje += `- El libro está dentro de una colección o serie\n\n`;
    mensaje += `🔍 Sugerencias:\n`;
    mensaje += `- Usa /autor si conoces el autor\n`;
    mensaje += `- Prueba con palabras más cortas del título\n`;
    mensaje += `- Revisa la ortografía (tildes, mayúsculas)\n\n`;
    mensaje += `📌 Ejemplo: /titulo Trafalgar`;
    
    // Añadir feedback también cuando no hay resultados
    const feedbackKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('👍 Sí', `feedback_ok_${Date.now()}_${tituloNormalizado.substring(0, 20)}`),
         Markup.button.callback('👎 No', `feedback_bad_${Date.now()}_${tituloNormalizado.substring(0, 20)}`)]
    ]);
    
    await ctx.reply(mensaje);
    await ctx.reply('¿Te fue útil esta búsqueda?', feedbackKeyboard);
}

// ==================== HANDLER_START ====================
bot.command('start', async (ctx) => {
    await ctx.reply(
        '📖 ¡Bienvenido a PergaminosAbiertos!\n\n' +
        'Aquí encuentras libros en dominio público al instante.\n\n' +
        'Pruébalo ahora:\n' +
        '/autor Jose Marti\n\n' +
        '¿Ves los botones? Elige uno y el libro aparece.\n\n' +
        '📘 ¿Dudas? Escribe /ayuda y te explico cómo leer o descargar.\n\n' +
        '🔒 Solo mostramos libros en dominio público. Si no encuentras un título, puede que tenga derechos de autor.'
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

// ==================== HANDLER_AUTOR (modificado) ====================
bot.command('autor', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
    await ctx.reply(
        '📖 Dame un nombre y te ayudo.\n\n' +
        'Escribe /autor seguido del autor que te interesa.\n\n' +
        'Por ejemplo: /autor Jose Marti\n\n' +
        'Así encuentro sus libros en dominio público. 📚'
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
        '📖 Dame un título y lo busco.\n\n' +
        'Escribe /titulo seguido del libro que quieres leer.\n\n' +
        'Por ejemplo: /titulo El Principito\n\n' +
        'Así reviso si está en dominio público para ti. 📚'
    );
    return;
}
    
    await buscarTituloPrincipal(ctx, query);
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

// ==================== FEEDBACK CALLBACKS ====================
// Feedback positivo (👍)
bot.action(/^feedback_ok_(.+)$/, async (ctx) => {
    const data = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.reply('🙌 ¡Me alegra! Disfruta tu lectura.');
    
    // Opcional: enviar feedback positivo al creador (comentado por ahora para no saturar)
    /*
    const usuario = ctx.from;
    await ctx.telegram.sendMessage(ID_CREADOR, 
        `📊 FEEDBACK POSITIVO\n\n` +
        `Usuario: @${usuario.username || usuario.first_name}\n` +
        `ID: ${usuario.id}\n` +
        `Datos: ${data}\n` +
        `Fecha: ${new Date().toLocaleString()}`
    );
    */
});

// Feedback negativo (👎)
bot.action(/^feedback_bad_(.+)$/, async (ctx) => {
    const data = ctx.match[1];
    await ctx.answerCbQuery();
    
    // Guardar el término de búsqueda en sesión temporal para el feedback
    const usuarioId = ctx.from.id;
    const feedbackData = {
        termino: data,
        timestamp: Date.now()
    };
    
    // Almacenar en memoria (expira en 5 minutos)
    if (!feedbackSesiones) global.feedbackSesiones = new Map();
    feedbackSesiones.set(usuarioId, feedbackData);
    
    await ctx.reply(
        '📝 Gracias por tu honestidad. ¿Qué salió mal?\n\n' +
        'Responde con un número:\n' +
        '1️⃣ No encontré el libro que buscaba\n' +
        '2️⃣ Los resultados no son relevantes\n' +
        '3️⃣ El bot no entendió mi búsqueda\n' +
        '4️⃣ Otro problema (escríbelo brevemente)\n\n' +
        'Tu feedback me ayuda a mejorar. 🙏'
    );
});

// Manejar respuestas de texto después de feedback negativo
bot.on('text', async (ctx) => {
    const usuarioId = ctx.from.id;
    if (!global.feedbackSesiones) return;
    
    const feedbackData = global.feedbackSesiones.get(usuarioId);
    if (!feedbackData) return;
    
    // Verificar que no haya pasado más de 5 minutos
    if (Date.now() - feedbackData.timestamp > 5 * 60 * 1000) {
        global.feedbackSesiones.delete(usuarioId);
        return;
    }
    
    const respuesta = ctx.message.text;
    let motivo = '';
    
    // Mapear la respuesta del usuario
    if (respuesta === '1' || respuesta === '1️⃣') {
        motivo = '1️⃣ No encontré el libro que buscaba';
    } else if (respuesta === '2' || respuesta === '2️⃣') {
        motivo = '2️⃣ Los resultados no son relevantes';
    } else if (respuesta === '3' || respuesta === '3️⃣') {
        motivo = '3️⃣ El bot no entendió mi búsqueda';
    } else if (respuesta === '4' || respuesta === '4️⃣') {
        motivo = '4️⃣ Otro problema (pendiente de detalles)';
    } else {
        motivo = `4️⃣ Otro problema: "${respuesta.substring(0, 200)}"`;
    }
    
    // Enviar feedback al creador
    const usuario = ctx.from;
    const mensajeFeedback = 
        `📊 FEEDBACK RECIBIDO\n\n` +
        `Usuario: @${usuario.username || usuario.first_name}\n` +
        `ID: ${usuario.id}\n` +
        `Comando: /titulo\n` +
        `Término buscado: "${feedbackData.termino}"\n` +
        `Feedback: 👎 Negativo\n` +
        `Motivo: ${motivo}\n` +
        `Fecha: ${new Date().toLocaleString()}`;
    
    await ctx.telegram.sendMessage(ID_CREADOR, mensajeFeedback);
    
    // Responder al usuario
    await ctx.reply('🙏 Gracias por tu feedback. Lo tendré en cuenta para mejorar.');
    
    // Limpiar la sesión
    global.feedbackSesiones.delete(usuarioId);
});

// ==================== EXPORTS ====================
module.exports = bot;