import type { ReactNode } from "react";

type Props = {
  step: number;
  total: number;
  title: string;
  hint?: string;
  children: ReactNode;
};

export function StepShell({ step, total, title, hint, children }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
        <span>Step {step + 1} of {total}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1}>
        <div className="h-full rounded-full bg-[#2b765c] transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>
      <h2 className="mt-7 text-xl font-bold">{title}</h2>
      {hint && <p className="muted mt-1 text-sm">{hint}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}
