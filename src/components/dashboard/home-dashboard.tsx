"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Check, ChevronDown, GripHorizontal, LayoutTemplate, Pencil, Plus, Trash2, Wand2, X } from "lucide-react";
import { DASHBOARD_MOTIONS, DASHBOARD_THEMES, MAX_WIDGETS, type DashboardItem, type DashboardLayoutView, type DashboardMotion, type DashboardTheme, type WidgetType } from "@/contracts";
import { deleteLayoutAction, previewDataAction, saveLayoutAction, switchLayoutAction } from "@/app/(teacher)/teacher/dashboard-actions";
import { tidyLayout } from "@/lib/dashboard-pack";
import { MOTION_LABELS, THEME_META, WIDGET_META } from "./catalog";
import type { DashboardData } from "./types";
import { WidgetBody, widgetTitle } from "./widgets";

type Props = {
  layout: { id: string | null; name: string; theme: DashboardTheme; motion: DashboardMotion; items: DashboardItem[] };
  layouts: DashboardLayoutView[];
  data: DashboardData;
};

const COLS = 12;
const ROW_HEIGHT = 56;
const GAP = 16;

const btn = "inline-flex h-9 items-center justify-center gap-2 rounded-lg border bg-card px-3.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
const btnPrimary = "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/** Closes a popover on an outside click or Escape. */
function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onMouse = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close]);
}

const newId = (type: WidgetType) => `${type.toLowerCase().replace(/_/g, "-")}-${Math.random().toString(36).slice(2, 6)}`;

/** Remounts when the server sends a different saved layout, so local edits never leak between layouts. */
export function HomeDashboard(props: Props) {
  // The status line lives out here so "Saved" survives the remount a new layout causes.
  const [status, setStatus] = useState<Status>(null);
  return <DashboardInner status={status} setStatus={setStatus} key={`${props.layout.id ?? "classic"}:${JSON.stringify([props.layout.name, props.layout.theme, props.layout.motion, props.layout.items])}`} {...props} />;
}

type Status = { kind: "ok" | "error"; text: string } | null;

