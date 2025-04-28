/* eslint-disable camelcase */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { calendar_v3 } from 'googleapis';
import { retrieveEvents } from '../auth';
import { PagifiedSelectMenu } from '../types/PagifiedSelect';
import * as fs from 'fs';

export interface Event {
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
	condition: (newValues: string[], event: Event) => boolean;
}

export interface CalendarEmbed {
	embed: EmbedBuilder;
	events: Event[];
}

/**
 * This function will filter out events based on the given filter array
 *
 * @param {Event[]} events The events that you want to filter
 * @param {Filter[]} filters The filters that you want to use to filter the events
 * @returns {Promise<Event[]>} This function will return an async promise of the filtered events in an array
 */
export async function filterCalendarEvents(events: Event[], filters: Filter[]): Promise<Event[]> {
	const filteredEvents: Event[] = [];

	let allFiltersFlags = true;

	await Promise.all(events.map(async (event) => {
		filters.forEach((filter) => {
			filter.flag = true;
			if (filter.newValues.length) {
				filter.flag = filter.condition(filter.newValues, event);
			}
		});
		allFiltersFlags = filters.every((filter) => filter.flag);

		if (allFiltersFlags) {
			filteredEvents.push(event);
		}
	}));

	return filteredEvents;
}

/**
 * This function will create embeds to contain all the events passed into the function
 *
 * @param {Event[]} events The events you want to display in the embed
 * @param {number} itemsPerPage The number of events you want to display on one embed
 * @returns {EmbedBuilder[]} Embeds containing all of the calendar events
 */
export function generateCalendarEmbeds(events: Event[], itemsPerPage: number): CalendarEmbed[] {
	const embeds: CalendarEmbed[] = [];

	// There can only be up to 25 fields in an embed, so this is just a check to make sure nothing breaks
	if (itemsPerPage > 25) {
		itemsPerPage = 25;
	}

	if (events.length) {
		// Pagify events array
		const pagifiedEvents: Event[][] = [];
		for (let i = 0; i < events.length; i += itemsPerPage) {
			pagifiedEvents.push(events.slice(i, i + itemsPerPage));
		}
		const maxPages = pagifiedEvents.length;

		// Create an embed for each page
		pagifiedEvents.forEach((page, pageIndex) => {
			const newEmbed = new EmbedBuilder()
				.setTitle(`Events - ${pageIndex + 1} of ${maxPages}`)
				.setColor('Green');

			const newCalendarEmbed: CalendarEmbed = { embed: newEmbed, events: [] };

			page.forEach((event, eventIndex) => {
				newEmbed.addFields({
					name: `**${eventIndex + 1}. ${event.calEvent.summary}**`,
					value: `Date: ${new Date(event.calEvent.start.dateTime).toLocaleDateString()}
					Time: ${new Date(event.calEvent.start.dateTime).toLocaleTimeString()} - ${new Date(event.calEvent.end.dateTime).toLocaleTimeString()}
					Location: ${event.calEvent.location}
					Email: ${event.calEvent.creator.email}\n`
				});
				newCalendarEmbed.events.push(event);
			});

			embeds.push(newCalendarEmbed);
		});
	} else {
		const emptyEmbed = new EmbedBuilder()
			.setTitle('No Events Found')
			.setColor('Green')
			.addFields({
				name: 'Try adjusting your filters',
				value: 'No events match your selections, please change them!'
			});
		const newCalendarEmbed: CalendarEmbed = { embed: emptyEmbed, events: [] };
		embeds.push(newCalendarEmbed);
	}
	return embeds;
}

/**
 * Generates pagification buttons and download buttons for the calendar embeds
 *
 * @param {number} currentPage The current embed page
 * @param {number} maxPage The total number of embeds
 * @param {number} downloadCount The number of selected events to be downloaded
 * @returns {ActionRowBuilder<ButtonBuilder>}  All of the needed buttons to control the calendar embeds
 */
export function generateCalendarButtons(currentPage: number, maxPage: number, downloadCount: number): ActionRowBuilder<ButtonBuilder> {
	const nextButton = new ButtonBuilder()
		.setCustomId('next')
		.setLabel('Next')
		.setStyle(ButtonStyle.Primary)
		.setDisabled(currentPage + 1 >= maxPage);

	const prevButton = new ButtonBuilder()
		.setCustomId('prev')
		.setLabel('Previous')
		.setStyle(ButtonStyle.Primary)
		.setDisabled(currentPage === 0);

	const downloadButton = new ButtonBuilder()
		.setCustomId('download')
		.setLabel(`Download ${downloadCount ? `${downloadCount} event(s)` : 'All'}`)
		.setStyle(ButtonStyle.Success);

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		prevButton,
		nextButton,
		downloadButton
	);
}

/**
 * Creates pagified select menus with the given filters
 *
 * @param {Filter[]} filters The filters to use to create the pagified select menus
 * @returns {PagifiedSelectMenu[]} The created pagified select menus based on the given filters
 */
