"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = exports.logMiddleware = exports.dumpJSONRPCPayload = exports.IndexSandbox = exports.getLengthAtKey = exports.readArrayBuffer = exports.readArrayBufferAsHex = exports.readArrayBufferAsUtf8 = void 0;
const express_1 = __importDefault(require("express"));
const rocksdb_1 = __importDefault(require("rocksdb"));
const body_parser_1 = __importDefault(require("body-parser"));
const logger_1 = require("./logger");
const events_1 = __importDefault(require("events"));
const ethers_1 = require("ethers");
const DB_LOCATION = process.env.DB_LOCATION;
const logger = (0, logger_1.getLogger)();
const readArrayBufferAsUtf8 = (memory, ptr) => {
    return Buffer.from(Array.from(new Uint8Array((0, exports.readArrayBuffer)(memory, ptr)))).toString("utf8");
};
exports.readArrayBufferAsUtf8 = readArrayBufferAsUtf8;
const readArrayBufferAsHex = (memory, ptr) => {
    return ("0x" +
        Buffer.from(Array.from(new Uint8Array((0, exports.readArrayBuffer)(memory, ptr)))).toString("hex"));
};
exports.readArrayBufferAsHex = readArrayBufferAsHex;
const readArrayBuffer = (memory, ptr) => {
    const ary = Array.from(new Uint8Array(memory.buffer));
    const data = Buffer.from(ary);
    const length = data.readUInt32LE(ptr - 4);
    return new Uint8Array(ary.slice(ptr, ptr + length)).buffer;
};
exports.readArrayBuffer = readArrayBuffer;
const stripHexPrefix = (s) => (s.substr(0, 2) === "0x" ? s.substr(2) : s);
const addHexPrefix = (s) => (s.substr(0, 2) === "0x" ? s : "0x" + s);
function get(db, key) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield new Promise((resolve, reject) => db.get(key, (err, result) => (err ? reject(err) : resolve(result))));
        }
        catch (e) {
            if (String(e).match("NotFound"))
                return Buffer.from([]);
            else
                throw e;
        }
    });
}
function swizzle(bytes) {
    return Buffer.from(Array.from(bytes).reverse());
}
function leftPad(hex, n) {
    return "0".repeat(n - hex.length) + hex;
}
function makeIndexKey(key, length) {
    const data = Array.from(key);
    return Buffer.from(data.concat(Array.from(swizzle(Buffer.from(leftPad(length.toString(16), 8), "hex")))));
}
function makeLengthKey(key) {
    return makeIndexKey(key, 0xffffffff);
}
function bytesToNumber(bytes) {
    return Number("0x" + Buffer.from(bytes).toString("hex"));
}
function getValueForBlock(db, key, blockTag) {
    return __awaiter(this, void 0, void 0, function* () {
        const blockNumber = blockTag === "latest" ? 0xffffffff : Number(blockTag);
        let i = (yield getLengthAtKey(db, key)) - 1;
        //logger.info("keylength: " + i);
        while (i >= 0) {
            const result = Array.from(yield get(db, makeIndexKey(key, i)));
            const resultHeight = bytesToNumber(result.slice(-4));
            if (resultHeight <= blockNumber)
                return Buffer.from(result.slice(0, -4));
            i--;
        }
        return Buffer.from([]);
    });
}
function getLengthAtKey(db, key) {
    return __awaiter(this, void 0, void 0, function* () {
        const length = yield get(db, makeLengthKey(key));
        if (length.length === 0)
            return 0;
        return Number("0x" + Buffer.from(length).toString("hex"));
    });
}
exports.getLengthAtKey = getLengthAtKey;
class IndexSandbox extends events_1.default {
    constructor(program) {
        super();
        this.program = program;
        this.db = (0, rocksdb_1.default)(DB_LOCATION);
    }
    openDatabase() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield new Promise((resolve, reject) => this.db.open({ readOnly: true }, (err) => {
                if (err)
                    return reject(err);
                resolve(this);
            }));
        });
    }
    get memory() {
        return this.instance.instance.exports.memory;
    }
    __log(ptr) {
        const ary = Array.from(new Uint8Array(this.memory.buffer));
        const data = Buffer.from(ary);
        const length = data.readUInt32LE(ptr - 4);
        this.emit("log", Buffer.from(ary.slice(ptr, ptr + length)).toString("utf8"));
    }
    __load_input(ptr) {
        const view = new Uint8Array(this.memory.buffer);
        const input = Buffer.from(stripHexPrefix(this.input), "hex");
        for (let i = 0; i < input.length; i++) {
            view[i + ptr] = input.readUInt8(i);
        }
    }
    __host_len() {
        return stripHexPrefix(this.input).length / 2;
    }
    __flush(v) { }
    __get(blockTag, k, v) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = (0, exports.readArrayBufferAsHex)(this.memory, k);
            const value = yield getValueForBlock(this.db, Buffer.from(key.substr(2), "hex"), blockTag);
            const view = new Uint8Array(this.memory.buffer);
            const valueData = value;
            for (let i = 0; i < valueData.length; i++) {
                view[v + i] = valueData.readUInt8(i);
            }
        });
    }
    __get_len(blockTag, k) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = (0, exports.readArrayBufferAsHex)(this.memory, k);
            const value = yield getValueForBlock(this.db, Buffer.from(key.substr(2), "hex"), blockTag);
            return value.length;
        });
    }
    abort() {
        this.emit("abort");
        throw Error("abort!");
    }
    setInput(input) {
        this.input = input;
        return this;
    }
    run(symbol, blockTag) {
        return __awaiter(this, void 0, void 0, function* () {
            this.instance = yield WebAssembly.instantiate(this.program, {
                env: {
                    abort: (...args) => this.abort(...args),
                    __log: (...args) => this.__log(...args),
                    __flush: (...args) => this.__flush(...args),
                    __get: (...args) => this.__get(blockTag, ...args),
                    __get_len: (...args) => this.__get_len(blockTag, ...args),
                    __host_len: () => this.__host_len(),
                    __load_input: (ptr) => this.__load_input(ptr),
                },
            });
            return yield this.instance.instance.exports[symbol]();
        });
    }
}
exports.IndexSandbox = IndexSandbox;
function dumpJSONRPCPayload(payload) {
    if (!payload.method || !payload.params)
        return "null";
    return payload.method + "/" + payload.params.join("/") + "/";
}
exports.dumpJSONRPCPayload = dumpJSONRPCPayload;
function logMiddleware(req, res, next) {
    const ip = req.get("X-Real-IP") || "127.0.0.1";
    logger.info(ip + "|" + dumpJSONRPCPayload(req.body));
    next();
}
exports.logMiddleware = logMiddleware;
function run(program) {
    return __awaiter(this, void 0, void 0, function* () {
        const _programHash = ethers_1.ethers.solidityPackedKeccak256(["bytes"], [
            addHexPrefix(Buffer.from(Array.from(new Uint8Array(program))).toString("hex")),
        ]);
        logger.info("program hash: " + _programHash);
        const app = (0, express_1.default)();
        app.use(body_parser_1.default.json());
        app.use(logMiddleware);
        app.post("/", (req, res) => {
            (() => __awaiter(this, void 0, void 0, function* () {
                if (!req.body)
                    return res.json({ success: "NO" });
                const { id, method, params } = req.body;
                try {
                    if (method === "metashrew_view") {
                        const [programHash, fn, input, blockTag] = params;
                        if (addHexPrefix(programHash) !== _programHash)
                            throw Error("program hash invalid for process handler");
                        logger.info("input: " + input);
                        const sandbox = new IndexSandbox(program);
                        sandbox.setInput(input);
                        yield sandbox.openDatabase();
                        sandbox.on("log", (log) => logger.debug(log));
                        const ptr = yield sandbox.run(fn, blockTag);
                        res.json({
                            id,
                            result: (0, exports.readArrayBufferAsHex)(sandbox.memory, ptr),
                            jsonrpc: "2.0",
                        });
                    }
                    else {
                        throw Error(`method "${method}" not handled by metashrew-view`);
                    }
                }
                catch (e) {
                    logger.error(e);
                    res.json({
                        jsonrpc: "2.0",
                        id,
                        error: e.message,
                    });
                }
            }))().catch((err) => logger.error(err));
        });
        return yield new Promise((resolve, reject) => app.listen(process.env.PORT || 3000, process.env.HOST || "0.0.0.0", (err) => {
            if (err)
                reject(err);
            else
                resolve(app);
        }));
    });
}
exports.run = run;
//# sourceMappingURL=metashrew-view.js.map