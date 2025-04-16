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
	Message,
	InteractionResponse
} from 'discord.js';
import { Command } from '@lib/types/Command';
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import { CALENDAR_CONFIG } from '@lib/CalendarConfig';
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
import { PagifiedSelectMenu } from '@root/src/lib/types/PagifiedSelect';

// Define global constants
const MASTER_CALENDAR_ID = CALENDAR_CONFIG.MASTER_ID;
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
			name: 'classname',
			description: 'Enter the event holder (e.g., class name).',
			required: false
		}
	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		// Define local variables
		let currentPage = 0;
		let selectedEvents: Event[] = [];
		const filters: Filter[] = [
			{
				customId: 'calendar_menu',
				placeholder: 'Select Course',
				values: [],
				newValues: [],
				flag: true,
				condition: (newValues: string[], event: Event) => {
					const calendarName = event.calendarName.toLowerCase() || '';
					return newValues.some((value) => calendarName === value.toLowerCase());
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

		// ************************************************************************************************* \\

		// Initial reply to acknowledge the interaction.
		await interaction.reply({
			content: 'Authenticating and fetching events...',
			ephemeral: true
		});

		// Fetch calendar IDs from MongoDB.
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

		// Add all calendar menu names to calendar menu filter
		const events: Event[] = [];
		const calendarFilter = filters.find((filter) => filter.customId === 'calendar_menu');
		if (calendarFilter) {
			calendarFilter.values = calendars.map((c) => c.calendarName);
		}

		// Retrieve events from every calendar in the database
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

		// Sort the events by date
		events.sort(
			(a, b) =>
				new Date(a.calEvent.start?.dateTime || a.calEvent.start?.date).getTime() -
				new Date(b.calEvent.start?.dateTime || b.calEvent.start?.date).getTime()
		);

		// Send inital dm to ask user to select calendar events to display
		const dm = await interaction.user.createDM();
		let message: Message<boolean> | InteractionResponse<boolean>;
		let filterMessage: Message<false>;
		const calendarSelectMenu = new PagifiedSelectMenu();
		calendarSelectMenu.createSelectMenu(
			{
				customId: `${calendarFilter.customId}0`,
				placeHolder: calendarFilter.placeholder,
				minimumValues: 0
			}
		);
		calendarFilter.values.forEach((calendar) => {
			calendarSelectMenu.addOption({ label: calendar, value: calendar });
		});
		try {
			message = await calendarSelectMenu.generateRowsAndSendMenu(async (menuI) => {
				await menuI.deferUpdate();
				if (menuI.customId === 'calendar_menu0') {
					// Add selected calendar into the new values array of the calendar filter
					calendarFilter.newValues = menuI.values;

					// Filter inital events
					let filteredEvents: Event[] = await filterCalendarEvents(events, filters);
					if (!filteredEvents.length) {
						await interaction.followUp({
							content: 'No matching events found based on your filters. Please adjust your search criteria.',
							ephemeral: true
						});
						return;
					}

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

					// Edit dm with first embed in the embeds array and the initial componenets
					message.edit({
						embeds: [embeds[currentPage]],
						components: initialComponents
					});

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
					filterMessage = await dm.send({
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
									await downloadEvents(selectedEvents, calendars, interaction);
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
									await downloadEvents(filteredEvents.flat(), calendars, interaction);
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
			}, interaction, dm, '**Select Course**');
		} catch (error) {
			console.error('Failed to send DM:', error);
			await interaction.followUp({
				content: "⚠️ I couldn't send you a DM. Please check your privacy settings.",
				ephemeral: true
			});
			return;
		}
	}

}
