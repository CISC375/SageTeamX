import { ChatInputCommandInteraction, InteractionResponse } from "discord.js";
import { Command } from "@lib/types/Command";
const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

export default class extends Command {
	name = "calendar";
	description = "Retrieves calendar events";

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
		const TOKEN_PATH = path.join(process.cwd(), "token.json");
		const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

		const printEvent = (event) => {
			try {
				const startDateTime = new Date(event.start.dateTime || event.start.date);
				const endDateTime = new Date(event.end.dateTime || event.end.date);

				const startDate = startDateTime.toLocaleDateString();
				const endDate = endDateTime.toLocaleDateString();
				const startTime = startDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
				const endTime = endDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

				const summaryParts = (event.summary || "No Title").split('-');
				const className = summaryParts[0] || "No Class Name";
				const eventHolder = summaryParts[1] || "No Event Holder";
				const eventLocation = summaryParts[2] || "No Location";

				const location = eventLocation;

				return `
					${className}
					${eventHolder}
					${startDate}
					${startTime} - ${endTime}
					${event.location}
					${location}
				`;
			} catch (error) {
				console.error("Error printing event:", error);
				return "Error printing event details.";
			}
		};

		async function loadSavedCredentialsIfExist() {
			try {
				const content = await fs.readFile(TOKEN_PATH);
				const credentials = JSON.parse(content);
				return google.auth.fromJSON(credentials);
			} catch (err) {
				return null;
			}
		}

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
				return null; // No events found
			}
			return events; // Return the events array
		}

		await interaction.reply("Authenticating and fetching events...");

		try {
			const auth = await authorize();
			const events = await listEvents(auth);

			if (!events) {
				await interaction.followUp("No upcoming events found.");
				return;
			}

			let currentIndex = 0;

			const sendEvent = async (index) => {
				const eventMessage = printEvent(events[index]);
				const row = new ActionRowBuilder()
					.addComponents(
						new ButtonBuilder()
							.setCustomId('prev')
							.setLabel('Previous')
							.setStyle(ButtonStyle.Primary)
							.setDisabled(index === 0),
						new ButtonBuilder()
							.setCustomId('next')
							.setLabel('Next')
							.setStyle(ButtonStyle.Primary)
							.setDisabled(index === events.length - 1),
					);

				// Update the original interaction message
				await interaction.editReply({ content: eventMessage, components: [row] });
			};

			// Initially display the first event
			await sendEvent(currentIndex);

			const collector = interaction.channel.createMessageComponentCollector({ time: 60000 });

			collector.on('collect', async (buttonInteraction) => {
				if (buttonInteraction.customId === 'prev') {
					if (currentIndex > 0) {
						currentIndex--;
						await sendEvent(currentIndex);
					}
				} else if (buttonInteraction.customId === 'next') {
					if (currentIndex < events.length - 1) {
						currentIndex++;
						await sendEvent(currentIndex);
					}
				}
				await buttonInteraction.deferUpdate(); // Acknowledge button press
			});

			collector.on('end', () => {
				interaction.editReply({ components: [] }); // Disable buttons after timeout
			});
		} catch (error) {
			console.error(error);
			await interaction.followUp("Failed to retrieve events.");
		}
	}
}
