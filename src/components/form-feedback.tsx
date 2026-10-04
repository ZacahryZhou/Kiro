export type FormState = { kind: "success" | "error" | null; message: string; details?: string[] };
export const initialFormState: FormState = { kind: null, message: "" };

export const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The success or error message shown under a form after it is submitted. */
export function FormFeedback({ state }: { state: FormState }) {
  if (!state.kind) return null;
  const isError = state.kind === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`space-y-1 rounded-lg border p-3 text-sm ${isError ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
      aria-live={isError ? "assertive" : "polite"}
    >
      <p>{state.message}</p>
      {state.details?.map((detail, index) => <p key={`${index}-${detail}`}>{detail}</p>)}
    </div>
  );
}