function DashboardInner({ layout, layouts, data: initialData, status, setStatus }: Props & { status: Status; setStatus: (status: Status) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<DashboardItem[]>(layout.items);
  const [theme, setTheme] = useState<DashboardTheme>(layout.theme);
  const [motion, setMotion] = useState<DashboardMotion>(layout.motion);
  const [name, setName] = useState(layout.id ? layout.name : "My layout");
  const [preview, setPreview] = useState<DashboardData | null>(null);
  const data = preview ?? initialData;
  const [dirty, setDirty] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusStudent, setFocusStudent] = useState("");
  const [trendCourse, setTrendCourse] = useState("");
  const { width, containerRef, mounted } = useContainerWidth();
  const menuRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const stacked = mounted && width < 720;

  useDismiss(menuRef, menuOpen, () => setMenuOpen(false));
  useDismiss(addRef, addOpen, () => setAddOpen(false));

  useEffect(() => {
    if (!editing || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing, dirty]);

  const gridLayout: Layout = useMemo(
    () => items.map((item) => ({ i: item.id, x: item.x, y: item.y, w: item.w, h: item.h, minW: WIDGET_META[item.type].minW, minH: WIDGET_META[item.type].minH })),
    [items],
  );

  const onLayoutChange = useCallback((next: Layout) => {
    setItems((current) => {
      let changed = false;
      const updated = current.map((item) => {
        const spot = next.find((entry) => entry.i === item.id);
        if (!spot || (spot.x === item.x && spot.y === item.y && spot.w === item.w && spot.h === item.h)) return item;
        changed = true;
        return { ...item, x: spot.x, y: spot.y, w: spot.w, h: spot.h };
      });
      if (changed) setDirty(true);
      return changed ? updated : current;
    });
  }, []);

  async function refreshData(nextItems: DashboardItem[]) {
    const result = await previewDataAction(nextItems);
    if (result.ok) setPreview(result.data);
    else setStatus({ kind: "error", text: result.message });
  }

  function addWidget(type: WidgetType, extra: Partial<DashboardItem> = {}) {
    if (items.length >= MAX_WIDGETS) return;
    const meta = WIDGET_META[type];
    const bottom = items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    const next = [...items, { id: newId(type), type, x: 0, y: bottom, w: meta.w, h: meta.h, ...extra }];
    setItems(next);
    setDirty(true);
    setStatus(null);
    startTransition(() => void refreshData(next));
  }

  function tidy() {
    setItems((current) => tidyLayout(current));
    setDirty(true);
  }

  function removeWidget(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    setDirty(true);
  }

  function enterEdit() {
    setEditing(true);
    setStatus(null);
  }

  function cancelEdit() {
    setItems(layout.items);
    setTheme(layout.theme);
    setMotion(layout.motion);
    setName(layout.id ? layout.name : "My layout");
    setPreview(null);
    setDirty(false);
    setEditing(false);
    setStatus(null);
  }

  function save() {
    startTransition(async () => {
      const result = await saveLayoutAction({ name, theme, motion, items });
      if (result.ok) {
        setStatus({ kind: "ok", text: result.message });
        setEditing(false);
        setDirty(false);
        router.refresh();
      } else setStatus({ kind: "error", text: result.message });
    });
  }

  function apply(layoutId: string | null) {
    setMenuOpen(false);
    startTransition(async () => {
      const result = await switchLayoutAction(layoutId);
      setStatus({ kind: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) router.refresh();
    });
  }

  function remove(view: DashboardLayoutView) {
    if (!window.confirm(`Delete the layout “${view.name}”? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteLayoutAction(view.id);
      setStatus({ kind: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) router.refresh();
    });
  }

  const replacing = editing && layouts.some((view) => view.name === name.trim() && view.id !== layout.id);
  const ordered = useMemo(() => [...items].sort((a, b) => a.y - b.y || a.x - b.x), [items]);
  const animationIndex = (id: string) => ordered.findIndex((item) => item.id === id);

  const frame = (item: DashboardItem) => {
    const meta = WIDGET_META[item.type];
    const Icon = meta.icon;
    const title = widgetTitle(item, data) || meta.label;
    return (
      <div className="dash-widget kora-card flex h-full flex-col overflow-hidden" data-testid={`widget-${item.type}`} style={{ ["--i" as string]: animationIndex(item.id) }}>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          {editing && !stacked ? (
            <div className="dash-handle flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold" title="Drag to move">
              <GripHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{title}</span>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
              <Icon className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="truncate">{title}</span>
            </div>
          )}
          {editing && (
            <button type="button" onClick={() => removeWidget(item.id)} aria-label={`Remove ${title}`} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <WidgetBody item={item} data={data} />
        </div>
      </div>
    );
  };

  const activeName = layout.id ? layout.name : "Classic";

  return (
    <div className="space-y-4" data-testid="home-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative" ref={menuRef}>
          <button type="button" className={btn} onClick={() => setMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={menuOpen} data-testid="layout-menu-button" disabled={editing}>
            <LayoutTemplate className="size-4" aria-hidden />
            <span className="max-w-40 truncate">{activeName}</span>
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute left-0 z-30 mt-2 w-72 overflow-hidden rounded-2xl border bg-popover p-1.5 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95">
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your layouts</p>
              <button role="menuitem" type="button" onClick={() => apply(null)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-muted">
                <span className="flex size-6 items-center justify-center">{!layout.id && <Check className="size-4 text-primary" aria-hidden />}</span>
                <span className="flex-1">Classic <span className="text-xs text-muted-foreground">(built in)</span></span>
              </button>
              {layouts.map((view) => (
                <div key={view.id} className="group flex items-center rounded-xl transition-colors hover:bg-muted">
                  <button role="menuitem" type="button" onClick={() => apply(view.id)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-sm" data-testid="layout-item">
                    <span className="flex size-6 items-center justify-center">{layout.id === view.id && <Check className="size-4 text-primary" aria-hidden />}</span>
                    <span className="min-w-0 flex-1 truncate">{view.name}</span>
                    <span className="flex gap-0.5" aria-hidden>{THEME_META[view.theme].swatch.map((color, index) => <span key={index} className="size-3 rounded-full border" style={{ background: color }} />)}</span>
                  </button>
                  <button type="button" onClick={() => remove(view)} aria-label={`Delete layout ${view.name}`} className="mr-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:text-destructive focus:opacity-100 group-hover:opacity-100">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
              {layouts.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nothing saved yet. Customise this page, or ask the assistant to design one for you.</p>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <p role="status" aria-live="polite" className={`text-sm ${status?.kind === "error" ? "text-destructive" : "text-muted-foreground"}`} data-testid="dashboard-status">{status?.text}</p>
          {editing ? null : (
            <button type="button" className={btn} onClick={enterEdit} disabled={pending} data-testid="customise-button"><Pencil className="size-4" aria-hidden />Customise</button>
          )}
        </div>
      </div>

      {editing && (
        <div className="kora-card sticky top-3 z-30 space-y-3 bg-card/95 p-3 backdrop-blur sm:p-4" data-testid="edit-panel">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <label className="min-w-40 flex-1 text-xs font-medium text-muted-foreground">
              Layout name
              <input value={name} onChange={(event) => { setName(event.target.value); setDirty(true); }} maxLength={40} className="mt-1 block h-9 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="layout-name" />
            </label>
            <fieldset>
              <legend className="text-xs font-medium text-muted-foreground">Colours</legend>
              <div className="mt-1 flex gap-1.5" role="radiogroup" aria-label="Colour theme">
                {DASHBOARD_THEMES.map((id) => (
                  <button key={id} type="button" role="radio" aria-checked={theme === id} aria-label={THEME_META[id].label} title={THEME_META[id].label} onClick={() => { setTheme(id); setDirty(true); }} className={`flex h-9 w-11 overflow-hidden rounded-lg border-2 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${theme === id ? "border-primary" : "border-transparent"}`} data-testid={`theme-${id}`}>
                    {THEME_META[id].swatch.map((color, index) => <span key={index} className="flex-1" style={{ background: color }} />)}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-xs font-medium text-muted-foreground">Motion</legend>
              <div className="mt-1 flex rounded-lg border bg-muted/60 p-0.5" role="radiogroup" aria-label="Motion style">
                {DASHBOARD_MOTIONS.map((id) => (
                  <button key={id} type="button" role="radio" aria-checked={motion === id} onClick={() => { setMotion(id); setDirty(true); }} className={`h-8 rounded-md px-3 text-sm font-medium transition-colors ${motion === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{MOTION_LABELS[id]}</button>
                ))}
              </div>
            </fieldset>
            <div className="relative" ref={addRef}>
              <button type="button" className={btn} onClick={() => setAddOpen((open) => !open)} aria-expanded={addOpen} aria-haspopup="dialog" data-testid="add-widget-button">
                <Plus className="size-4" aria-hidden />Add widget<span className="text-xs text-muted-foreground">{items.length}/{MAX_WIDGETS}</span>
              </button>
              {addOpen && (
                <div role="dialog" aria-label="Add a widget" className="absolute left-0 z-40 mt-2 w-[min(42rem,calc(100vw-2rem))] rounded-2xl border bg-popover p-3 text-popover-foreground shadow-2xl animate-in fade-in-0 zoom-in-95 sm:right-0 sm:left-auto">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(Object.keys(WIDGET_META) as WidgetType[]).map((type) => {
                      const meta = WIDGET_META[type];
                      const Icon = meta.icon;
                      const full = items.length >= MAX_WIDGETS;
                      return (
                        <div key={type} className="flex items-start gap-3 rounded-xl border bg-card/60 p-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" aria-hidden /></span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{meta.label}</p>
                            <p className="text-xs text-muted-foreground">{meta.description}</p>
                            {type === "STUDENT_FOCUS" && (
                              <select value={focusStudent} onChange={(event) => setFocusStudent(event.target.value)} aria-label="Student to focus on" className="mt-2 h-8 w-full rounded-md border bg-background px-2 text-xs">
                                <option value="">Choose a student…</option>
                                {data.students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
                              </select>
                            )}
                            {type === "ATTENDANCE_TREND" && (
                              <select value={trendCourse} onChange={(event) => setTrendCourse(event.target.value)} aria-label="Course for the trend" className="mt-2 h-8 w-full rounded-md border bg-background px-2 text-xs">
                                <option value="">All courses</option>
                                {data.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                              </select>
                            )}
                          </div>
                          <button type="button" onClick={() => { addWidget(type, type === "STUDENT_FOCUS" ? { studentId: focusStudent } : type === "ATTENDANCE_TREND" && trendCourse ? { courseId: trendCourse } : {}); setAddOpen(false); }} disabled={full || (type === "STUDENT_FOCUS" && !focusStudent)} aria-label={`Add ${meta.label}`} data-testid={`add-${type}`} className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card transition-colors hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-40">
                            <Plus className="size-4" aria-hidden />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {items.length >= MAX_WIDGETS && <p className="mt-2 text-xs text-muted-foreground">You have reached {MAX_WIDGETS} widgets. Remove one to add another.</p>}
                </div>
              )}
            </div>
            <button type="button" className={btn} onClick={tidy} title="Line the widgets up and close any gaps" data-testid="tidy-layout"><Wand2 className="size-4" aria-hidden />Tidy up</button>
            <div className="ml-auto flex gap-2">
              <button type="button" className={btn} onClick={cancelEdit} disabled={pending}>Cancel</button>
              <button type="button" className={btnPrimary} onClick={save} disabled={pending || name.trim() === "" || items.length === 0} data-testid="save-layout">{pending ? "Saving…" : "Save layout"}</button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="edit-hint">
            {replacing ? `A layout named “${name.trim()}” already exists and will be replaced.` : layout.id && name.trim() !== layout.name ? "A new name saves a new layout and keeps the old one in your history." : "Drag a widget by its title bar; pull its bottom-right corner to resize. Colours and motion preview live."}
          </p>
        </div>
      )}

      {data.notice && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">Some data could not be loaded: {data.notice}</p>}

      <div ref={containerRef} className="dash-stage" data-theme={theme} data-motion={motion} data-editing={editing} data-testid="dash-stage" key={layout.id ?? "classic"}>
        {!mounted ? (
          <div className="h-96 animate-pulse rounded-2xl bg-muted/60" aria-hidden />
        ) : stacked ? (
          <div className="space-y-4">
            {ordered.map((item) => <div key={item.id} className="[&>.dash-widget]:h-auto">{frame(item)}</div>)}
            {editing && <p className="text-xs text-muted-foreground">Dragging and resizing need a wider screen. Widgets can still be added and removed here.</p>}
          </div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">This layout is empty. Use Customise to add widgets.</p>
        ) : (
          <ReactGridLayout
            layout={gridLayout}
            width={Math.max(0, width - (width >= 640 ? 48 : 32))}
            gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: [GAP, GAP], containerPadding: [0, 0], maxRows: Infinity }}
            dragConfig={{ enabled: editing, bounded: false, handle: ".dash-handle", threshold: 3 }}
            resizeConfig={{ enabled: editing, handles: ["se"] }}
            compactor={verticalCompactor}
            onLayoutChange={onLayoutChange}
          >
            {items.map((item) => <div key={item.id}>{frame(item)}</div>)}
          </ReactGridLayout>
        )}
      </div>
    </div>
  );
}
