export type StrategyLabDateDefaults = {
  rebalanceStartDate: string;
  rebalanceEndDate: string;
  breakoutStartDate: string;
  breakoutEndDate: string;
};

function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

export function buildStrategyLabDateDefaults(now = new Date()): StrategyLabDateDefaults {
  return {
    rebalanceStartDate: toLocalDateInputValue(shiftYears(now, -1)),
    rebalanceEndDate: toLocalDateInputValue(now),
    breakoutStartDate: toLocalDateInputValue(shiftYears(now, -5)),
    breakoutEndDate: toLocalDateInputValue(now),
  };
}
