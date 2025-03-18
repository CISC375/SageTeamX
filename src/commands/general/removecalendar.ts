/* eslint-disable */
import {
	ChatInputCommandInteraction,
	PermissionFlagsBits,
	ComponentType,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	ActionRowBuilder,
} from "discord.js";
import { Command } from "@root/src/lib/types/Command";
import { MongoClient } from "mongodb";
import "dotenv/config";

// MongoDB Connection Settings
const MONGO_URI = process.env.DB_CONN_STRING || "";
const DB_NAME = "CalendarDatabase";
const COLLECTION_NAME = "calendarIds";

export default class extends Command {
	name = "removecalendar";
	description = "Removes a Google Calendar from tracking (Admin only)";

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

		// Connect to MongoDB
		const client = new MongoClient(MONGO_URI);
		await client.connect();
		const db = client.db(DB_NAME);
		const collection = db.collection(COLLECTION_NAME);

		// Fetch all stored calendars
		const calendarDocs = await collection.find().toArray();

		// If no calendars are stored
		if (calendarDocs.length === 0) {
			await interaction.reply({
				content: "⚠️ There are no imported calendars to remove.",
				ephemeral: true,
			});
			await client.close();
			return;
		}

		// Create a dropdown menu to select which calendar to remove
		const menu = new StringSelectMenuBuilder()
			.setCustomId("select_calendar_to_remove")
			.setPlaceholder("Select a calendar to remove")
			.addOptions(
				calendarDocs.map((doc) =>
					new StringSelectMenuOptionBuilder()
						.setLabel(doc.calendarName)
						.setValue(doc.calendarId)
				)
			);

		// Create action row for the dropdown
		const row =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

		// Send the dropdown to the user
		const replyMessage = await interaction.reply({
			content: "**Select a calendar to remove:**",
			components: [row],
			ephemeral: true,
		});

		// Collector for dropdown interaction
		const collector = replyMessage.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			time: 60000, // 60 seconds
		});

		collector.on("collect", async (i) => {
			if (i.user.id !== interaction.user.id) return; // Ignore others

			const selectedCalendarId = i.values[0];

			// Remove from MongoDB
			await collection.deleteOne({ calendarId: selectedCalendarId });

			// Send confirmation message
			await i.update({
				content: `✅ Successfully removed the calendar: **${
					calendarDocs.find(
						(doc) => doc.calendarId === selectedCalendarId
					)?.calendarName
				}** (\`${selectedCalendarId}\`).`,
				components: [],
			});

			await client.close();
		});

		// Collector timeout
		collector.on("end", async (collected, reason) => {
			if (reason === "time") {
				await interaction.editReply({
					content:
						"⏳ Time expired. Please run `/removecalendar` again.",
					components: [],
				});
			}
		});
	}
}
