/* eslint-disable */
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
	StringSelectMenuOptionBuilder,
} from 'discord.js';
import { Command } from '@lib/types/Command';
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { authorize } from '../../lib/auth';
import * as fs from 'fs';
import { CALENDAR_CONFIG } from './calendarConfig';
const path = require("path");
const process = require("process");

const { google } = require("googleapis");

// Define the Master Calendar ID constant.
const MASTER_CALENDAR_ID = CALENDAR_CONFIG.MASTER_ID;

interface Event {
	eventId: string;
	courseID: string;
	instructor: string;
	date: string;
	start: string;
	end: string;
	location: string;
	locationType: string;
	email: string;
}

export default class extends Command {
	name = "calendar";
	description = "Retrieve calendar events with pagination and filters";

	options: ApplicationCommandStringOptionData[] = [
		{
			type: ApplicationCommandOptionType.String,
			name: "eventholder",
			description: "Enter the event holder (e.g., class name).",
			required: false,
		},
		{
			type: ApplicationCommandOptionType.String,
			name: "eventdate",
			description: 'Enter the date (e.g., "December 12").',
			required: false,
		},
	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		/** Helper Functions **/

		// Filters calendar events based on slash command inputs and filter dropdown selections.
		async function filterEvents(events, eventsPerPage: number, filters) {
			const eventHolder: string = interaction.options.getString("eventholder")?.toLowerCase();
			const eventDate: string = interaction.options.getString("eventdate");

			const newEventDate: string = eventDate ? new Date(eventDate + " 2025").toLocaleDateString() : "";
			let temp = [];
			let filteredEvents = [];

			let allFiltersFlags = true;
			let eventHolderFlag: boolean = true;
			let eventDateFlag: boolean = true;
			events.forEach((event) => {
				const lowerCaseSummary: string = event.summary.toLowerCase();

				// Extract class name (works for "CISC108-..." and "CISC374010")
				const classNameMatch = lowerCaseSummary.match(/cisc\d+/i);
				const extractedClassName = classNameMatch ? classNameMatch[0].toUpperCase() : "";

				// Dynamically update filter options.
				const classFilter = filters.find((f) => f.customId === "class_name_menu");
				if (extractedClassName && classFilter && !classFilter.values.includes(extractedClassName)) {
					classFilter.values.push(extractedClassName);
				}

				const currentEventDate: Date = new Date(event.start.dateTime);

				if (filters.length) {
					filters.forEach((filter) => {
						filter.flag = true;
						if (filter.newValues.length) {
							filter.flag = filter.condition(filter.newValues, event);
						}
					});
					allFiltersFlags = filters.every((f) => f.flag);
				}

				if (eventHolder) {
					eventHolderFlag = lowerCaseSummary.includes(eventHolder);
				}
				if (eventDate) {
					eventDateFlag = currentEventDate.toLocaleDateString() === newEventDate;
				}

				if (allFiltersFlags && eventHolderFlag && eventDateFlag) {
					temp.push(event);
					if (temp.length % eventsPerPage === 0) {
						filteredEvents.push(temp);
						temp = [];
					}
				}
			});
			if (temp.length) filteredEvents.push(temp);
			return filteredEvents;
		}

		// Generates the embed for displaying events.
		function generateEmbed(filteredEvents, currentPage: number, maxPage: number): EmbedBuilder {
			let embed: EmbedBuilder;
			if (
				filteredEvents.length &&
				filteredEvents[currentPage] &&
				filteredEvents[currentPage].length
			) {
				embed = new EmbedBuilder()
					.setTitle(`Events - ${currentPage + 1} of ${maxPage}`)
					.setColor("Green");
				filteredEvents[currentPage].forEach((event) => {
					embed.addFields({
						name: `**${event.summary}**`,
						value: `Date: ${new Date(event.start.dateTime).toLocaleDateString()}
Time: ${new Date(event.start.dateTime).toLocaleTimeString()} - ${new Date(event.end.dateTime).toLocaleTimeString()}
Location: ${event.location ? event.location : "`NONE`"}
Email: ${event.creator.email}\n`,
					});
				});
			} else {
				embed = new EmbedBuilder()
					.setTitle("No Events Found")
					.setColor("Green")
					.addFields({
						name: "Try adjusting your filters",
						value: "No events match your selections, please change them!",
					});
			}
			return embed;
		}

		// Generates the pagination buttons (Previous, Next, Download Calendar, Download All, Done).
		function generateButtons(currentPage: number, maxPage: number, filteredEvents, downloadCount: number): ActionRowBuilder<ButtonBuilder> {
			const nextButton = new ButtonBuilder()
				.setCustomId("next")
				.setLabel("Next")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(currentPage + 1 >= maxPage);

			const prevButton = new ButtonBuilder()
				.setCustomId("prev")
				.setLabel("Previous")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(currentPage === 0);

			const downloadCal = new ButtonBuilder()
				.setCustomId("download_Cal")
				.setLabel(`Download Calendar (${downloadCount})`)
				.setStyle(ButtonStyle.Success)
				.setDisabled(downloadCount === 0);

			const downloadAll = new ButtonBuilder()
				.setCustomId("download_all")
				.setLabel("Download All")
				.setStyle(ButtonStyle.Secondary);

			const done = new ButtonBuilder()
				.setCustomId("done")
				.setLabel("Done")
				.setStyle(ButtonStyle.Danger);

			return new ActionRowBuilder<ButtonBuilder>().addComponents(
				prevButton,
				nextButton,
				downloadCal,
				downloadAll,
				done
			);
		}

		// Generates filter dropdown menus.
		function generateFilterMessage(filters) {
			const filterMenus = filters.map((filter) => {
				if (filter.values.length === 0) {
					filter.values.push("No Data Available");
				}
				return new StringSelectMenuBuilder()
					.setCustomId(filter.customId)
					.setMinValues(0)
					.setMaxValues(filter.values.length > 0 ? filter.values.length : 1)
					.setPlaceholder(filter.placeholder)
					.addOptions(
						filter.values.map((value) => {
							return new StringSelectMenuOptionBuilder()
								.setLabel(value)
								.setValue(value.toLowerCase());
						})
					);
			});
			const components = filterMenus.map((menu) => {
				return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
			});
			return components;
		}

		// Generates a row of toggle buttons – one for each event on the current page.
		function generateEventSelectButtons(filteredEvents, currentPage: number) {
			const row = new ActionRowBuilder<ButtonBuilder>();
			if (!filteredEvents[currentPage] || !filteredEvents[currentPage].length)
				return row;
			filteredEvents[currentPage].forEach((event, idx) => {
				row.addComponents(
					new ButtonBuilder()
						.setCustomId(`toggle-${currentPage}-${idx}`)
						.setLabel(`Select #${idx + 1}`)
						.setStyle(ButtonStyle.Secondary)
				);
			});
			return row;
		}

		// Downloads events by generating an ICS file.
		// This version includes recurrence rules (if the event has them).
		async function downloadSelectedEvents(selectedEvents, calendar, auth) {
			const formattedEvents: string[] = [];
			selectedEvents.forEach((event) => {
				// Join recurrence rules (if any) into a string.
				const recurrenceString = event.recurrence ? event.recurrence.join("\n") : "";
				const iCalEvent = {
					UID: `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
					CREATED: new Date(event.created)
						.toISOString()
						.replace(/[-:.]/g, ''),
					DTSTAMP: event.updated.replace(/[-:.]/g, ''),
					DTSTART: `TZID=${event.start.timeZone}:${event.start.dateTime.replace(/[-:.]/g, '')}`,
					DTEND: `TZID=${event.end.timeZone}:${event.end.dateTime.replace(/[-:.]/g, '')}`,
					SUMMARY: event.summary,
					DESCRIPTION: `Contact Email: ${event.creator.email || 'NA'}`,
					LOCATION: event.location ? event.location : 'NONE',
				};

				const icsFormatted = `BEGIN:VEVENT
UID:${iCalEvent.UID}
CREATED:${iCalEvent.CREATED}
DTSTAMP:${iCalEvent.DTSTAMP}
DTSTART;${iCalEvent.DTSTART}
DTEND;${iCalEvent.DTEND}
SUMMARY:${iCalEvent.SUMMARY}
DESCRIPTION:${iCalEvent.DESCRIPTION}
LOCATION:${iCalEvent.LOCATION}
${recurrenceString ? recurrenceString + "\n" : ""}STATUS:CONFIRMED
END:VEVENT
`.replace(/\t/g, '');
				formattedEvents.push(icsFormatted);
			});

			const icsCalendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//YourBot//Discord Calendar//EN
${formattedEvents.join('')}
END:VCALENDAR
`.replace(/\t/g, '');

			fs.writeFileSync('./events.ics', icsCalendar);
		}

		/******************************************************************************************************************/
		// Initial reply to acknowledge the interaction.
		await interaction.reply({
			content: "Authenticating and fetching events...",
			ephemeral: true,
		});

		// Define filters for dropdowns.
		const filters = [
			{
				customId: "calendar_menu",
				placeholder: "Select Calendar",
				values: [],
				newValues: [],
				flag: true,
				condition: (newValues, event) => {
					const calendarName = event.calendarName?.toLowerCase() || "";
					return newValues.some((value) => calendarName.includes(value.toLowerCase()));
				},
			},
			{
				customId: "class_name_menu",
				placeholder: "Select Classes",
				values: [],
				newValues: [],
				flag: true,
				condition: (newValues, event) => {
					const summary = event.summary?.toLowerCase() || "";
					return newValues.some((value) => summary.includes(value.toLowerCase()));
				},
			},
			{
				customId: "location_type_menu",
				placeholder: "Select Location Type",
				values: ["In Person", "Virtual"],
				newValues: [],
				flag: true,
				condition: (newValues, event) => {
					const locString = event.summary.toLowerCase();
					return newValues.some((value) => locString.includes(value.toLowerCase()));
				},
			},
			{
				customId: "week_menu",
				placeholder: "Select Days of Week",
				values: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
				newValues: [],
				flag: true,
				condition: (newValues, event) => {
					if (!event.start?.dateTime) return false;
					const dt = new Date(event.start.dateTime);
					const weekdayIndex = dt.getDay();
					const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekdayIndex];
					return newValues.some((value) => value.toLowerCase() === dayName.toLowerCase());
				},
			},
		];

		// Set up Google Calendar API authorization.
		const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
		const TOKEN_PATH = path.join(process.cwd(), "token.json");
		const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
		const auth = await authorize(TOKEN_PATH, SCOPES, CREDENTIALS_PATH);
		const calendar = google.calendar({ version: "v3", auth });

		const MONGO_URI = process.env.DB_CONN_STRING || "";
		const DB_NAME = "CalendarDatabase";
		const COLLECTION_NAME = "calendarIds";

		// Fetch calendar IDs from MongoDB.
		async function fetchCalendars() {
			const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
			await client.connect();
			const db = client.db(DB_NAME);
			const collection = db.collection(COLLECTION_NAME);

			const calendarDocs = await collection.find().toArray();
			await client.close();

			const calendars = calendarDocs.map((doc) => ({
				calendarId: doc.calendarId,
				calendarName: doc.calendarName || "Unnamed Calendar",
			}));

			if (!calendars.some((c) => c.calendarId === MASTER_CALENDAR_ID)) {
				calendars.push({
					calendarId: MASTER_CALENDAR_ID,
					calendarName: "Master Calendar",
				});
			}

			return calendars;
		}

		let events = [];
		try {
			const calendars = await fetchCalendars();
			const calendarMenu = filters.find((f) => f.customId === "calendar_menu");
			if (calendarMenu) {
				calendarMenu.values = calendars.map((c) => c.calendarName);
			}

			// IMPORTANT: Set singleEvents to false so that master events (with recurrence) are returned.
			for (const cal of calendars) {
				const response = await calendar.events.list({
					calendarId: cal.calendarId,
					timeMin: new Date().toISOString(),
					timeMax: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
					singleEvents: false,
					// Removed orderBy parameter since it's not allowed with singleEvents: false.
				});

				if (response.data.items) {
					response.data.items.forEach((event) => {
						event.calendarName = cal.calendarName;
					});
					events.push(...response.data.items);
				}
			}

			// Sort events by their start time.
			events.sort(
				(a, b) =>
					new Date(a.start?.dateTime || a.start?.date).getTime() -
					new Date(b.start?.dateTime || b.start?.date).getTime()
			);
		} catch (error) {
			console.error("Google Calendar API Error:", error);
			await interaction.followUp({
				content: "⚠️ Failed to retrieve calendar events due to an API issue. Please try again later.",
				ephemeral: true,
			});
			return;
		}

		const eventsPerPage: number = 3;
		let filteredEvents = await filterEvents(events, eventsPerPage, filters);
		if (!filteredEvents.length) {
			await interaction.followUp({
				content: "No matching events found based on your filters. Please adjust your search criteria.",
				ephemeral: true,
			});
			return;
		}

		let maxPage: number = filteredEvents.length;
		let currentPage: number = 0;
		const selectedEventsSet = new Set<string>();
		const eventMap = {};
		filteredEvents.forEach((pageEvents, pIndex) => {
			pageEvents.forEach((evt, eIndex) => {
				eventMap[`${pIndex}-${eIndex}`] = evt;
			});
		});

		const embed = generateEmbed(filteredEvents, currentPage, maxPage);
		const buttonRow = generateButtons(currentPage, maxPage, filteredEvents, selectedEventsSet.size);
		const toggleRow = generateEventSelectButtons(filteredEvents, currentPage);

		const dm = await interaction.user.createDM();
		let message;
		try {
			message = await dm.send({
				embeds: [embed],
				components: [toggleRow, buttonRow],
			});
		} catch (error) {
			console.error("Failed to send DM:", error);
			await interaction.followUp({
				content: "⚠️ I couldn't send you a DM. Please check your privacy settings.",
				ephemeral: true,
			});
			return;
		}

		const filterComponents = generateFilterMessage(filters);
		let filterMessage;
		try {
			filterMessage = await dm.send({
				content: "**Select Filters:**",
				components: filterComponents,
			});
		} catch (error) {
			console.error("Failed to send DM:", error);
			await interaction.followUp({
				content: "⚠️ I couldn't send you a DM. Please check your privacy settings.",
				ephemeral: true,
			});
			return;
		}
		await filterMessage.edit({
			content: "**Select Filters:**",
			components: filterComponents,
		});

		// Create collectors for button and menu interactions.
		const buttonCollector = message.createMessageComponentCollector({ time: 300000 });
		const menuCollector = filterMessage.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 300000 });

		buttonCollector.on("collect", async (btnInt) => {
			try {
				await btnInt.deferUpdate();
				if (btnInt.customId.startsWith("toggle-")) {
					const parts = btnInt.customId.split("-");
					const key = `${parts[1]}-${parts[2]}`;
					const event = eventMap[key];
					if (selectedEventsSet.has(key)) {
						selectedEventsSet.delete(key);
						try {
							const removeMsg = await dm.send(`Removed ${event.summary}`);
							setTimeout(async () => {
								try {
									await removeMsg.delete();
								} catch (err) {
									console.error("Failed to delete removal message:", err);
								}
							}, 3000);
						} catch (err) {
							console.error("Error sending removal message:", err);
						}
					} else {
						selectedEventsSet.add(key);
						try {
							const addMsg = await dm.send(`Added ${event.summary}`);
							setTimeout(async () => {
								try {
									await addMsg.delete();
								} catch (err) {
									console.error("Failed to delete addition message:", err);
								}
							}, 3000);
						} catch (err) {
							console.error("Error sending addition message:", err);
						}
					}
				} else if (btnInt.customId === "next") {
					if (currentPage + 1 >= maxPage) return;
					currentPage++;
				} else if (btnInt.customId === "prev") {
					if (currentPage === 0) return;
					currentPage--;
				} else if (btnInt.customId === 'download_Cal') {
					if (selectedEventsSet.size === 0) {
						await dm.send("No events selected to download!");
						return;
					}
					const selectedEvents = [];
					selectedEventsSet.forEach((key) => {
						if (eventMap[key]) selectedEvents.push(eventMap[key]);
					});
					const downloadMessage = await dm.send({ content: 'Downloading selected events...' });
					try {
						await downloadSelectedEvents(selectedEvents, calendar, auth);
						const filePath = path.join('./events.ics');
						await downloadMessage.edit({
							content: '',
							files: [filePath]
						});
						fs.unlinkSync('./events.ics');
					} catch {
						await downloadMessage.edit({ content: '⚠️ Failed to download events' });
					}
				} else if (btnInt.customId === "download_all") {
					const allFilteredEvents = filteredEvents.flat();
					if (!allFilteredEvents.length) {
						await dm.send("No events to download!");
						return;
					}
					const downloadMessage = await dm.send({ content: "Downloading all events..." });
					try {
						await downloadSelectedEvents(allFilteredEvents, calendar, auth);
						const filePath = path.join('./events.ics');
						await downloadMessage.edit({
							content: '',
							files: [filePath]
						});
						fs.unlinkSync('./events.ics');
					} catch {
						await downloadMessage.edit({ content: "⚠️ Failed to download all events." });
					}
				} else if (btnInt.customId === "done") {
					await message.edit({
						embeds: [],
						components: [],
						content: "📅 Calendar session closed.",
					});
					await filterMessage.edit({
						embeds: [],
						components: [],
						content: "Filters closed.",
					});
					buttonCollector.stop();
					menuCollector.stop();
					return;
				}

				const newEmbed = generateEmbed(filteredEvents, currentPage, maxPage);
				const newButtonRow = generateButtons(currentPage, maxPage, filteredEvents, selectedEventsSet.size);
				const newToggleRow = generateEventSelectButtons(filteredEvents, currentPage);
				await message.edit({
					embeds: [newEmbed],
					components: [newToggleRow, newButtonRow],
				});
			} catch (error) {
				console.error("Button Collector Error:", error);
				await btnInt.followUp({
					content: "⚠️ An error occurred while navigating through events. Please try again.",
					ephemeral: true,
				});
			}
		});

		menuCollector.on("collect", async (i) => {
			i.deferUpdate();
			const filter = filters.find((f) => f.customId === i.customId);
			if (filter) {
				filter.newValues = i.values;
			}
			filteredEvents = await filterEvents(events, eventsPerPage, filters);
			currentPage = 0;
			maxPage = filteredEvents.length;
			selectedEventsSet.clear();
			filteredEvents.forEach((pageEvents, pIndex) => {
				pageEvents.forEach((evt, eIndex) => {
					eventMap[`${pIndex}-${eIndex}`] = evt;
				});
			});
			const newEmbed = generateEmbed(filteredEvents, currentPage, maxPage);
			const newButtonRow = generateButtons(currentPage, maxPage, filteredEvents, selectedEventsSet.size);
			const newToggleRow = generateEventSelectButtons(filteredEvents, currentPage);
			message.edit({
				embeds: [newEmbed],
				components: [newToggleRow, newButtonRow],
			});
		});
	}
}
