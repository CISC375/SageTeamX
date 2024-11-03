import { ChatInputCommandInteraction, InteractionResponse } from "discord.js";
import { Command } from "@lib/types/Command";
const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

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
				calendarId: "primary",
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

			const eventList = events
				.map((event, i) => {

					//Parse the dates
					const startDate = new Date(event.start.dateTime || event.start.date);
					const endDate = new Date(event.end.dateTime || event.end.date);

					//Defining the format for displaying Day, Date and Time
					const dayOptions: Intl.DateTimeFormatOptions = { weekday: 'long' }
					const dateOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
					const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: 'numeric', hour12: true };

					const day = new Intl.DateTimeFormat("en-US", dayOptions).format(startDate); //This formats the startDate into a day
					const startDateFormatted = new Intl.DateTimeFormat("en-US", dateOptions).format(startDate); //Converts 2021-11-04T09:10:00 into Nov 4, 2024
					const startTimeFormatted = new Intl.DateTimeFormat("en-US", timeOptions).format(startDate);
					const endTimeFormatted = new Intl.DateTimeFormat("en-US", timeOptions).format(endDate);

					return `${i + 1}. **${event.summary}** on ${day}, ${startDateFormatted}\n	Time: ${startTimeFormatted} - ${endTimeFormatted}`;

					// const start = event.start.dateTime || event.start.date;
					// return `${i + 1}. **${event.summary}** - ${start}`;
				})
				.join("\n");

			await interaction.followUp(`Upcoming 10 events:\n${eventList}`);
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
