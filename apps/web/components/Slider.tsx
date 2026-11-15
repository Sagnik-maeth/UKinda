type Props = {
  low: string;
  high: string;
  value: number;
  onChange: (value: number) => void;
};

export function Slider({ low, high, value, onChange }: Props) {
  return (
    <label className="block text-sm font-semibold">
      <span className="flex justify-between gap-4">
        <span>{low}</span>
        <span className="text-right">{high}</span>
      </span>
      <input
        className="mt-3 w-full accent-[#2b765c]"
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        aria-label={`${low} to ${high}`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
