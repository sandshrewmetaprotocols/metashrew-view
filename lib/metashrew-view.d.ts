/// <reference types="node" />
import EventEmitter from "events";
export declare const readArrayBufferAsUtf8: (memory: WebAssembly.Memory, ptr: number) => string;
export declare const readArrayBufferAsHex: (memory: WebAssembly.Memory, ptr: number) => string;
export declare const readArrayBuffer: (memory: WebAssembly.Memory, ptr: number) => ArrayBufferLike;
export declare class IndexSandbox extends EventEmitter {
    input: string;
    program: ArrayBuffer;
    kv: any;
    db: any;
    constructor(program: ArrayBuffer);
    openDatabase(): Promise<unknown>;
    get memory(): any;
    __log(ptr: number): void;
    __load_input(ptr: number): void;
    __host_len(): number;
    __flush(v: number): void;
    __get(k: number, v: number): Promise<void>;
    __get_len(k: number): Promise<number>;
    abort(): void;
    setInput(input: string): IndexSandbox;
    run(symbol: string): Promise<any>;
}
export declare function dumpJSONRPCPayload(payload: any): string;
export declare function logMiddleware(req: any, res: any, next: any): void;
export declare function run(program: ArrayBuffer): Promise<unknown>;
