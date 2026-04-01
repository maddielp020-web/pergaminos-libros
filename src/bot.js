// ==================== IMPORTACIONES ====================
const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config');
const { buscarLibros, buscarPorAutorConFallback, normalizarConsulta, formatearNombreAutor } = require('./buscar/gutendex');
const { formatearResultados } = require('./mensajes/formatear');

// ==================== INICIALIZACION ====================
const bot = new Telegraf(BOT_TOKEN);

console.log('🤖 Bot inicializado (FASE 3 - Comandos /titulo y /autor)');

// ==================== FUNCION_AUXILIAR_BUSQUEDA ====================
/**
 * Función auxiliar para manejar búsquedas por título o autor
 * @param {Object} ctx - Contexto de Telegraf
 * @param {string} query - Término de búsqueda
 * @param {string} tipo - 'titulo' o 'autor'
 */
async function manejarBusqueda(ctx, query, tipo) {
    console.log(`📖 Búsqueda solicitada: "${query}" (tipo: ${tipo}, usuario: ${ctx.from.id})`);
    
    // Normalizar consulta
    const normalizada = normalizarConsulta(query);
    const consultaBase = normalizada.corregida || normalizada.limpia;
    const consultaFinal = consultaBase !== '' ? consultaBase : normalizada.limpia;
    
    console.log(`🔧 Consulta normalizada: "${normalizada.original}" → "${consultaFinal}"`);
    
    // Enviar mensaje de espera
    let mensajeEsperaTexto = `🔍 *Buscando por ${tipo}* "${query}"...\n\n`;
    
    if (normalizada.modificada && consultaFinal !== normalizada.original) {
        mensajeEsperaTexto += `📝 *Corrigiendo:* "${normalizada.original}" → "${consultaFinal}"\n`;
    }
    
    mensajeEsperaTexto += `⏳ Consultando Project Gutenberg...`;
    
    const mensajeEspera = await ctx.reply(mensajeEsperaTexto, { parse_mode: 'Markdown' });
    
    try {
        let libros = [];
        
        // Búsqueda según tipo
        if (tipo === 'autor') {
            // Usar función con fallback para autores
            libros = await buscarPorAutorConFallback(consultaFinal, 'es');
            
            // Si no hay resultados en español, intentar en inglés
            if (libros.length === 0) {
                console.log(`🌎 Intentando búsqueda por autor en inglés`);
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    mensajeEspera.message_id,
                    null,
                    `${mensajeEsperaTexto}\n\n🌎 Sin resultados en español. Probando en inglés...`,
                    { parse_mode: 'Markdown' }
                );
                libros = await buscarPorAutorConFallback(consultaFinal, 'en');
            }
        } else {
            // Búsqueda por título (con el flujo existente)
            libros = await buscarLibros(consultaFinal, 'es', 'titulo');
            
            // Si no hay resultados, intentar en inglés
            if (libros.length === 0) {
                console.log(`🌎 Intentando búsqueda por título en inglés`);
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    mensajeEspera.message_id,
                    null,
                    `${mensajeEsperaTexto}\n\n🌎 Sin resultados en español. Probando en inglés...`,
                    { parse_mode: 'Markdown' }
                );
                libros = await buscarLibros(consultaFinal, 'en', 'titulo');
            }
            
            // Si aún no hay resultados y la consulta original era diferente, probar con la original limpia
            if (libros.length === 0 && consultaFinal !== normalizada.limpia && normalizada.limpia !== '') {
                console.log(`🔄 Intentando con consulta limpia original: "${normalizada.limpia}"`);
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    mensajeEspera.message_id,
                    null,
                    `${mensajeEsperaTexto}\n\n🔄 Probando con: "${normalizada.limpia}"...`,
                    { parse_mode: 'Markdown' }
                );
                libros = await buscarLibros(normalizada.limpia, 'es', 'titulo');
            }
        }
        
        // Formatear resultados
        const mensajeResultado = formatearResultados(libros, query, normalizada);
        
        // Añadir nota de tipo de búsqueda
        let mensajeFinal = mensajeResultado;
        const notaTipo = `\n\n🔍 *Tipo de búsqueda:* ${tipo === 'autor' ? 'por autor 👤' : 'por título 📖'}`;
        mensajeFinal = mensajeFinal.replace(/\n\n🔗 Fuente:/, `${notaTipo}\n\n🔗 Fuente:`);
        
        // Añadir nota de corrección si aplica
        if (libros.length > 0 && normalizada.modificada && consultaFinal !== query) {
            const notaCorreccion = `\n\n📝 *Nota:* Buscaste "${query}". Mostrando resultados para "${consultaFinal}".`;
            mensajeFinal = mensajeFinal.replace(/\n\n🔗 Fuente:/, `${notaCorreccion}\n\n🔗 Fuente:`);
        }
        
        // Editar mensaje de espera con resultados
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            mensajeEspera.message_id,
            null,
            mensajeFinal,
            { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
        
        console.log(`✅ Resultados enviados para: "${query}" (${libros.length} libros, tipo: ${tipo})`);
        
    } catch (error) {
        console.error(`❌ Error en búsqueda de "${query}":`, error.message);
        
        // Mensaje de error amigable
        let mensajeError = `❌ *Error en la búsqueda*\n\n` +
            `No pude consultar Project Gutenberg en este momento.\n\n` +
            `💡 *Sugerencias:*\n` +
            `• Intenta de nuevo en unos segundos\n` +
            `• Prueba con otro término de búsqueda\n` +
            `• Verifica tu conexión a internet\n` +
            `• Si el error persiste, avisa al administrador\n\n` +
            `🔍 *Buscabas:* "${query}" (${tipo})`;
        
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            mensajeEspera.message_id,
            null,
            mensajeError,
            { parse_mode: 'Markdown' }
        );
    }
}

