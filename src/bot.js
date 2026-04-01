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
const { buscarLibros } = require('./buscar/gutendex');
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
            'Usa el comando seguido del título:\n' +
            '`/buscar El Quijote`\n\n' +
            'O si prefieres, envía directamente el nombre del libro.',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    console.log(`📖 Búsqueda solicitada: "${query}" (usuario: ${ctx.from.id})`);
    
    // Enviar mensaje de espera
    const mensajeEspera = await ctx.reply(
        `🔍 *Buscando* "${query}"...\n\n` +
        `⏳ Consultando Project Gutenberg...`,
        { parse_mode: 'Markdown' }
    );
    
    try {
        // Buscar en español primero
        console.log(`🌎 Buscando en español: "${query}"`);
        let libros = await buscarLibros(query, 'es');
        
        // Si no hay resultados, buscar en inglés
        if (libros.length === 0) {
            console.log(`⚠️ Sin resultados en español, buscando en inglés: "${query}"`);
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                mensajeEspera.message_id,
                null,
                `🔍 *Buscando* "${query}"...\n\n` +
                `⏳ Sin resultados en español. Probando en inglés...`,
                { parse_mode: 'Markdown' }
            );
            libros = await buscarLibros(query, 'en');
        }
        
        // Formatear resultados
        const mensajeResultado = formatearResultados(libros, query);
        
        // Editar mensaje de espera con resultados
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            mensajeEspera.message_id,
            null,
            mensajeResultado,
            { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
        
        console.log(`✅ Resultados enviados para: "${query}" (${libros.length} libros)`);
        
    } catch (error) {
        console.error(`❌ Error en búsqueda de "${query}":`, error.message);
        
        // Mensaje de error amigable
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            mensajeEspera.message_id,
            null,
            `❌ *Error en la búsqueda*\n\n` +
            `No pude consultar Project Gutenberg en este momento.\n\n` +
            `💡 *Sugerencias:*\n` +
            `• Intenta de nuevo en unos segundos\n` +
            `• Prueba con otro término de búsqueda\n` +
            `• Si el error persiste, avisa al administrador\n\n` +
            `🔍 *Buscabas:* "${query}"`,
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