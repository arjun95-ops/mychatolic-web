import { CronExpressionParser } from "cron-parser";
import { DEFAULT_TIMEZONE, safeTimeZone } from "@/lib/admin-constants";

export function normalizeCronExpression(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateCronExpression(value: string): { valid: boolean; error?: string } {
  const cron = normalizeCronExpression(value);

  if (!cron) {
    return { valid: false, error: "Cron expression wajib diisi." };
  }

  try {
    CronExpressionParser.parse(cron, { currentDate: new Date() });
    return { valid: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Cron tidak valid.";
    return { valid: false, error: message };
  }
}

export function getNextRunAt({
  cronExpression,
  timezone,
  fromDate,
}: {
  cronExpression: string;
  timezone?: string;
  fromDate?: Date;
}): Date {
  const tz = safeTimeZone(timezone, DEFAULT_TIMEZONE);
  const cron = normalizeCronExpression(cronExpression);
  const expression = CronExpressionParser.parse(cron, {
    currentDate: fromDate || new Date(),
    tz,
  });
  return expression.next().toDate();
}
