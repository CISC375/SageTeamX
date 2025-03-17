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

// MongoDB Connection Settings
const MONGO_URI = process.env.DB_CONN_STRING || "";
const DB_NAME = "CalendarDatabase";
const COLLECTION_NAME = "calendarIds";

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

		// Get Calendar ID from command
		const calendarId = interaction.options.getString("calendarid");

		// Connect to MongoDB
		const client = new MongoClient(MONGO_URI);
		await client.connect();
		const db = client.db(DB_NAME);
		const collection = db.collection(COLLECTION_NAME);

		// Check if Calendar ID already exists
		const existingCalendar = await collection.findOne({ calendarId });
		if (existingCalendar) {
			await interaction.reply({
				content: `⚠️ Calendar ID \`${calendarId}\` is already imported.`,
				ephemeral: true,
			});
			await client.close();
			return;
		}

		// Insert new Calendar ID into the database
		await collection.insertOne({ calendarId });

		await interaction.reply({
			content: `✅ Successfully added calendar: \`${calendarId}\``,
			ephemeral: false,
		});

		// Close MongoDB connection
		await client.close();
	}
}
