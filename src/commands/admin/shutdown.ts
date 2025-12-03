import { BOT } from '@root/config';
import { BOTMASTER_PERMS } from '@lib/permissions';
import { ApplicationCommandOptionData, ApplicationCommandOptionType, ApplicationCommandPermissions, ChatInputCommandInteraction, InteractionResponse } from 'discord.js';
import { Command } from '@lib/types/Command';

export default class extends Command {

	description = `Shutdown ${BOT.NAME}. The bot will have to be restarted manually from the terminal.`;
	permissions: ApplicationCommandPermissions[] = BOTMASTER_PERMS;

	options: ApplicationCommandOptionData[] = [
		{
			name: 'confirm',
			description: `Confirm the shutdown by typing the bot's name: "${BOT.NAME}"`,
			type: ApplicationCommandOptionType.String,
			required: true
		}
	];

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const confirm = interaction.options.getString('confirm');

		if (confirm !== BOT.NAME) {
			return interaction.reply({ content: `Incorrect phrase. Type ('${BOT.NAME}') to confirm the shutdown.`, ephemeral: true });
		}

		await interaction.reply({ content: `Shutting down ${BOT.NAME}`, ephemeral: true });
		await interaction.client.user.setPresence({ status: 'invisible' });
		interaction.client.destroy();
		process.exit(0);
	}

}