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
import { PagifiedSelectMenu } from '@root/src/lib/utils/calendarUtils';

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
		async function generateMessage(filteredEvents, eventMenu: PagifiedSelectMenu, offsetMenu: PagifiedSelectMenu) {
			// 1) Event dropdown
			eventMenu.createSelectMenu({customId: 'select_event', placeHolder: 'Select an event', minimumValues: 1});
			filteredEvents.forEach((event, index) => {
				eventMenu.addOption(
					{
						label: event.summary, 
						value: `${event.start.dateTime}::${index}`,
						description: `Starts at: ${new Date(event.start.dateTime).toLocaleString()}`
					}
				)
			});
			const eventMenuRows = eventMenu.generateActionRows();

			// 2) Offset dropdown
			const offsetOptions = [
				{ label: "At event", value: "0" },
				{ label: "10 minutes before", value: "10m" },
				{ label: "30 minutes before", value: "30m" },
				{ label: "1 hour before", value: "1h" },
				{ label: "1 day before", value: "1d" },
			];

			offsetMenu.createSelectMenu({customId: 'select_offset', placeHolder: 'Select reminder offset', maximumValues: 1});
			offsetOptions.forEach((option) => {
				offsetMenu.addOption(
					{
						label: option.label,
						value: option.value
					}
				)
			});
			const offsetMenuRows = offsetMenu.generateActionRows();

			// 3) Set Reminder button
			const setReminder = new ButtonBuilder()
				.setCustomId("set_reminder")
				.setLabel("Set Reminder")
				.setStyle(ButtonStyle.Success);

			// Create action row for set reminder button
			const setReminderRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
				setReminder
			);

			return [...eventMenuRows, ...offsetMenuRows, setReminderRow];
		}
		// Authorize Google Calendar
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

		const eventMenu = new PagifiedSelectMenu();
		const offsetMenu = new PagifiedSelectMenu();

		// Send ephemeral message with both dropdowns
		const initalComponents = await generateMessage(filteredEvents, eventMenu, offsetMenu);
		const replyMessage = await interaction.reply({
			components: initalComponents,
			ephemeral: true
		})

		let chosenEvent = null;
		let chosenOffset: number | null = null;
		let activeReminderId: string | null = null;

		// Main collector for event & offset
		const collector = replyMessage.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			time: 60_000,
		});

		collector.on("collect", async (i) => {
			if (i.customId === 'select_event') {
				const [eventDateStr, indexStr] = i.values[0].split("::");
				const selectedIndex = parseInt(indexStr);
				chosenEvent = filteredEvents[selectedIndex];
				await i.deferUpdate();
			}
			else if (i.customId === "select_offset") {
				const rawOffsetStr = i.values[0];
				chosenOffset = rawOffsetStr === "0" ? 0 : parse(rawOffsetStr);
				if (isNaN(chosenOffset)) {
					await i.reply({
						content:
							"⚠️ Invalid reminder offset selected. Please try again.",
						ephemeral: true,
					});
					return;
				}
				await i.deferUpdate();
			}
		});

		// Button collector for Cancel and Set Reminder
		const buttonCollector = replyMessage.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 300_000, // 5 minutes
		});

		buttonCollector.on("collect", async (btnInt) => {
			if (btnInt.customId === "set_reminder") {
				await btnInt.deferUpdate();
				if (chosenEvent && chosenEvent !== null) {
					const dateObj = new Date(chosenEvent.start.dateTime);
	
					// Create reminder time in local time
					const remindDate = new Date(
						dateObj.getTime() - chosenOffset
					);

					// Force it to UTC by re-parsing the ISO string
					const utcRemindDate = new Date(remindDate.toISOString());

					// Check if it's already in the past
					if (utcRemindDate.getTime() <= Date.now()) {
						await btnInt.editReply({
							content:
								"That reminder time is in the past. No reminder was set.",
							components: [],
						});
						collector.stop();
						buttonCollector.stop;
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
						expires: utcRemindDate,
						repeat: null,
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
						content: `Your reminder is set!\nI'll remind you at **${reminderTime(
							reminder
						)}** about:\n\`\`\`\n${reminder.content}\n\`\`\``,
						components: [buttonRow],
					});

					collector.stop();
				}
			} else if (btnInt.customId === "cancel_reminder") {
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
