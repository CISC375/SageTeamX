import { Command } from '@root/src/lib/types/Command';
import { ChatInputCommandInteraction } from 'discord.js';

export default class extends Command {

	name = 'calreminder';
	description = 'Setup reminders from calendar events';

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.reply({
			content: 'This is a test',
			ephemeral: true
		});
	}

}
