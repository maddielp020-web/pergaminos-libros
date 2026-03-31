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
    
    // TEMPORAL: Respuesta sin búsqueda real
    // FASE 2: Conectar con gutendex.js
    await ctx.reply(
        `🔍 *Buscando:* "${query}"\n\n` +
        '⏳ *FASE 1 - Funcionalidad temporal*\n' +
        'Esta es una respuesta de prueba. En la próxima fase, ' +
        'conectaré con Project Gutenberg para mostrar resultados reales.\n\n' +
        '✅ El bot funciona correctamente. Espera la siguiente orden operativa.',
        { parse_mode: 'Markdown' }
    );
    
    console.log(`✅ Respuesta temporal enviada para: "${query}"`);
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