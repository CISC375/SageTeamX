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
import path from 'path';
import
{ downloadEvents,
	Filter,
	filterCalendarEvents,
	generateCalendarButtons,
	generateCalendarEmbeds,
	generateEventSelectButtons,
	generateCalendarFilterMessage,
	Event } from '@root/src/lib/utils/calendarUtils';

// Define global constants
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
			description: 'Enter the course code for the class calendar you want (e.g., cisc108).',
			required: true
		}
	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		// Define local variables
		let currentPage = 0;
		let selectedEvents: Event[] = [];
		const courseCode = interaction.options.getString(this.options[0].name, this.options[0].required);
		const filters: Filter[] = [
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
				values: WEEKDAYS,
				newValues: [],
				flag: true,
				condition: (newValues: string[], event: Event) => {
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
		await interaction.reply({
			content: 'Authenticating and fetching events...',
			ephemeral: true
		});

		// Fetch the calendar from the database that matches with the inputed course code.
		let calendar: {calendarId: string, calendarName: string};
		try {
			const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
			await client.connect();
			const db = client.db(DB_NAME);
			const collection = db.collection(COLLECTION_NAME);
			const calendarInDB = await collection.findOne({ calendarName: courseCode });
			await client.close();
			calendar = { calendarId: calendarInDB.calendarId, calendarName: calendarInDB.calendarName };
		} catch (error) {
			await interaction.followUp({
				content: `There are no matching calendars with course code **${courseCode}**.`,
				ephemeral: true
			});
			return;
		}

		// Retrieve events from every calendar in the database
		const events: Event[] = [];
		const retrivedEvents = await retrieveEvents(calendar.calendarId, interaction);
		if (retrivedEvents === null) {
			return;
		}
		retrivedEvents.forEach((retrivedEvent) => {
			const newEvent: Event = { calEvent: retrivedEvent, calendarName: calendar.calendarName };
			events.push(newEvent);
		});

		// Sort the events by date
		events.sort(
			(a, b) =>
				new Date(a.calEvent.start?.dateTime || a.calEvent.start?.date).getTime() -
				new Date(b.calEvent.start?.dateTime || b.calEvent.start?.date).getTime()
		);

		// Create a filtered events variable to keep the original array intact
		let filteredEvents: Event[] = events;

		// Create initial embed
		let embeds = generateCalendarEmbeds(filteredEvents, EVENTS_PER_PAGE);
		let maxPage: number = embeds.length;

		// Create initial componenets
		const initialComponents: ActionRowBuilder<ButtonBuilder>[] = [];
		const selectButtons = generateEventSelectButtons(embeds[currentPage], filteredEvents);
		initialComponents.push(generateCalendarButtons(currentPage, maxPage, selectedEvents.length));
		if (selectButtons) {
			initialComponents.push(selectButtons);
		}

		// Send intital dm
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

		// Create pagified select menus based on the filters
		let content = '**Select Filters**';
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
					maxPage = embeds.length;

					const newComponents: ActionRowBuilder<ButtonBuilder>[] = [];
					const newSelectButtons = generateEventSelectButtons(embeds[currentPage], filteredEvents);
					newComponents.push(generateCalendarButtons(currentPage, maxPage, selectedEvents.length));
					if (newSelectButtons) {
						newComponents.push(newSelectButtons);
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

		buttonCollector.on('collect', async (btnInt: ButtonInteraction<CacheType>) => {
			try {
				await btnInt.deferUpdate();
				if (btnInt.customId.startsWith('toggle-')) {
					const eventIndex = Number(btnInt.customId.split('-')[1]) - 1;
					const event = filteredEvents[(currentPage * EVENTS_PER_PAGE) + eventIndex];
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
						await downloadEvents(selectedEvents, calendar, interaction);
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
						await downloadEvents(filteredEvents.flat(), calendar, interaction);
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
				const newSelectButtons = generateEventSelectButtons(embeds[currentPage], filteredEvents);
				newComponents.push(generateCalendarButtons(currentPage, maxPage, selectedEvents.length));
				if (newSelectButtons) {
					newComponents.push(newSelectButtons);
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

			filteredEvents = await filterCalendarEvents(events, filters);
			embeds = generateCalendarEmbeds(filteredEvents, EVENTS_PER_PAGE);

			currentPage = 0;
			selectedEvents = [];
			maxPage = embeds.length;

			const newComponents: ActionRowBuilder<ButtonBuilder>[] = [];
			const newSelectButtons = generateEventSelectButtons(embeds[currentPage], filteredEvents);
			newComponents.push(generateCalendarButtons(currentPage, maxPage, selectedEvents.length));
			if (newSelectButtons) {
				newComponents.push(newSelectButtons);
			}

			message.edit({
				embeds: [embeds[currentPage]],
				components: newComponents
			});
		});
	}

}
