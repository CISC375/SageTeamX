import 'dotenv/config';

// Validation function for calendar IDs
export function validateCalendarId(calId: string): boolean {
// This regex expects calendar IDs to match the typical Google Calendar pattern
	const calIdRegex = /^[a-zA-Z0-9._%+-]+@group\.calendar\.google\.com$/;
	return calIdRegex.test(calId);
}

// Load the Calendar ID from the environment
const envCalendarId = process.env.CALENDAR_ID;
if (!envCalendarId) {
	throw new Error('CALENDAR_ID is not defined in the environment (.env file).');
}

if (!validateCalendarId(envCalendarId)) {
	throw new Error('Invalid CALENDAR_ID format. Please check your .env file.');
}

// Export the secure Calendar configuration
export const CALENDAR_CONFIG = {
	MASTER_ID: envCalendarId
};
