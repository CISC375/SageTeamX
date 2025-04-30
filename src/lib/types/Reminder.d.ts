export interface Reminder {
	owner: string;
	expires: Date;
	content: string;
	repeat: null | 'daily' | 'weekly' | 'every_event';
	mode: 'public' | 'private';
}

export interface CalReminder {
	owner: string;
	content: string;
	calendarId: string;
	eventId: string,
	offset: number;
	expires: Date;
	mode: 'public' | 'private';
	repeat: null | 'daily' | 'weekly' | 'every_event';
	repeatUntil: Date;
}
