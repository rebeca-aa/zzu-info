/**
 * 主页「今日课表」的离线兜底。
 *
 * 实时读不到时要从缓存的学期课表里按日期挑出这一天的课，并且让调用方知道
 * 这份数据是哪来的——界面上要根据它标「离线课表 · 学期缓存」。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readSemesterDay } from '../pwa/views';
import { writeCache } from '../src/core/offline';
import { weekOfDate, weekdayOf } from '../src/core/util';
import type { Course } from '../src/core/types';

const mem = new Map<string, string>();

function installLocalStorage(): void {
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  } as unknown as Storage;
}

/* 学期首周周一 + 某一天：测试自己算周次，别把期望值写死 */
const TERM_START = '2026-09-07';
const DAY = '2026-11-16';
const WEEK = weekOfDate(TERM_START, DAY);
const DOW = weekdayOf(DAY);

const course = (name: string, weekday: number, weeks: number[] = []): Course => ({
  key: name,
  name,
  teachers: [],
  weekday,
  startTime: '08:00',
  endTime: '09:35',
  weeks,
  source: 'jwxt',
});

beforeEach(() => {
  mem.clear();
  installLocalStorage();
});

describe('今日课表的学期缓存兜底', () => {
  it('学期缓存里有这一天：挑出来并标明来源是学期缓存', async () => {
    await writeCache('courses', {
      termStart: TERM_START,
      courses: [course('高数', DOW), course('英语', (DOW % 7) + 1)],
    });

    const got = await readSemesterDay(DAY, TERM_START);
    expect(got?.from).toBe('semester');
    expect(got?.week).toBe(WEEK);
    expect(got?.courses.map((c) => c.name)).toEqual(['高数']);
  });

  it('按教学周过滤：不在本周的课不出现', async () => {
    await writeCache('courses', {
      termStart: TERM_START,
      courses: [course('本学期一直有', DOW), course('只在第 1 周', DOW, [1])],
    });

    const got = await readSemesterDay(DAY, TERM_START);
    expect(got?.courses.map((c) => c.name)).toEqual(['本学期一直有']);
  });

  it('没有学期缓存时退回「本周课表」缓存，来源标成本周', async () => {
    await writeCache(`schedule:week:${WEEK}`, { week: WEEK, courses: [course('线代', DOW)] });

    const got = await readSemesterDay(DAY, TERM_START);
    expect(got?.from).toBe('week');
    expect(got?.courses.map((c) => c.name)).toEqual(['线代']);
  });

  it('学期缓存里有 termStart 时不必再传', async () => {
    await writeCache('courses', { termStart: TERM_START, courses: [course('高数', DOW)] });

    const got = await readSemesterDay(DAY);
    expect(got?.courses.map((c) => c.name)).toEqual(['高数']);
  });

  it('推不出周次（没有 termStart）就老实返回 null，不瞎猜', async () => {
    await writeCache('courses', { courses: [course('高数', DOW)] });

    expect(await readSemesterDay(DAY)).toBeNull();
  });

  it('两种缓存都没有：null', async () => {
    expect(await readSemesterDay(DAY, TERM_START)).toBeNull();
  });
});
