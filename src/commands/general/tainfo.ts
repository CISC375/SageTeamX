/* eslint-disable */
import {
	ChatInputCommandInteraction,
	ApplicationCommandStringOptionData,
	StringSelectMenuInteraction,
	EmbedBuilder,
	Message,
} from "discord.js";
import { Command } from "@lib/types/Command";
import "dotenv/config";
import { retrieveEvents } from "../../lib/auth";
import { PagifiedSelectMenu } from '@root/src/lib/types/PagifiedSelect';

export default class extends Command {
	name = "tainfo";
	description = "Retrieve TA information for a specific course";

	// Removed typed courseIds for preset ones after entering the /tainfo command
	options: ApplicationCommandStringOptionData[] = [];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		const classOptions = [
			"CISC106",
			"CISC108",
			"CISC181",
			"CISC210",
			"CISC220",
			"CISC260",
			"CISC275"
		];

		const taSelectMenu = new PagifiedSelectMenu();
		taSelectMenu.createSelectMenu({customId: "class_menu", placeHolder: 'Select Class'});
		classOptions.forEach((option) => {
			taSelectMenu.addOption({label: option, value: option});
		});

		const collectorLogic = async (i: StringSelectMenuInteraction) => {
			if (i.user.id === interaction.user.id) {
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
					className: string
				) {
					try {
						const events = await retrieveEvents("c_dd28a9977da52689612627d786654e9914d35324f7fcfc928a7aab294a4a7ce3@group.calendar.google.com", interaction);

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
								filteredEvents.map((event) => {
									// Extract email from the description if it exists
									let emailFromDescription: string | undefined;
									if (event.description) {
										const emailMatch = event.description.match(/Email:\s*([^\s]+)/i);
										if (emailMatch) {
											emailFromDescription = emailMatch[1];
										}
									}
						
									// Use email from description if found, otherwise fallback to creator's email
									return {
										name: event.summary.split("-")[1]?.trim(),
										email: emailFromDescription || event.creator?.email,
									};
								})
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
						let message: Message<false>;
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
					await listEvents(className);
				} catch (err) {
					console.error(err);
					await i.editReply("An error occurred.");
				}
			}
		}

		taSelectMenu.generateRowsAndSendMenu(collectorLogic, interaction, null, "Please select a class:");
	}
}
