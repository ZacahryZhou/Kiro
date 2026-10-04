import { DashboardLayoutInput, GRID_COLUMNS } from "@/contracts";
import { THEME_META, WIDGET_META } from "@/components/dashboard/catalog";

/** A thumbnail of a proposed home-page layout, drawn from the validated payload. */
export function LayoutPreview({ payload }: { payload: unknown }) {
  const parsed = DashboardLayoutInput.safeParse(payload);
  if (!parsed.success) return null;
  const { items, theme } = parsed.data;
  const rows = Math.max(...items.map((item) => item.y + item.h));
  const [background, accent] = THEME_META[theme].swatch;
  const ink = theme === "midnight" ? "oklch(0.95 0.01 250)" : "oklch(0.25 0.03 255)";
  return (
    <div className="mb-2 rounded-lg border p-1.5" style={{ background }} role="img" aria-label={`Layout preview: ${items.map((item) => WIDGET_META[item.type].label).join(", ")}`} data-testid="layout-preview">
      <div className="relative w-full" style={{ aspectRatio: `${GRID_COLUMNS} / ${rows}`, maxHeight: 190 }}>
        {items.map((item) => (
          <div
            key={item.id}
            className="absolute flex items-center justify-center overflow-hidden rounded-[5px] p-0.5 text-center text-[9px] font-semibold leading-tight"
            style={{ left: `${(item.x / GRID_COLUMNS) * 100}%`, top: `${(item.y / rows) * 100}%`, width: `${(item.w / GRID_COLUMNS) * 100}%`, height: `${(item.h / rows) * 100}%`, padding: 1 }}
          >
            <span className="flex h-full w-full items-center justify-center rounded-[4px] px-1" style={{ background: `color-mix(in oklch, ${accent} 45%, ${background})`, color: ink }}>
              {WIDGET_META[item.type].label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
