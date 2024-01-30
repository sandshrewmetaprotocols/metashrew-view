#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs-extra');
const yargs = require('yargs');
const { getLogger } = require('../lib/logger');
const { run } = require('../lib');

const PROGRAM_PATH = process.env.PROGRAM_PATH || '/mnt/volume/indexer.wasm';

(async () => {
  const program = new Uint8Array(Buffer.from(await fs.readFile(PROGRAM_PATH))).buffer;
  await run(program);
})().catch((err) => logger.error(err));
