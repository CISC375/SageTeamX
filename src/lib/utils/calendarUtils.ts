/* eslint-disable camelcase */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { calendar_v3 } from 'googleapis';
import { retrieveEvents } from '../auth';
import { PagifiedSelectMenu } from '../types/PagifiedSelect';
import * as fs from 'fs';
import { CalendarEmbed, CalendarEvent, Filter } from '../types/Calendar';

/**
 * This function will filter out events based on the given filter array
 *
 * @param {CalendarEvent[]} events The events that you want to filter
 * @param {Filter[]} filters The filters that you want to use to filter the events
 * @returns {Promise<Event[]>} This function will return an async promise of the filtered events in an array
 */
export async function filterCalendarEvents(events: CalendarEvent[], filters: Filter[]): Promise<CalendarEvent[]> {
	const filteredEvents: CalendarEvent[] = [];

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
 * This is a helper function update the calendar embed fields when the download button is pressed
 *
 * @param {CalendarEmbed[]} embeds The embeds that you want to update
 * @param {boolean} add Whether or not you want to add or remove from the calendar fields
 * @returns {CalendarEmbed[]} The updated embeds
 */
export function updateCalendarEmbed(embeds: CalendarEmbed[], add: boolean): CalendarEmbed[] {
	if (add) {
		embeds.forEach((embed) => {
			const { fields } = embed.embed.data;
			if (fields) {
				fields.forEach((field, index) => {
					field.name = `**${index + 1}.** ${field.name}`;
				});
			}
		});
	} else {
		embeds.forEach((embed) => {
			const { fields } = embed.embed.data;
			if (fields) {
				fields.forEach((field) => {
					[, field.name] = field.name.split(/\*\*\d+\.\*\*\s/);
				});
			}
		});
	}
	return embeds;
}

/**
 * This function will create embeds to contain all the events passed into the function
 *
 * @param {CalendarEvent[]} events The events you want to display in the embed
 * @param {number} itemsPerPage The number of events you want to display on one embed
 * @returns {EmbedBuilder[]} Embeds containing all of the calendar events
 */
export function generateCalendarEmbeds(events: CalendarEvent[], itemsPerPage: number): CalendarEmbed[] {
	const embeds: CalendarEmbed[] = [];

	// There can only be up to 25 fields in an embed, so this is just a check to make sure nothing breaks
	if (itemsPerPage > 25) {
		itemsPerPage = 25;
	}

	if (events.length) {
		// Pagify events array
		const pagifiedEvents: CalendarEvent[][] = [];
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

			page.forEach((event) => {
				newEmbed.addFields({
					name: `**${event.calEvent.summary}**`,
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
 * @param {CalendarEvent[]} filteredEvents All of the filtered events
 * @param {CalendarEvent[]} selectedEvents The events selected from the filtered events array (if any)
 * @param {number} currentPage The current embed page
 * @param {number} maxPage The total number of embeds
 * @param {boolean} downloadPressed  Whether or not the download button has been pressed
 * @returns {ActionRowBuilder<ButtonBuilder>}  All of the needed buttons to control the calendar embeds
 */
export function generateCalendarButtons(
	filteredEvents: CalendarEvent[],
	selectedEvents: CalendarEvent[],
	currentPage: number,
	maxPage: number,
	downloadPressed: boolean
): ActionRowBuilder<ButtonBuilder> {
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

	let downloadLabel = 'Download Events';
	if (downloadPressed) {
		downloadLabel = `Download Every Event (${filteredEvents.length})`;
		if (selectedEvents.length) {
			downloadLabel = `Download ${selectedEvents.length} event(s)`;
		}
	}

	const downloadButton = new ButtonBuilder()
		.setCustomId('download')
		.setLabel(downloadLabel)
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
 * @param {EmbedBuilder} calendarEmbed The embed to generate buttons for
 * @param {CalendarEvent[]} events All of the events retrieved from the google calendar
 * @returns {ActionRowBuilder<ButtonBuilder>} An action row containing all of the select butttons
 */
export function generateEventSelectButtons(calendarEmbed: CalendarEmbed, events: CalendarEvent[]): ActionRowBuilder<ButtonBuilder> | void {
	const selectEventButtons: ButtonBuilder[] = [];
	const { embed } = calendarEmbed;
	const emebdEvents = calendarEmbed.events;

	if (events.length && embed) {
		// This is to ensure that the number of buttons does not exceed to the limit per row
		let eventsInEmbed = emebdEvents.length;
		if (eventsInEmbed > 5) {
			eventsInEmbed = 5;
		}

		// Create buttons for each event on the page (up to 5)
		for (let i = 0; i < eventsInEmbed; i++) {
			const selectEvent = new ButtonBuilder()
				.setCustomId(`toggle-${i + 1}`)
				.setLabel(emebdEvents[i].selected ? `Remove #${i + 1}` : `Select #${i + 1}`)
				.setStyle(emebdEvents[i].selected ? ButtonStyle.Danger : ButtonStyle.Secondary);
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
 * @param {CalendarEvent[]} selectedEvents The selected events to download
 * @param {{calendarId: string, calendarName: string}} calendar An arry of all of the calendars retrived from MongoDB
 * @param {ChatInputCommandInteraction} interaction The interaction created by calling /calendar
 */
export async function downloadEvents(selectedEvents: CalendarEvent[], calendar: {calendarId: string, calendarName: string}, interaction: ChatInputCommandInteraction): Promise<void> {
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
