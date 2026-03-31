// ==================== IMPORTACIONES ====================
const axios = require('axios');
const { GUTENDEX_API_URL } = require('../config');

// ==================== CONFIGURACION ====================
console.log('🔌 Módulo gutendex.js cargado (FASE 1 - Placeholder)');

// ==================== FUNCION_BUSCAR ====================
/**
 * Busca libros en Gutendex por título
 * @param {string} query - Título a buscar
 * @returns {Promise<Array>} Lista de libros encontrados
 */
async function buscarLibros(query) {
    console.log(`📡 [PLACEHOLDER] Búsqueda en Gutendex: "${query}"`);
    console.log(`📍 URL configurada: ${GUTENDEX_API_URL}`);
    
    // TEMPORAL: Retorna estructura vacía para FASE 2
    // En la siguiente orden operativa se implementará la llamada real
    return [];
}

// ==================== EXPORTS ====================
module.exports = {
    buscarLibros
};