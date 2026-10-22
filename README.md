# oc-token-speed

OpenCode TUI plugin that shows token throughput in the prompt bar:

```
84.8 tok/s AVG 84.8 tok/s | TTFT 14.3s AVG 14.3s
```

- **live** — latest response, `(output + reasoning) / (completed ?? now − firstToken)`. Updates every 250 ms while streaming, keeps that value when the response completes, and only switches when the next response produces its first token.
- **AVG** (first) — moving average `Σtokens / Σduration` over the **last 10** completed assistant messages (generation window, TTFT excluded). Scoped to the session and to the TUI process (in-memory, resets on restart).
- **TTFT** / **AVG** (second) — latest response's time to first token, and the moving average over the last 10 responses that produced a token, measured from the message `time.created` to the first `text`/`reasoning` part update.

## Install

Add it to `~/.config/opencode/tui.json`:

```json
{
  "plugin": ["oc-token-speed"]
}
```

Or from a local file:

```json
{
  "plugin": ["file:///D:/path/to/oc-token-speed/src/index.tsx"]
}
```

## Notes

- Renders in the `session_prompt_right` slot, on its own line below the model name.
- This is a **TUI** plugin: it must be referenced from `tui.json`. Do not drop the `.tsx` into `~/.config/opencode/plugins/` — auto-discovered plugins are loaded by the server process and get no TUI slot API.
- Local file usage requires `solid-js` and `@opentui/solid` resolvable from the config directory (`npm install` in `~/.config/opencode`), or install the npm package instead.

## License

MIT © [ucukertz](https://github.com/ucukertz) — see [LICENSE](./LICENSE).
