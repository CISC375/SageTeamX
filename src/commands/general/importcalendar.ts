/* eslint-disable */
import {
	ChatInputCommandInteraction,
	PermissionFlagsBits,
	ApplicationCommandOptionData,
	ApplicationCommandOptionType,
} from "discord.js";
import { Command } from "@root/src/lib/types/Command";
import { MongoClient } from "mongodb";
import "dotenv/config";
import { google } from "googleapis";
import { retrieveEvents } from '@root/src/lib/auth';
import { validateCalendarId } from './calendarConfig';

// MongoDB Connection Settings
const MONGO_URI = process.env.DB_CONN_STRING || "";
const DB_NAME = "CalendarDatabase";
const COLLECTION_NAME = "calendarIds";

// Google Calendar API Settings
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
const TOKEN_PATH = "token.json";
const CREDENTIALS_PATH = "credentials.json";

export default class extends Command {
	name = "importcalendar";
	description =
		"Adds a new Google Calendar ID for event tracking (Admin only)";

	options: ApplicationCommandOptionData[] = [
		{
			type: ApplicationCommandOptionType.String,
			name: "calendarid",
			description: "Enter the Google Calendar ID to add",
			required: true,
		},
		{
			type: ApplicationCommandOptionType.String,
			name: "calendarname",
			description: "Enter a name for this calendar",
			required: true,
		},
	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		// Check if user has Admin privileges
		if (
			!interaction.memberPermissions?.has(
				PermissionFlagsBits.Administrator
			)
		) {
			await interaction.reply({
				content: "❌ You do not have permission to use this command.",
				ephemeral: true,
			});
			return;
		}

		// Get Calendar ID & Name from command
		const calendarId = interaction.options.getString("calendarid");
		const calendarName = interaction.options.getString("calendarname");

		if (!validateCalendarId(calendarId)) {
			await interaction.reply({
			  content: "❌ Invalid Calendar ID format. Please check the ID and try again.",
			  ephemeral: true,
			});
			return;
		  }

		// Connect to MongoDB
		const client = new MongoClient(MONGO_URI);
		await client.connect();
		const db = client.db(DB_NAME);
		const collection = db.collection(COLLECTION_NAME);

		// Check if Calendar ID already exists
		const existingCalendar = await collection.findOne({ calendarId });
		if (existingCalendar) {
			await interaction.reply({
				content: `⚠️ Calendar ID \`${calendarId}\` is already imported as **${existingCalendar.calendarName}**.`,
				ephemeral: true,
			});
			await client.close();
			return;
		}

		// Validate the Calendar ID by checking if it returns events
		try {
			const events = await retrieveEvents(calendarId, interaction);

			// If no events are found, the calendar still exists
			if (!events) {
				await interaction.reply({
					content: `⚠️ Calendar ID \`${calendarId}\` exists but has no upcoming events.`,
					ephemeral: true,
				});
			}
		} catch (error) {
			console.error("Google Calendar API Error:", error);
			await interaction.reply({
				content: `❌ Invalid or inaccessible Calendar ID: \`${calendarId}\`. Please check and try again.`,
				ephemeral: true,
			});
			await client.close();
			return;
		}

		// Insert new Calendar ID & Name into the database
		await collection.insertOne({ calendarId, calendarName });

		await interaction.reply({
			content: `✅ Successfully added **${calendarName}** (\`${calendarId}\`) to the calendar list.`,
			ephemeral: false,
		});

		// Close MongoDB connection
		await client.close();
	}
}
