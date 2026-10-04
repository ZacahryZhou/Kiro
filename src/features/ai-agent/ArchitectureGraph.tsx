import type { StepId } from "@/lib/ai/trace/steps";

type NodeState = "idle" | "active" | "done" | "error";
type Zone = "fixed" | "flexible" | "human";

type GraphNode = {
  key: string;
  /** Pipeline step this node follows live; static nodes have none. */
  step?: StepId;
  title: string;
  note: string;
  x: number;
  y: number;
  zone: Zone;
};

const W = 190;
const H = 50;

const NODES: GraphNode[] = [
  { key: "request", step: "request", title: "Chat request", note: "Zod-validated body", x: 355, y: 16, zone: "fixed" },
  { key: "identity", step: "identity", title: "Identity", note: "From the session only", x: 355, y: 86, zone: "fixed" },
  { key: "prompt", step: "prompt", title: "Prompt + tools", note: "Per role: 26 teacher / 6 student", x: 355, y: 156, zone: "fixed" },
  { key: "model", step: "model", title: "Model", note: "Decides the next tool call", x: 110, y: 285, zone: "flexible" },
  { key: "tool", step: "tool", title: "Tool runs", note: "Actor injected by code", x: 395, y: 285, zone: "flexible" },
  { key: "read", title: "Read services", note: "Access-filtered database reads", x: 650, y: 285, zone: "fixed" },
  { key: "citations", step: "citations", title: "Citations", note: "Code verifies every quote", x: 270, y: 380, zone: "fixed" },
  { key: "proposal", step: "proposal", title: "Proposal saved", note: "Pending; data unchanged", x: 520, y: 380, zone: "fixed" },
  { key: "guards", title: "Reply guards", note: "No false confirmation claims", x: 355, y: 485, zone: "fixed" },
  { key: "runlog", step: "runlog", title: "Run logged", note: "AgentRun table", x: 355, y: 555, zone: "fixed" },
  { key: "reply", step: "reply", title: "Reply + preview", note: "Cards shown to the user", x: 355, y: 625, zone: "fixed" },
  { key: "confirm", step: "confirm", title: "Human confirms", note: "Atomic pending → confirmed", x: 355, y: 725, zone: "human" },
  { key: "write", title: "Write service", note: "Only code that edits business tables", x: 355, y: 795, zone: "fixed" },
];

const EDGES: { from: string; to: string; dashed?: boolean; label?: string }[] = [
  { from: "request", to: "identity" },
  { from: "identity", to: "prompt" },
  { from: "prompt", to: "model" },
  { from: "model", to: "tool", label: "calls" },
  { from: "tool", to: "model", label: "result" },
  { from: "tool", to: "read" },
  { from: "tool", to: "citations" },
  { from: "tool", to: "proposal" },
  { from: "model", to: "guards", label: "final text" },
  { from: "guards", to: "runlog" },
  { from: "runlog", to: "reply" },
  { from: "proposal", to: "confirm", dashed: true, label: "waits for a person" },
  { from: "reply", to: "confirm", dashed: true },
  { from: "confirm", to: "write" },
];

const STATE_CLASS: Record<NodeState, string> = {
  idle: "fill-card stroke-border",
  active: "fill-amber-100 stroke-amber-500 animate-pulse",
  done: "fill-emerald-50 stroke-emerald-500",
  error: "fill-red-50 stroke-red-500",
};

const find = (key: string) => NODES.find((node) => node.key === key)!;

/** Edge anchor points: vertical links leave the bottom/top; sideways links use the side edges. */
function edgePath(fromKey: string, toKey: string, offset = 0): string {
  const a = find(fromKey);
  const b = find(toKey);
  const ax = a.x + W / 2;
  const bx = b.x + W / 2;
  if (Math.abs(a.y - b.y) < 10) {
    const goingRight = b.x > a.x;
    const y = a.y + H / 2 + offset;
    return `M ${goingRight ? a.x + W : a.x} ${y} L ${goingRight ? b.x : b.x + W} ${y}`;
  }
  if (b.y > a.y) {
    const y1 = a.y + H;
    const y2 = b.y;
    const mid = (y1 + y2) / 2;
    return `M ${ax + offset} ${y1} C ${ax + offset} ${mid}, ${bx + offset} ${mid}, ${bx + offset} ${y2}`;
  }
  return `M ${ax} ${a.y} L ${bx} ${b.y + H}`;
}

