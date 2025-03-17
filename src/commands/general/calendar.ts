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
} from "discord.js";
import { Command } from "@lib/types/Command";
import "dotenv/config";
import { MongoClient } from "mongodb";
import { authorize } from "../../lib/auth";

//import event from '@root/src/models/calEvent';

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
}
export default class extends Command {
	name = "calendar";
	description =
		"Retrieve calendar events over the next 10 days with pagination, optionally filter";

	// All available filters that someone can add and they are not required
	options: ApplicationCommandStringOptionData[] = [
		{
			type: ApplicationCommandOptionType.String,
			name: "eventholder",
			description:
				"Enter the name of the event holder you are looking for.",
			required: false,
		},
		{
			type: ApplicationCommandOptionType.String,
			name: "eventdate",
			description:
				'Enter the name of the date you are looking for with: [month name] [day] (eg., "december 12").',
			required: false,
		},
	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		/** Helper Functions **/

		// Filters calendar events based on various parameters
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
								lowerCaseSummary,
								days,
								currentEventDate
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

			temp.length ? filteredEvents.push(temp) : 0;
			return filteredEvents;
		}

		// Generates the embed for displaying events
		function generateEmbed(
			filteredEvents,
			currentPage: number,
			maxPage: number
		): EmbedBuilder {
			let embed: EmbedBuilder;
			if (filteredEvents.length) {
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
								Location: ${event.location ? event.location : "`NONE`"}\n`,
					});
				});
			} else {
				embed = new EmbedBuilder()
					.setTitle(`No Events`)
					.setColor(`Green`)
					.addFields({
						name: `No events for the selected filters`,
						value: `Please select different filters`,
					});
			}
			return embed;
		}

		// Generates the buttons for changing pages
		function generateButtons(
			currentPage: number,
			maxPage: number
		): ActionRowBuilder<ButtonBuilder> {
			const nextButton = new ButtonBuilder()
				.setCustomId("next")
				.setLabel("Next")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(currentPage + 1 === maxPage);

			const prevButton = new ButtonBuilder()
				.setCustomId("prev")
				.setLabel("Previous")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(currentPage === 0);

			const done = new ButtonBuilder()
				.setCustomId("done")
				.setLabel("Done")
				.setStyle(ButtonStyle.Danger);

			return new ActionRowBuilder<ButtonBuilder>().addComponents(
				prevButton,
				nextButton,
				done
			);
		}

		// Generates message for filters
		function generateFilterMessage(filters) {
			const filterMenus = filters.map((filter) => {
				return new StringSelectMenuBuilder()
					.setCustomId(filter.customId)
					.setMinValues(0)
					.setMaxValues(filter.values.length)
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

		/**********************************************************************************************************************************************************************************************/

		// Inital Reply
		await interaction.reply({
			content: "Authenticating and fetching events...",
			ephemeral: true,
		});
		// Send filter message
		const filters = [
			{
				customId: "class_name_menu",
				placeholder: "Select Classes",
				values: [],
				newValues: [],
				flag: true,
				condition: (
					newValues: string[],
					summary?: string,
					days?: string[],
					eventDate?: Date
				) => newValues.some((value) => summary.includes(value)),
			},
			{
				customId: "location_type_menu",
				placeholder: "Select Location Type",
				values: ["In Person", "Virtual"],
				newValues: [],
				flag: true,
				condition: (
					newValues: string[],
					summary?: string,
					days?: string[],
					eventDate?: Date
				) => newValues.some((value) => summary.includes(value)),
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
				condition: (
					newValues: string[],
					summary?: string,
					days?: string[],
					eventDate?: Date
				) =>
					newValues.some(
						(value) => days[eventDate.getDay()] === value
					),
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
		async function fetchCalendarIds() {
			const client = new MongoClient(MONGO_URI);
			await client.connect();
			const db = client.db(DB_NAME);
			const collection = db.collection(COLLECTION_NAME);

			const calendarDocs = await collection.find().toArray();
			await client.close();

			// Extract IDs from database & ensure master ID is always included
			const calendarIds = calendarDocs.map((doc) => doc.calendarId);
			if (!calendarIds.includes(MASTER_CALENDAR_ID)) {
				calendarIds.push(MASTER_CALENDAR_ID);
			}
			return calendarIds;
		}

		let events = [];

		try {
			// Fetch calendar IDs dynamically + include the master ID
			const calendarIds = await fetchCalendarIds();

			// Fetch events from each calendar
			for (const calendarId of calendarIds) {
				const response = await calendar.events.list({
					calendarId: calendarId,
					timeMin: new Date().toISOString(),
					timeMax: new Date(
						new Date().getTime() + 10 * 24 * 60 * 60 * 1000
					).toISOString(),
					singleEvents: true,
					orderBy: "startTime",
				});

				// Add events from this calendar to the combined events list
				if (response.data.items) {
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

		// Generate intial embed and buttons
		let maxPage: number = filteredEvents.length;
		let currentPage: number = 0;
		const embed = generateEmbed(filteredEvents, currentPage, maxPage);
		const buttonRow = generateButtons(currentPage, maxPage);

		// Send main message
		const dm = await interaction.user.createDM();
		let message;
		try {
			message = await dm.send({
				embeds: [embed],
				components: [buttonRow],
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

		// Send filter message
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

		// Create button collector for main message
		const buttonCollector = message.createMessageComponentCollector({
			time: 300000,
		});

		// Create dropdown collector for filters
		const menuCollector = filterMessage.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			time: 300000,
		});

		buttonCollector.on("collect", async (btnInt) => {
			try {
				await btnInt.deferUpdate();
				if (btnInt.customId === "next") {
					if (currentPage + 1 >= maxPage) return;
					currentPage++;
				} else if (btnInt.customId === "prev") {
					if (currentPage === 0) return;
					currentPage--;
				} else {
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

				const newEmbed = generateEmbed(
					filteredEvents,
					currentPage,
					maxPage
				);
				const newButtonRow = generateButtons(currentPage, maxPage);
				await message.edit({
					embeds: [newEmbed],
					components: [newButtonRow],
				});
			} catch (error) {
				console.error("Button Collector Error:", error);
				await btnInt.followUp({
					content:
						"⚠️ An error occurred while navigating through events. Please try again.",
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
			const newEmbed = generateEmbed(
				filteredEvents,
				currentPage,
				maxPage
			);
			const newButtonRow = generateButtons(currentPage, maxPage);
			message.edit({
				embeds: [newEmbed],
				components: [newButtonRow],
			});
		});
	}
}
