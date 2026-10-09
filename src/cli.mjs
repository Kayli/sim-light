#!/usr/bin/env node
import { parseArgs } from 'node:util';

import { runServer } from './server.mjs';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '8000' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log('Usage: sim-light [--port <number>]');
  process.exit(0);
}

const port = Number.parseInt(values.port, 10);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Invalid port: ${values.port}`);
  process.exit(1);
}

runServer(port);
