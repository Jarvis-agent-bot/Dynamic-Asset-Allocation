import { describe, expect, it } from "vitest";

import {
  computeMostRecentScheduledAtLocalV0,
  computeNextRunAtLocalV0,
  defaultRebalanceScheduleV1,
  type RebalanceScheduleV1,
} from "../rebalanceScheduleV0";

describe("daa/rebalanceScheduleV0", () => {
  it("returns null when disabled", () => {
    const now = new Date(2026, 1, 14, 0, 10, 0);
    const st = defaultRebalanceScheduleV1();
    expect(computeNextRunAtLocalV0(st, now)).toBe(null);
  });

  it("daily: schedules later today when time is in the future", () => {
    const now = new Date(2026, 1, 14, 9, 0, 0);
    const sch: RebalanceScheduleV1 = { enabled: true, cadence: "daily", timeLocalHHMM: "09:30" };
    const next = computeNextRunAtLocalV0(sch, now);
    expect(next).not.toBe(null);
    expect(next?.getFullYear()).toBe(2026);
    expect(next?.getMonth()).toBe(1);
    expect(next?.getDate()).toBe(14);
    expect(next?.getHours()).toBe(9);
    expect(next?.getMinutes()).toBe(30);
  });

  it("daily: schedules tomorrow when time already passed", () => {
    const now = new Date(2026, 1, 14, 10, 0, 0);
    const sch: RebalanceScheduleV1 = { enabled: true, cadence: "daily", timeLocalHHMM: "09:30" };
    const next = computeNextRunAtLocalV0(sch, now);
    expect(next).not.toBe(null);
    expect(next?.getDate()).toBe(15);
    expect(next?.getHours()).toBe(9);
    expect(next?.getMinutes()).toBe(30);
  });

  it("weekly: schedules this week when target weekday/time is ahead", () => {
    // 2026-02-14 is Saturday (local), so next Monday should be 2026-02-16.
    const now = new Date(2026, 1, 14, 9, 0, 0);
    const sch: RebalanceScheduleV1 = { enabled: true, cadence: "weekly", timeLocalHHMM: "09:30", weekday0Sun: 1 };
    const next = computeNextRunAtLocalV0(sch, now);
    expect(next).not.toBe(null);
    expect(next?.getFullYear()).toBe(2026);
    expect(next?.getMonth()).toBe(1);
    expect(next?.getDate()).toBe(16);
    expect(next?.getHours()).toBe(9);
    expect(next?.getMinutes()).toBe(30);
  });

  it("weekly: when weekday is today and time passed, schedules next week", () => {
    // 2026-02-16 is Monday.
    const now = new Date(2026, 1, 16, 10, 0, 0);
    const sch: RebalanceScheduleV1 = { enabled: true, cadence: "weekly", timeLocalHHMM: "09:30", weekday0Sun: 1 };
    const next = computeNextRunAtLocalV0(sch, now);
    expect(next).not.toBe(null);
    expect(next?.getDate()).toBe(23);
    expect(next?.getHours()).toBe(9);
    expect(next?.getMinutes()).toBe(30);
  });

  it("computeMostRecentScheduledAtLocalV0 (daily): returns today when already past", () => {
    const now = new Date(2026, 1, 14, 10, 0, 0);
    const sch: RebalanceScheduleV1 = { enabled: true, cadence: "daily", timeLocalHHMM: "09:30" };
    const prev = computeMostRecentScheduledAtLocalV0(sch, now);
    expect(prev).not.toBe(null);
    expect(prev?.getDate()).toBe(14);
    expect(prev?.getHours()).toBe(9);
    expect(prev?.getMinutes()).toBe(30);
  });

  it("computeMostRecentScheduledAtLocalV0 (daily): returns yesterday when time is in the future", () => {
    const now = new Date(2026, 1, 14, 9, 0, 0);
    const sch: RebalanceScheduleV1 = { enabled: true, cadence: "daily", timeLocalHHMM: "09:30" };
    const prev = computeMostRecentScheduledAtLocalV0(sch, now);
    expect(prev).not.toBe(null);
    expect(prev?.getDate()).toBe(13);
    expect(prev?.getHours()).toBe(9);
    expect(prev?.getMinutes()).toBe(30);
  });

  it("computeMostRecentScheduledAtLocalV0 (weekly): when today before scheduled time, returns last week", () => {
    // 2026-02-16 is Monday.
    const now = new Date(2026, 1, 16, 9, 0, 0);
    const sch: RebalanceScheduleV1 = { enabled: true, cadence: "weekly", timeLocalHHMM: "09:30", weekday0Sun: 1 };
    const prev = computeMostRecentScheduledAtLocalV0(sch, now);
    expect(prev).not.toBe(null);
    expect(prev?.getDate()).toBe(9);
    expect(prev?.getHours()).toBe(9);
    expect(prev?.getMinutes()).toBe(30);
  });
});
