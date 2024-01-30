# metashrew-view

Parallelizable view layer for metashrew. Exposes the metashrew_view JSON-RPC method and can be reverse proxied by the complete RPC provider to surface data for a single index.

The concept is simple: we do not scale up the r/w performance of the rocksdb instance that owns the index we care about, but we can scale up the amount of WebAssembly instances that run the index to compute a view result.

## Install

```sh
git clone https://github.com/sandshrew/metashrew-view
cd metashrew-view
yarn
npm install -g
```

## Usage

Set environment variables HOST, PORT, DB_LOCATION and PROGRAM_PATH then run the command

```sh
metashrew-view
```

This will run the HTTP service and can be reverse proxied.

The remote rocksdb database must be mounted over FUSE, nfs, or something similar that exposes native filesystem access to the remote index. The database is opened in read-only mode and a handle is instantiated for every call to metashrew_view. It is expected that a metashrew process will own the rocksdb volume where the index is built. This same filesystem mount is intended to be provided over the network to metashrew-view such that it may be opened in read-only mode.

## metashrew_view

The metashrew_view RPC call takes three params:

```js

[ programHash, functionName, inputHexString ]

```

It returns a hex encoded byte string as the JSON-RPC result.


## License

MIT


## Author

flex