// ==================== HANDLER_TITULO ====================
bot.command('titulo', async (ctx) => {
    console.log(`📚 Comando /titulo recibido de: ${ctx.from.id}`);
    
    const mensajeCompleto = ctx.message.text;
    const args = mensajeCompleto.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        console.log(`⚠️ Título vacío de: ${ctx.from.id}`);
        await ctx.reply(
            '❓ *¿Qué libro buscas?*\n\n' +
            'Usa el comando seguido del título:\n' +
            '`/titulo Frankenstein`\n' +
            '`/titulo El Quijote`\n\n' +
            '💡 *Consejo:* Puedes usar frases completas, yo limpio palabras vacías automáticamente.',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    await manejarBusqueda(ctx, query, 'titulo');
});

// ==================== HANDLER_AUTOR ====================
bot.command('autor', async (ctx) => {
    console.log(`👤 Comando /autor recibido de: ${ctx.from.id}`);
    
    const mensajeCompleto = ctx.message.text;
    const args = mensajeCompleto.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        console.log(`⚠️ Autor vacío de: ${ctx.from.id}`);
        await ctx.reply(
            '❓ *¿Qué autor buscas?*\n\n' +
            'Usa el comando seguido del nombre del autor:\n' +
            '`/autor Mary Shelley`\n' +
            '`/autor Jane Austen`\n' +
            '`/autor Charles Dickens`\n\n' +
            '💡 *Consejo:* Puedes buscar en español o inglés. El bot intenta ambos idiomas automáticamente.',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    await manejarBusqueda(ctx, query, 'autor');
});

// ==================== HANDLER_BUSCAR ====================
// Mantener /buscar como alias de /titulo para compatibilidad
bot.command('buscar', async (ctx) => {
    console.log(`🔍 Comando /buscar recibido de: ${ctx.from.id} (alias de /titulo)`);
    
    const mensajeCompleto = ctx.message.text;
    const args = mensajeCompleto.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        await ctx.reply(
            '❓ *¿Qué libro buscas?*\n\n' +
            'Usa el comando seguido del título:\n' +
            '`/buscar Frankenstein`\n\n' +
            '📌 *Nuevos comandos disponibles:*\n' +
            '• `/titulo [título]` - Busca por título\n' +
            '• `/autor [nombre]` - Busca por autor\n\n' +
            'Escribe `/help` para ver todos los comandos.',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    await manejarBusqueda(ctx, query, 'titulo');
});

// ==================== HANDLER_START ====================
bot.command('start', async (ctx) => {
    console.log(`📩 Comando /start recibido de: ${ctx.from.id} (@${ctx.from.username || 'sin_username'})`);
    
    await ctx.reply(
        '📚 *Bienvenido a PergaminosLibros_Bot*\n\n' +
        'Este bot te ayuda a buscar libros de dominio público en Project Gutenberg.\n\n' +
        '🔍 *Comandos disponibles:*\n' +
        '• `/titulo [título]` - Busca libros por título\n' +
        '• `/autor [nombre]` - Busca libros por autor\n' +
        '• `/buscar [título]` - Alias de /titulo\n' +
        '• `/help` - Muestra esta ayuda\n\n' +
        '✨ *Ejemplos:*\n' +
        '`/titulo Frankenstein`\n' +
        '`/autor Mary Shelley`\n\n' +
        '📖 *100% legal* - Solo redirijo a bibliotecas públicas.',
        { parse_mode: 'Markdown' }
    );
    
    console.log(`✅ Mensaje de bienvenida enviado a: ${ctx.from.id}`);
});

// ==================== HANDLER_HELP ====================
bot.command('help', async (ctx) => {
    console.log(`❓ Comando /help recibido de: ${ctx.from.id}`);
    
    await ctx.reply(
        '📖 *PergaminosLibros_Bot - Ayuda*\n\n' +
        '🔍 *Comandos:*\n' +
        '• `/start` - Inicia el bot\n' +
        '• `/titulo [título]` - Busca libros por título\n' +
        '• `/autor [nombre]` - Busca libros por autor\n' +
        '• `/buscar [título]` - Alias de /titulo\n' +
        '• `/help` - Muestra esta ayuda\n\n' +
        '📚 *Ejemplos de búsqueda:*\n' +
        '• Por título: `/titulo Frankenstein`\n' +
        '• Por autor: `/autor Mary Shelley`\n' +
        '• En español: `/titulo El Quijote`\n' +
        '• En inglés: `/autor Mark Twain`\n\n' +
        '💡 *Características:*\n' +
        '• Corrige errores ortográficos comunes\n' +
        '• Elimina palabras vacías automáticamente\n' +
        '• Busca en español, fallback a inglés\n' +
        '• Para autores, prueba con "Nombre Apellido" o "Apellido, Nombre"\n\n' +
        '🌐 *Fuente:* Project Gutenberg (dominio público)\n' +
        '✨ *100% gratuito y legal*',
        { parse_mode: 'Markdown' }
    );
    
    console.log(`✅ Ayuda enviada a: ${ctx.from.id}`);
});

// ==================== EXPORTS ====================
module.exports = bot;