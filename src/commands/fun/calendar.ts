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
		const TOKEN_PATH = path.join(process.cwd(), "token.json");
		const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

		// Load previously authorized credentials
		async function loadSavedCredentialsIfExist() {
			try {
				const content = await fs.readFile(TOKEN_PATH);
				const credentials = JSON.parse(content);
				return google.auth.fromJSON(credentials);
			} catch (err) {
				return null;
			}
		}

		// Save new credentials
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

		// Authorize the user or request authorization
		async function authorize() {
			let client = await loadSavedCredentialsIfExist();
			if (client) {
				return client;
			}
			client = await authenticate({
				scopes: SCOPES,
				keyfilePath: CREDENTIALS_PATH,
				redirectUri: process.env.NODE_ENV === "production"
					? "https://your-production-url.com/auth/callback"
					: "http://localhost:<PORT>/auth/callback"
			});
			if (client.credentials) {
				await saveCredentials(client);
			}
			return client;
		}

		// List events on the user's primary calendar
		async function listEvents(auth) {
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
				return "No upcoming events found.";
			}

			// Format the list of events
			return events
				.map((event, i) => {
					const start = event.start.dateTime || event.start.date;
					return `${i + 1}. **${event.summary}** - ${start}`;
				})
				.join("\n");
		}

		// Initial defer reply
		await interaction.deferReply({ ephemeral: false });

		// Authenticate and retrieve events
		try {
			const auth = await authorize();
			const eventList = await listEvents(auth);
			await interaction.editReply({
				content: `Upcoming 10 events:\n${eventList}`
			});
		} catch (error) {
			console.error(error);
			await interaction.editReply("Failed to retrieve events.");
		}
	}
}
