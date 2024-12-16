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
		}

		/**
		 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
		 *
		 * @param {OAuth2Client} client
		 * @return {Promise<void>}
		 */
		async function saveCredentials(client) {
			const content = await fs.readFile(CREDENTIALS_PATH);
			const keys = JSON.parse(content);
			const key = keys.installed || keys.web;
			const payload = JSON.stringify({
				type: "authorized_user",
				client_id: key.client_id,
				client_secret: key.client_secret,
				refresh_token: client.credentials.refresh_token,
			});
			await fs.writeFile(TOKEN_PATH, payload);
		}

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
			}
			client = await authenticate({
				scopes: SCOPES,
				keyfilePath: CREDENTIALS_PATH,
			});
			if (client.credentials) {
				await saveCredentials(client);
			}
			return client;
		}

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
		}

		await interaction.reply("Authenticating and fetching events...");

		authorize()
			.then((auth) => listEvents(auth, interaction))
			.catch((error) => {
				console.error(error);
				interaction.followUp("Failed to retrieve events.");
			});
	}
}
