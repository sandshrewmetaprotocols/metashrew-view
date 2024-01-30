import express from "express";
import rocksdb from "rocksdb";
import bodyParser from "body-parser";
import { getLogger } from "./logger";
import EventEmitter from "events";
import rlp from "rlp";
import { ethers } from "ethers";
import chunk from "lodash/chunk";

const DB_LOCATION = process.env.DB_LOCATION;

const logger = getLogger();

export const readArrayBufferAsUtf8 = (
  memory: WebAssembly.Memory,
  ptr: number,
) => {
  return Buffer.from(
    Array.from(new Uint8Array(readArrayBuffer(memory, ptr))),
  ).toString("utf8");
};

export const readArrayBufferAsHex = (
  memory: WebAssembly.Memory,
  ptr: number,
) => {
  return (
    "0x" +
    Buffer.from(
      Array.from(new Uint8Array(readArrayBuffer(memory, ptr))),
    ).toString("hex")
  );
};

export const readArrayBuffer = (memory: WebAssembly.Memory, ptr: number) => {
  const ary = Array.from(new Uint8Array(memory.buffer));
  const data = Buffer.from(ary);
  const length = data.readUInt32LE(ptr - 4);
  return new Uint8Array(ary.slice(ptr, ptr + length)).buffer;
};

const stripHexPrefix = (s) => (s.substr(0, 2) === "0x" ? s.substr(2) : s);
const addHexPrefix = (s) => (s.substr(0, 2) === "0x" ? s : "0x" + s);

export class IndexSandbox extends EventEmitter {
  public input: string;
  public program: ArrayBuffer;
  public kv: any;
  public db: any;
  constructor(program: ArrayBuffer) {
    super();
    this.program = program;
    this.db = rocksdb(DB_LOCATION);
  }
  async openDatabase() {
    return await new Promise((resolve, reject) => this.db.open({ readOnly: true }, (err) => {
      if (err) return reject(err);
      resolve(this);
    }));
  }
  get memory() {
    return (this as any).instance.instance.exports.memory;
  }
  __log(ptr: number): void {
    const ary = Array.from(new Uint8Array(this.memory.buffer));
    const data = Buffer.from(ary);
    const length = data.readUInt32LE(ptr - 4);
    this.emit(
      "log",
      Buffer.from(ary.slice(ptr, ptr + length)).toString("utf8"),
    );
  }
  __load_input(ptr: number): void {
    const view = new Uint8Array(this.memory.buffer);
    const input = Buffer.from(stripHexPrefix(this.input), "hex");
    for (let i = 0; i < input.length; i++) {
      view[i + ptr] = input.readUInt8(i);
    }
  }
  __host_len(): number {
    return stripHexPrefix(this.input).length / 2;
  }
  __flush(v: number): void {}
  async __get(k: number, v: number): Promise<void> {
    const key = readArrayBufferAsHex(this.memory, k);
    const value = await new Promise((resolve, reject) => this.db.get(Buffer.from(key.substr(2), 'hex'), (err, value) => err ? reject(err) : resolve(value)));
    const view = new Uint8Array(this.memory.buffer);
    const valueData = Buffer.from(stripHexPrefix(value), "hex");
    for (let i = 0; i < valueData.length; i++) {
      view[v + i] = valueData.readUInt8(i);
    }
  }
  async __get_len(k: number): Promise<number> {
    const key = readArrayBufferAsHex(this.memory, k);
    const value: Buffer = await new Promise((resolve, reject) => this.db.get(Buffer.from(key.substr(2), 'hex'), (err, value) => err ? reject(err) : resolve(value)));
    return value.length;
  }
  abort() {
    this.emit("abort");
    throw Error("abort!");
  }
  setInput(input: string): IndexSandbox {
    this.input = input;
    return this;
  }
  async run(symbol: string) {
    (this as any).instance = await WebAssembly.instantiate(this.program, {
      env: {
        abort: (...args) => (this as any).abort(...args),
        __log: (...args) => (this as any).__log(...args),
        __flush: (...args) => (this as any).__flush(...args),
        __get: (...args) => (this as any).__get(...args),
        __get_len: (...args) => (this as any).__get_len(...args),
        __host_len: () => (this as any).__host_len(),
        __load_input: (ptr: number) => (this as any).__load_input(ptr),
      },
    });
    return await (this as any).instance.instance.exports[symbol]();
  }
}

export function dumpJSONRPCPayload(payload) {
  if (!payload.method || !payload.params) return "null";
  return payload.method + "/" + payload.params.join("/") + "/";
}

export function logMiddleware(req, res, next) {
  const ip = req.get("X-Real-IP");
  logger.info(ip + "|" + dumpJSONRPCPayload(req.body));
  next();
}

export async function run(program: ArrayBuffer) {
  const app = express();
  app.use(bodyParser.json());
  app.use(logMiddleware);
  app.post('/', (req, res) => {
    (async () => {
      const { id, method, params } = req.body;
      try {
        if (method === 'metashrew_view') {
          const [ programHash, fn, input ] = params;
          if (addHexPrefix(programHash) !== ethers.solidityPackedKeccak256(['bytes'], [addHexPrefix(Buffer.from(Array.from(new Uint8Array(program))).toString('hex'))])) throw Error('program hash invalid for process handler');
          const sandbox = new IndexSandbox(program);
	  sandbox.setInput(input);
	  await sandbox.openDatabase();
	  const ptr = await sandbox.run(fn);
	  res.json({
            id,
	    result: readArrayBufferAsHex(sandbox.memory, ptr),
	    jsonrpc: '2.0'
	  });
	} else {
          throw Error(`method "${method}" not handled by metashrew-view`);
	}
      } catch (e) {
	logger.error(e);
        res.json({
          jsonrpc: '2.0',
	  id,
	  error: e.message
	});
      }
    })().catch((err) => logger.error(err));
  });
  return await new Promise((resolve, reject) => app.listen(process.env.PORT || 3000, process.env.HOST || '0.0.0.0', (err) => {
    if (err) reject(err);
    else resolve(app);
  }));
}
