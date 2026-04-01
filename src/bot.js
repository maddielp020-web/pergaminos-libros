// ==================== IMPORTACIONES ====================
const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config');

// ==================== INICIALIZACION ====================
const bot = new Telegraf(BOT_TOKEN);

console.log('🤖 Bot inicializado');

// ==================== HANDLER_START ====================
bot.command('start', async (ctx) => {
    console.log(`📩 Comando /start recibido de: ${ctx.from.id} (@${ctx.from.username || 'sin_username'})`);
    
    await ctx.reply(
        '📚 *Bienvenido a PergaminosLibros_Bot*\n\n' +
        'Este bot te ayuda a buscar libros de dominio público en Project Gutenberg.\n\n' +
        '🔍 *Comandos disponibles:*\n' +
        '• `/buscar [título]` - Busca libros por título\n' +
        '• `/help` - Muestra esta ayuda\n\n' +
        '✨ *Ejemplo:* `/buscar Frankenstein`\n\n' +
        '📖 *100% legal* - Solo redirijo a bibliotecas públicas.',
        { parse_mode: 'Markdown' }
    );
    
    console.log(`✅ Mensaje de bienvenida enviado a: ${ctx.from.id}`);
});

// ==================== HANDLER_BUSCAR ====================
const { buscarLibros, normalizarConsulta, detectarTipoConsulta } = require('./buscar/gutendex');
const { formatearResultados } = require('./mensajes/formatear');

