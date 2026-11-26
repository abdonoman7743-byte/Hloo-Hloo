# Call-hloo — Security and stability repair notes

This review/patch is based on the uploaded project source. It does not connect to the production Railway database or perform a live penetration test.

## Changes applied

- Friend acceptance now requires a real incoming `pending` request from the target user. The reciprocal accepted rows are written in a transaction. Reject/remove actions now require the matching relationship state, and cancelling a request requires an existing outgoing pending request.
- Call signaling now accepts only known call-event types, requires a real call and a participant sender, requires the recipient to be the other call participant, applies role checks to answer/reject/renegotiation events, validates SDP/ICE payload presence, and caps signaling payload size.
- Calls to oneself and malformed SDP offers are rejected.
- Direct-message history is no longer returned to either party when that pair has a block relation. The only group ID accepted is the public group currently represented by the schema; arbitrary client-supplied room IDs are rejected.
- Message text length is bounded while media data URLs retain a larger bounded allowance so image/voice-note features are not accidentally disabled.
- Added per-process request throttles to registration, friend requests, messages, call creation, and signaling; expired throttle entries are periodically pruned.
- Browser sessions now use the server-issued HttpOnly cookie for same-origin requests and the SSE stream. JWTs are no longer stored in `localStorage`/`sessionStorage` or placed in the SSE URL. The registration response now sets the same session cookie as login.
- Removed the query-string JWT authentication path and made malformed cookie decoding fail closed.
- Fixed fail-open `COALESCE(..., id)` predicates in the users-table RLS policies. Existing versions of these policies are dropped and recreated so a previously deployed unsafe policy is not silently retained.

## Verification performed

- Parsed all 47 TypeScript/TSX source files with the globally available TypeScript transpiler: no syntax diagnostics.
- Reviewed the modified authentication, friends, messages, calls, signaling, and database-infrastructure paths.
- Searched source files for the former browser token-storage keys, `Authorization: Bearer` UI headers, and query-string token usage; none remain in the source tree.

## Verification not possible in this environment

- `npm ci` did not complete in the available execution window, leaving the dependency directories incomplete. Therefore ESLint and the full Next.js production build/typecheck could not be run here.
- No production `DATABASE_URL`, `JWT_SECRET`, Railway environment, or test accounts were supplied. No live database migration, live WebRTC call, multi-user privacy test, or production endpoint test was run.
- The rate limiter is in-process memory. It is a useful first layer but is not shared across multiple Railway replicas; use a shared Redis/Upstash limiter for production-grade distributed limits.
- RLS is enabled on multiple tables, but the current app uses a trusted server-side database connection and does not set `app.current_user_id` for each request. The route-level authorization checks remain essential. Do not expose `DATABASE_URL`; a full least-privilege RLS deployment requires a dedicated DB role and transaction-scoped user context across database operations.
- The nested `call-with-oboud-architecture (1).zip` is an older embedded snapshot from the uploaded project and was not used as the deployable source. The canonical deployable source is the files at this project root.

## Railway release checklist

1. Keep `DATABASE_URL` server-only and ensure it points to the existing database. Do not reset, recreate, or seed a fresh production database as part of this patch.
2. Set a strong random `JWT_SECRET` in Railway. Keep it stable during deployment so existing sessions are not invalidated unexpectedly.
3. Deploy the project root (not the nested archive).
4. Run `npm ci`, `npm run typecheck`, `npm run lint`, and `npm run build` in CI/Railway before promoting the deployment.
5. Test registration/login/logout, friend request/accept/reject/cancel, blocked-user access, direct/group messaging, incoming/outgoing audio/video calls, ICE restart, and SSE reconnect with two separate test accounts.
6. Confirm TURN server credentials and TLS reachability from external networks; the presence of TURN settings in source code alone does not prove TURN is operational.
7. Back up the production database before deployment. The source changes do not intentionally drop or recreate user/application tables.
