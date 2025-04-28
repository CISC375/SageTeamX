import { DB } from "@root/config";
import { Command } from "@root/src/lib/types/Command";
import { Reminder } from "@root/src/lib/types/Reminder";
import {
	ActionRowBuilder,
	ApplicationCommandOptionData,
	ApplicationCommandOptionType,
	ButtonBuilder,
	ButtonStyle,
	ChatInputCommandInteraction,
	ComponentType,
} from "discord.js";
import parse from "parse-duration";
import { PagifiedSelectMenu } from "@root/src/lib/utils/calendarUtils";
import { retrieveEvents } from "@root/src/lib/auth";
import { calendar_v3 } from "googleapis";
import { MongoClient } from "mongodb";
const MONGO_URI = process.env.DB_CONN_STRING || "";

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
		let eventMenu: PagifiedSelectMenu;
		let offsetMenu: PagifiedSelectMenu;

		function generateMessage(
			repeatInterval: "every_event" | null,
			chosenEvent?: calendar_v3.Schema$Event,
			chosenOffset?: number,
			renderMenus = false,
			eventCurrentPage = 0,
			offsetCurrentPage = 0
		) {
			if (renderMenus) {
				eventMenu = new PagifiedSelectMenu();
				eventMenu.createSelectMenu({
					customId: "select_event",
					placeHolder: "Select an event",
					minimumValues: 1,
					maximumValues: 1,
				});
				let defaultSet = false;

				filteredEvents.forEach((event, index) => {
					if (!event.start?.dateTime) return;

					const isDefault =
						!defaultSet &&
						chosenEvent?.start?.dateTime === event.start?.dateTime;

					if (isDefault) defaultSet = true;

					eventMenu.addOption({
						label: event.summary,
						value: `${event.start.dateTime}::${index}`,
						description: `Starts at: ${new Date(
							event.start.dateTime
						).toLocaleString()}`,
						default: isDefault,
					});
				});

				eventMenu.currentPage = eventCurrentPage;

				// Create offset select menu
				const offsetOptions = [
					{ label: "At event", value: "0" },
					{ label: "10 minutes before", value: "10m" },
					{ label: "30 minutes before", value: "30m" },
					{ label: "1 hour before", value: "1h" },
					{ label: "1 day before", value: "1d" },
				];

				offsetMenu = new PagifiedSelectMenu();
				offsetMenu.createSelectMenu({
					customId: "select_offset",
					placeHolder: "Select reminder offset",
					minimumValues: 1,
					maximumValues: 1,
				});

				let offsetDefaultSet = false;

				offsetOptions.forEach((option) => {
					const isDefault =
						!offsetDefaultSet &&
						chosenOffset === parse(option.value);
					if (isDefault) offsetDefaultSet = true;

					offsetMenu.addOption({
						label: option.label,
						value: option.value,
						default: isDefault,
					});
				});

				offsetMenu.currentPage = offsetCurrentPage;
			}

			// 1) Generate event menu row(s)
			const eventMenuRows = eventMenu.generateActionRows();

			// 2) Generate offset menu row(s)
			const offsetMenuRows = offsetMenu.generateActionRows();

			// 3) Generate repeat button
			const toggleRepeatButton = new ButtonBuilder()
				.setCustomId("toggle_repeat")
				.setLabel(
					repeatInterval === "every_event"
						? "Repeat: On"
						: "Repeat: Off"
				)
				.setStyle(ButtonStyle.Secondary);

			// 4) Generate set reminder button
			const setReminder = new ButtonBuilder()
				.setCustomId("set_reminder")
				.setLabel("Set Reminder")
				.setStyle(ButtonStyle.Success);

			const setReminderAndRepeatRow =
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					toggleRepeatButton,
					setReminder
				);

			return [
				...eventMenuRows,
				...offsetMenuRows,
				setReminderAndRepeatRow,
			];
		}

		const courseCode = interaction.options
			.getString("classname")
			?.toUpperCase();

		if (!courseCode) {
			await interaction.reply({
				content: "❗ You must specify a class name.",
				ephemeral: true,
			});
			return;
		}

		// Lookup calendar from MongoDB
		let calendar: { calendarId: string; calendarName: string };
		try {
			const client = new MongoClient(MONGO_URI, {
				useUnifiedTopology: true,
			});
			await client.connect();

			const db = client.db("CalendarDatabase");
			const collection = db.collection("calendarIds");

			const calendarInDB = await collection.findOne({
				calendarName: { $regex: `^${courseCode}$`, $options: "i" },
			});

			await client.close();

			if (!calendarInDB) {
				await interaction.reply({
					content: `⚠️ There are no matching calendars with course code **${courseCode}**.`,
					ephemeral: true,
				});
				return;
			}

			calendar = {
				calendarId: calendarInDB.calendarId,
				calendarName: calendarInDB.calendarName,
			};
		} catch (error) {
			console.error("Calendar lookup failed:", error);
			await interaction.reply({
				content: `❌ Database error while fetching calendar for **${courseCode}**.`,
				ephemeral: true,
			});
			return;
		}

		// Retrieve events
		const events = await retrieveEvents(calendar.calendarId, interaction);

		if (!events || events.length === 0) {
			await interaction.reply({
				content:
					"⚠️ Failed to fetch calendar events or no events found.",
				ephemeral: true,
			});
			return;
		}

		const filteredEvents = events; // no filtering needed since each calendar is specific to a course

		let chosenEvent: calendar_v3.Schema$Event = null;
		let chosenOffset: number = null;
		let repeatInterval: "every_event" = null;
		let activeReminderId: string = null;

		const initialComponents = generateMessage(
			repeatInterval,
			chosenEvent,
			chosenOffset,
			true
		);
		if (chosenOffset === null) {
			chosenOffset = 0;
		}

		const replyMessage = await interaction.reply({
			components: initialComponents,
			ephemeral: true,
		});

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

				const updatedComponents = generateMessage(
					repeatInterval,
					chosenEvent,
					chosenOffset,
					true,
					eventMenu.currentPage,
					offsetMenu.currentPage
				);

				await btnInt.update({
					components: updatedComponents,
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
				const EXPIRE_BUFFER_MS = 180 * 24 * 60 * 60 * 1000; // 180 days in ms

				const reminder: Reminder = {
					owner: btnInt.user.id,
					content: eventInfo,
					mode: "public",
					expires: repeatInterval
						? new Date(remindDate.getTime() + EXPIRE_BUFFER_MS) // give repeat reminders more time
						: remindDate, // one-time reminders
					repeat: repeatInterval,
				};

				let result;
				try {
					result = await btnInt.client.mongo
						.collection(DB.REMINDERS)
						.insertOne(reminder);
					activeReminderId = result.insertedId;
				} catch (err) {
					console.error("Failed to insert reminder:", err);
					await btnInt.editReply({
						content:
							"❌ Failed to save reminder. Please try again later.",
						components: [],
					});
					buttonCollector.stop();
					return;
				}

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
					content: `✅ Your reminder is set!\nI'll remind you at **${remindDate.toLocaleString()}** about:\n\`\`\`\n${
						reminder.content
					}\n\`\`\`${
						repeatInterval
							? `\n🔁 Repeats every event (for up to 180 days)
`
							: ""
					}`,
					components: [buttonRow],
				});
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

			const actions: Record<string, () => void> = {
				"next_button:select_event": () => eventMenu.currentPage++,
				"prev_button:select_event": () => eventMenu.currentPage--,
				"next_button:select_offset": () => offsetMenu.currentPage++,
				"prev_button:select_offset": () => offsetMenu.currentPage--,
			};
			const action = actions[btnInt.customId];

			if (action) {
				await btnInt.deferUpdate();
				action();

				const newRows = generateMessage(
					repeatInterval,
					chosenEvent,
					chosenOffset,
					true, // ← force menus to regenerate
					eventMenu.currentPage, // ← keep the event page
					offsetMenu.currentPage // ← keep the offset page
				);
				await btnInt.editReply({ components: newRows });
			}
		});
	}
}
