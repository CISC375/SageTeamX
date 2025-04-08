import assert from 'assert';
import { validateCalendarId } from './calendarConfig';

// Test valid calendar ID:
const validId = 'c_dd28a9977da52689612627d786654e9914d35324f7fcfc928a7aab294a4a7ce3@group.calendar.google.com';
assert.strictEqual(validateCalendarId(validId), true, 'The valid calendar ID should return true.');

// Test an invalid calendar ID:
const invalidId = 'invalid@calendar.com';
assert.strictEqual(validateCalendarId(invalidId), false, 'An invalid calendar ID should return false.');

// Test malicious input:
const maliciousId = 'something; DROP TABLE users';
assert.strictEqual(validateCalendarId(maliciousId), false, 'Malicious input should return false.');

console.log('All tests passed.');