bot.command('buscar', async (ctx) => {
    console.log(`🔍 Comando /buscar recibido de: ${ctx.from.id}`);
    
    const mensajeCompleto = ctx.message.text;
    const args = mensajeCompleto.split(' ').slice(1);
    const query = args.join(' ');
    
    if (!query) {
        console.log(`⚠️ Búsqueda vacía de: ${ctx.from.id}`);
        await ctx.reply(
            '❓ *¿Qué libro buscas?*\n\n' +
            'Usa el comando seguido del título o autor:\n' +
            '`/buscar Frankenstein`\n' +
            '`/buscar Mary Shelley`\n\n' +
            'También puedes buscar frases:\n' +
            '`/buscar el libro de Frankenstein`\n\n' +
            '💡 *Consejo:* El bot corrige errores comunes y elimina palabras vacías automáticamente.',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    console.log(`📖 Búsqueda solicitada: "${query}" (usuario: ${ctx.from.id})`);
    
    // Normalizar consulta
    const normalizada = normalizarConsulta(query);
    const consultaBase = normalizada.corregida || normalizada.limpia;
    
    // Si la consulta corregida está vacía, usar la original limpia
    const consultaFinal = consultaBase !== '' ? consultaBase : normalizada.limpia;
    
    console.log(`🔧 Consulta normalizada: "${normalizada.original}" → "${consultaFinal}"`);
    
    // Enviar mensaje de espera
    let mensajeEsperaTexto = `🔍 *Buscando* "${query}"...\n\n`;
    
    if (normalizada.modificada && consultaFinal !== normalizada.original) {
        mensajeEsperaTexto += `📝 *Corrigiendo:* "${normalizada.original}" → "${consultaFinal}"\n`;
    }
    
    mensajeEsperaTexto += `⏳ Consultando Project Gutenberg...`;
    
    const mensajeEspera = await ctx.reply(mensajeEsperaTexto, { parse_mode: 'Markdown' });
    
    try {
        // Detectar tipo de consulta
        let tipo = detectarTipoConsulta(consultaFinal);
        console.log(`🎯 Tipo detectado: ${tipo}`);
        
        // PRIMER INTENTO: Con consulta limpia y tipo detectado
        let libros = await buscarLibros(consultaFinal, 'es', tipo);
        
        // SEGUNDO INTENTO: Si no hay resultados y era autor, intentar como título
        if (libros.length === 0 && tipo === 'autor') {
            console.log(`🔄 Intentando búsqueda por título (fallback desde autor)`);
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                mensajeEspera.message_id,
                null,
                `${mensajeEsperaTexto}\n\n🔄 Sin resultados por autor. Probando por título...`,
                { parse_mode: 'Markdown' }
            );
            libros = await buscarLibros(consultaFinal, 'es', 'titulo');
            tipo = 'titulo';
        }
        
        // TERCER INTENTO: Si aún no hay resultados, intentar con inglés (título)
        if (libros.length === 0) {
            console.log(`🌎 Intentando búsqueda en inglés (fallback)`);
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                mensajeEspera.message_id,
                null,
                `${mensajeEsperaTexto}\n\n🌎 Sin resultados en español. Probando en inglés...`,
                { parse_mode: 'Markdown' }
            );
            libros = await buscarLibros(consultaFinal, 'en', 'titulo');
        }
        
        // CUARTO INTENTO: Si aún no hay resultados y la consulta original era diferente, probar con la original limpia
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
        
        // Formatear resultados con información de normalización
        const mensajeResultado = formatearResultados(libros, query, normalizada);
        
        // Añadir nota de corrección si aplica
        let mensajeFinal = mensajeResultado;
        if (libros.length > 0 && normalizada.modificada && consultaFinal !== query) {
            const notaCorreccion = `\n\n📝 *Nota:* Buscaste "${query}". Mostrando resultados para "${consultaFinal}".`;
            mensajeFinal = mensajeResultado.replace(/\n\n🔗 Fuente:/, `${notaCorreccion}\n\n🔗 Fuente:`);
        }
        
        // Añadir nota de tipo de búsqueda si fue por autor
        if (libros.length > 0 && tipo === 'autor') {
            const notaAutor = `\n\n👤 *Búsqueda por autor:* Estos son libros de "${consultaFinal}".`;
            mensajeFinal = mensajeFinal.replace(/\n\n🔗 Fuente:/, `${notaAutor}\n\n🔗 Fuente:`);
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
        console.error(`   Stack:`, error.stack);
        
        // Mensaje de error amigable
        let mensajeError = `❌ *Error en la búsqueda*\n\n` +
            `No pude consultar Project Gutenberg en este momento.\n\n` +
            `💡 *Sugerencias:*\n` +
            `• Intenta de nuevo en unos segundos\n` +
            `• Prueba con otro término de búsqueda\n` +
            `• Verifica tu conexión a internet\n` +
            `• Si el error persiste, avisa al administrador\n\n` +
            `🔍 *Buscabas:* "${query}"`;
        
        // Si la consulta fue corregida, mostrar qué intentamos buscar
        if (normalizada.modificada && consultaFinal !== query) {
            mensajeError += `\n\n📝 *Intenté buscar:* "${consultaFinal}"`;
        }
        
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            mensajeEspera.message_id,
            null,
            mensajeError,
            { parse_mode: 'Markdown' }
        );
    }
});

// ==================== HANDLER_HELP ====================
bot.command('help', async (ctx) => {
    console.log(`❓ Comando /help recibido de: ${ctx.from.id}`);
    
    await ctx.reply(
        '📖 *PergaminosLibros_Bot - Ayuda*\n\n' +
        '🔍 *Comandos:*\n' +
        '• `/start` - Inicia el bot\n' +
        '• `/buscar [título]` - Busca libros\n' +
        '• `/help` - Muestra esta ayuda\n\n' +
        '📚 *Ejemplos de búsqueda:*\n' +
        '• `/buscar Frankenstein`\n' +
        '• `/buscar Sherlock Holmes`\n' +
        '• `/buscar Moby Dick`\n\n' +
        '🌐 *Fuente:* Project Gutenberg (dominio público)\n' +
        '✨ *100% gratuito y legal*',
        { parse_mode: 'Markdown' }
    );
    
    console.log(`✅ Ayuda enviada a: ${ctx.from.id}`);
});

// ==================== EXPORTS ====================
module.exports = bot;