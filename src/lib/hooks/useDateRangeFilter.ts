import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { dateInputToTimestamp, timestampToDateInputValue, todayDateInputValue } from '@/lib/dates';

export const DEFAULT_RANGE_DAYS = 7;
export const DAY_MS = 24 * 60 * 60 * 1000;

function readDateParam(searchParams: URLSearchParams, key: string): string | null {
  const value = searchParams.get(key);
  return value && dateInputToTimestamp(value) !== null ? value : null;
}

function initialRange(searchParams: URLSearchParams): { from: string; to: string } {
  let from =
    readDateParam(searchParams, 'from') ??
    timestampToDateInputValue(Date.now() - DEFAULT_RANGE_DAYS * DAY_MS);
  let to = readDateParam(searchParams, 'to') ?? todayDateInputValue();
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

export function useDateRangeFilter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [range, setRange] = useState(() => initialRange(searchParams));

  const persistRange = (next: { from: string; to: string }) => {
    const params = new URLSearchParams(searchParams);
    params.set('from', next.from);
    params.set('to', next.to);
    setSearchParams(params, { replace: true });
  };

  const applyRange = (next: { from: string; to: string }) => {
    setRange(next);
    persistRange(next);
  };

  const handleFromChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (!value || dateInputToTimestamp(value) === null) return;
    applyRange({ from: value, to: value > range.to ? value : range.to });
  };

  const handleToChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (!value || dateInputToTimestamp(value) === null) return;
    applyRange({ from: value < range.from ? value : range.from, to: value });
  };

  const resetRange = () => {
    const next = {
      from: timestampToDateInputValue(Date.now() - DEFAULT_RANGE_DAYS * DAY_MS),
      to: todayDateInputValue(),
    };
    setRange(next);
    const params = new URLSearchParams(searchParams);
    params.delete('from');
    params.delete('to');
    setSearchParams(params, { replace: true });
  };

  return {
    range,
    handleFromChange,
    handleToChange,
    resetRange,
  };
}
