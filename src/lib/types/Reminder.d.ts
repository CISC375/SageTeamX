export interface Reminder {
	_id?: ObjectId;
	owner: string;
	expires: Date;
	content: string;
	repeat: null | 'daily' | 'weekly' | 'every_event';
	summary: string;
	mode: 'public' | 'private';
	calendarId?: string;
	offset?: number;
	repeatUntil?: Date;
}
