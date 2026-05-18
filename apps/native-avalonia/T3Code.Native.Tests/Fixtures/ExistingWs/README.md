# Existing `/ws` Compatibility Fixtures

These fixtures capture the current unmodified T3 backend WebSocket shape used by
the web client. They are redacted and synthetic where needed:

- no pairing tokens, bearer session tokens, ws tokens, cookies, or local secrets
- no private home paths
- stable request IDs, trace IDs, span IDs, timestamps, and process IDs
- high-impact calls use harmless missing/synthetic inputs

The wire format is Effect RPC JSON over WebSocket. Native compatibility code must
keep these shapes isolated behind `T3Code.Native.Client` interfaces.
