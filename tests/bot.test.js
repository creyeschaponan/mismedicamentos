jest.mock('../src/supabase', () => ({}));
jest.mock('telegraf', () => ({ Telegraf: jest.fn(), Markup: jest.fn() }));
const { parseTimeString } = require('../src/bot');

describe('Time Parsing - parseTimeString', () => {
  it('should parse 24h format', () => {
    expect(parseTimeString('14:30')).toEqual({ hours: 14, minutes: 30 });
    expect(parseTimeString('08:00')).toEqual({ hours: 8, minutes: 0 });
    expect(parseTimeString('23:59')).toEqual({ hours: 23, minutes: 59 });
    expect(parseTimeString('00:00')).toEqual({ hours: 0, minutes: 0 });
  });

  it('should parse 12h format with minutes', () => {
    expect(parseTimeString('2:30pm')).toEqual({ hours: 14, minutes: 30 });
    expect(parseTimeString('2:30 pm')).toEqual({ hours: 14, minutes: 30 });
    expect(parseTimeString('8:00am')).toEqual({ hours: 8, minutes: 0 });
    expect(parseTimeString('12:00pm')).toEqual({ hours: 12, minutes: 0 }); // Noon
    expect(parseTimeString('12:30am')).toEqual({ hours: 0, minutes: 30 }); // Midnight
  });

  it('should parse 12h format without minutes', () => {
    expect(parseTimeString('8am')).toEqual({ hours: 8, minutes: 0 });
    expect(parseTimeString('2pm')).toEqual({ hours: 14, minutes: 0 });
    expect(parseTimeString('12pm')).toEqual({ hours: 12, minutes: 0 });
    expect(parseTimeString('12am')).toEqual({ hours: 0, minutes: 0 });
  });

  it('should return null for invalid formats', () => {
    expect(parseTimeString('invalid')).toBeNull();
    expect(parseTimeString('25:00')).toBeNull();
    expect(parseTimeString('13pm')).toBeNull(); // 13pm isn't technically valid but regex might catch it if not careful. The regex allows 1-2 digits, bounded to 23? Wait, the regex checks h <= 23.
  });
});
