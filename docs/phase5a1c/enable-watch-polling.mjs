// Local acceptance process only: avoid Windows EBUSY in fs.watch; no production config change.
import process from 'node:process';
process.env.CHOKIDAR_USEPOLLING='true';
