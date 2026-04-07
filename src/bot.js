// ==================== IMPORTACIONES ====================
const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config');
const { buscarPorAutor: buscarPorAutorGutendex, buscarPorTitulo: buscarPorTituloGutendex, normalizarTexto } = require('./buscar/gutendex');
const { formatearListaAutorConBotones, formatearLibroUnicoConBotones, obtenerMensajeEspecial } = require('./mensajes/formatear');
const { buscarPorAutorConPaginacion, buscarPorTitulo } = require('./buscar/openLibrary');
const {
    obtenerLibrosPorAutor,
    guardarLibrosPorAutor,
    obtenerEstadisticas,
    borrarTodo
} = require('./almacen/almacenManager');
// ==================== EXTRAER PALABRAS CLAVE ====================
function extraerPalabrasClave(frase, modo = 'simple') {
    // Palabras muy cortas o comunes que se ignoran
    const palabrasIgnorar = ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 
                              'de', 'del', 'y', 'a', 'ante', 'bajo', 'cabe', 'con', 
                              'contra', 'desde', 'durante', 'en', 'entre', 'hacia', 
                              'hasta', 'mediante', 'para', 'por', 'según', 'sin', 
                              'so', 'sobre', 'tras', 'vs', 'e', 'ni', 'o', 'u'];
    
    const palabras = frase.toLowerCase()
        .split(' ')
        .filter(palabra => {
            // Permitir números (ej: 1984)
            if (/^\d+$/.test(palabra)) return true;
            // Palabras de 3 o más letras que no sean palabras ignoradas
            return palabra.length >= 3 && !palabrasIgnorar.includes(palabra);
        });
    
    if (modo === 'simple') {
        // Si no hay palabras después de filtrar, usar la primera palabra original (último recurso)
        if (palabras.length === 0) {
            const primeraPalabra = frase.toLowerCase().split(' ')[0];
            return primeraPalabra || '';
        }
        
        // Usar la palabra MÁS LARGA (más específica, menos común)
        const palabraMasLarga = palabras.reduce((a, b) => a.length >= b.length ? a : b);
        return palabraMasLarga;
    }
    
    // Modo 'multiple': primeras 2-3 palabras (para búsqueda más amplia)
    return palabras.slice(0, 3).join(' ');
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
        let libros = await buscarPorAutorGutendex(autor, 'es');
        if (libros.length === 0) {
            libros = await buscarPorAutorGutendex(autor, 'en');
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
    
    // Normalizar el título para búsqueda
    const tituloNormalizado = normalizarTexto(titulo);
    console.log(`   📝 Título normalizado: "${tituloNormalizado}"`);
    
    // Verificar caché local
    let librosCache = obtenerLibrosPorAutor(`titulo_${tituloNormalizado}`);
    
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
        
        guardarBusqueda(usuarioId, `titulo_${tituloNormalizado}`, librosCache, 0, total);
        const { teclado } = formatearListaAutorConBotones(tituloNormalizado, primeros5, 0, total);
        await ctx.reply(mensaje, { ...teclado });
        return;
    }
    
    // Paso 1: Buscar con título normalizado
    let libros = [];
    let usoPalabrasClave = false;
    
    try {
        let resultados = await buscarPorTitulo(tituloNormalizado, 'es');
        libros = resultados;
        
        if (libros.length === 0) {
            resultados = await buscarPorTitulo(tituloNormalizado, 'en');
            libros = resultados;
        }
        
        // Paso 2: Si no hay resultados, usar palabra clave (MODO SIMPLE - UNA SOLA PALABRA)
        if (libros.length === 0) {
            const palabraClave = extraerPalabrasClave(tituloNormalizado, 'simple');
            
            if (palabraClave && palabraClave !== tituloNormalizado && palabraClave.length > 0) {
                console.log(`🔄 Reintentando con palabra clave simple: "${palabraClave}"`);
                usoPalabrasClave = true;
                
                let resultadosClave = await buscarPorTitulo(palabraClave, 'es');
                libros = resultadosClave;
                
                if (libros.length === 0) {
                    resultadosClave = await buscarPorTitulo(palabraClave, 'en');
                    libros = resultadosClave;
                }
            }
        }
        
        if (libros.length > 0) {
            guardarLibrosPorAutor(`titulo_${tituloNormalizado}`, libros);
            const primeros5 = libros.slice(0, 5);
            const total = libros.length;
            
            let mensaje = '';
            
            if (usoPalabrasClave) {
                const palabraUsada = extraerPalabrasClave(tituloNormalizado, 'simple');
                mensaje = `📌 No encontré el título exacto "${titulo}". Te muestro resultados relacionados con la palabra clave "${palabraUsada}".\n\n`;
            }
            
            mensaje += `📚 BÚSQUEDA POR TÍTULO: "${titulo}"\n\n`;
            mensaje += `(${total} libros encontrados)\n\n`;
            
            primeros5.forEach((libro, idx) => {
                const numero = idx + 1;
                const año = libro.anio ? ` (${libro.anio})` : '';
                mensaje += `${numero}. ${libro.titulo} - ${libro.autor}${año}\n`;
            });
            
            mensaje += `\n👇 Toca el número del libro que quieres ver`;
            
            guardarBusqueda(usuarioId, `titulo_${tituloNormalizado}`, libros, 0, total);
            
            // ==================== CREAR_TECLADO_TITULOS ====================
// Crear teclado con botones numéricos para títulos
const botonesNumericos = [];
const maxBotones = Math.min(primeros5.length, 5);

// Crear fila de botones numéricos
for (let i = 0; i < maxBotones; i++) {
    botonesNumericos.push({
        text: `${i + 1}`,
        callback_data: `libro_${i + 1}`
    });
}

const inline_keyboard = [];
inline_keyboard.push(botonesNumericos);

// Agregar botón "Ver más títulos" si hay más de 5
if (total > 5) {
    inline_keyboard.push([{ 
        text: '📖 Ver más títulos', 
        callback_data: `mas_titulo_${encodeURIComponent(titulo)}_0` 
    }]);
}

const teclado = {
    reply_markup: { inline_keyboard }
};

await ctx.reply(mensaje, { ...teclado });
            
            await ctx.reply(mensaje, { ...teclado });
            
            return;
        }
    } catch (error) {
        console.error(`❌ Error en Open Library (título): ${error.message}`);
    }
    
    // ==================== FALLBACK_GUTENDEX_TITULO ====================
