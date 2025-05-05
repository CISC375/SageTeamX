/* eslint-disable camelcase */
export interface CalendarEvent {
	calEvent: calendar_v3.Schema$Event;
	calendarName: string;
	selected: boolean;
}

export interface Filter {
	customId: string;
	placeholder: string,
	values: string[];
	newValues: string[];
	flag: boolean;
	condition: (newValues: string[], event: CalendarEvent) => boolean;
}

export interface CalendarEmbed {
	embed: EmbedBuilder;
	events: CalendarEvent[];
}
