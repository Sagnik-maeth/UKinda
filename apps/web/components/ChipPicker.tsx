type Props = {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Disables unselected chips once this many are picked. */
  max?: number;
};

export function ChipPicker({ label, options, selected, onToggle, max }: Props) {
  const full = max !== undefined && selected.length >= max;
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              className="chip text-sm disabled:opacity-40"
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => onToggle(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
