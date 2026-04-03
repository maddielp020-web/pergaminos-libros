// ==================== IMPORTACIONES ====================
const express = require('express');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

// Importar configuración con fallback
let PORT = process.env.PORT || 10000;

try {
    const config = require('./src/config');
    if (config.PORT) PORT = config.PORT;
} catch (err) {
    console.log('⚠️ No se pudo cargar config.js, usando PORT por defecto:', PORT);
}

const bot = require('./src/bot');

// ==================== CONFIGURACION ====================
const app = express();
console.log('🚀 Iniciando PergaminosLibros_Bot...');

// ==================== SERVIDOR_HTTP ====================
// Endpoint de salud para Render
app.get('/', (req, res) => {
    console.log(`🌐 Health check recibido: ${req.ip}`);
    res.send('✅ PergaminosLibros_Bot está funcionando');
});

app.get('/health', (req, res) => {
    console.log(`❤️ Health check detallado: ${req.ip}`);
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

bot.launch()
    .then(() => {
        console.log('✅ Bot de Telegram iniciado correctamente');
        console.log('📍 Modo: Long Polling');
        console.log('🎯 Comandos disponibles: /start, /autor, /buscar, /titulo');
    })
    .catch((err) => {
        console.error('❌ Error al iniciar el bot:', err.message);
        console.error('📍 Stack trace:', err.stack);
        process.exit(1);
    });

// ==================== MANEJO_ERRORES ====================
process.once('SIGINT', () => {
    console.log('🛑 Recibida señal SIGINT (Ctrl+C)');
    console.log('🔌 Cerrando bot...');
    bot.stop('SIGINT');
    server.close(() => {
        console.log('✅ Servidor HTTP cerrado');
        process.exit(0);
    });
});

process.once('SIGTERM', () => {
    console.log('🛑 Recibida señal SIGTERM');
    console.log('🔌 Cerrando bot...');
    bot.stop('SIGTERM');
    server.close(() => {
        console.log('✅ Servidor HTTP cerrado');
        process.exit(0);
    });
});

console.log('🎯 Sistema listo. Esperando comandos...');