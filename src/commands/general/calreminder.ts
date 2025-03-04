import { DB } from '@root/config';
import { Command } from '@root/src/lib/types/Command';
import { Reminder } from '@root/src/lib/types/Reminder';
import { reminderTime } from '@root/src/lib/utils/generalUtils';
import { ApplicationCommandOptionData, ApplicationCommandOptionType, ChatInputCommandInteraction } from 'discord.js';
import parse from 'parse-duration';

export default class extends Command {

	name = 'calreminder';
	description = 'Setup reminders for calendar events';
	options: ApplicationCommandOptionData[] =
	[
		{
			name: 'date',
			description: 'What time would you like to be reminded?',
			type: ApplicationCommandOptionType.String,
			required: true
		},
		{
			name: 'offset',
			description: 'How long in advance',
			type: ApplicationCommandOptionType.String,
			required: false
		}

	];

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		let offset: number;
		const date: string = interaction.options.getString('date');
		const rawOffset: string = interaction.options.getString('offset');
		if (rawOffset) {
			offset = parse(rawOffset);
		}
		const dateNNumber: number = new Date(date).getTime() - offset;
		const remindDate: Date = new Date(dateNNumber);
		const content = 'For Office Hours';
		const repeat: 'daily' | 'weekly' = null;
		const reminder: Reminder = {
			owner: interaction.user.id,
			content,
			mode: 'public',
			expires: remindDate,
			repeat
		};

		interaction.client.mongo.collection(DB.REMINDERS).insertOne(reminder);
		interaction.reply({ content: `I'll remind you about that at ${reminderTime(reminder)}.`, ephemeral: true });
	}

}
