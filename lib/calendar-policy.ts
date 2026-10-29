import { z } from "zod";
const zoned = z.string().datetime({ offset: true });
export const calendarEventInput = z
  .object({
    summary: z.string().trim().min(1).max(500),
    description: z.string().max(10_000).default(""),
    location: z.string().max(1000).default(""),
    start: zoned,
    end: zoned,
    timeZone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
    attendees: z.array(z.string().email()).max(50).default([]),
    reminderMinutes: z.number().int().min(0).max(40320).nullable().default(30),
  })
  .refine((v) => Date.parse(v.end) > Date.parse(v.start), {
    message: "The end must be after the start.",
  });
export function providerCalendarEvent(
  value: z.infer<typeof calendarEventInput>,
) {
  return {
    summary: value.summary,
    description: value.description,
    location: value.location,
    start: { dateTime: value.start, timeZone: value.timeZone },
    end: { dateTime: value.end, timeZone: value.timeZone },
    attendees: value.attendees.map((email) => ({ email })),
    reminders: {
      useDefault: false,
      overrides:
        value.reminderMinutes === null
          ? []
          : [{ method: "popup", minutes: value.reminderMinutes }],
    },
  };
}
