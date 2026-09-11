// Goal lifecycle and calendar periods use the UTC calendar date, independently
// of the host operating-system timezone. Services accept this clock in tests.
export type GoalClock = () => string;
export const utcToday: GoalClock = () => new Date().toISOString().slice(0, 10);
export const calculatedAt = () => new Date().toISOString();
