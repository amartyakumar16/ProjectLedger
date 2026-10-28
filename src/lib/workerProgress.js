export const roundQuantity = (value) => Math.round((value + Number.EPSILON) * 1000) / 1000;

export function progressRows(task) {
  let completed = 0;
  return [...task.entries].sort((a, b) => a.date.localeCompare(b.date)).map((entry, index) => {
    completed = roundQuantity(completed + entry.quantity);
    return { ...entry, day: index + 1, completed, remaining: roundQuantity(task.target - completed) };
  });
}
