import { type CSSProperties } from "react";
import { clamp } from "./number";

export type ParameterControlProps = {
  id: string;
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
};

export function ParameterControl({
  id,
  label,
  description,
  value,
  min,
  max,
  unit = "",
  onChange,
}: ParameterControlProps) {
  const progress = max === min ? 100 : ((value - min) / (max - min)) * 100;

  return (
    <div className="control-group">
      <div className="control-heading">
        <div>
          <label className="control-label" htmlFor={id}>
            {label}
          </label>
          <p className="control-description" id={`${id}-description`}>
            {description}
          </p>
        </div>
        <span className="control-value">
          {value}
          {unit}
        </span>
      </div>
      <input
        aria-label={label}
        aria-describedby={`${id}-description`}
        className="range-input"
        id={id}
        max={max}
        min={min}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        step={1}
        style={{ "--range-progress": `${progress}%` } as CSSProperties}
        type="range"
        value={value}
      />
      <div className="range-scale" aria-hidden="true">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}