export function generateCalendarFilterMessage(filters: Filter[]): PagifiedSelectMenu[] {
	const filterMenus: PagifiedSelectMenu[] = filters.map((filter) => {
		if (filter.values.length === 0) {
			filter.values.push('No Data Available');
		}
		const filterMenu = new PagifiedSelectMenu();
		filterMenu.createSelectMenu(
			{
				customId: filter.customId,
				placeHolder: filter.placeholder,
				minimumValues: 0,
				maximumValues: 25
			}
		);

		filter.values.forEach((value) => {
			filterMenu.addOption({ label: value, value: value.toLowerCase() });
		});
		return filterMenu;
	});

	return filterMenus;
}

/**
 * This function will generate select buttons for each event on the given embed (up to 5 events)
 *
 * @param {EmbedBuilder} embed The embed to generate buttons for
 * @param {Event[]} events All of the events retrieved from the google calendar
 * @returns {ActionRowBuilder<ButtonBuilder>} An action row containing all of the select butttons
 */
export function generateEventSelectButtons(embed: EmbedBuilder, events: Event[]): ActionRowBuilder<ButtonBuilder> | void {
	const selectEventButtons: ButtonBuilder[] = [];

	if (events.length && embed) {
		// This is to ensure that the number of buttons does not exceed to the limit per row
		let eventsInEmbed = embed.data.fields.length;
		if (eventsInEmbed > 5) {
			eventsInEmbed = 5;
		}

		// Create buttons for each event on the page (up to 5)
		for (let i = 1; i <= eventsInEmbed; i++) {
			const selectEvent = new ButtonBuilder()
				.setCustomId(`toggle-${i}`)
				.setLabel(`Select #${i}`)
				.setStyle(events[i].selected ? ButtonStyle.Primary : ButtonStyle.Secondary);
			selectEventButtons.push(selectEvent);
		}

		// Create row containing all of the select buttons
		const selectRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			...selectEventButtons
		);

		return selectRow;
	}
}

/**
 * Helper function for download events that formats the date and time properly
 *
 * @param {string} dateTimeString The date and time string to be formatted
 * @returns {string} The formatted version of the date and time
 */
function formatTime(dateTimeString: string): string {
	const [date, time] = dateTimeString.split('T');
	const formattedTime = time.split(/[-+]/)[0];
	return `${date}T${formattedTime}`.replace(/[-:.]/g, '');
}

/**
 * Creates an ics file containing all of the selected events
 *
 * @param {Event[]} selectedEvents The selected events to download
 * @param {{calendarId: string, calendarName: string}} calendar An arry of all of the calendars retrived from MongoDB
 * @param {ChatInputCommandInteraction} interaction The interaction created by calling /calendar
 */
export async function downloadEvents(selectedEvents: Event[], calendar: {calendarId: string, calendarName: string}, interaction: ChatInputCommandInteraction): Promise<void> {
	const formattedEvents: string[] = [];
	const parentEvents: calendar_v3.Schema$Event[] = await retrieveEvents(calendar.calendarId, interaction, false);
	const recurrenceRules: Record<string, string[]> = Object.fromEntries(parentEvents.map((event) => [event.id, event.recurrence]));
	const recurringIds: Set<string> = new Set();

	selectedEvents.forEach((event) => {
		let append = false;
		const iCalEvent = {
			UID: `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
			CREATED: new Date(event.calEvent.created).toISOString().replace(/[-:.]/g, ''),
			DTSTAMP: event.calEvent.updated.replace(/[-:.]/g, ''),
			DTSTART: `TZID=${event.calEvent.start.timeZone}:${formatTime(event.calEvent.start.dateTime)}`,
			DTEND: `TZID=${event.calEvent.end.timeZone}:${formatTime(event.calEvent.end.dateTime)}`,
			SUMMARY: event.calEvent.summary,
			DESCRIPTION: `${event.calEvent.description || ''} Contact Email: ${event.calEvent.creator.email || 'NA'}`,
			LOCATION: event.calEvent.location ? event.calEvent.location : 'NONE'
		};

		if (!event.calEvent.recurringEventId) {
			append = true;
		} else if (!recurringIds.has(event.calEvent.recurringEventId)) {
			recurringIds.add(event.calEvent.recurringEventId);
			append = true;
		}

		if (append) {
			const icsFormatted
			= `BEGIN:VEVENT
			UID:${iCalEvent.UID}
			CREATED:${iCalEvent.CREATED}
			DTSTAMP:${iCalEvent.DTSTAMP}
			DTSTART;${iCalEvent.DTSTART}
			DTEND;${iCalEvent.DTEND}
			SUMMARY:${iCalEvent.SUMMARY}
			DESCRIPTION:${iCalEvent.DESCRIPTION}
			LOCATION:${iCalEvent.LOCATION}
			STATUS:CONFIRMED
			${event.calEvent.recurringEventId ? recurrenceRules[event.calEvent.recurringEventId].join('\n') : ''}
			END:VEVENT
			`.replace(/\t/g, '');
			formattedEvents.push(icsFormatted);
		}
	});

	const icsCalendar = `BEGIN:VCALENDAR
	VERSION:2.0
	PRODID:-//YourBot//Discord Calendar//EN
	${formattedEvents.join('')}
	END:VCALENDAR
	`.replace(/\t/g, '');
	fs.writeFileSync('./events.ics', icsCalendar);
}
