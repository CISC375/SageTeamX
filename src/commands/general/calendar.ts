/* eslint-disable camelcase */
import {
	ChatInputCommandInteraction,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
	EmbedBuilder,
	ApplicationCommandOptionType,
	ApplicationCommandStringOptionData,
	ComponentType,
	StringSelectMenuBuilder,
	ButtonInteraction,
	CacheType,
	StringSelectMenuInteraction,
	Message
} from 'discord.js';
import { Command } from '@lib/types/Command';
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import { CALENDAR_CONFIG } from '@lib/CalendarConfig';
import { PagifiedSelectMenu } from '@root/src/lib/utils/calendarUtils';
import { calendar_v3 } from 'googleapis';
import { retrieveEvents } from '@root/src/lib/auth';
import path from 'path';

// Define the Master Calendar ID constant.
const MASTER_CALENDAR_ID = CALENDAR_CONFIG.MASTER_ID;

interface Event {
	calEvent: calendar_v3.Schema$Event;
	calendarName: string;
}

interface Filter {
	customId: string;
	placeholder: string,
	values: string[];
	newValues: string[];
	flag: boolean;
	condition: (newValues: string[], event: Event) => boolean;
}

export default class extends Command {

	name = 'calendar';
	description = 'Retrieve calendar events with pagination and filters';

