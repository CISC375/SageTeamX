/* eslint-disable camelcase */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { calendar_v3 } from 'googleapis';
import { retrieveEvents } from '../auth';
import { PagifiedSelectMenu } from '../types/PagifiedSelect';
import * as fs from 'fs';

export interface Event {
	calEvent: calendar_v3.Schema$Event;
	calendarName: string;
}

export interface Filter {
	customId: string;
	placeholder: string,
	values: string[];
	newValues: string[];
	flag: boolean;
	condition: (newValues: string[], event: Event) => boolean;
}

export async function filterEvents(events: Event[], filters: Filter[]): Promise<Event[]> {
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

// Generates the embed for displaying events.
export function generateEmbed(filteredEvents: Event[], currentPage: number, itemsPerPage: number): EmbedBuilder[] {
	const embeds: EmbedBuilder[] = [];
	let embed: EmbedBuilder;

	if (filteredEvents.length) {
		let numEmbeds = 1;
		const maxPage: number = Math.ceil(filteredEvents.length / itemsPerPage);

		embed = new EmbedBuilder()
			.setTitle(`Events - ${currentPage + numEmbeds} of ${maxPage}`)
			.setColor('Green');

		let i = 1;
		filteredEvents.forEach((event, index) => {
			embed.addFields({
				name: `**${event.calEvent.summary}**`,
				value: `Date: ${new Date(event.calEvent.start.dateTime).toLocaleDateString()}
				Time: ${new Date(event.calEvent.start.dateTime).toLocaleTimeString()} - ${new Date(event.calEvent.end.dateTime).toLocaleTimeString()}
				Location: ${event.calEvent.location ? event.calEvent.location : '`NONE`'}
				Email: ${event.calEvent.creator.email}\n`
			});

			if (i % itemsPerPage === 0) {
				numEmbeds++;
				embeds.push(embed);
				embed = new EmbedBuilder()
					.setTitle(`Events - ${currentPage + numEmbeds} of ${maxPage}`)
					.setColor('Green');
			} else if (filteredEvents.length - 1 === index) {
				embeds.push(embed);
			}
			i++;
		});
	} else {
		embed = new EmbedBuilder()
			.setTitle('No Events Found')
			.setColor('Green')
			.addFields({
				name: 'Try adjusting your filters',
				value: 'No events match your selections, please change them!'
			});
		embeds.push(embed);
	}
	return embeds;
}

// Generates the pagination buttons (Previous, Next, Download Calendar, Download All, Done).
export function generateButtons(currentPage: number, maxPage: number, downloadCount: number): ActionRowBuilder<ButtonBuilder> {
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

	const downloadCal = new ButtonBuilder()
		.setCustomId('download_Cal')
		.setLabel(`Download Calendar (${downloadCount})`)
		.setStyle(ButtonStyle.Success)
		.setDisabled(downloadCount === 0);

	const downloadAll = new ButtonBuilder()
		.setCustomId('download_all')
		.setLabel('Download All')
		.setStyle(ButtonStyle.Secondary);

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		prevButton,
		nextButton,
		downloadCal,
		downloadAll
	);
}

// Generates filter dropdown menus.
export function generateFilterMessage(filters: Filter[]): PagifiedSelectMenu[] {
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
			let isDefault = false;
			if (filter.newValues[0]) {
				if (filter.newValues[0].toLowerCase() === value.toLowerCase()) {
					isDefault = true;
				}
			}
			filterMenu.addOption({ label: value, value: value.toLowerCase(), default: isDefault });
		});
		return filterMenu;
	});

	return filterMenus;
}

// Generates a row of toggle buttons – one for each event on the current page.
export function generateEventSelectButtons(eventsPerPage: number): ActionRowBuilder<ButtonBuilder> {
	const selectEventButtons: ButtonBuilder[] = [];

	// This is to ensure that the number of buttons does not exceed to the limit per row
	// We should probably change to a pagified select menu later on
	if (eventsPerPage > 5) {
		eventsPerPage = 5;
	}

	// Create buttons for each event on the page (up to 5)
	for (let i = 1; i <= eventsPerPage; i++) {
		const selectEvent = new ButtonBuilder()
			.setCustomId(`toggle-${i}`)
			.setLabel(`Select #${i}`)
			.setStyle(ButtonStyle.Secondary);
		selectEventButtons.push(selectEvent);
	}

	// Create row containing all of the select buttons
	const selectRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		...selectEventButtons
	);

	return selectRow;
}

// Downloads events by generating an ICS file.
// This version includes recurrence rules (if the event has them).
export async function downloadEvents(selectedEvents: Event[], calendars: {calendarId: string, calendarName: string}[], interaction: ChatInputCommandInteraction): Promise<void> {
	const formattedEvents: string[] = [];
	const parentEvents: calendar_v3.Schema$Event[] = [];

	for (const calendar of calendars) {
		const newParentEvents = await retrieveEvents(calendar.calendarId, interaction, false);
		parentEvents.push(...newParentEvents);
	}

	const recurrenceRules: Record<string, string> = Object.fromEntries(parentEvents.map((event) => [event.id, event.recurrence[0]]));

	const recurringIds: Set<string> = new Set();

	selectedEvents.forEach((event) => {
		let append = false;
		const iCalEvent = {
			UID: `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
			CREATED: new Date(event.calEvent.created).toISOString().replace(/[-:.]/g, ''),
			DTSTAMP: event.calEvent.updated.replace(/[-:.]/g, ''),
			DTSTART: `TZID=${event.calEvent.start.timeZone}:${event.calEvent.start.dateTime.replace(/[-:.]/g, '')}`,
			DTEND: `TZID=${event.calEvent.end.timeZone}:${event.calEvent.end.dateTime.replace(/[-:.]/g, '')}`,
			SUMMARY: event.calEvent.summary,
			DESCRIPTION: `Contact Email: ${event.calEvent.creator.email || 'NA'}`,
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
			${event.calEvent.recurringEventId ? recurrenceRules[event.calEvent.recurringEventId] : ''}
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
