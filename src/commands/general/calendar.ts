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
const path = require("path");
const process = require("process");

const { google } = require("googleapis");

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
	// Shortened description (<100 characters)
	description = "Retrieve calendar events with pagination and filters";

	// Slash command options for eventholder and eventdate
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
			const eventHolder: string = interaction.options
				.getString("eventholder")
				?.toLowerCase();
			const eventDate: string =
				interaction.options.getString("eventdate");

			const newEventDate: string = eventDate
				? new Date(eventDate + " 2025").toLocaleDateString()
				: "";
			const days: string[] = [
				"sunday",
				"monday",
				"tuesday",
				"wednesday",
				"thursday",
				"friday",
				"saturday",
			];

			let temp = [];
			let filteredEvents = [];

			// Flags for each property
			let allFiltersFlags = true;
			let eventHolderFlag: boolean = true;
			let eventDateFlag: boolean = true;
			events.forEach((event) => {
				const lowerCaseSummary: string = event.summary.toLowerCase();

				// Extract class name (works for "CISC108-..." and "CISC374010")
				const classNameMatch = lowerCaseSummary.match(/cisc\d+/i);
				const extractedClassName = classNameMatch
					? classNameMatch[0].toUpperCase()
					: "";

				// Add class name to filters dynamically
				const classFilter = filters.find(
					(f) => f.customId === "class_name_menu"
				);
				if (
					extractedClassName &&
					classFilter &&
					!classFilter.values.includes(extractedClassName)
				) {
					classFilter.values.push(extractedClassName);
				}

				const currentEventDate: Date = new Date(event.start.dateTime);

				if (filters.length) {
					filters.forEach((filter) => {
						filter.flag = true;
						if (filter.newValues.length) {
							filter.flag = filter.condition(
								filter.newValues,
								event
							);
						}
					});
					allFiltersFlags = filters.every((f) => f.flag);
				}

				if (eventHolder) {
					eventHolderFlag = lowerCaseSummary.includes(eventHolder);
				}
				if (eventDate) {
					eventDateFlag =
						currentEventDate.toLocaleDateString() === newEventDate;
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

		// Generates the embed for displaying events
		function generateEmbed(
			filteredEvents,
			currentPage: number,
			maxPage: number
		): EmbedBuilder {
			let embed: EmbedBuilder;
			if (filteredEvents.length && filteredEvents[currentPage] && filteredEvents[currentPage].length) {
				embed = new EmbedBuilder()
					.setTitle(`Events - ${currentPage + 1} of ${maxPage}`)
					.setColor("Green");
				filteredEvents[currentPage].forEach((event) => {
					embed.addFields({
						name: `**${event.summary}**`,
						value: `Date: ${new Date(
							event.start.dateTime
						).toLocaleDateString()}
								Time: ${new Date(event.start.dateTime).toLocaleTimeString()} - ${new Date(
							event.end.dateTime
						).toLocaleTimeString()}
								Location: ${event.location ? event.location : "`NONE`"}
								email:${event.creator.email}\n`,
					});
				});
			} else {
				embed = new EmbedBuilder()
					.setTitle(`No Events`)
					.setColor(`Green`)
					.setTitle("No Events Found")
					.addFields({
						name: "Try adjusting your filters",
						value: "No events match your selections, please change them!",
					});
			}
			return embed;
		}

		// Generates the pagination buttons (Previous, Next, Download Calendar, Done).
		// Accepts an extra parameter "downloadCount" to show the number of selected events.
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
				.setDisabled(downloadCount === 0); // disabled if no events selected

			const done = new ButtonBuilder()
				.setCustomId("done")
				.setLabel("Done")
				.setStyle(ButtonStyle.Danger);

			return new ActionRowBuilder<ButtonBuilder>().addComponents(
				prevButton,
				nextButton,
				downloadCal,
				done
			);
		}

		// Generates filter dropdown menus.
		function generateFilterMessage(filters) {
			const filterMenus = filters.map((filter) => {
				if (filter.values.length === 0) {
					// Either skip building the menu...
					// return null; // (you'd then filter out null below)

					// Or add a placeholder option:
					filter.values.push("No Data Available");
				}
				return new StringSelectMenuBuilder()
					.setCustomId(filter.customId)
					.setMinValues(0)
					.setMaxValues(
						filter.values.length > 0
							? filter.values.length // allow picking as many as exist
							: 1 // fallback to 1 if empty
					)
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
				return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					menu
				);
			});
			return components;
		}

		// Generates a row of toggle buttons – one for each event on the current page.
		function generateEventSelectButtons(filteredEvents, currentPage: number) {
			const row = new ActionRowBuilder<ButtonBuilder>();
			if (!filteredEvents[currentPage] || !filteredEvents[currentPage].length) return row;
			filteredEvents[currentPage].forEach((event, idx) => {
				// Custom ID format: toggle-<currentPage>-<index>
				row.addComponents(
					new ButtonBuilder()
						.setCustomId(`toggle-${currentPage}-${idx}`)
						.setLabel(`Select #${idx + 1}`)
						.setStyle(ButtonStyle.Secondary)
				);
			});
			return row;
		}

		// Downloads only the selected events by generating an ICS file.
		async function downloadSelectedEvents(selectedEvents, calendar, auth) {
			const formattedEvents: string[] = [];
			selectedEvents.forEach((event) => {
				const iCalEvent = {
					UID: `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
					CREATED: new Date(event.created).toISOString().replace(/[-:.]/g, ''),
					DTSTAMP: event.updated.replace(/[-:.]/g, ''),
					DTSTART: `TZID=${event.start.timeZone}:${event.start.dateTime.replace(/[-:.]/g, '')}`,
					DTEND: `TZID=${event.end.timeZone}:${event.end.dateTime.replace(/[-:.]/g, '')}`,
					SUMMARY: event.summary,
					DESCRIPTION: `Contact Email: ${event.creator.email || 'NA'}`,
					LOCATION: event.location ? event.location : 'NONE',
				};

				const icsFormatted =
					`BEGIN:VEVENT
UID:${iCalEvent.UID}
CREATED:${iCalEvent.CREATED}
DTSTAMP:${iCalEvent.DTSTAMP}
DTSTART;${iCalEvent.DTSTART}
DTEND;${iCalEvent.DTEND}
SUMMARY:${iCalEvent.SUMMARY}
DESCRIPTION:${iCalEvent.DESCRIPTION}
LOCATION:${iCalEvent.LOCATION}
STATUS:CONFIRMED
END:VEVENT
`.replace(/\t/g, '');
				formattedEvents.push(icsFormatted);
			});

			const icsCalendar =
				`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//YourBot//Discord Calendar//EN
${formattedEvents.join('')}
END:VCALENDAR
`.replace(/\t/g, '');

			fs.writeFileSync('./events.ics', icsCalendar);
		}

		/**********************************************************************************************************************************************************************************************/
		// Initial Reply to acknowledge the interaction (only once)
		await interaction.reply({
			content: "Authenticating and fetching events...",
			ephemeral: true,
		});
		// Send filter message
		const filters = [
			{
				customId: "calendar_menu",
				placeholder: "Select Calendar",
				values: [], // Filled with calendar names from the DB
				newValues: [],
				flag: true,
				condition: (newValues, event) => {
					// Check the event’s calendarName property
					const calendarName =
						event.calendarName?.toLowerCase() || "";
					// For partial matches: use .includes(...)
					// For exact matches: use (calendarName === value)
					return newValues.some((value) =>
						calendarName.includes(value.toLowerCase())
					);
				},
			},
			{
				customId: "class_name_menu",
				placeholder: "Select Classes",
				values: [], // Dynamically updated
				newValues: [],
				flag: true,
				condition: (newValues, event) => {
					// Check the event.summary property
					const summary = event.summary?.toLowerCase() || "";
					return newValues.some((value) =>
						summary.includes(value.toLowerCase())
					);
				},
			},
			{
				customId: "location_type_menu",
				placeholder: "Select Location Type",
				values: ["In Person", "Virtual"], // Example
				newValues: [],
				flag: true,
				condition: (newValues, event) => {
					// Example: assume "In Person" or "Virtual" might appear in event.location (or event.summary)
					const locString = event.summary.toLowerCase();
					// If you want to treat "In Person" or "Virtual" as a substring match:
					return newValues.some((value) =>
						locString.includes(value.toLowerCase())
					);
				},
			},
			{
				customId: "week_menu",
				placeholder: "Select Days of Week",
				values: [
					"Sunday",
					"Monday",
					"Tuesday",
					"Wednesday",
					"Thursday",
					"Friday",
					"Saturday",
				],
				newValues: [],
				flag: true,
				condition: (newValues, event) => {
					// Convert event.start.dateTime into a weekday
					if (!event.start?.dateTime) return false; // if there's no dateTime at all
					const dt = new Date(event.start.dateTime);
					const weekdayIndex = dt.getDay(); // 0 = Sunday, 1 = Monday, etc.
					const dayName = [
						"Sunday",
						"Monday",
						"Tuesday",
						"Wednesday",
						"Thursday",
						"Friday",
						"Saturday",
					][weekdayIndex];
					console.log(newValues);
					console.log(dayName)
					return newValues.some((value) => value.toLowerCase() === dayName.toLowerCase());
				},
			},
		];

		// Fetch Calendar events
		// Fetch Calendar events from multiple calendars
		// Fetch Calendar events from multiple Google Calendars
		const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
		const TOKEN_PATH = path.join(process.cwd(), "token.json");
		const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
		const auth = await authorize(TOKEN_PATH, SCOPES, CREDENTIALS_PATH);
		const calendar = google.calendar({ version: "v3", auth });

		const MONGO_URI = process.env.DB_CONN_STRING || "";
		const DB_NAME = "CalendarDatabase";
		const COLLECTION_NAME = "calendarIds";

		// Hardcoded Master Google Calendar ID (Always Included)
		const MASTER_CALENDAR_ID =
			"c_dd28a9977da52689612627d786654e9914d35324f7fcfc928a7aab294a4a7ce3@group.calendar.google.com";

		// Function to fetch stored Google Calendar IDs from MongoDB
		/** Fetch Calendar IDs & Names **/
		async function fetchCalendars() {
			const client = new MongoClient(MONGO_URI);
			await client.connect();
			const db = client.db(DB_NAME);
			const collection = db.collection(COLLECTION_NAME);

			const calendarDocs = await collection.find().toArray();
			await client.close();

			// Include master calendar always
			const calendars = calendarDocs.map((doc) => ({
				calendarId: doc.calendarId,
				calendarName: doc.calendarName || "Unnamed Calendar",
			}));

			// Ensure Master Calendar is always included
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

			// Let’s pick out the "calendar_menu" from your filters
			const calendarMenu = filters.find(
				(f) => f.customId === "calendar_menu"
			);
			if (calendarMenu) {
				// Fill the dropdown with the names
				calendarMenu.values = calendars.map((c) => c.calendarName);
			}

			// For all calendarIds, attach the name to each fetched event
			for (const cal of calendars) {
				const response = await calendar.events.list({
					calendarId: cal.calendarId,
					timeMin: new Date().toISOString(),
					timeMax: new Date(
						Date.now() + 10 * 24 * 60 * 60 * 1000
					).toISOString(),
					singleEvents: true,
					orderBy: "startTime",
				});

				if (response.data.items) {
					// Tag each event with its source calendar name
					response.data.items.forEach((event) => {
						event.calendarName = cal.calendarName;
					});
					events.push(...response.data.items);
				}
			}

			// Sort events by start time
			events.sort(
				(a, b) =>
					new Date(a.start?.dateTime || a.start?.date).getTime() -
					new Date(b.start?.dateTime || b.start?.date).getTime()
			);
		} catch (error) {
			console.error("Google Calendar API Error:", error);
			await interaction.followUp({
				content:
					"⚠️ Failed to retrieve calendar events due to an API issue. Please try again later.",
				ephemeral: true,
			});
			return;
		}

		// Continue using the existing filterEvents function
		const eventsPerPage: number = 3;
		let filteredEvents = await filterEvents(events, eventsPerPage, filters);

		if (!filteredEvents.length) {
			await interaction.followUp({
				content:
					"No matching events found based on your filters. Please adjust your search criteria.",
				ephemeral: true,
			});
			return;
		}

		let maxPage: number = filteredEvents.length;
		let currentPage: number = 0;

		// Create state variables to track selected events.
		// Keys are in the format "page-index"; eventMap holds the actual event objects.
		const selectedEventsSet = new Set<string>();
		const eventMap = {};

		// Build the eventMap from filtered events.
		filteredEvents.forEach((pageEvents, pIndex) => {
			pageEvents.forEach((evt, eIndex) => {
				eventMap[`${pIndex}-${eIndex}`] = evt;
			});
		});

		// Generate initial embed, pagination buttons, and event toggle buttons.
		const embed = generateEmbed(filteredEvents, currentPage, maxPage);
		// Pass the selected events count so Download button is initially disabled if count is 0.
		const buttonRow = generateButtons(currentPage, maxPage, filteredEvents, selectedEventsSet.size);
		const toggleRow = generateEventSelectButtons(filteredEvents, currentPage);

		// Send main DM message with embed and two rows: toggle buttons and pagination buttons.
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
				content:
					"⚠️ I couldn't send you a DM. Please check your privacy settings.",
				ephemeral: true,
			});
			return;
		}
		const filterComponents = generateFilterMessage(filters);

		// Send filter message to prompt the user.
		let filterMessage;
		try {
			filterMessage = await dm.send({
				content: "**Select Filters:**",
				components: filterComponents,
			});
		} catch (error) {
			console.error("Failed to send DM:", error);
			await interaction.followUp({
				content:
					"⚠️ I couldn't send you a DM. Please check your privacy settings.",
				ephemeral: true,
			});
			return;
		}
		// Refresh filter dropdown so newly detected classes appear
		await filterMessage.edit({
			content: "**Select Filters:**",
			components: filterComponents,
		});

		// Create a button collector for the main message (for toggling, pagination, download, done).
		const buttonCollector = message.createMessageComponentCollector({
			time: 300000,
		});

		// Create a collector for the filter dropdown menus.
		const menuCollector = filterMessage.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			time: 300000,
		});

		// Handle button interactions (toggle selection, pagination, download, done)
		buttonCollector.on("collect", async (btnInt) => {
			try {
				await btnInt.deferUpdate();
				// Handle toggle button clicks.
				if (btnInt.customId.startsWith("toggle-")) {
					// Custom ID format: toggle-<page>-<index>
					const parts = btnInt.customId.split("-");
					const key = `${parts[1]}-${parts[2]}`;
					const event = eventMap[key];
					if (selectedEventsSet.has(key)) {
						selectedEventsSet.delete(key);
						// Send a temporary message indicating removal.
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
					// When Download is pressed, include only selected events.
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

				// Update the embed and both rows (toggle and pagination) after any interaction.
				const newEmbed = generateEmbed(filteredEvents, currentPage, maxPage);
				const newButtonRow = generateButtons(currentPage, maxPage, filteredEvents, selectedEventsSet.size);
				const newToggleRow = generateEventSelectButtons(filteredEvents, currentPage);
				await message.edit({
					embeds: [newEmbed],
					components: [newToggleRow, newButtonRow],
				});
			} catch (error) {
				console.error("Button Collector Error:", error);
				// Always use followUp to avoid re-acknowledging an interaction.
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
			// Re-filter events using the updated filter selections.
			filteredEvents = await filterEvents(events, eventsPerPage, filters);
			currentPage = 0;
			maxPage = filteredEvents.length;
			// Clear previous selections and rebuild the eventMap.
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
				components: [newButtonRow],
			});
		});
	}
}
