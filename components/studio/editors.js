'use client';
// Champs de saisie validés à la sortie du champ (volets Paramètres et Données).
import { useEffect, useState } from 'react';

export function NumberInput({ value, onCommit }) {
  const [v, setV] = useState(String(value ?? ''));
  useEffect(() => setV(String(value ?? '')), [value]);
  return (
    <input
      className="input sm"
      inputMode="decimal"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (String(value ?? '') !== v) onCommit(v.trim() === '' ? '' : Number(v.replace(',', '.')));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const n = (Number(v.replace(',', '.')) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
          setV(String(n));
          onCommit(n);
        }
      }}
    />
  );
}

export function TextInputCommit({ value, onCommit, className = 'input sm', placeholder }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className={className}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setV(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
