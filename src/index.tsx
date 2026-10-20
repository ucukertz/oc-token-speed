/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, Show } from "solid-js"

type MsgState = {
  sessionID: string
  created: number
  tokens: number
  firstTokenAt?: number
  completed?: number
}

type Sample = { tokens: number; seconds: number; ttft?: number }

type Tracker = {
  messages: Map<string, MsgState>
  averages: Map<string, Sample[]>
  counted: Set<string>
}

const TICK_MS = 250
const AVERAGE_WINDOW = 10

const formatRate = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "-"
  if (value >= 100) return `${Math.round(value)}`
  if (value >= 10) return `${value.toFixed(1)}`
  return `${value.toFixed(2)}`
}

function StatusLine(props: {
  api: Parameters<TuiPlugin>[0]
  sessionID: () => string | undefined
  tracker: Tracker
  version: () => number
  clock: () => number
}) {
  const latest = createMemo(() => {
    props.version()
    props.clock()
    const sid = props.sessionID()
    if (!sid) return
    let best: MsgState | undefined
    for (const msg of props.tracker.messages.values()) {
      if (msg.sessionID !== sid) continue
      if (msg.firstTokenAt === undefined) continue
      if (!best || msg.created > best.created) best = msg
    }
    return best
  })

  const live = createMemo(() => {
    props.version()
    props.clock()
    const msg = latest()
    if (!msg || msg.tokens <= 0) return "-"
    const seconds = ((msg.completed ?? Date.now()) - (msg.firstTokenAt ?? msg.created)) / 1000
    return formatRate(msg.tokens / seconds)
  })

  const average = createMemo(() => {
    props.version()
    const sid = props.sessionID()
    const samples = sid ? props.tracker.averages.get(sid) : undefined
    if (!samples || samples.length === 0) return "-"
    const tokens = samples.reduce((sum, s) => sum + s.tokens, 0)
    const seconds = samples.reduce((sum, s) => sum + s.seconds, 0)
    return seconds > 0 ? formatRate(tokens / seconds) : "-"
  })

  const ttft = createMemo(() => {
    props.version()
    const msg = latest()
    if (!msg || msg.firstTokenAt === undefined) return "-"
    return Math.max((msg.firstTokenAt - msg.created) / 1000, 0).toFixed(1)
  })

  const avgTtft = createMemo(() => {
    props.version()
    const sid = props.sessionID()
    const samples = (sid ? props.tracker.averages.get(sid) : undefined) ?? []
    const timed = samples.filter((s) => s.ttft !== undefined)
    if (timed.length === 0) return "-"
    const ttft = timed.reduce((sum, s) => sum + (s.ttft ?? 0), 0)
    return (ttft / timed.length).toFixed(1)
  })

  const text = createMemo(() => {
    props.version()
    props.clock()
    return `${live()} tok/s AVG ${average()} tok/s | TTFT ${ttft()}s AVG ${avgTtft()}s`
  })

  return (
    <Show when={props.sessionID()}>
      <box width={0} height={2} />
      <text
        position="absolute"
        top={1}
        right={0}
        wrapMode="none"
        fg={props.api.theme.current.textMuted}
      >
        {text()}
      </text>
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  const tracker: Tracker = { messages: new Map(), averages: new Map(), counted: new Set() }
  const [version, setVersion] = createSignal(0)
  const [clock, setClock] = createSignal(Date.now())
  const bump = () => setVersion((v) => v + 1)

  const ticker = setInterval(() => setClock(Date.now()), TICK_MS)
  api.lifecycle.onDispose(() => {
    clearInterval(ticker)
  })

  api.event.on("message.updated", ({ properties }) => {
    const info = properties.info as any
    if (!info || info.role !== "assistant") return
    const created = info.time?.created
    if (typeof created !== "number") return

    let msg = tracker.messages.get(info.id)
    if (!msg) {
      msg = { sessionID: properties.sessionID, created, tokens: 0 }
      tracker.messages.set(info.id, msg)
    }

    const tokens = (info.tokens?.output ?? 0) + (info.tokens?.reasoning ?? 0)
    msg.tokens = tokens

    const completed = info.time?.completed
    if (typeof completed === "number") {
      msg.completed = completed
      if (!tracker.counted.has(info.id) && msg.tokens > 0) {
        tracker.counted.add(info.id)
        const seconds = Math.max((completed - (msg.firstTokenAt ?? created)) / 1000, 0.001)
        const sample: Sample = { tokens: msg.tokens, seconds }
        if (msg.firstTokenAt !== undefined) sample.ttft = Math.max((msg.firstTokenAt - created) / 1000, 0)
        const samples = tracker.averages.get(msg.sessionID) ?? []
        samples.push(sample)
        if (samples.length > AVERAGE_WINDOW) samples.shift()
        tracker.averages.set(msg.sessionID, samples)
      }
    }
    bump()
  })

  api.event.on("message.part.updated", ({ properties }) => {
    const part = properties.part as any
    if (!part || (part.type !== "text" && part.type !== "reasoning")) return
    const msg = tracker.messages.get(part.messageID)
    if (!msg || msg.firstTokenAt !== undefined) return
    msg.firstTokenAt = typeof properties.time === "number" ? properties.time : Date.now()
    bump()
  })

  api.slots.register({
    slots: {
      session_prompt_right(_ctx, value) {
        return (
          <StatusLine
            api={api}
            sessionID={() => value.session_id}
            tracker={tracker}
            version={version}
            clock={clock}
          />
        )
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = { id: "oc-token-speed", tui }

export default plugin
