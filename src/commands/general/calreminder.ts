import { DB } from '@root/config';
import { Command } from '@root/src/lib/types/Command';
import { Reminder } from '@root/src/lib/types/Reminder';
import { reminderTime } from '@root/src/lib/utils/generalUtils';
import { ApplicationCommandOptionData, ApplicationCommandOptionType, ChatInputCommandInteraction } from 'discord.js';

export default class extends Command {

	name = 'calreminder';
	description = 'Setup reminders for calendar events';
	options: ApplicationCommandOptionData[] =
	[
		{
			name: 'time',
			description: 'What time would you like to be reminded?',
			type: ApplicationCommandOptionType.String,
			required: true
		}

	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		const rawDuration: string = interaction.options.getString('time');
		const duration: Date = new Date(rawDuration);
		const content = 'For Office Hours';
		const repeat: 'daily' | 'weekly' = null;
		const reminder: Reminder = {
			owner: interaction.user.id,
			content,
			mode: 'public', // temporary
			expires: duration,
			repeat
		};
		interaction.client.mongo.collection(DB.REMINDERS).insertOne(reminder);
		interaction.reply({ content: `I'll remind you about that at ${reminderTime(reminder)}.`, ephemeral: true });
	}

}
