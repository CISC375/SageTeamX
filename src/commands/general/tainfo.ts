import {
	ChatInputCommandInteraction,
	ApplicationCommandStringOptionData,
	StringSelectMenuInteraction,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	DMChannel
} from 'discord.js';
import { Command } from '@lib/types/Command';
import 'dotenv/config';
import { retrieveEvents } from '../../lib/auth';
import { PagifiedSelectMenu } from '@root/src/lib/types/PagifiedSelect';

const EMAIL_REGEX = /Email:\s*([^\s]+)/i;
const CALENDAR_ID
	= 'c_dd28a9977da52689612627d786654e9914d35324f7fcfc928a7aab294a4a7ce3@group.calendar.google.com';
const EXPIRATION_TIME = 5 * 60 * 1000; // 5 minutes
const NUM_ENTRIES_PER_PAGE = 5;

// Function to chunk an array into smaller ones; used for pagination
function chunk<T>(arr: T[], size: number): T[][] {
	const pages: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		pages.push(arr.slice(i, i + size));
	}
	return pages;
}

export default class extends Command {

	name = 'tainfo';
	description = 'Retrieve TA information for a specific course';
	options: ApplicationCommandStringOptionData[] = [];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		const classOptions = [
			'CISC106',
			'CISC108',
			'CISC181',
			'CISC210',
			'CISC220',
			'CISC260',
			'CISC275'
		];

		const classMenu = new PagifiedSelectMenu();
		classMenu.createSelectMenu({
			customId: 'class_menu',
			placeHolder: 'Select Class'
		});
		classOptions.forEach((opt) =>
			classMenu.addOption({ label: opt, value: opt })
		);

		const collectorLogic = async (i: StringSelectMenuInteraction) => {
			if (i.user.id !== interaction.user.id) return;

			const className = i.values[0];
			if (!/^cisc\d{3}$/i.test(className)) {
				return i.reply({
					content: 'Invalid class name format.',
					ephemeral: true
				});
			}

			await i.deferReply({ ephemeral: true });

			try {
				const events = await retrieveEvents(CALENDAR_ID, interaction);

				const taSet = new Set<string>();
				for (const ev of events) {
					if (
						!ev.summary
							?.toLowerCase()
							.includes(className.toLowerCase())
					) {
						continue;
					}
					const name = ev.summary.split('-')[1]?.trim();
					if (!name) continue;
					const email
						= ev.description?.match(EMAIL_REGEX)?.[1]
						|| ev.creator?.email;
					if (!email) continue;
					taSet.add(`**Name:** ${name}  **Email:** ${email}`);
				}

				if (!taSet.size) {
					return i.editReply({
						content: `No TAs found for course **${className}**.`
					});
				}

				const taData = Array.from(taSet).map((line) => {
					const [rawName, rawEmail] = line
						.replace(/\*\*/g, '') // remove all asterisks for plain text
						.split('  ');
					return {
						name: rawName.replace(/^Name:\s*/, '').trim(),
						email: rawEmail.replace(/^Email:\s*/, '').trim()
					};
				});

				const pages = chunk(taData, NUM_ENTRIES_PER_PAGE);
				let pageIndex = 0;

				const makeEmbed = (page: number) => {
					const embed = new EmbedBuilder()
						.setTitle(
							`TAs for **${className}** (page ${page + 1}/${
								pages.length
							})`
						)
						.setColor('#0099ff');

					pages[page].forEach((ta) =>
						embed.addFields(
							{ name: 'Name', value: ta.name, inline: true },
							{ name: 'Email', value: ta.email, inline: true },
							// Spacer for new line
							{ name: '\u200b', value: '\u200b', inline: true }
						)
					);

					return embed;
				};

				const makeRow = () =>
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setCustomId('prev')
							.setLabel('⬅ Previous')
							.setStyle(ButtonStyle.Secondary)
							.setDisabled(pageIndex === 0),
						new ButtonBuilder()
							.setCustomId('next')
							.setLabel('Next ➡')
							.setStyle(ButtonStyle.Secondary)
							.setDisabled(pageIndex === pages.length - 1),
						new ButtonBuilder()
							.setCustomId('close')
							.setLabel('Close ✖️')
							.setStyle(ButtonStyle.Danger)
					);

				const dmChannel
					= (await interaction.user.createDM()) as DMChannel;
				const listMessage = await dmChannel.send({
					embeds: [makeEmbed(pageIndex)],
					components: [makeRow()]
				});

				await i.editReply({
					content: `I’ve sent you a DM with the TA info for **${className}**!`
				});

				const dmCollector = listMessage.createMessageComponentCollector(
					{
						componentType: ComponentType.Button,
						time: EXPIRATION_TIME,
						filter: (btnInt) =>
							btnInt.user.id === interaction.user.id
					}
				);

				dmCollector.on('collect', async (btn) => {
					if (
						btn.customId === 'next'
						&& pageIndex < pages.length - 1
					) {
						pageIndex++;
						return btn.update({
							embeds: [makeEmbed(pageIndex)],
							components: [makeRow()]
						});
					} else if (btn.customId === 'prev' && pageIndex > 0) {
						pageIndex--;
						return btn.update({
							embeds: [makeEmbed(pageIndex)],
							components: [makeRow()]
						});
					} else if (btn.customId === 'close') {
						await btn.update({
							components: []
						});
						return dmCollector.stop();
					}
					return btn.deferUpdate();
				});

				dmCollector.on('end', async () => {
					await listMessage.edit({
						components: [
							new ActionRowBuilder<ButtonBuilder>().addComponents(
								new ButtonBuilder()
									.setCustomId('prev')
									.setLabel('⬅ Previous')
									.setStyle(ButtonStyle.Primary)
									.setDisabled(true),
								new ButtonBuilder()
									.setCustomId('next')
									.setLabel('Next ➡')
									.setStyle(ButtonStyle.Primary)
									.setDisabled(true),
								new ButtonBuilder()
									.setCustomId('close')
									.setLabel('Close ✖️')
									.setStyle(ButtonStyle.Danger)
									.setDisabled(true)
							)
						]
					});
				});
			} catch (err) {
				console.error(err);
				await i.editReply('Failed to retrieve information.');
			}
		};

		classMenu.generateRowsAndSendMenu(
			collectorLogic,
			interaction,
			null,
			'Please select a class:'
		);
	}

}
