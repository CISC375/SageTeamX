/**
 *Creates announcement in specified channel or the announcement channel if no valid channel is given
 Does not ping users unless certain keywords are used in announcement
 @everyone will cause every user in server to be pinged
 @here will cause every user online at the moment to be pinged
 @/role will ping every user with that role in the server
 */
import { BOTMASTER_PERMS } from '@lib/permissions';
import { TextChannel, ApplicationCommandPermissions, ChatInputCommandInteraction, ApplicationCommandOptionData, ModalBuilder, ActionRowBuilder,
	ModalActionRowComponentBuilder, InteractionResponse, TextInputBuilder, TextInputStyle, ApplicationCommandOptionType } from 'discord.js';
import { CHANNELS } from '@root/config';
import { Command } from '@lib/types/Command';

export default class extends Command {

	description = 'Sends an announcement from Sage to a specified channel or announcements if no channel is given.';
	permissions: ApplicationCommandPermissions[] = BOTMASTER_PERMS;

	options: ApplicationCommandOptionData[] = [{
		name: 'channel',
		description: 'The channel to send the announcement in',
		type: ApplicationCommandOptionType.Channel,
		required: true
	},
	{
		name: 'file',
		description: 'A file to be posted with the announcement',
		type: ApplicationCommandOptionType.Attachment,
		required: false
	}]

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const announceChannel = interaction.guild.channels.cache.get(CHANNELS.ANNOUNCEMENTS);
		const channelOption = interaction.options.getChannel('channel');
		const file = interaction.options.getAttachment('file');

		const channel = (channelOption || announceChannel) as TextChannel;

		const modal = new ModalBuilder()
			.setTitle('Announce')
			.setCustomId('announce');

		const contentsComponent = new TextInputBuilder()
			.setCustomId('content')
			.setLabel('Content to send with this announcement')
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true);

		const channelComponent = new TextInputBuilder()
			.setCustomId('channel')
			.setLabel('ID of receiving channel (auto-filled)')
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setValue(channel.id);

		const fileComponent = new TextInputBuilder()
			.setCustomId('file')
			.setLabel('URL to attached file (auto-filled)')
			.setStyle(TextInputStyle.Short)
			.setRequired(false)
			.setValue(file ? file.url : '');

		const modalRows: ActionRowBuilder<ModalActionRowComponentBuilder>[] = [
			new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(contentsComponent),
			new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(channelComponent),
			new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(fileComponent)
		];
		modal.addComponents(...modalRows);

		await interaction.showModal(modal);
	}

}
