import { z } from "zod"
import { ASSET_TYPES } from "@/lib/assets"
import { blankOr, intervalDays, intervalMiles, meterReading, moneyAmount, nameText, optionalNameText, requiredDateText, optionalDateText } from "@/lib/input-limits"

// The reminder schemas, shared by the actions in lib/actions/maintenance.ts and the tests.

export const scheduleSchema = z.object({
  assetId: z.string().min(1),
  assetType: z.enum(ASSET_TYPES),
  title: nameText("Title is required"),
  description: z.string().optional(),
  // "" is tried first: coerce would turn a blank field into 0.
  intervalDays: blankOr(intervalDays()).optional(),
  intervalMiles: blankOr(intervalMiles()).optional(),
  /// "4,10": months of the year for a calendar schedule. Blank for the other kinds.
  dueMonths: z.string().optional(),
  dueDay: blankOr(z.coerce.number().int().min(1).max(28)).optional(),
  estimatedCost: blankOr(moneyAmount()).optional(),
  nextDueDate: optionalDateText,
  nextDueMileage: blankOr(meterReading()).optional(),
  reminderDaysBefore: intervalDays().default(14),
  reminderMilesBefore: intervalMiles().default(500),
  /// Must be a room on the target's property; left out, an update keeps the schedule's room.
  roomId: z.string().optional(),
  /// A file on the same asset or on this reminder, and a page of it. Left out, an update keeps the stored link.
  referenceAttachmentId: z.string().optional(),
  referencePage: z.string().or(z.number()).optional(),
})

export const completeSchema = z.object({
  completedDate: requiredDateText("Date is required"),
  completedMileage: blankOr(meterReading()).optional(),
  /// Log the work as a service record too. On unless the caller turns it off.
  logService: z.boolean().default(true),
  vendor: optionalNameText,
  cost: blankOr(moneyAmount()).optional(),
  notes: z.string().optional(),
})

export const templatePicksSchema = z
  .array(
    z.object({
      key: z.string().min(1),
      intervalDays: blankOr(intervalDays()).optional(),
      intervalMiles: blankOr(intervalMiles()).optional(),
    })
  )
  .min(1)
  .max(50)
