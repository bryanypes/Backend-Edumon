/**
 * MongoDB efímero (en memoria) para ensayar la demo sin Docker y sin tocar
 * ninguna base existente. Se borra al cerrar el proceso (Ctrl+C).
 *
 *   node tests/demo/mongoEfimero.mjs --puerto 27999
 *   → MONGO_URI=mongodb://127.0.0.1:27999/edumon_demo
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

const i = process.argv.indexOf('--puerto');
const port = i > -1 ? Number(process.argv[i + 1]) : 27999;
const servidor = await MongoMemoryServer.create({ instance: { port, ip: '127.0.0.1' } });
console.log(`MONGO_URI=${servidor.getUri('edumon_demo')}`);
const cerrar = async () => { await servidor.stop(); process.exit(0); };
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