/** Long dashed links route around the side so they do not cross other nodes. */
function sidePath(fromKey: string, toKey: string, side: "left" | "right"): string {
  const a = find(fromKey);
  const b = find(toKey);
  const startX = side === "right" ? a.x + W : a.x;
  const endX = side === "right" ? b.x + W : b.x;
  const bend = side === "right" ? Math.max(startX, endX) + 70 : Math.min(startX, endX) - 70;
  return `M ${startX} ${a.y + H / 2} C ${bend} ${a.y + H / 2}, ${bend} ${b.y + H / 2}, ${endX} ${b.y + H / 2}`;
}

export function ArchitectureGraph({ states, activeStep }: { states: Map<StepId, NodeState>; activeStep: StepId | null }) {
  const stateOf = (node: GraphNode): NodeState => (node.step ? (states.get(node.step) ?? "idle") : "idle");

  return (
    <section aria-label="Architecture" className="kora-card p-4" data-testid="architecture-graph">
      <h2 className="text-sm font-semibold">Architecture</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Nodes light up as a request moves through. The blue area is the only part the model controls; everything else is fixed code.
      </p>
      <svg viewBox="0 0 900 865" className="h-auto w-full" role="img" aria-label="Agent architecture diagram">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
        </defs>

        <rect x={70} y={235} width={790} height={200} rx={18} className="fill-sky-50 stroke-sky-400" strokeDasharray="6 5" />
        <text x={846} y={256} textAnchor="end" className="fill-sky-900 text-[13px] font-semibold">
          Flexible: the model picks tools and order (max 6 rounds)
        </text>
        <text x={86} y={175} className="fill-muted-foreground text-[12px]">
          FIXED
        </text>
        <text x={86} y={745} className="fill-amber-900 text-[12px] font-semibold">
          HUMAN
        </text>

        {EDGES.map((edge) => {
          const key = `${edge.from}-${edge.to}`;
          let d: string;
          if (edge.from === "tool" && edge.to === "model") d = edgePath("tool", "model", 12);
          else if (edge.from === "model" && edge.to === "tool") d = edgePath("model", "tool", -12);
          else if (edge.from === "model" && edge.to === "guards") d = `M ${find("model").x + W / 2} ${find("model").y + H} C ${find("model").x + W / 2} 470, ${find("guards").x} 510, ${find("guards").x} ${find("guards").y + H / 2}`;
          else if (edge.from === "proposal" && edge.to === "confirm") d = sidePath("proposal", "confirm", "right");
          else if (edge.from === "reply" && edge.to === "confirm") d = edgePath("reply", "confirm");
          else d = edgePath(edge.from, edge.to);
          return <path key={key} d={d} fill="none" strokeWidth={1.6} strokeDasharray={edge.dashed ? "5 4" : undefined} className="stroke-muted-foreground" markerEnd="url(#arrow)" />;
        })}

        <text x={347} y={291} textAnchor="middle" className="fill-muted-foreground text-[11px]">calls</text>
        <text x={347} y={344} textAnchor="middle" className="fill-muted-foreground text-[11px]">result</text>
        <text x={792} y={600} className="fill-muted-foreground text-[11px]">waits for a person</text>

        {NODES.map((node) => {
          const state = stateOf(node);
          const isStatic = !node.step;
          return (
            <g key={node.key} data-testid={`arch-${node.key}`} data-state={state}>
              <rect
                x={node.x}
                y={node.y}
                width={W}
                height={H}
                rx={12}
                strokeWidth={activeStep === node.step ? 3 : 1.6}
                strokeDasharray={isStatic ? "4 3" : undefined}
                className={`${STATE_CLASS[state]} ${node.zone === "human" && state === "idle" ? "stroke-amber-500" : ""}`}
              />
              <text x={node.x + W / 2} y={node.y + 21} textAnchor="middle" className="fill-foreground text-[13px] font-semibold">
                {node.title}
              </text>
              <text x={node.x + W / 2} y={node.y + 38} textAnchor="middle" className="fill-muted-foreground text-[10.5px]">
                {node.note}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-xs text-muted-foreground">Dashed outline: always-on code with no live trace. Dashed arrow: needs a person before anything is written.</p>
    </section>
  );
}
