const fs = require("fs");

const AUTH_KEY = /^sb-[A-Za-z0-9_-]{1,120}$/;
const MAX_VALUE = 100000;

function readStore(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const store = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (AUTH_KEY.test(key) && typeof value === "string" && value.length <= MAX_VALUE) store[key] = value;
    }
    return store;
  } catch {
    return {};
  }
}

function writeStore(filePath, store) {
  const directory = require("path").dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  const fd = fs.openSync(temporary, "w");
  try {
    fs.writeFileSync(fd, JSON.stringify(store));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, filePath);
}

function createAuthSessionFile(filePath) {
  return {
    get(key) {
      if (!AUTH_KEY.test(String(key || ""))) return null;
      const store = readStore(filePath);
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    set(key, value) {
      const name = String(key || "");
      if (!AUTH_KEY.test(name) || typeof value !== "string" || value.length > MAX_VALUE) return false;
      const store = readStore(filePath);
      store[name] = value;
      writeStore(filePath, store);
      return true;
    },
    remove(key) {
      const name = String(key || "");
      if (!AUTH_KEY.test(name)) return false;
      const store = readStore(filePath);
      if (!Object.prototype.hasOwnProperty.call(store, name)) return true;
      delete store[name];
      writeStore(filePath, store);
      return true;
    },
  };
}

module.exports = { AUTH_KEY, createAuthSessionFile };
