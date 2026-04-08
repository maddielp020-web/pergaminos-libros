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

// Variable global para evitar múltiples inicios
let botIniciado = false;

// Función para iniciar el bot de forma segura (SOLO UNA VEZ)
const iniciarBotSeguro = async () => {
    // Evitar ejecutar si ya se inició
    if (botIniciado) {
        console.log('⚠️ El bot ya está iniciado, ignorando llamada duplicada');
        return;
    }
    
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
        
        botIniciado = true;
        console.log('✅ Bot de Telegram iniciado correctamente');
        console.log('📍 Modo: Long Polling (sin conflictos)');
        console.log('🎯 Comandos disponibles: /start, /autor, /buscar, /titulo, /help');
        
    } catch (err) {
        console.error('❌ Error al iniciar el bot:', err.message);
        if (err.response) {
            console.error('   Detalle:', err.response.description);
        }
        // No salimos con process.exit(1) para evitar reinicios en bucle
        console.log('⚠️ El bot no se inició, pero el servidor HTTP sigue funcionando');
    }
};

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