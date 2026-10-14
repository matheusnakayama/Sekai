import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { catalogGameName, isCatalogGame, normalizeProcessName } = createRequire(import.meta.url)("../lib/gameCatalog.cjs");

test("Nine Sols is a catalog game and random apps are not", () => {
  assert.equal(catalogGameName("NineSols.exe"), "Nine Sols");
  assert.equal(catalogGameName("C:\\Games\\Nine Sols\\NineSols.exe"), "Nine Sols");
  assert.equal(isCatalogGame("ninesols"), true);
  for (const appName of ["spotify", "chrome", "discord", "Code", "msedge", "Sekai"]) {
    assert.equal(isCatalogGame(appName), false, appName);
    assert.equal(catalogGameName(appName), null);
  }
});

test("process names ignore the exe suffix and folders", () => {
  assert.equal(normalizeProcessName("  Valorant-Win64-Shipping.EXE "), "valorant-win64-shipping");
  assert.equal(catalogGameName("Valorant-Win64-Shipping.exe"), "VALORANT");
});
