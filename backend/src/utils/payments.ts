export function calculateWeeksFromAmount(amount: number) {
  if (amount <= 0) return 0;
  return Math.min(4, Math.floor(amount / 50));
}

export function calculateBalanceWeeks(week1: boolean, week2: boolean, week3: boolean, week4: boolean) {
  const total = [week1, week2, week3, week4].filter(Boolean).length;
  return 4 - total;
}

export function calculateBalanceMonths(balanceWeeks: number) {
  return Number((balanceWeeks / 4).toFixed(2));
}

export function calculateBalanceRupees(balanceWeeks: number) {
  return balanceWeeks * 50;
}
