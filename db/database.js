const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const raw = new DatabaseSync(path.join(__dirname, 'riderent.sqlite'));
raw.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
module.exports = {
 prepare: sql => raw.prepare(sql), exec: sql => raw.exec(sql),
 pragma: sql => raw.prepare('PRAGMA '+sql).all(),
 transaction: fn => (...args) => { raw.exec('BEGIN IMMEDIATE'); try { const result=fn(...args); raw.exec('COMMIT'); return result; } catch(e) { raw.exec('ROLLBACK'); throw e; } },
 close: () => raw.close()
};
