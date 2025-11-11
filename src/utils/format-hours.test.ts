// ABOUTME: Tests for formatting and cleaning hours strings
// ABOUTME: Removes closed days from hours strings for cleaner output

import { test, expect } from "bun:test";
import { cleanHours } from "./format-hours";

test("removes closed days from hours string", () => {
  const input = "Monday: Closed; Tuesday: 10:00 AM – 12:00 PM; Wednesday: Closed; Thursday: Closed; Friday: Closed; Saturday: Closed; Sunday: 11:30 AM – 12:00 PM";
  const expected = "Tuesday: 10:00 AM – 12:00 PM; Sunday: 11:30 AM – 12:00 PM";
  expect(cleanHours(input)).toBe(expected);
});

test("handles all days closed", () => {
  const input = "Monday: Closed; Tuesday: Closed; Wednesday: Closed; Thursday: Closed; Friday: Closed; Saturday: Closed; Sunday: Closed";
  expect(cleanHours(input)).toBe("");
});

test("handles no closed days", () => {
  const input = "Monday: 9:00 AM – 5:00 PM; Tuesday: 9:00 AM – 5:00 PM";
  expect(cleanHours(input)).toBe(input);
});

test("handles null/undefined input", () => {
  expect(cleanHours(null)).toBe("");
  expect(cleanHours(undefined)).toBe("");
  expect(cleanHours("")).toBe("");
});

test("handles various closed formats", () => {
  const input = "Monday: closed; Tuesday: 9:00 AM – 5:00 PM; Wednesday: CLOSED; Thursday: Closed";
  const expected = "Tuesday: 9:00 AM – 5:00 PM";
  expect(cleanHours(input)).toBe(expected);
});

test("preserves backslash in times", () => {
  const input = "Tuesday: 10:00 AM – 12:00 \\PM; Sunday: 11:30 AM – 12:00 \\PM";
  expect(cleanHours(input)).toBe(input);
});

test("handles multiline format", () => {
  const input = "Monday: Closed\nTuesday: 10:00 AM – 12:00 PM\nWednesday: Closed";
  const expected = "Tuesday: 10:00 AM – 12:00 PM";
  expect(cleanHours(input)).toBe(expected);
});

test("handles 24 hours format", () => {
  const input = "Monday: Closed; Tuesday: Open 24 hours; Wednesday: Closed";
  const expected = "Tuesday: Open 24 hours";
  expect(cleanHours(input)).toBe(expected);
});
