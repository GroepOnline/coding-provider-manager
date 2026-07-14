# CPM agent protocol

CPM exposes a prompt-free newline-delimited JSON protocol.

```bash
cpm agent manifest
cpm agent serve
```

Request:

```json
{"id":1,"method":"keys.next","params":{"provider":"openrouter"}}
```

Response:

```json
{"id":1,"ok":true,"result":{"provider":"openrouter","activeKey":"backup"}}
```

Errors use stable codes:

```json
{"id":1,"ok":false,"error":{"code":"CPM_ERROR","message":"..."}}
```

`METHOD_NOT_FOUND` and `INVALID_JSON` are returned for protocol-level errors. Secret values are never returned. Supported methods are listed by `cpm agent manifest`.
