// ==================== IMPORTACIONES ====================
require('dotenv').config();

// ==================== CONSTANTES ====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const GUTENDEX_API_URL = 'https://gutendex.com/books';

// ==================== VALIDACION ====================
if (!BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN no está definido en .env');
    console.error('📍 Archivo: src/config.js');
    console.error('🔧 Solución: Agrega BOT_TOKEN=tu_token_aqui en .env');
    process.exit(1);
}

console.log('✅ Configuración cargada correctamente');
console.log(`   📍 Puerto: ${PORT}`);
console.log(`   📍 API: ${GUTENDEX_API_URL}`);

// ==================== EXPORTS ====================
module.exports = {
    BOT_TOKEN,
    PORT,
    GUTENDEX_API_URL
};