try {
    console.log(`🔄 Intentando Gutendex para título: "${tituloNormalizado}"`);
    let librosGutendex = await buscarPorTituloGutendex(tituloNormalizado, 'es');
    
    if (librosGutendex.length === 0) {
        librosGutendex = await buscarPorTituloGutendex(tituloNormalizado, 'en');
    }
    
    if (librosGutendex.length > 0) {
        guardarLibrosPorAutor(`titulo_${tituloNormalizado}`, librosGutendex);
        const primeros5 = librosGutendex.slice(0, 5);
        const total = librosGutendex.length;
        
        let mensaje = `📚 BÚSQUEDA POR TÍTULO (Gutendex): "${titulo}"\n\n`;
        mensaje += `(${total} libros encontrados)\n\n`;
        
        primeros5.forEach((libro, idx) => {
            const numero = idx + 1;
            const año = libro.anio ? ` (${libro.anio})` : '';
            mensaje += `${numero}. ${libro.titulo} - ${libro.autor}${año}\n`;
        });
        
        mensaje += `\n👇 Toca el número del libro que quieres ver`;
        
        guardarBusqueda(usuarioId, `titulo_${tituloNormalizado}`, librosGutendex, 0, total);
        
        // Crear teclado con botones numéricos
        const botonesNumericos = [];
        for (let i = 0; i < primeros5.length; i++) {
            botonesNumericos.push({ text: `${i + 1}`, callback_data: `libro_${i + 1}` });
        }
        
        const inline_keyboard = [botonesNumericos];
        if (total > 5) {
            inline_keyboard.push([{ 
                text: '📖 Ver más títulos', 
                callback_data: `mas_titulo_${encodeURIComponent(titulo)}_0` 
            }]);
        }
        
        const teclado = { reply_markup: { inline_keyboard } };
        await ctx.reply(mensaje, { ...teclado });
        return;
    }
} catch (error) {
    console.error(`❌ Error en Gutendex (título): ${error.message}`);
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
    
    await ctx.reply(mensaje);
}

