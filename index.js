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

// ==================== INICIO_BOT (VERSIÓN CORREGIDA SIN CONFLICTOS) ====================
console.log('🤖 Iniciando bot de Telegram...');

// Importar bot después del servidor
const bot = require('./src/bot');

// Función para iniciar el bot de forma segura
const iniciarBotSeguro = async () => {
    try {
        // Paso 1: Limpiar webhook completo
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log('✅ Webhook limpiado');
        
        // Paso 2: Forzar limpieza de todas las conexiones pendientes
        await bot.telegram.getUpdates({ offset: -1, timeout: 0 });
        console.log('✅ Conexiones anteriores eliminadas');
        
        // Paso 3: Iniciar el bot con opciones anti-conflicto
        await bot.launch({
            allowedUpdates: ['message', 'callback_query'],
            dropPendingUpdates: true
        });
        
        console.log('✅ Bot de Telegram iniciado correctamente');
        console.log('📍 Modo: Long Polling (sin conflictos)');
        console.log('🎯 Comandos disponibles: /start, /autor, /buscar, /titulo, /help');
        
    } catch (err) {
        console.error('❌ Error al iniciar el bot:', err.message);
        if (err.response) {
            console.error('   Detalle:', err.response.description);
        }
        process.exit(1);
    }
};

// Arrancar el servidor HTTP
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor HTTP escuchando en puerto: ${PORT}`);
    console.log(`   📍 Health check: http://0.0.0.0:${PORT}/health`);
    
    // Una vez que el servidor está corriendo, iniciar el bot
    // Esto evita el error 409 porque el servidor ya está completamente listo
    setTimeout(() => {
        iniciarBotSeguro();
    }, 2000); // Esperar 2 segundos extra para estar seguros
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

console.log('🎯 Sistema preparado. El bot arrancará cuando el servidor esté listo...');