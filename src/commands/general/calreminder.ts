/* eslint-disable */
import { DB } from "@root/config";
import { Command } from "@root/src/lib/types/Command";
import { Reminder } from "@root/src/lib/types/Reminder";
import { reminderTime } from "@root/src/lib/utils/generalUtils";
import {
	ActionRowBuilder,
	ApplicationCommandOptionData,
	ApplicationCommandOptionType,
	ButtonBuilder,
	ButtonStyle,
	ChatInputCommandInteraction,
	ComponentType,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from "discord.js";

const path = require("path");
const process = require("process");
const { google } = require("googleapis");
import parse from "parse-duration";
import { authorize } from "./auth";

export default class extends Command {
	name = "calreminder";
	description = "Setup reminders for calendar events";
	options: ApplicationCommandOptionData[] = [
		{
			name: "classname",
			description: "Course ID",
			type: ApplicationCommandOptionType.String,
			required: true,
		},
	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		// Authorize Google Calendar
		const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
		const TOKEN_PATH = path.join(process.cwd(), "token.json");
		const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
		const auth = await authorize(TOKEN_PATH, SCOPES, CREDENTIALS_PATH);

		// Fetch events
		const now = new Date();
		const timeMin = now.toISOString();
		const timeMax = new Date(
			now.getTime() + 10 * 24 * 60 * 60 * 1000
		).toISOString();
		const calendar = google.calendar({ version: "v3", auth });
		const res = await calendar.events.list({
			calendarId:
				"c_dd28a9977da52689612627d786654e9914d35324f7fcfc928a7aab294a4a7ce3@group.calendar.google.com",
			timeMin,
			timeMax,
			singleEvents: true,
			orderBy: "startTime",
		});

		// Command input
		const className = interaction.options.getString("classname");
		const events = res.data.items || [];

		// Filter events
		const filteredEvents = events.filter((event) =>
			event.summary.toLowerCase().includes(className.toLowerCase())
		);

		if (!filteredEvents.length) {
			await interaction.reply({
				content: "No events found for this class.",
				ephemeral: true,
			});
			return;
		}

		// 1) Event dropdown
		const eventMenu = new StringSelectMenuBuilder()
			.setCustomId("select_event")
			.setPlaceholder("Select an event")
			.setMaxValues(1)
			.addOptions(
				filteredEvents.map((event, index: number) => {
					const label = event.summary;
					const description = `Starts at: ${new Date(
						event.start.dateTime
					).toLocaleString()}`;
					// Stash dateTime plus index
					return new StringSelectMenuOptionBuilder()
						.setLabel(label)
						.setDescription(description)
						.setValue(`${event.start.dateTime}::${index}`);
				})
			);

		// 2) Offset dropdown
		const offsetOptions = [
			{ label: "At event", value: "0" },
			{ label: "10 minutes before", value: "10m" },
			{ label: "30 minutes before", value: "30m" },
			{ label: "1 hour before", value: "1h" },
			{ label: "1 day before", value: "1d" },
		];

		const offsetMenu = new StringSelectMenuBuilder()
			.setCustomId("select_offset")
			.setPlaceholder("Select reminder offset")
			.setMaxValues(1)
			.addOptions(
				offsetOptions.map((opt) =>
					new StringSelectMenuOptionBuilder()
						.setLabel(opt.label)
						.setValue(opt.value)
				)
			);

		// Create action rows for the dropdowns
		const row1 =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				eventMenu
			);
		const row2 =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				offsetMenu
			);

		// Send ephemeral message with both dropdowns
		const replyMessage = await interaction.reply({
			components: [row1, row2],
			ephemeral: true,
		});

		let chosenEvent = null;
		let chosenOffset: number | null = null;
		let activeReminderId: string | null = null;

		// Main collector for event & offset
		const collector = replyMessage.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			time: 60_000,
		});

		collector.on("collect", async (i) => {
			if (i.customId === "select_event") {
				const [eventDateStr, indexStr] = i.values[0].split("::");
				const selectedIndex = parseInt(indexStr);
				chosenEvent = filteredEvents[selectedIndex];
				await i.deferUpdate();
			} else if (i.customId === "select_offset") {
				const rawOffsetStr = i.values[0];
				chosenOffset = rawOffsetStr === "0" ? 0 : parse(rawOffsetStr);
				await i.deferUpdate();
			}

			if (chosenEvent && chosenOffset !== null) {
				const dateObj = new Date(chosenEvent.start.dateTime);
				const remindDate = new Date(dateObj.getTime() - chosenOffset);

				// Check if it's already in the past
				if (remindDate.getTime() <= Date.now()) {
					await i.editReply({
						content:
							"That reminder time is in the past. No reminder was set.",
						components: [],
					});
					collector.stop();
					return;
				}

				// Build more detailed reminder text
				const eventInfo = `${
					chosenEvent.summary
				}\nStarts at: ${dateObj.toLocaleString()}`;

				// Create reminder in DB
				const reminder: Reminder = {
					owner: i.user.id,
					content: eventInfo,
					mode: "public",
					expires: remindDate,
					repeat: null,
				};

				const result = await i.client.mongo
					.collection(DB.REMINDERS)
					.insertOne(reminder);
				activeReminderId = result.insertedId;

				// Build Cancel button row
				const cancelButton = new ButtonBuilder()
					.setCustomId("cancel_reminder")
					.setLabel("Cancel Reminder")
					.setStyle(ButtonStyle.Danger);

				const buttonRow =
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						cancelButton
					);

				// Update ephemeral message with final reminder text + Cancel button
				await i.editReply({
					content: `Your reminder is set!\nI'll remind you at **${reminderTime(
						reminder
					)}** about:\n\`\`\`\n${reminder.content}\n\`\`\``,
					components: [buttonRow],
				});

				collector.stop();
			}
		});

		// Button collector for Cancel
		const buttonCollector = replyMessage.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 300_000, // 5 minutes
		});

		buttonCollector.on("collect", async (btnInt) => {
			if (btnInt.customId === "cancel_reminder") {
				if (activeReminderId) {
					// Remove from DB
					await btnInt.client.mongo
						.collection(DB.REMINDERS)
						.deleteOne({ _id: activeReminderId });
				}

				await btnInt.update({
					content: "Your reminder has been canceled.",
					components: [],
				});

				buttonCollector.stop();
			}
		});
	}
}