// ==================== HANDLER_START ====================
bot.command('start', async (ctx) => {
    await ctx.reply(
        '📖 ¡Bienvenido a PergaminosAbiertos!\n\n' +
        'Aquí encuentras libros en dominio público al instante.\n\n' +
        '📚 COMANDOS PRINCIPALES:\n\n' +
        '/autor Jose Marti\n' +
        '→ Busca libros por autor\n\n' +
        '/titulo El Principito\n' +
        '→ Busca libros por título\n\n' +
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
        '4. Si hay más de 5, toca "📖 Ver más libros" (en autores) o "📖 Ver más títulos" (en títulos)\n\n' +
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
    mensaje += `- Prueba con /titulo si conoces el título exacto\n`
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

// ==================== BOTÓN VER MÁS TÍTULOS ====================
bot.action(/^mas_titulo_(.+)_(\d+)$/, async (ctx) => {
    let titulo = ctx.match[1];
    const paginaActual = parseInt(ctx.match[2]);
    const usuarioId = ctx.from.id;
    
    // Decodificar el título (convertir %20 a espacios)
    titulo = decodeURIComponent(titulo);
    const claveBusqueda = `titulo_${titulo}`;
    const busqueda = obtenerBusqueda(usuarioId);
    
    if (!busqueda || busqueda.autor !== claveBusqueda) {
        await ctx.answerCbQuery('Búsqueda no encontrada');
        await ctx.reply(`❓ Primero buscá el título con: /titulo ${titulo}`);
        return;
    }
    
    const nuevaPagina = paginaActual;
    const offset = nuevaPagina * 5;
    
    if (offset >= busqueda.totalLibros) {
        await ctx.answerCbQuery('No hay más libros');
        await ctx.reply(`📚 *No hay más títulos para* "${titulo}"`);
        return;
    }
    
    const librosPagina = busqueda.libros.slice(offset, offset + 5);
    
    if (librosPagina.length === 0) {
        await ctx.answerCbQuery('No hay más libros');
        return;
    }
    
    let mensaje = `📚 BÚSQUEDA POR TÍTULO: "${titulo}"\n\n`;
    mensaje += `(${busqueda.totalLibros} libros encontrados)\n\n`;
    
    librosPagina.forEach((libro, idx) => {
        const numero = offset + idx + 1;
        const año = libro.anio ? ` (${libro.anio})` : '';
        mensaje += `${numero}. ${libro.titulo} - ${libro.autor}${año}\n`;
    });
    
    mensaje += `\n👇 Toca el número del libro que quieres ver`;

// ==================== BOTÓN VER MÁS LIBROS (AUTOR) ====================
bot.action(/^mas_autor_(.+)_(\d+)$/, async (ctx) => {
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
        
        const { mensaje, teclado } = formatearListaAutorConBotones(autor, librosActualizados, nuevaPagina, busqueda.totalLibros);
        guardarBusqueda(usuarioId, autor, librosActualizados, nuevaPagina, busqueda.totalLibros);
        
        await ctx.answerCbQuery(`Página ${nuevaPagina + 1}`);
        await ctx.reply(mensaje, { ...teclado });
        
    } catch (error) {
        console.error(`❌ Error en paginación de autor: ${error.message}`);
        await ctx.answerCbQuery('Error al cargar');
    }
});
    
    // ==================== TECLADO_PAGINACION_TITULOS ====================
const botonesNumericos = [];
const inicioNumero = offset + 1;

for (let i = 0; i < librosPagina.length; i++) {
    botonesNumericos.push({
        text: `${inicioNumero + i}`,
        callback_data: `libro_${inicioNumero + i}`
    });
}

const inline_keyboard = [];
inline_keyboard.push(botonesNumericos);

// Agregar botón "Ver más títulos" si hay más páginas
if (offset + 5 < busqueda.totalLibros) {
    inline_keyboard.push([{ 
        text: '📖 Ver más títulos', 
        callback_data: `mas_titulo_${encodeURIComponent(titulo)}_${nuevaPagina + 1}` 
    }]);
}

const teclado = {
    reply_markup: { inline_keyboard }
};
    
    guardarBusqueda(usuarioId, claveBusqueda, busqueda.libros, nuevaPagina, busqueda.totalLibros);
    
    await ctx.answerCbQuery(`Página ${nuevaPagina + 1}`);
    await ctx.reply(mensaje, { ...teclado });
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