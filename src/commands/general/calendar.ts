/* eslint-disable camelcase */
import {
	ChatInputCommandInteraction,
	ButtonBuilder,
	ActionRowBuilder,
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
import { retrieveEvents } from '@root/src/lib/auth';
import
{ downloadEvents,
	filterCalendarEvents,
	generateCalendarButtons,
	generateCalendarEmbeds,
	generateEventSelectButtons,
	generateCalendarFilterMessage,
	updateCalendarEmbed } from '@root/src/lib/utils/calendarUtils';
import { CalendarEvent, Filter } from '@root/src/lib/types/Calendar';

// Global constants
const MONGO_URI = process.env.DB_CONN_STRING || '';
const DB_NAME = 'CalendarDatabase';
const COLLECTION_NAME = 'calendarIds';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EVENTS_PER_PAGE = 3;

export default class extends Command {

	name = 'calendar';
	description = 'Retrieve calendar events with pagination and filters';

	options: ApplicationCommandStringOptionData[] = [
		{
			type: ApplicationCommandOptionType.String,
			name: 'coursecode',
			description: 'Enter the course code for the class calendar you want (e.g., CISC108).',
			required: true
		}
	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		// Local variables
		let currentPage = 0;
		let downloadPressed = false;
		let selectedEvents: CalendarEvent[] = [];
		const courseCode = interaction.options.getString(this.options[0].name, this.options[0].required);
		const filters: Filter[] = [
			{
				customId: 'location_type_menu',
				placeholder: 'Select Location Type',
				values: ['In Person', 'Virtual'],
				newValues: [],
				flag: true,
				condition: (newValues: string[], event: CalendarEvent) => {
					const valuesToCheck = ['virtual', 'online', 'zoom'];
					const summary = event.calEvent.summary?.toLowerCase() || '';
					const location = event.calEvent.location?.toLowerCase() || '';
					const isVirtual = valuesToCheck.some((value) => summary.includes(value.toLowerCase()) || location.includes(value.toLowerCase()));
					return (isVirtual && newValues.includes('virtual')) || (!isVirtual && newValues.includes('in person'));
				}
			},
			{
				customId: 'week_menu',
				placeholder: 'Select Days of Week',
				values: WEEKDAYS,
				newValues: [],
				flag: true,
				condition: (newValues: string[], event: CalendarEvent) => {
					if (!event.calEvent.start?.dateTime) return false;
					const dt = new Date(event.calEvent.start.dateTime);
					const weekdayIndex = dt.getDay(); // 0 = Sunday, 1 = Monday, etc.
					const dayName = WEEKDAYS[weekdayIndex];
					return newValues.some((value) => value.toLowerCase() === dayName.toLowerCase());
				}
			}
		];

		// ************************************************************************************************* //

		// Initial reply to acknowledge the interaction.
		const initalReply = await interaction.reply({
			content: 'Fetching events. This may take a few moments...',
			ephemeral: true
		});

		// Fetch the calendar from the database that matches with the inputed course code.
		let calendar: {calendarId: string, calendarName: string};
		try {
			const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
			await client.connect();
			const db = client.db(DB_NAME);
			const collection = db.collection(COLLECTION_NAME);
			const calendarInDB = await collection.findOne({ calendarName: courseCode.toUpperCase() });
			await client.close();
			calendar = { calendarId: calendarInDB.calendarId, calendarName: calendarInDB.calendarName };
		} catch (error) {
			await initalReply.edit({
				content: `⚠️ There are no matching calendars with course code **${courseCode}**.`
			});
			return;
		}

		// Retrieve events from selected calendar
		const events: CalendarEvent[] = [];
		const retrivedEvents = await retrieveEvents(calendar.calendarId, interaction);
		if (retrivedEvents === null) {
			return;
		}
		retrivedEvents.forEach((retrivedEvent) => {
			const newEvent: CalendarEvent = { calEvent: retrivedEvent, calendarName: calendar.calendarName, selected: false };
			if (!newEvent.calEvent.location) {
				newEvent.calEvent.location = '`Location not specified for this event`';

				// Checks if the event summary specfies in person or a specific room in smith (either 203 or 102A)
				const validRoomLocations = ['smith hall room 203', 'smith 203', 'room 203', 'smith hall room 102a', 'smith 102a', 'room 102a'];
				const summary = newEvent.calEvent.summary.toLowerCase() || '';
				if (validRoomLocations.some((location) => summary.includes(location) || summary.includes('in person'))) {
					const inRoom203 = ['CISC101', 'CISC103', 'CISC106', 'CISC108', 'CISC181', 'CISC210', 'CISC220', 'CISC260', 'CISC275', 'TEST'];

					// Replaces empty location field with the right location
					if (inRoom203.some((course) => course === courseCode.toUpperCase())) {
						newEvent.calEvent.location = 'Smith Hall Room 203';
					} else {
						newEvent.calEvent.location = 'Smith Hall Room 102A';
					}
				}
			}
			events.push(newEvent);
		});

		// Sort the events by date
		events.sort(
			(a, b) =>
				new Date(a.calEvent.start?.dateTime || a.calEvent.start?.date).getTime() -
				new Date(b.calEvent.start?.dateTime || b.calEvent.start?.date).getTime()
		);

		// Create a filtered events variable to keep the original array intact
		let filteredEvents: CalendarEvent[] = events;

		// Create initial embed
		let embeds = generateCalendarEmbeds(filteredEvents, EVENTS_PER_PAGE);
		let maxPage: number = embeds.length;

		// Create initial componenets
		const initialComponents: ActionRowBuilder<ButtonBuilder>[] = [];
		initialComponents.push(generateCalendarButtons(filteredEvents, selectedEvents, currentPage, maxPage, downloadPressed));

		// Send intital dm
		const dm = await interaction.user.createDM();
		let message: Message<false>;
		try {
			message = await dm.send({
				embeds: [embeds[currentPage].embed],
				components: initialComponents
			});
			initalReply.edit({
				content: `I sent you a DM with the calendar for **${courseCode.toUpperCase()}**`
			});
		} catch (error) {
			console.error('Failed to send DM:', error);
			await interaction.followUp({
				content: "⚠️ I couldn't send you a DM. Please check your privacy settings.",
				ephemeral: true
			});
			return;
		}

		// Create pagified select menus based on the filters
		let content = '**\nSelect Filters**';
		const filterComponents = generateCalendarFilterMessage(filters);

		// Separate single page menus and pagified menus. Send pagified menus in a separate message
		const singlePageMenus: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] = [];
		filterComponents.forEach((component) => {
			if (component.menus.length > 1) {
				component.generateRowsAndSendMenu(async (i) => {
					await i.deferUpdate();
					const filter = filters.find((fi) => fi.customId === i.customId);
					if (filter) {
						filter.newValues = i.values;
					}

					filteredEvents = await filterCalendarEvents(events, filters);
					embeds = generateCalendarEmbeds(filteredEvents, EVENTS_PER_PAGE);

					currentPage = 0;
					selectedEvents = [];
					downloadPressed = false;
					maxPage = embeds.length;

					const newComponents: ActionRowBuilder<ButtonBuilder>[] = [];
					newComponents.push(generateCalendarButtons(filteredEvents, selectedEvents, currentPage, maxPage, downloadPressed));
					if (downloadPressed) {
						const newSelectButtons = generateEventSelectButtons(embeds[currentPage], filteredEvents);
						if (newSelectButtons) {
							newComponents.push(newSelectButtons);
						}
					}

					message.edit({
						embeds: [embeds[currentPage].embed],
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
			console.error('Failed to send Filters:', error);
			await interaction.followUp({
				content: "⚠️ I couldn't send you a DM. Please check your privacy settings.",
				ephemeral: true
			});
			return;
		}

		// Create collectors for button and menu interactions.
		const buttonCollector = message.createMessageComponentCollector({ time: 300000 });
		const menuCollector = filterMessage.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 300000 });

		// Assuming inside your `run` method, after you've sent `message` and `filterMessage` and created collectors:

		buttonCollector.on('collect', async (btnInt: ButtonInteraction<CacheType>) => {
			try {
				await btnInt.deferUpdate();

				// Selection Buttons
				if (btnInt.customId.startsWith('toggle-')) {
					const eventIndex = Number(btnInt.customId.split('-')[1]) - 1;
					const event = filteredEvents[(currentPage * EVENTS_PER_PAGE) + eventIndex];
					event.selected = !event.selected;
					if (selectedEvents.includes(event)) {
						selectedEvents = selectedEvents.filter(e => e !== event);
						const m = await dm.send(`➖ Removed **${event.calEvent.summary}**`);
						setTimeout(() => m.delete().catch(console.error), 3000);
					} else {
						selectedEvents.push(event);
						const m = await dm.send(`➕ Added **${event.calEvent.summary}**`);
						setTimeout(() => m.delete().catch(console.error), 3000);
					}

				// Next and previous buttons
				} else if (btnInt.customId === 'next') {
					if (currentPage + 1 < maxPage) currentPage++;
				} else if (btnInt.customId === 'prev') {
					if (currentPage > 0) currentPage--;

				// Single Download button, context‑aware
				} else if (btnInt.customId === 'download') {
					if (downloadPressed) {
						// Decide whether to download selected events or all of them
						const toDownload = selectedEvents.length > 0
							? selectedEvents
							: filteredEvents;

						if (toDownload.length === 0) {
							await dm.send('⚠️ No events to download!');
							return;
						}

						const prep = await dm.send(`⏳ Preparing ${toDownload.length} event(s)…`);
						try {
						// downloadEvents writes to './events.ics'
							await downloadEvents(toDownload, calendar, interaction);
							await prep.edit({
								content: `📥 Here are your ${toDownload.length} event(s):`,
								files: ['./events.ics']
							});
							fs.unlinkSync('./events.ics');
						} catch (e) {
							console.error('Download failed:', e);
							await prep.edit('⚠️ Failed to generate calendar file.');
						}
						downloadPressed = false;
						selectedEvents.forEach((event) => {
							event.selected = false;
						});
						selectedEvents = [];
						embeds = updateCalendarEmbed(embeds, false);
					} else {
						downloadPressed = true;
						embeds = updateCalendarEmbed(embeds, true);
					}
				}

				// Re‑render embed & buttons for toggles / pagination
				const newComponents: ActionRowBuilder<ButtonBuilder>[] = [];
				newComponents.push(generateCalendarButtons(filteredEvents, selectedEvents, currentPage, maxPage, downloadPressed));
				if (downloadPressed) {
					const newSelectButtons = generateEventSelectButtons(embeds[currentPage], filteredEvents);
					if (newSelectButtons) {
						newComponents.push(newSelectButtons);
					}
				}

				await message.edit({
					embeds: [embeds[currentPage].embed],
					components: newComponents
				});
			} catch (error) {
				console.error('Button Collector Error:', error);
				await btnInt.followUp({
					content: '⚠️ An error occurred navigating events. Please try again.',
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

			filteredEvents = await filterCalendarEvents(events, filters);
			embeds = generateCalendarEmbeds(filteredEvents, EVENTS_PER_PAGE);

			currentPage = 0;
			selectedEvents = [];
			downloadPressed = false;
			maxPage = embeds.length;

			const newComponents: ActionRowBuilder<ButtonBuilder>[] = [];
			newComponents.push(generateCalendarButtons(filteredEvents, selectedEvents, currentPage, maxPage, downloadPressed));
			if (downloadPressed) {
				const newSelectButtons = generateEventSelectButtons(embeds[currentPage], filteredEvents);
				if (newSelectButtons) {
					newComponents.push(newSelectButtons);
				}
			}

			message.edit({
				embeds: [embeds[currentPage].embed],
				components: newComponents
			});
		});
	}

}
