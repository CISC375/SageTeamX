/* eslint-disable */
import {
	ChatInputCommandInteraction,
	ApplicationCommandOptionType,
	ApplicationCommandStringOptionData,
	StringSelectMenuBuilder,
	ActionRowBuilder,
	ComponentType,
	StringSelectMenuInteraction,
	Embed,
	EmbedBuilder,
} from "discord.js";
import { Command } from "@lib/types/Command";
import "dotenv/config";
import { authorize } from "../../lib/auth";

const path = require("path");
const process = require("process");
const { google } = require("googleapis");

interface Event {
	eventId: string;
	courseID: string;
	instructor: string;
	date: string;
	start: string;
	end: string;
	location: string;
	locationType: string;
}

export default class extends Command {
	name = "tainfo";
	description = "Retrieve TA information for a specific course";

	// Removed typed courseIds for preset ones after entering the /tainfo command
	options: ApplicationCommandStringOptionData[] = [];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
		const TOKEN_PATH = path.join(process.cwd(), "token.json");
		const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

		const classOptions = [
			"CISC106",
			"CISC108",
			"CISC181",
			"CISC210",
			"CISC220",
			"CISC260",
			"CISC275",
		];

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId("class_menu")
			.setPlaceholder("Select Class")
			.addOptions(
				classOptions.map((className) => ({
					label: className,
					value: className,
				}))
			);

		const row =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				selectMenu
			);

		await interaction.reply({
			content: "Please select a class:",
			components: [row],
			ephemeral: true, // Only visible to the user who entered the command
		});

		const filter = (i: StringSelectMenuInteraction) =>
			i.customId === "class_menu" && i.user.id === interaction.user.id;
		const collector = interaction.channel.createMessageComponentCollector({
			filter,
			componentType: ComponentType.StringSelect,
			time: 60000,
		});

		collector.on("collect", async (i: StringSelectMenuInteraction) => {
			const className = i.values[0];

			// Validate class name format
			const classNameRegex = /^cisc\d{3}$/i;
			if (className && !classNameRegex.test(className)) {
				await i.reply({
					content:
						"Invalid class name format. Please select a valid class name.",
					ephemeral: true, // Only visible to the user who entered the command
				});
				return;
			}

			async function listEvents(
				auth,
				interaction: StringSelectMenuInteraction,
				className: string
			) {
				const calendar = google.calendar({ version: "v3", auth });
				const now = new Date();
				const timeMin = now.toISOString();
				const timeMax = new Date(
					now.getTime() + 10 * 24 * 60 * 60 * 1000
				).toISOString();

				try {
					const res = await calendar.events.list({
						calendarId:
							"c_dd28a9977da52689612627d786654e9914d35324f7fcfc928a7aab294a4a7ce3@group.calendar.google.com",
						timeMin,
						timeMax,
						singleEvents: true,
						orderBy: "startTime",
					});

					const events = res.data.items || [];
					if (events.length === 0) {
						await i.editReply(
							`No TAs found for course: **${className}**. Please check back later or contact the instructor.`
						);
						return;
					}

					// Filter events by class name
					const filteredEvents = events.filter((event) => {
						return (
							event.summary &&
							event.summary
								.toLowerCase()
								.includes(className.toLowerCase())
						);
					});

					if (filteredEvents.length === 0) {
						await i.editReply({
							content: `No TAs found for course: **${className}**. Please check back later or contact the instructor.`,
						});
						return;
					}

					// Extract unique event holders
					const eventHolders = Array.from(
						new Set(
							filteredEvents.map((event) => ({
								name: event.summary.split("-")[1]?.trim(),
								email: event.creator?.email,
							}))
						)
					).filter((holder: { name?: string; email?: string }) => holder.name && holder.email);

					if (eventHolders.length === 0) {
						await i.editReply({
							content: `No TAs found for course: **${className}**.`,
						});
						return;
					}

					// Format the list of TAs
					const taInfoList = eventHolders
					.map((holder: { name: string; email: string }) => `**Name:** ${holder.name} **Email:** ${holder.email}`)
					.join("\n\n");

					// Remove duplicates
					const uniqueTaInfoList = Array.from(
						new Set(taInfoList.split("\n\n"))
					).join("\n\n");

					const embed = new EmbedBuilder()
						.setTitle(`TAs for course **${className}**`)
						.setDescription(uniqueTaInfoList)
						.setColor("#0099ff")

					// Send DM with list of TAs
					const dm = await interaction.user.createDM();
					let message;
					try {
						message = await dm.send({ embeds: [embed] });
						await i.editReply({
							content: `I have sent you a DM with the TA information for **${className}**.`,
						});
					} catch (error) {
						console.error("Failed to send DM:", error);
						await interaction.followUp({
							content:
								"⚠️ I couldn't send you a DM. Please check your privacy settings.",
							ephemeral: true,
						});
						return;
					}
				} catch (err) {
					console.error(err);
					await i.editReply("Failed to retrieve information.");
				}
			}

			try {
				await i.deferReply({ ephemeral: true });
				const auth = await authorize(
					TOKEN_PATH,
					SCOPES,
					CREDENTIALS_PATH
				);
				await listEvents(auth, i, className);
			} catch (err) {
				console.error(err);
				await i.editReply("An error occurred.");
			}
		});

		collector.on("end", (collected) => {
			if (collected.size === 0) {
				interaction.editReply({
					content: "No class selected. Please try again.",
					components: [],
				});
			}
		});
	}
}
