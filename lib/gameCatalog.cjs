const GAME_CATALOG = require("./gameCatalog.json");

const namesByProcess = new Map(GAME_CATALOG.map((game) => [game.process, game.name]));

function normalizeProcessName(value) {
  return String(value || "").trim().replace(/\.exe$/i, "").split(/[\\/]/).pop().toLowerCase();
}

function catalogGameName(processName) {
  return namesByProcess.get(normalizeProcessName(processName)) || null;
}

function isCatalogGame(processName) {
  return catalogGameName(processName) !== null;
}

module.exports = { GAME_CATALOG, catalogGameName, isCatalogGame, normalizeProcessName };
