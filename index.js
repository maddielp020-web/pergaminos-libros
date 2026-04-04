// ==================== IMPORTACIONES ====================
const express = require('express');
const { PORT, BOT_TOKEN } = require('./src/config');

// Fix para conflictos de Telegram
process.env.NTBA_FIX_319 = '1';
process.env.NTBA_FIX_350 = '1';

// Validación rápida
if (!BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN no está configurado');
    process.exit(1);
}

// ==================== CONFIGURACION ====================
const app = express();
console.log('🚀 Iniciando PergaminosLibros_Bot...');

// ==================== SERVIDOR_HTTP ====================
app.get('/', (req, res) => {
    console.log(`🌐 Health check recibido: ${req.ip}`);
    res.send('✅ PergaminosLibros_Bot está funcionando');
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'PergaminosLibros_Bot',
        timestamp: new Date().toISOString()
    });
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor HTTP escuchando en puerto: ${PORT}`);
    console.log(`   📍 Health check: http://0.0.0.0:${PORT}/health`);
});

// ==================== INICIO_BOT ====================
console.log('🤖 Iniciando bot de Telegram...');

// Importar bot después del servidor
const bot = require('./src/bot');

// Limpiar webhook antes de iniciar
bot.telegram.deleteWebhook({ drop_pending_updates: true })
    .then(() => {
        console.log('✅ Webhook limpiado');
        return bot.launch();
    })
    .then(() => {
        console.log('✅ Bot de Telegram iniciado correctamente');
        console.log('📍 Modo: Long Polling');
        console.log('🎯 Comandos disponibles: /start, /autor, /buscar, /titulo, /help');
    })
    .catch((err) => {
        console.error('❌ Error al iniciar el bot:', err.message);
        if (err.response) {
            console.error('   Detalle:', err.response.description);
        }
        process.exit(1);
    });

// ==================== MANEJO_ERRORES ====================
process.once('SIGINT', () => {
    console.log('🛑 Cerrando bot...');
    bot.stop('SIGINT');
    server.close(() => process.exit(0));
});

process.once('SIGTERM', () => {
    console.log('🛑 Cerrando bot...');
    bot.stop('SIGTERM');
    server.close(() => process.exit(0));
});

console.log('🎯 Sistema listo. Esperando comandos...');