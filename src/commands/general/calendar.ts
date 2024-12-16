import {
import { ChatInputCommandInteraction, InteractionResponse } from "discord.js";
import { Command } from "@lib/types/Command";
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");


interface Event {
	eventID: string;
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
	description = "Retrieves calendar events";

	async run(
		interaction: ChatInputCommandInteraction
	): Promise<InteractionResponse<boolean> | void> {
		// If modifying these scopes, delete token.json.
		const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
		// The file token.json stores the user's access and refresh tokens, and is
		// created automatically when the authorization flow completes for the first
		// time.
		const TOKEN_PATH = path.join(process.cwd(), "token.json");
		const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
		// function that takes in the even object and prints it into a readable format
		const printEvent = (event) => {
			const eventSummary = event.summary || '';
			const summaryArray = eventSummary.split('-');
			const eventName = summaryArray[1] || 'Untitled';
			const eventHolder = summaryArray[2] || ' No Instructor';

			// tells the user if this is in-person or virtual
			const eventLocation1 = summaryArray[3] || 'No Location Type';
			const eventLocation2 = event.location || 'No Location';

			const formatDate = (dateObj) => {
				if (!dateObj) return 'Date TBD';
				try {
					const date = new Date(dateObj);
					return date.toLocaleDateString('en-US', {
						weekday: 'short',
						month: 'short',
						day: 'numeric'
					});
				} catch (err) {
					return 'Date TBD';
				}
			};
	
			const formatTime = (dateObj) => {
				if (!dateObj) return 'Time TBD';
				try {
					const date = new Date(dateObj);
					return date.toLocaleTimeString('en-US', {
						hour: 'numeric',
						minute: '2-digit'
					});
				} catch (err) {
					return 'Time TBD';
				}
			};
	
			// Safely access start and end times
			const startDateTime = event?.start?.dateTime || event?.start?.date;
			const endDateTime = event?.end?.dateTime || event?.end?.date;
	
			const eventDate = formatDate(startDateTime);
			let eventTime = 'Time TBD';
			
			if (startDateTime && endDateTime) {
				eventTime = `${formatTime(startDateTime)} - ${formatTime(endDateTime)}`;
			}


			return `
				${eventName}
				${eventDate}
				${eventTime}
				${eventHolder}
				${eventLocation1}
				${eventLocation2}
				-------------------------------------------
				`;
		};
		/**
		 * Reads previously authorized credentials from the save file.
		 *
		 * @return {Promise<OAuth2Client|null>}
		 */
		async function loadSavedCredentialsIfExist() {
			try {
				const content = await fs.readFile(TOKEN_PATH);
				const credentials = JSON.parse(content);
				return google.auth.fromJSON(credentials);
			} catch (err) {
				return null;
			}

import{
	ChatInputCommandInteraction,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
	EmbedBuilder,
	ApplicationCommandOptionType,
	ApplicationCommandStringOptionData,
} from 'discord.js';
import { Command } from '@lib/types/Command';
const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

export default class extends Command {
	name = 'calendar';
	description = 'Retrieve calendar events over the next 10 days with pagination, optionally filter';

	// All available filters that someone can add and they are not required
	options: ApplicationCommandStringOptionData[] = [
		{
			type: ApplicationCommandOptionType.String,
			name: 'classname',
			description: 'Enter the class name to filter events (e.g., "cisc123")',
			required: false,
		},
		{
			type: ApplicationCommandOptionType.String,
			name: 'locationtype',
			description: 'Enter "IP" for In-Person or "V" for Virtual events',
			required: false,
		},
		{
			type: ApplicationCommandOptionType.String,
			name: 'eventholder',
			description: 'Enter the name of the event holder you are looking for.',
			required: false,
		},
		{
			type: ApplicationCommandOptionType.String,
			name: 'eventdate',
			description: 'Enter the name of the date you are looking for with: [month name] [day] (eg., "december 12").',
			required: false,
		},
		{
			type: ApplicationCommandOptionType.String,
			name: 'dayofweek',
			description: 'Enter the day of the week to filter events (e.g., "Monday")',
			required: false,
		},
	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
		const TOKEN_PATH = path.join(process.cwd(), 'token.json');
		const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

		// Loads saved credentials if they exist
		async function loadSavedCredentialsIfExist() {
			try {
				const content = await fs.readFile(TOKEN_PATH);
				const credentials = JSON.parse(content);
				return google.auth.fromJSON(credentials);
			} catch {
				return null;
			}
		}

		// Saves calendar access token.json into its own folder when authenticating
		async function saveCredentials(client) {
			const content = await fs.readFile(CREDENTIALS_PATH);
			const keys = JSON.parse(content);
			const key = keys.installed || keys.web;
			const payload = JSON.stringify({
				type: 'authorized_user',
				client_id: key.client_id,
				client_secret: key.client_secret,
				refresh_token: client.credentials.refresh_token,
			});
			await fs.writeFile(TOKEN_PATH, payload);
		}
    
		// Loads the credentials that were authenticated by the user on their first use

		return client;
	  }
  
	  function formatDateTime(dateTime?: string): string {
		if (!dateTime) return '`NONE`';
		const date = new Date(dateTime);
		return date.toLocaleString('en-US', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
	  }
  
	  // Get the class name and location type arguments (if any)
	  const className = interaction.options.getString('classname') || '';
	  const locationType = interaction.options.getString('locationtype')?.toUpperCase() || '';
	  const eventHolder = interaction.options.getString('eventholder')|| '';
	  const eventDate = interaction.options.getString('eventdate')|| '';
	  const dayOfWeek = interaction.options.getString('dayofweek')?.toLowerCase() || '';
  
	  // Regex to validate that the class name starts with 'cisc' followed by exactly 3 digits
	  const classNameRegex = /^cisc\d{3}$/i;
	  //validates the date format to make sure it is valid input
	  const dateRegex = /^(?:january|february|march|april|may|june|july|august|september|october|november|december) (\d{1,2})$/;
  
	  // Validate class name format
	  if (className && !classNameRegex.test(className)) {
		await interaction.reply({
		  content: 'Invalid class name format. Please enter a class name starting with "cisc" followed by exactly three digits (e.g., "cisc123").',
		  ephemeral: true, // Only visible to the user who entered the command
		});
		return;
	  }
	  //map to get the day of the week from the date
	  const daysOfWeekMap: { [key: string]: number } = {
		sunday: 0,
		monday: 1,
		tuesday: 2,
		wednesday: 3,
		thursday: 4,
		friday: 5,
		saturday: 6,
	  };


		/*
		PURPOSE:
		MongoDB connection variables. This is where you would add in the connection string to your own MongoDB database, as well as establishing 
		the collection you want the events to be saved to within that database. It is currently set up to store events in the database of the bot
		which is running this command (Lineages), but feel free to make a specific database for the events or switch to your bot's database. 
		*/

		const connString = process.env.DB_CONN_STRING;
		const client = await MongoClient.connect(connString);
		const db = client.db('Lineages');
		const eventsCollection = db.collection('events');

		/**
		 * Load or request or authorization to call APIs.
		 *
		 */
		async function authorize() {
			let client = await loadSavedCredentialsIfExist();
			if (client) {
				return client;
        
	  // Validate locationType input ("IP" for In-Person, "V" for Virtual)
	  if (locationType && !['IP', 'V'].includes(locationType)) {
		await interaction.reply({
		  content: 'Invalid location type. Please enter "IP" for In-Person or "V" for Virtual events.',
		  ephemeral: true, // Only visible to the user who entered the command
		});
		return;
	  }
	  //makes sure the month is valid otherwise it will not execute
	  if (eventDate && !dateRegex.test(eventDate)) {
		await interaction.reply({
		  content: 'Invalid date format. Please enter a date starting with "month" followed by 1-2 digits (e.g., "december 9").',
		  ephemeral: true, // Only visible to the user who entered the command
		});
		return;
	  }
  
	  async function listEvents(auth, interaction: ChatInputCommandInteraction, className: string, locationType: string) {
		const calendar = google.calendar({ version: 'v3', auth });
		const now = new Date();
		const timeMin = now.toISOString();
		const timeMax = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
  
		try {
		  const res = await calendar.events.list({
			calendarId: 'c_dd28a9977da52689612627d786654e9914d35324f7fcfc928a7aab294a4a7ce3@group.calendar.google.com',
			timeMin,
			timeMax,
			singleEvents: true,
			orderBy: 'startTime',
		  });
  
		  const events = res.data.items || [];
		  if (events.length === 0) {
			await interaction.followUp('No events found over the next 10 days.');
			return;
		  }
  
		  // filters are provided, filter events by the ones given by user. 
		  const filteredEvents = events.filter((event) => {
			let matchClassName = true;
			let matchLocationType = true;
			let matchEventHolder = true;
			let matchEventDate = true;
			let matchDayOfWeek = true;
  
			// Class name filter
			if (className) {
			  matchClassName = event.summary && event.summary.toLowerCase().includes(className.toLowerCase());
			}
			client = await authenticate({ scopes: SCOPES, keyfilePath: CREDENTIALS_PATH });
			if (client.credentials) {
				await saveCredentials(client);
			}
			return client;
		}

		// Formats the date and time for events
		function formatDateTime(dateTime?: string): string {
			if (!dateTime) return '`NONE`';
			const date = new Date(dateTime);
			return date.toLocaleString('en-US', {
				month: 'long',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				timeZoneName: 'short',
			});
		}

		// Get the class name and location type arguments (if any)
		const className = interaction.options.getString('classname') || '';
		const locationType = interaction.options.getString('locationtype')?.toUpperCase() || '';
		const eventHolder = interaction.options.getString('eventholder') || '';
		const eventDate = interaction.options.getString('eventdate') || '';
		const dayOfWeek = interaction.options.getString('dayofweek')?.toLowerCase() || '';

		// Regex to validate that the class name starts with 'cisc' followed by exactly 3 digits
		const classNameRegex = /^cisc\d{3}$/i;
		// Validates the date format to make sure it is valid input
		const dateRegex = /^(?:january|february|march|april|may|june|july|august|september|october|november|december) (\d{1,2})$/;

		// Validate class name format
		if (className && !classNameRegex.test(className)) {
			await interaction.reply({
				content: 'Invalid class name format. Please enter a class name starting with "cisc" followed by exactly three digits (e.g., "cisc123").',
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
		if (locationType && !['IP', 'V'].includes(locationType)) {
			await interaction.reply({
				content: 'Invalid location type. Please enter "IP" for In-Person or "V" for Virtual events.',
				ephemeral: true, // Only visible to the user who entered the command
			});
			return;
		}

		// Makes sure the month is valid, otherwise it will not execute
		if (eventDate && !dateRegex.test(eventDate)) {
			await interaction.reply({
				content: 'Invalid date format. Please enter a date starting with "month" followed by 1-2 digits (e.g., "december 9").',
				ephemeral: true, // Only visible to the user who entered the command
			});
			return;
		}

		async function listEvents(auth, interaction: ChatInputCommandInteraction, className: string, locationType: string) {
			const calendar = google.calendar({ version: 'v3', auth });
			const now = new Date();
			const timeMin = now.toISOString();
			const timeMax = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();

			try {
				const res = await calendar.events.list({
					calendarId: 'c_dd28a9977da52689612627d786654e9914d35324f7fcfc928a7aab294a4a7ce3@group.calendar.google.com',
					timeMin,
					timeMax,
					singleEvents: true,
					orderBy: 'startTime',
				});

				const events = res.data.items || [];
				if (events.length === 0) {
					await interaction.followUp('No events found over the next 10 days.');
					return;
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
						matchClassName = event.summary && event.summary.toLowerCase().includes(className.toLowerCase());
					}

					// Event date filter
					if (eventDate) {
						const formattedEventDate = formatDateTime(event.start?.dateTime.toLowerCase());
						matchEventDate = formattedEventDate && formattedEventDate.toLowerCase().includes(eventDate.toLowerCase());
					}

					// Day of the week filter
					if (dayOfWeek) {
						const eventDate = new Date(event.start?.dateTime || event.start?.date);
						const eventDayOfWeek = eventDate.getDay();
						matchDayOfWeek = eventDayOfWeek === daysOfWeekMap[dayOfWeek];
					}

					// Location type filter (In-Person or Virtual)
					if (locationType) {
						if (locationType === 'IP') {
							matchLocationType = event.summary && event.summary.toLowerCase().includes('in person');
						} else if (locationType === 'V') {
							matchLocationType = event.summary && event.summary.toLowerCase().includes('virtual');
						}
					}

					// Event holder name filter
					if (eventHolder) {
						matchEventHolder = event.summary && event.summary.toLowerCase().includes(eventHolder.toLowerCase());
					}

					return matchClassName && matchLocationType && matchEventHolder && matchEventDate && matchDayOfWeek;
				});

				if (filteredEvents.length === 0) {
					await interaction.followUp('No events found matching the specified filters.');
					return;
				}

				// Puts the event object into stringified fields for printing
				const parsedEvents = filteredEvents.map((event, index) => ({
					name: (event.summary.split('-'))[0] || `Event ${index + 1}`,
					eventHolder: (event.summary.split('-'))[1],
					eventType: (event.summary.split('-'))[2],
					start: formatDateTime(event.start?.dateTime || event.start?.date),
					end: formatDateTime(event.end?.dateTime || event.end?.date),
					location: event.location || '`NONE`',
				}));

				// Display to the user with 3 events per page with a prev/next button to look through
				let currentPage = 0;
				const EVENTS_PER_PAGE = 3;

				function generateEmbed(page: number): EmbedBuilder {
					const embed = new EmbedBuilder()
						.setColor('Green')
						.setTitle(`Upcoming Events ${className ? `for ${className}` : ''} (${locationType ? locationType === 'IP' ? 'In-Person' : 'Virtual' : ''}) (Page ${page + 1} of ${Math.ceil(parsedEvents.length / EVENTS_PER_PAGE)})`);

					parsedEvents
						.slice(page * EVENTS_PER_PAGE, (page + 1) * EVENTS_PER_PAGE)
						.forEach((event, index) => {
							embed.addFields({
								name: `Event ${page * EVENTS_PER_PAGE + index + 1}: ${event.name}`,
								value: `**Event Holder:** ${event.eventHolder}\n**Start:** ${event.start}\n**End:** ${event.end}\n**Location:** ${event.location}\n**Event Type:** ${event.eventType}\n\n`,
							});
						});

					return embed;
				}

				async function updateMessage(page: number, message) {
					const embed = generateEmbed(page);
					const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setCustomId('prev')
							.setLabel('Previous')
							.setStyle(ButtonStyle.Primary)
							.setDisabled(page === 0),
						new ButtonBuilder()
							.setCustomId('next')
							.setLabel('Next')
							.setStyle(ButtonStyle.Primary)
							.setDisabled(page === Math.ceil(parsedEvents.length / EVENTS_PER_PAGE) - 1),
						new ButtonBuilder()
							.setCustomId('done')
							.setLabel('Done')
							.setStyle(ButtonStyle.Danger)
					);

					await message.edit({ embeds: [embed], components: [buttons] });
				}

				// Send initial message via DM
				const dmChannel = await interaction.user.createDM();
				const initialEmbed = generateEmbed(currentPage);
				const initialButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId('prev')
						.setLabel('Previous')
						.setStyle(ButtonStyle.Primary)
						.setDisabled(true),
					new ButtonBuilder()
						.setCustomId('next')
						.setLabel('Next')
						.setStyle(ButtonStyle.Primary)
						.setDisabled(filteredEvents.length <= EVENTS_PER_PAGE),
					new ButtonBuilder()
						.setCustomId('done')
						.setLabel('Done')
						.setStyle(ButtonStyle.Danger)
				);

				const message = await dmChannel.send({
					embeds: [initialEmbed],
					components: [initialButtons],
				});

				const collector = message.createMessageComponentCollector({ time: 300000 });

				collector.on('collect', async (btnInteraction) => {
					if (btnInteraction.customId === 'done') {
						collector.stop();
						await message.edit({ components: [] });
						await btnInteraction.reply('Collector manually terminated.');
					} else {
						if (btnInteraction.customId === 'prev') currentPage--;
						if (btnInteraction.customId === 'next') currentPage++;
						await updateMessage(currentPage, message);
						await btnInteraction.deferUpdate();
					}
				});

				collector.on('end', async () => {
					await message.edit({ components: [] });
				});
			} catch (err) {
				console.error(err);
				await interaction.followUp('Failed to retrieve calendar events.');
			  });
  
			return embed;
		 
      /**
		 * Lists the next 10 events on the user's primary calendar.
		 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
		 */
		async function listEvents(auth, interaction) {
			const calendar = google.calendar({ version: "v3", auth });
			const res = await calendar.events.list({
				calendarId: process.env.CAL_ID,
				timeMin: new Date().toISOString(),
				maxResults: 10,
				singleEvents: true,
				orderBy: "startTime",
			});

			const events = res.data.items;
			if (!events || events.length === 0) {
				await interaction.followUp("No upcoming events found.");
				return;
			}

			const formatDate = (dateString: string) => {
				if (!dateString) return '';
				const date = new Date(dateString);
				return date.toLocaleDateString('en-US', {
					month: '2-digit',
					day: '2-digit',
					year: 'numeric'
				});
			};
			const formatTime = (dateString: string) => {
				if (!dateString) return '';
				const date = new Date(dateString);
				return date.toLocaleTimeString('en-US', {
					hour: '2-digit',
					minute: '2-digit',
					hour12: true
				});
			};

		
			/*
			This is the part of the code that creates events and stores them to the database. Using the variables established while we parse, 
			it will add the event data. 
			*/
			await Promise.all(events.map(event => {
				const summaryArray = event.summary?.split('-') || [];
				const startDateTime = event?.start?.dateTime || event?.start?.date;
				const endDateTime = event?.end?.dateTime || event?.end?.date;
				const newEvent: Event = {
					eventID: event.id, 				//eventID
					courseID: summaryArray[0] || '',	//courseID (eventName in parsing)
					instructor: summaryArray[1] || '',  //instructor (eventHolder in parsing)
					date: formatDate(startDateTime) || '',
           			start: formatTime(startDateTime) || '',
            		end: formatTime(endDateTime) || '', // end time
					location: event.location || '', // location (eventLocation2 in parsing)
					locationType: summaryArray [2] || '' // locationType (eventLocation1 in parsing)
				};

				/*
				If there is an event which has changed since the last time you ran the command, it will update the command. 
				*/

				return eventsCollection.updateOne( 
					{ eventID: newEvent.eventID }, 
					{ $set: { ...newEvent}}, 
					{upsert: true}
				);

			}));


			const eventChunks: string[] = [];
    let currentChunk = 'Upcoming 10 events:\n';

    for (const event of events) {
        const eventText = printEvent(event);
        
        // If adding this event would exceed Discord's limit, start a new chunk
        if (currentChunk.length + eventText.length > 1900) {
            eventChunks.push(currentChunk);
            currentChunk = '';
        }
        
        currentChunk += eventText;
    }
    
    // Add the last chunk if it has content
    if (currentChunk) {
        eventChunks.push(currentChunk);
    }

    // Send chunks as separate messages
    for (const chunk of eventChunks) {
        await interaction.followUp(chunk);
    }

		  async function updateMessage(page: number, message) {
			const embed = generateEmbed(page);
			const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
			  new ButtonBuilder()
				.setCustomId('prev')
				.setLabel('Previous')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(page === 0),
			  new ButtonBuilder()
				.setCustomId('next')
				.setLabel('Next')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(page === Math.ceil(parsedEvents.length / EVENTS_PER_PAGE) - 1),
			  new ButtonBuilder()
				.setCustomId('done')
				.setLabel('Done')
				.setStyle(ButtonStyle.Danger)
			);
  
			await message.edit({ embeds: [embed], components: [buttons] });
		  }
  
		  // Send initial message via DM
		  const dmChannel = await interaction.user.createDM();
		  const initialEmbed = generateEmbed(currentPage);
		  const initialButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
			  .setCustomId('prev')
			  .setLabel('Previous')
			  .setStyle(ButtonStyle.Primary)
			  .setDisabled(true),
			new ButtonBuilder()
			  .setCustomId('next')
			  .setLabel('Next')
			  .setStyle(ButtonStyle.Primary)
			  .setDisabled(filteredEvents.length <= EVENTS_PER_PAGE),
			new ButtonBuilder()
			  .setCustomId('done')
			  .setLabel('Done')
			  .setStyle(ButtonStyle.Danger)
		  );
  
		  const message = await dmChannel.send({
			embeds: [initialEmbed],
			components: [initialButtons],
		  });
  
		  const collector = message.createMessageComponentCollector({ time: 300000 });
  
		  collector.on('collect', async (btnInteraction) => {
			if (btnInteraction.customId === 'done') {
			  collector.stop();
			  await message.edit({ components: [] });
			  await btnInteraction.reply('Collector manually terminated.');
			} else {
			  if (btnInteraction.customId === 'prev') currentPage--;
			  if (btnInteraction.customId === 'next') currentPage++;
			  await updateMessage(currentPage, message);
			  await btnInteraction.deferUpdate();
			}
		}

		try {
			await interaction.reply('Authenticating and fetching events...');
			const auth = await authorize();
			await listEvents(auth, interaction, className, locationType);
		} catch (err) {
			console.error(err);
			await interaction.followUp('An error occurred.');
		}
	}
}