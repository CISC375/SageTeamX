export interface Reminder {
	owner: string;
	expires: Date;
	content: string;
	repeat: null | 'daily' | 'weekly' | 'every_event';
	mode: 'public' | 'private';
}

export interface CalReminder {
	owner: string;
	calendarId: string
	eventId: string,
	expires: Date;
	content: string;
	repeat: null | 'daily' | 'weekly' | 'every_event';
	mode: 'public' | 'private';
}
