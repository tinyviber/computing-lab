import { SHEET_LIMITS } from "../domain/schema";

export function NumberInput({
  label,
  value,
  onChange,
  min = 1,
  max = SHEET_LIMITS.maxScore,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="ts-num">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}
