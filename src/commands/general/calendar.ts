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
} from 'discord.js';
import { Command } from '@lib/types/Command';
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { authorize } from '../../lib/auth';
//import event from '@root/src/models/calEvent';

const path = require('path');
const process = require('process');
const { google } = require('googleapis');

interface Event{
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
	description = "Retrieve calendar events over the next 10 days with pagination, optionally filter";

	// All available filters that someone can add and they are not required
	options: ApplicationCommandStringOptionData[] = [
		{
			type: ApplicationCommandOptionType.String,
			name: "classname",
			description:
				'Enter the class name to filter events (e.g., "cisc123")',
			required: false,
		},
		{
			type: ApplicationCommandOptionType.String,
			name: "locationtype",
			description: 'Enter "IP" for In-Person or "V" for Virtual events',
			required: false,
		},
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
		{
			type: ApplicationCommandOptionType.String,
			name: "dayofweek",
			description:
				'Enter the day of the week to filter events (e.g., "Monday")',
			required: false,
		},
	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		/** Helper Functions **/

		// Filters calendar events based on various parameters
		async function filter(events, eventsPerPage: number) {
			const className: string = interaction.options.getString('classname')?.toLowerCase();
			const locationType: string = interaction.options.getString('locationtype')?.toLowerCase();
			const eventHolder: string = interaction.options.getString('eventholder')?.toLowerCase();
			const eventDate: string = interaction.options.getString('eventdate')
			const dayOfWeek: string = interaction.options.getString('dayofweek')?.toLowerCase();
			const newLocationType: 'in person' | 'virtual' | '' = locationType ? (locationType === 'ip' ? 'in person' : 'virtual') : '';
			const newEventDate: string = eventDate ? new Date(eventDate).toLocaleDateString() : '';
			const daysOfWeek: string[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

			let temp = [];
			let filteredEvents = [];
			let eventsInTemp = 0;
			let classNameFlag: boolean = false;
			let locationTypeFlag: boolean = false;
			let eventHolderFlag: boolean = false;
			let eventDateFlag: boolean = false;
			let dayOfWeekFlag: boolean = false;
			events.forEach((event) => {
				const lowerCaseSummary: string = event.summary.toLowerCase();
				const currentEventDate: Date = new Date(event.start.dateTime);
				if ((!className || lowerCaseSummary.includes(className)) && 
					(!newLocationType || lowerCaseSummary.includes(newLocationType)) && 
					(!eventHolder || lowerCaseSummary.includes(eventHolder)) && 
					(!newEventDate || currentEventDate.toLocaleDateString() === newEventDate) &&
					(!dayOfWeek || daysOfWeek[currentEventDate.getDay()] === dayOfWeek)) {
					temp.push(event);
					eventsInTemp++;
					if (eventsInTemp % eventsPerPage === 0) {
						filteredEvents.push(temp);
						temp = [];
					}
				}
				classNameFlag = lowerCaseSummary.includes(className) ? true : false;
				locationTypeFlag = lowerCaseSummary.includes(newLocationType);
				eventHolderFlag = lowerCaseSummary.includes(eventHolder);
				eventDateFlag = currentEventDate.toLocaleDateString() === newEventDate;
				dayOfWeekFlag = daysOfWeek[currentEventDate.getDay()] === dayOfWeek;
			});

			if (filteredEvents.length === 0) {
				let errorMessage = '';

				if (dayOfWeek && dayOfWeekFlag) {
					errorMessage = `Invalid day of the week: **${dayOfWeek}**. Please enter a valid day (e.g., "Monday").`;
				} else if (eventDate && !eventDateFlag) {
					errorMessage = `Invalid date format: **${eventDate}**. Please enter a date in the format **"Month Day"** (e.g., "December 9").`;
				} else if (locationType && !locationTypeFlag) {
					errorMessage = `Invalid location type: **${locationType}**. Please enter **"IP"** for In-Person or **"V"** for Virtual.`;
				} else if (eventHolder && eventHolderFlag) {
					errorMessage = `No office hours found for instructor: **${eventHolder}**. They may not have scheduled any office hours.`;
				} else if (className && !classNameFlag) {
					errorMessage = `No office hours found for course: **${className}**. Please check back later or contact the instructor.`;
				} else {
					errorMessage = "No office hours match your search criteria.";
				}

				console.warn(
					`Missing data: ${errorMessage} - Filters: Class: ${
						className || "N/A"
					}, LocationType: ${
						locationType || "N/A"
					}, EventHolder: ${eventHolder || "N/A"}, EventDate: ${
						eventDate || "N/A"
					}, DayOfWeek: ${dayOfWeek || "N/A"}`
				);

				await interaction.followUp({content: errorMessage, ephemeral: true});
				return;
			}
			
			return filteredEvents;
		}

		// Generates the embed for displaying events
		function generateEmbed(filteredEvents, currentPage: number, maxPage: number): EmbedBuilder {
			const embed = new EmbedBuilder()
				.setTitle(`Events - ${currentPage + 1} of ${maxPage}`)
				.setColor('Green');
			filteredEvents[currentPage].forEach(event => {
				embed.addFields({
					name: `**${event.summary}**`, 
					value: `Date: ${new Date(event.start.dateTime).toLocaleDateString()}
							Time: ${new Date(event.start.dateTime).toLocaleTimeString()} - ${new Date(event.end.dateTime).toLocaleTimeString()}
							Location: ${event.location ? event.location : "`NONE`"}\n`
				});
			});
			return embed;
		}

		// Generates the buttons for changing pages
		function generateButtons(currentPage: number, maxPage: number): ActionRowBuilder<ButtonBuilder> {
			const nextButton = new ButtonBuilder()
				.setCustomId('next')
				.setLabel('Next')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(currentPage + 1 === maxPage);
			
			const prevButton = new ButtonBuilder()
				.setCustomId('prev')
				.setLabel('Previous')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(currentPage === 0);
			
			const done = new ButtonBuilder()
				.setCustomId('done')
				.setLabel('Done')
				.setStyle(ButtonStyle.Danger);
		
			return new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton, done);
		}

		/**********************************************************************************************************************************************************************************************/
		
		await interaction.reply({content: "Gettings events", ephemeral: true});

		// Fetch Calendar events
		const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
		const TOKEN_PATH = path.join(process.cwd(), "token.json");
		const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
		const auth = await authorize(TOKEN_PATH, SCOPES, CREDENTIALS_PATH);
		const calendar = google.calendar({ version: "v3", auth });
		const response = await calendar.events.list({
			calendarId: 'c_dd28a9977da52689612627d786654e9914d35324f7fcfc928a7aab294a4a7ce3@group.calendar.google.com',
    		timeMin: new Date().toISOString(),
    		maxResults: 100,
    		singleEvents: true,
    		orderBy: 'startTime',
		});
		const events = response.data.items || [];

		// Filter events into a 2D array
		const eventsPerPage: number = 3; // Modify this value to change the number of events per page
		const filteredEvents = await filter(events, eventsPerPage);
		
		// Generate intial embed and buttons
		let maxPage: number = filteredEvents.length;
		let currentPage: number = 0;
		const embed = generateEmbed(filteredEvents, currentPage, maxPage);
		const buttonRow = generateButtons(currentPage, maxPage);

		// Send message
		const dm = await interaction.user.createDM()
		const message = await dm.send({
			embeds: [embed],
			components: [buttonRow]
		});

		// Create button collector for message
		const buttonCollector = message.createMessageComponentCollector({
			time: 300000
		});

		buttonCollector.on('collect', async (btnInt) => {
			btnInt.deferUpdate();
			if (btnInt.customId === 'next') {
				currentPage++;
			}
			else if (btnInt.customId === 'prev') {
				currentPage--;
			}
			else {
				message.edit({
					embeds: [],
					components: [],
					content: 'Calendar Deleted'
				})
				buttonCollector.stop()
				return;
			}
			const newEmbed = generateEmbed(filteredEvents, currentPage, maxPage);
			const newButtonRow = generateButtons(currentPage, maxPage);
			message.edit({
				embeds: [newEmbed], 
				components: [newButtonRow]
			});
		});
	}
}

