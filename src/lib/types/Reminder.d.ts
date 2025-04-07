export interface Reminder {
	owner: string;
	expires: Date;
	content: string;
	repeat: null | "daily" | "weekly" | "every_event";
	mode: "public" | "private";
}