	options: ApplicationCommandStringOptionData[] = [
		{
			type: ApplicationCommandOptionType.String,
			name: 'classname',
			description: 'Enter the event holder (e.g., class name).',
			required: false
		}
	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		/** Helper Functions **/

		// Filters calendar events based on slash command inputs and filter dropdown selections.
		async function filterEvents(events: Event[], filters: Filter[]) {
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
		function generateEmbed(filteredEvents: Event[], currentPage: number, itemsPerPage: number): EmbedBuilder[] {
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
		function generateButtons(currentPage: number, maxPage: number, downloadCount: number): ActionRowBuilder<ButtonBuilder> {
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
		function generateFilterMessage(filters: Filter[]) {
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
		function generateEventSelectButtons(eventsPerPage: number): ActionRowBuilder<ButtonBuilder> {
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
		async function downloadEvents(selectedEvents: Event[], calendars: {calendarId: string, calendarName: string}[]) {
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

		/** ****************************************************************************************************************/
		// Initial reply to acknowledge the interaction.
		await interaction.reply({
			content: 'Authenticating and fetching events...',
			ephemeral: true
		});

		// Define filters for dropdowns.
		const filters: Filter[] = [
			{
				customId: 'calendar_menu',
				placeholder: 'Select Calendar',
				values: [],
				newValues: [],
				flag: true,
				condition: (newValues: string[], event: Event) => {
					const calendarName = event.calendarName.toLowerCase() || '';
					return newValues.some((value) => calendarName === value.toLowerCase());
				}
			},
			{
				customId: 'class_name_menu',
				placeholder: 'Select Classes',
				values: [],
				newValues: [interaction.options.getString('classname') ? interaction.options.getString('classname') : ''],
				flag: true,
				condition: (newValues: string[], event: Event) => {
					const summary = event.calEvent.summary?.toLowerCase() || '';
					return newValues.some((value) => summary.includes(value.toLowerCase()));
				}
			},
			{
				customId: 'location_type_menu',
				placeholder: 'Select Location Type',
				values: ['In Person', 'Virtual'],
				newValues: [],
				flag: true,
				condition: (newValues: string[], event: Event) => {
					const locString = event.calEvent.summary?.toLowerCase() || '';
					return newValues.some((value) => locString.includes(value.toLowerCase()));
				}
			},
			{
				customId: 'week_menu',
				placeholder: 'Select Days of Week',
				values: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
				newValues: [],
				flag: true,
				condition: (newValues: string[], event: Event) => {
					if (!event.calEvent.start?.dateTime) return false;
					const dt = new Date(event.calEvent.start.dateTime);
					const weekdayIndex = dt.getDay(); // 0 = Sunday, 1 = Monday, etc.
					const dayName = [
						'Sunday',
						'Monday',
						'Tuesday',
						'Wednesday',
						'Thursday',
						'Friday',
						'Saturday'
					][weekdayIndex];
					return newValues.some((value) => value.toLowerCase() === dayName.toLowerCase());
				}
			}
		];

		const MONGO_URI = process.env.DB_CONN_STRING || '';
		const DB_NAME = 'CalendarDatabase';
		const COLLECTION_NAME = 'calendarIds';

		// Fetch calendar IDs from MongoDB.
		async function fetchCalendars() {
			const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
			await client.connect();
			const db = client.db(DB_NAME);
			const collection = db.collection(COLLECTION_NAME);

			const calendarDocs = await collection.find().toArray();
			await client.close();

			const calendars: {calendarId: string, calendarName: string}[] = calendarDocs.map((doc) => ({
				calendarId: doc.calendarId,
				calendarName: doc.calendarName || 'Unnamed Calendar'
			}));

			if (!calendars.some((c) => c.calendarId === MASTER_CALENDAR_ID)) {
				calendars.push({
					calendarId: MASTER_CALENDAR_ID,
					calendarName: 'Master Calendar'
				});
			}

			return calendars;
		}

		// Retrieve events from all calendars in the database
		const events: Event[] = [];
		const calendars = await fetchCalendars();
		const calendarMenu = filters.find((fi) => fi.customId === 'calendar_menu');
		if (calendarMenu) {
			calendarMenu.values = calendars.map((c) => c.calendarName);
		}

		await Promise.all(calendars.map(async (cal) => {
			const retrivedEvents = await retrieveEvents(cal.calendarId, interaction);
			if (retrivedEvents === null) {
				return;
			}
			retrivedEvents.forEach((retrivedEvent) => {
				const newEvent: Event = { calEvent: retrivedEvent, calendarName: cal.calendarName };
				events.push(newEvent);
			});
		}));
		// for (const cal of calendars) {
		// 	const retrivedEvents = await retrieveEvents(cal.calendarId, interaction);
		// 	if (retrivedEvents === null) {
		// 		return;
		// 	}
		// 	retrivedEvents.forEach((retrivedEvent) => {
		// 		const newEvent: Event = { calEvent: retrivedEvent, calendarName: cal.calendarName };
		// 		events.push(newEvent);
		// 	});
		// }

		// Sort events by their start time.
		events.sort(
			(a, b) =>
				new Date(a.calEvent.start?.dateTime || a.calEvent.start?.date).getTime() -
				new Date(b.calEvent.start?.dateTime || b.calEvent.start?.date).getTime()
		);

		const eventsPerPage = 3;
		let filteredEvents: Event[] = await filterEvents(events, filters);
		if (!filteredEvents.length) {
			await interaction.followUp({
				content: 'No matching events found based on your filters. Please adjust your search criteria.',
				ephemeral: true
			});
			return;
		}

		let currentPage = 0;
		let selectedEvents: Event[] = [];
		let embeds = generateEmbed(filteredEvents, currentPage, eventsPerPage);
		let maxPage: number = embeds.length;

		const initialComponents: ActionRowBuilder<ButtonBuilder>[] = [];
		initialComponents.push(generateButtons(currentPage, maxPage, selectedEvents.length));
		if (embeds[currentPage]) {
			if (embeds[currentPage].data.fields.length) {
				initialComponents.push(generateEventSelectButtons(embeds[currentPage].data.fields.length));
			}
		}

		const dm = await interaction.user.createDM();
		let message: Message<false>;
		try {
			message = await dm.send({
				embeds: [embeds[currentPage]],
				components: initialComponents
			});
		} catch (error) {
			console.error('Failed to send DM:', error);
			await interaction.followUp({
				content: "⚠️ I couldn't send you a DM. Please check your privacy settings.",
				ephemeral: true
			});
			return;
		}

		const filterComponents = generateFilterMessage(filters);
		let content = '**Select Filters**';

		const singlePageMenus: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] = [];
		filterComponents.forEach((component) => {
			if (component.menus.length > 1) {
				component.generateRowsAndSendMenu(async (i) => {
					await i.deferUpdate();
					const filter = filters.find((fi) => fi.customId === i.customId);
					if (filter) {
						filter.newValues = i.values;
					}
					filteredEvents = await filterEvents(events, filters);
					currentPage = 0;
					selectedEvents = [];
					embeds = generateEmbed(filteredEvents, currentPage, eventsPerPage);
					maxPage = embeds.length;
					const newComponents: ActionRowBuilder<ButtonBuilder>[] = [];
					newComponents.push(generateButtons(currentPage, maxPage, selectedEvents.length));
					if (embeds[currentPage]) {
						if (embeds[currentPage].data.fields.length) {
							newComponents.push(generateEventSelectButtons(embeds[currentPage].data.fields.length));
						}
					}
					message.edit({
						embeds: [embeds[currentPage]],
						components: newComponents
					});
				}, interaction, dm, content);
				content = '';
			} else {
				singlePageMenus.push(component.generateActionRows()[0]);
			}
		});

		// Send filter message
		let filterMessage: Message<false>;
		try {
			filterMessage = await dm.send({
				content: content,
				components: singlePageMenus
			});
		} catch (error) {
			console.error('Failed to send DM:', error);
			await interaction.followUp({
				content: "⚠️ I couldn't send you a DM. Please check your privacy settings.",
				ephemeral: true
			});
			return;
		}
		await filterMessage.edit({
			content: content,
			components: singlePageMenus
		});

		// Create collectors for button and menu interactions.
		const buttonCollector = message.createMessageComponentCollector({ time: 300000 });
		const menuCollector = filterMessage.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 300000 });

		buttonCollector.on('collect', async (btnInt: ButtonInteraction<CacheType>) => {
			try {
				await btnInt.deferUpdate();
				if (btnInt.customId.startsWith('toggle-')) {
					const eventIndex = Number(btnInt.customId.split('-')[1]) - 1;
					const event = filteredEvents[(currentPage * eventsPerPage) + eventIndex];
					if (selectedEvents.some((e) => e === event)) {
						selectedEvents.splice(selectedEvents.indexOf(event), 1);
						try {
							const removeMsg = await dm.send(`Removed ${event.calEvent.summary}`);
							setTimeout(async () => {
								try {
									await removeMsg.delete();
								} catch (err) {
									console.error('Failed to delete removal message:', err);
								}
							}, 3000);
						} catch (err) {
							console.error('Error sending removal message:', err);
						}
					} else {
						selectedEvents.push(event);
						try {
							const addMsg = await dm.send(`Added ${event.calEvent.summary}`);
							setTimeout(async () => {
								try {
									await addMsg.delete();
								} catch (err) {
									console.error('Failed to delete addition message:', err);
								}
							}, 3000);
						} catch (err) {
							console.error('Error sending addition message:', err);
						}
					}
				} else if (btnInt.customId === 'next') {
					if (currentPage + 1 >= maxPage) return;
					currentPage++;
				} else if (btnInt.customId === 'prev') {
					if (currentPage === 0) return;
					currentPage--;
				} else if (btnInt.customId === 'download_Cal') {
					if (selectedEvents.length === 0) {
						await dm.send('No events selected to download!');
						return;
					}
					const downloadMessage = await dm.send({ content: 'Downloading selected events...' });
					try {
						await downloadEvents(selectedEvents, calendars);
						const filePath = path.join('./events.ics');
						await downloadMessage.edit({
							content: '',
							files: [filePath]
						});
						fs.unlinkSync('./events.ics');
					} catch {
						await downloadMessage.edit({ content: '⚠️ Failed to download events' });
					}
				} else if (btnInt.customId === 'download_all') {
					if (!filteredEvents.length) {
						await dm.send('No events to download!');
						return;
					}
					const downloadMessage = await dm.send({ content: 'Downloading all events...' });
					try {
						await downloadEvents(filteredEvents.flat(), calendars);
						const filePath = path.join('./events.ics');
						await downloadMessage.edit({
							content: '',
							files: [filePath]
						});
						fs.unlinkSync('./events.ics');
					} catch {
						await downloadMessage.edit({ content: '⚠️ Failed to download all events.' });
					}
				}


				const newComponents: ActionRowBuilder<ButtonBuilder>[] = [];
				newComponents.push(generateButtons(currentPage, maxPage, selectedEvents.length));
				if (embeds[currentPage]) {
					if (embeds[currentPage].data.fields.length) {
						newComponents.push(generateEventSelectButtons(embeds[currentPage].data.fields.length));
					}
				}
				await message.edit({
					embeds: [embeds[currentPage]],
					components: newComponents
				});
			} catch (error) {
				console.error('Button Collector Error:', error);
				await btnInt.followUp({
					content: '⚠️ An error occurred while navigating through events. Please try again.',
					ephemeral: true
				});
			}
		});

		menuCollector.on('collect', async (i: StringSelectMenuInteraction<CacheType>) => {
			await i.deferUpdate();
			const filter = filters.find((fi) => fi.customId === i.customId);
			if (filter) {
				filter.newValues = i.values;
			}
			filteredEvents = await filterEvents(events, filters);
			currentPage = 0;
			selectedEvents = [];
			embeds = generateEmbed(filteredEvents, currentPage, eventsPerPage);
			maxPage = embeds.length;
			const newComponents: ActionRowBuilder<ButtonBuilder>[] = [];
			newComponents.push(generateButtons(currentPage, maxPage, selectedEvents.length));
			if (embeds[currentPage]) {
				if (embeds[currentPage].data.fields.length) {
					newComponents.push(generateEventSelectButtons(embeds[currentPage].data.fields.length));
				}
			}
			message.edit({
				embeds: [embeds[currentPage]],
				components: newComponents
			});
		});
	}

}
