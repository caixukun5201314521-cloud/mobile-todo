import { describe, test, expect } from 'bun:test';
import { financeSummary, safeUrl, countdown, dueDate, escapeHtml, localDate, moduleOf, sumMinutes } from '../public/utils.js';

describe('浏览器端记录口径', () => {
  test('财务计算分开投资与消费，按整数分计算且月份隔离', () => {
    const totals = financeSummary([
      { date: '2026-10-22', type: 'income', amount: 800 },
      { date: '2026-10-22', type: 'expense', amount: 25.10, necessary: true },
      { date: '2026-10-23', type: 'expense', amount: 12.20, necessary: false },
      { date: '2026-10-24', type: 'investment', amount: 500 },
      { date: '2026-09-24', type: 'expense', amount: 999 }
    ], 4000, '2026-10');
    expect(totals).toEqual({income:800,expense:37.3,investment:500,necessary:25.1,discretionary:12.2,funds:4800,available:4262.7});
    expect(financeSummary([{date:'2026-10-01',type:'expense',amount:4001}],4000,'2026-10').available).toBe(-1);
  });
  test('正文与属性转义，链接不允许脚本和SVG数据', () => {
    expect(escapeHtml('<img src="x" onerror="alert(1)">')).not.toContain('<img');
    for (const value of ['javascript:alert(1)', 'data:text/html,test', '//example.com', 'file:///tmp/test']) expect(safeUrl(value)).toBe('');
    expect(safeUrl('data:image/svg+xml;base64,AAAA',true)).toBe('');
    expect(safeUrl('/uploads/photo.png',true)).toBe('/uploads/photo.png');
    expect(safeUrl('https://example.com/paper')).toBe('https://example.com/paper');
    expect(safeUrl('data:image/png;base64,AAAA',true)).toContain('data:image/png');
  });
  test('倒计时区分剩余和逾期，无时间按本地23:59', () => {
    const now = new Date('2026-10-22T12:00:00');
    expect(countdown({date:'2026-10-23',time:'14:30'},now)).toBe('1 天 2 小时');
    expect(countdown({date:'2026-10-22',time:'10:30'},now)).toBe('已逾期 1 小时 30 分');
    expect(dueDate({date:'2026-10-22'}).getHours()).toBe(23);
    expect(dueDate({date:'2026-10-22'}).getMinutes()).toBe(59);
    expect(countdown({},now)).toBe('未设置截止');
  });
  test('保留旧分类语义，不擅自把全部学习任务归为科研', () => {
    expect(moduleOf({category:'学习'})).toBe('life');
    expect(moduleOf({category:'健康'})).toBe('training');
    expect(moduleOf({category:'学习',module:'learning'})).toBe('learning');
    expect(sumMinutes([{durationMinutes:0.1},{durationMinutes:0.2}])).toBe(0.3);
    expect(localDate(new Date(2026,9,22,0,1))).toBe('2026-10-22');
  });
});
