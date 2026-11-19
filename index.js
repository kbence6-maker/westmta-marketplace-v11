require('dotenv').config();
const { initDatabase } = require('./db');
const { startServer } = require('./server');
const { startBot } = require('./bot');

initDatabase();
startServer();
if (process.env.DISCORD_TOKEN) {
  startBot().catch((error) => console.error('[Discord] Indítási hiba:', error));
} else {
  console.warn('[Discord] DISCORD_TOKEN nincs beállítva: a weboldal működik, a bot nem indul.');
}
