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
import { authorize } from "../../lib/auth";

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
		const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
		const TOKEN_PATH = path.join(process.cwd(), "token.json");
		const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
		let auth;
		try {
			auth = await authorize(TOKEN_PATH, SCOPES, CREDENTIALS_PATH);
		} catch (error) {
			console.error("Google Calendar Authorization Error:", error);
			await interaction.reply({
				content:
					"⚠️ Failed to authenticate with Google Calendar. Please try again later.",
				ephemeral: true,
			});
			return;
		}
		// Fetch events
		const now = new Date();
		const timeMin = now.toISOString();
		const timeMax = new Date(
			now.getTime() + 10 * 24 * 60 * 60 * 1000
		).toISOString();
		const calendar = google.calendar({ version: "v3", auth });
		let res;
		try {
			res = await calendar.events.list({
				calendarId:
					"c_dd28a9977da52689612627d786654e9914d35324f7fcfc928a7aab294a4a7ce3@group.calendar.google.com",
				timeMin,
				timeMax,
				singleEvents: true,
				orderBy: "startTime",
			});
		} catch (error) {
			console.error("Google Calendar API Error:", error);
			await interaction.reply({
				content:
					"⚠️ Failed to retrieve calendar events. Please try again later.",
				ephemeral: true,
			});
			return;
		}

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

		// Needed to rebuild dropdowns after clicking repeat (weird Discord UI clears the dropdowns)
		function buildEventDropdown(
			filteredEvents: any[],
			chosenEvent: any
		): StringSelectMenuBuilder {
			return new StringSelectMenuBuilder()
				.setCustomId("select_event")
				.setPlaceholder("Select an event")
				.setMaxValues(1)
				.addOptions(
					filteredEvents.slice(0, 25).map((event, index) => {
						const label = event.summary;
						const description = `Starts at: ${new Date(
							event.start.dateTime
						).toLocaleString()}`;
						const value = `${event.start.dateTime}::${index}`;
						const option = new StringSelectMenuOptionBuilder()
							.setLabel(label)
							.setDescription(description)
							.setValue(value);

						if (
							chosenEvent &&
							chosenEvent.start.dateTime === event.start.dateTime
						) {
							option.setDefault(true);
						}

						return option;
					})
				);
		}

		function buildOffsetDropdown(
			offsetOptions: { label: string; value: string }[],
			chosenOffset: number | null
		): StringSelectMenuBuilder {
			return new StringSelectMenuBuilder()
				.setCustomId("select_offset")
				.setPlaceholder("Select reminder offset")
				.setMaxValues(1)
				.addOptions(
					offsetOptions.map((opt) => {
						const option = new StringSelectMenuOptionBuilder()
							.setLabel(opt.label)
							.setValue(opt.value);

						if (
							chosenOffset !== null &&
							(opt.value === "0"
								? chosenOffset === 0
								: parse(opt.value) === chosenOffset)
						) {
							option.setDefault(true);
						}

						return option;
					})
				);
		}

		// 1) Event dropdown
		const eventMenu = new StringSelectMenuBuilder()
			.setCustomId("select_event")
			.setPlaceholder("Select an event")
			.setMaxValues(1)
			.addOptions(
				filteredEvents.slice(0, 25).map((event, index: number) => {
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

		const toggleRepeatButton = new ButtonBuilder()
			.setCustomId("toggle_repeat")
			.setLabel("Repeat: Off")
			.setStyle(ButtonStyle.Secondary);

		// 3) Set Reminder button
		const setReminder = new ButtonBuilder()
			.setCustomId("set_reminder")
			.setLabel("Set Reminder")
			.setStyle(ButtonStyle.Success);

		// Create action rows for the dropdowns
		const row1 =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				eventMenu
			);
		const row2 =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				offsetMenu
			);
		const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
			toggleRepeatButton,
			setReminder
		);

		// Send ephemeral message with both dropdowns
		const replyMessage = await interaction.reply({
			components: [row1, row2, row3],
			ephemeral: true,
		});

		let chosenEvent = null;
		let chosenOffset: number | null = null;
		let repeatInterval: "every_event" | null = null;
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
		});

		// Button collector for Cancel and Set Reminder
		const buttonCollector = replyMessage.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 300_000, // 5 minutes
		});

		buttonCollector.on("collect", async (btnInt) => {
			if (btnInt.customId === "toggle_repeat") {
				repeatInterval = repeatInterval ? null : "every_event";
				const newLabel = repeatInterval ? "Repeat: On" : "Repeat: Off";

				const updatedRow1 =
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						buildEventDropdown(filteredEvents, chosenEvent)
					);

				const updatedRow2 =
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						buildOffsetDropdown(offsetOptions, chosenOffset)
					);

				const updatedRow3 =
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setCustomId("toggle_repeat")
							.setLabel(newLabel)
							.setStyle(ButtonStyle.Secondary),
						setReminder
					);

				await btnInt.update({
					components: [updatedRow1, updatedRow2, updatedRow3],
				});
			} else if (btnInt.customId === "set_reminder") {
				// If user hasn’t selected both fields, just silently acknowledge
				if (!chosenEvent || chosenOffset === null) {
					if (!btnInt.deferred && !btnInt.replied) {
						await btnInt.deferUpdate(); // Prevent "interaction failed"
					}
					return;
				}

				// Everything is valid, continue with reminder setup
				await btnInt.deferUpdate();

				const dateObj = new Date(chosenEvent.start.dateTime);
				const remindDate = new Date(dateObj.getTime() - chosenOffset);

				// Check if it's already in the past
				if (remindDate.getTime() <= Date.now()) {
					await btnInt.editReply({
						content:
							"⏰ That reminder time is in the past. No reminder was set.",
						components: [],
					});
					collector.stop();
					buttonCollector.stop();
					return;
				}

				// Build more detailed reminder text
				const eventInfo = `${
					chosenEvent.summary
				}\nStarts at: ${dateObj.toLocaleString()}`;

				// Create reminder in DB
				const reminder: Reminder = {
					owner: btnInt.user.id,
					content: eventInfo,
					mode: "public",
					expires: remindDate,
					repeat: repeatInterval,
				};

				const result = await btnInt.client.mongo
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
				await btnInt.editReply({
					content: `✅ Your reminder is set!\nI'll remind you at **${reminderTime(
						reminder
					)}** about:\n\`\`\`\n${reminder.content}\n\`\`\`${
						repeatInterval ? `\n🔁 Repeats every event` : ""
					}`,
					components: [buttonRow],
				});

				// collector.stop();
				// buttonCollector.stop();
			} else if (btnInt.customId === "cancel_reminder") {
				try {
					// 1) Defer *a new reply* (ephemeral)
					if (!btnInt.deferred && !btnInt.replied) {
						await btnInt.deferReply({ ephemeral: true });
					}

					// 2) Delete the reminder from DB if it exists
					if (activeReminderId) {
						await btnInt.client.mongo
							.collection(DB.REMINDERS)
							.deleteOne({ _id: activeReminderId });
					}

					// 3) Send brand new ephemeral follow-up
					await btnInt.followUp({
						content: "❌ Your reminder has been canceled.",
						ephemeral: true,
					});

					// 4) Stop the collector
					buttonCollector.stop();
				} catch (err) {
					console.error("Failed to cancel reminder:", err);
				}
			}
		});
	}
}