/*
// Formats the date and time for events
		function formatDateTime(dateTime?: string): string {
			if (!dateTime) return "`NONE`";
			const date = new Date(dateTime);
			return date.toLocaleString("en-US", {
				month: "long",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
				timeZoneName: "short",
			});
		}

		/**
		 * MongoDB connection variables. This is where you would add in the connection string to your own MongoDB database, as well as establishing
		 * the collection you want the events to be saved to within that database. It is currently set up to store events in the database of the bot
		 * which is running this command (Lineages), but feel free to make a specific database for the events or switch to your bot's database. 
		 

		const connString = process.env.DB_CONN_STRING;
		const client = await MongoClient.connect(connString);
		const db = client.db('Lineages');
		const eventsCollection = db.collection('events'); 

		This code might not be entirely neccessary, but I'll keep it here just in case

		

		// Get the class name and location type arguments (if any)
		const className = interaction.options.getString("classname") || "";
		const locationType =
			interaction.options.getString("locationtype")?.toUpperCase() || "";
		const eventHolder = interaction.options.getString("eventholder") || "";
		const eventDate = interaction.options.getString("eventdate") || "";
		const dayOfWeek =
			interaction.options.getString("dayofweek")?.toLowerCase() || "";

		// Regex to validate that the class name starts with 'cisc' followed by exactly 3 digits
		const classNameRegex = /^cisc\d{3}$/i;
		// Validates the date format to make sure it is valid input
		const dateRegex =
			/^(?:january|february|march|april|may|june|july|august|september|october|november|december) (\d{1,2})$/;

		// Validate class name format
		if (className && !classNameRegex.test(className)) {
			await interaction.reply({
				content:
					'Invalid class name format. Please enter a class name starting with "cisc" followed by exactly three digits (e.g., "cisc123").',
				ephemeral: true, // Only visible to the user who entered the command
			});
			return;
		}

		// Map to get the day of the week from the date
		const daysOfWeekMap: { [key: string]: number } = {
			sunday: 0,
			monday: 1,
			tuesday: 2,
			wednesday: 3,
			thursday: 4,
			friday: 5,
			saturday: 6,
		};

		// Validate locationType input ("IP" for In-Person, "V" for Virtual)
		if (locationType && !["IP", "V"].includes(locationType)) {
			await interaction.reply({
				content:
					'Invalid location type. Please enter "IP" for In-Person or "V" for Virtual events.',
				ephemeral: true, // Only visible to the user who entered the command
			});
			return;
		}

		// Makes sure the month is valid, otherwise it will not execute
		if (eventDate && !dateRegex.test(eventDate)) {
			await interaction.reply({
				content:
					'Invalid date format. Please enter a date starting with "month" followed by 1-2 digits (e.g., "december 9").',
				ephemeral: true, // Only visible to the user who entered the command
			});
			return;
		}

		async function listEvents(
			auth,
			interaction: ChatInputCommandInteraction,
			className: string,
			locationType: string
		) {
			const calendar = google.calendar({ version: "v3", auth });
			const now = new Date();
			const timeMin = now.toISOString();
			const timeMax = new Date(
				now.getTime() + 10 * 24 * 60 * 60 * 1000
			).toISOString();

			try {
				const res = await calendar.events.list({
					calendarId:
						"c_dd28a9977da52689612627d786654e9914d35324f7fcfc928a7aab294a4a7ce3@group.calendar.google.com",
					timeMin,
					timeMax,
					singleEvents: true,
					orderBy: "startTime",
				});

				const events = res.data.items || [];
				if (events.length === 0) {
					await interaction.followUp(
						"No events found over the next 10 days."
					);
					return;
				}
				/**
				 * before filtering the events, we store every single one in MongoDB. 
				   This code might not be entirely neccessary, but I'll keep it here just in case

				for (const event of events) {
					const eventParts = event.summary.split("-");
					const eventData: Event = {
						eventId: event.id,
						courseID: eventParts[0]?.trim() || "",
						instructor: eventParts[1]?.trim() || "",
						date: formatDateTime(
							event.start?.dateTime || event.start?.date
						),
						start: event.start?.dateTime || event.start?.date || "",
						end: event.end?.dateTime || event.end?.date || "",
						location: event.location || "",
						locationType: eventParts[2]
							?.trim()
							.toLowerCase()
							.includes("virtual")
							? "V"
							: "IP",
					};

					try {
						// Update or insert the event
						await eventsCollection.updateOne(
							{ eventId: eventData.eventId },
							{ $set: eventData },
							{ upsert: true }
						);
					} catch (dbError) {
						console.error(
							"Error storing event in database:",
							dbError
						);
					}
				}

				
				

				// Filters are provided, filter events by the ones given by user
				const filteredEvents = events.filter((event) => {
					let matchClassName = true;
					let matchLocationType = true;
					let matchEventHolder = true;
					let matchEventDate = true;
					let matchDayOfWeek = true;

					// Class name filter
					if (className) {
						matchClassName =
							event.summary &&
							event.summary
								.toLowerCase()
								.includes(className.toLowerCase());
					}

					// Event date filter
					if (eventDate) {
						const formattedEventDate = formatDateTime(
							event.start?.dateTime.toLowerCase()
						);
						matchEventDate =
							formattedEventDate &&
							formattedEventDate
								.toLowerCase()
								.includes(eventDate.toLowerCase());
					}

					// Day of the week filter
					if (dayOfWeek) {
						const eventDate = new Date(
							event.start?.dateTime || event.start?.date
						);
						const eventDayOfWeek = eventDate.getDay();
						matchDayOfWeek =
							eventDayOfWeek === daysOfWeekMap[dayOfWeek];
					}

					// Location type filter (In-Person or Virtual)
					if (locationType) {
						if (locationType === "IP") {
							matchLocationType =
								event.summary &&
								event.summary
									.toLowerCase()
									.includes("in person");
						} else if (locationType === "V") {
							matchLocationType =
								event.summary &&
								event.summary.toLowerCase().includes("virtual");
						}
					}

					// Event holder name filter
					if (eventHolder) {
						matchEventHolder =
							event.summary &&
							event.summary
								.toLowerCase()
								.includes(eventHolder.toLowerCase());
					}

					return (
						matchClassName &&
						matchLocationType &&
						matchEventHolder &&
						matchEventDate &&
						matchDayOfWeek
					);
				});

				if (filteredEvents.length === 0) {
					let errorMessage = "No office hours available";

					if (className && !classNameRegex.test(className)) {
						errorMessage = `Invalid class name format: **${className}**. Class names should be in the format **"cisc123"**.`;
					} else if (dayOfWeek && !(dayOfWeek in daysOfWeekMap)) {
						errorMessage = `Invalid day of the week: **${dayOfWeek}**. Please enter a valid day (e.g., "Monday").`;
					} else if (eventDate && !dateRegex.test(eventDate)) {
						errorMessage = `Invalid date format: **${eventDate}**. Please enter a date in the format **"Month Day"** (e.g., "December 9").`;
					} else if (
						locationType &&
						!["IP", "V"].includes(locationType)
					) {
						errorMessage = `Invalid location type: **${locationType}**. Please enter **"IP"** for In-Person or **"V"** for Virtual.`;
					} else if (eventHolder) {
						errorMessage = `No office hours found for instructor: **${eventHolder}**. They may not have scheduled any office hours.`;
					} else if (className) {
						errorMessage = `No office hours found for course: **${className}**. Please check back later or contact the instructor.`;
					} else {
						errorMessage =
							"No office hours match your search criteria.";
					}

					console.warn(
						`Missing data: ${errorMessage} - Filters: Class: ${
							className || "N/A"
						}, LocationType: ${
							locationType || "N/A"
						}, EventHolder: ${eventHolder || "N/A"}, EventDate: ${
							eventDate || "N/A"
						}, DayOfWeek: ${dayOfWeek || "N/A"}`
					);

					await interaction.followUp(errorMessage);
					return;
				}

				// Puts the event object into stringified fields for printing
				const parsedEvents = filteredEvents.map((event, index) => ({
					name: event.summary.split("-")[0] || `Event ${index + 1}`,
					eventHolder: event.summary.split("-")[1],
					eventType: event.summary.split("-")[2],
					start: formatDateTime(
						event.start?.dateTime || event.start?.date
					),
					end: formatDateTime(event.end?.dateTime || event.end?.date),
					location: event.location || "`NONE`",
				}));

				// Display to the user with 3 events per page with a prev/next button to look through
				let currentPage = 0;
				const EVENTS_PER_PAGE = 3;

				function generateEmbed(page: number): EmbedBuilder {
					const embed = new EmbedBuilder()
						.setColor("Green")
						.setTitle(
							`Upcoming Events ${
								className ? `for ${className}` : ""
							} (${
								locationType
									? locationType === "IP"
										? "In-Person"
										: "Virtual"
									: ""
							}) (Page ${page + 1} of ${Math.ceil(
								parsedEvents.length / EVENTS_PER_PAGE
							)})`
						);

					parsedEvents
						.slice(
							page * EVENTS_PER_PAGE,
							(page + 1) * EVENTS_PER_PAGE
						)
						.forEach((event, index) => {
							embed.addFields({
								name: `Event ${
									page * EVENTS_PER_PAGE + index + 1
								}: ${event.name}`,
								value: `**Event Holder:** ${event.eventHolder}\n**Start:** ${event.start}\n**End:** ${event.end}\n**Location:** ${event.location}\n**Event Type:** ${event.eventType}\n\n`,
							});
						});

					return embed;
				}

				async function updateMessage(page: number, message) {
					const embed = generateEmbed(page);
					const buttons =
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setCustomId("prev")
								.setLabel("Previous")
								.setStyle(ButtonStyle.Primary)
								.setDisabled(page === 0),
							new ButtonBuilder()
								.setCustomId("next")
								.setLabel("Next")
								.setStyle(ButtonStyle.Primary)
								.setDisabled(
									page ===
										Math.ceil(
											parsedEvents.length /
												EVENTS_PER_PAGE
										) -
											1
								),
							new ButtonBuilder()
								.setCustomId("done")
								.setLabel("Done")
								.setStyle(ButtonStyle.Danger)
						);

					await message.edit({
						embeds: [embed],
						components: [buttons],
					});
				}

				// Send initial message via DM
				const dmChannel = await interaction.user.createDM();
				const initialEmbed = generateEmbed(currentPage);
				const initialButtons =
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setCustomId("prev")
							.setLabel("Previous")
							.setStyle(ButtonStyle.Primary)
							.setDisabled(true),
						new ButtonBuilder()
							.setCustomId("next")
							.setLabel("Next")
							.setStyle(ButtonStyle.Primary)
							.setDisabled(
								filteredEvents.length <= EVENTS_PER_PAGE
							),
						new ButtonBuilder()
							.setCustomId("done")
							.setLabel("Done")
							.setStyle(ButtonStyle.Danger)
					);

				const message = await dmChannel.send({
					embeds: [initialEmbed],
					components: [initialButtons],
				});

				const collector = message.createMessageComponentCollector({
					time: 300000,
				});

				collector.on("collect", async (btnInteraction) => {
					if (btnInteraction.customId === "done") {
						collector.stop();
						await message.edit({ components: [] });
						await btnInteraction.reply(
							"Collector manually terminated."
						);
					} else {
						if (btnInteraction.customId === "prev") currentPage--;
						if (btnInteraction.customId === "next") currentPage++;
						await updateMessage(currentPage, message);
						await btnInteraction.deferUpdate();
					}
				});

				collector.on("end", async () => {
					await message.edit({ components: [] });
				});
			} catch (err) {
				console.error(err);
				await interaction.followUp(
					"Failed to retrieve calendar events."
				);
			}
		}

		try {
			await interaction.reply('Authenticating and fetching events...');
			const auth = await authorize(TOKEN_PATH, SCOPES, CREDENTIALS_PATH);
			await listEvents(auth, interaction, className, locationType);
		} catch (err) {
			console.error(err);
			await interaction.followUp("An error occurred.");
		}
*/
