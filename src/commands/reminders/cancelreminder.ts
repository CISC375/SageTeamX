import { Reminder } from '@lib/types/Reminder';
import { DB } from '@root/config';
import { ApplicationCommandOptionData, ApplicationCommandOptionType, ChatInputCommandInteraction, InteractionResponse } from 'discord.js';
import { Command } from '@lib/types/Command';
import { generateErrorEmbed } from '@root/src/lib/utils/generalUtils';

/**
 * A command that allows a user to cancel one of their pending reminders
 * using the ID from the /viewreminders command.
 */
export default class extends Command {

	description = 'Cancel any pending reminders you may have.';
	extendedHelp = 'You can only cancel one reminder at a time';

	options: ApplicationCommandOptionData[] = [
		{
			name: 'remindernumber',
			type: ApplicationCommandOptionType.Integer,
			required: true,
			description: 'ID of the reminder to cancel'
		}
	]

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		try {
			const reminderNumInput = interaction.options.getInteger('remindernumber');
			// User sees a 1-based list, so we subtract 1 for the 0-based array index
			const reminderIndex = reminderNumInput - 1;

			// Get all of the user's reminders from the DB
			const reminders: Array<Reminder> = await interaction.client.mongo.collection(DB.REMINDERS)
				.find({ owner: interaction.user.id }).toArray();

			// Sort them by expiration to match the /viewreminders command order
			reminders.sort((a, b) => a.expires.valueOf() - b.expires.valueOf());

			const reminder = reminders[reminderIndex];

			// Check if the reminder exists
			if (!reminder) {
				// Use the original user input in the error for clarity
				return interaction.reply({
					content: `I couldn't find reminder **${reminderNumInput}**. Use the \`/viewreminders\` command to see your current reminders.`,
					ephemeral: true
				});
			}

			// Delete the reminder from the database
			await interaction.client.mongo.collection(DB.REMINDERS).findOneAndDelete(reminder);

			const hidden = reminder.mode === 'private';
			return interaction.reply({
				content: `Canceled reminder: **${reminder.content}**`,
				ephemeral: hidden
			});
		} catch (error) {
			// Catch any unexpected errors (e.g., database failure)
			console.error(`[cancelreminder] Error: ${error}`);
			return interaction.reply({
				embeds: [generateErrorEmbed('Sorry, I couldn\'t cancel your reminder. Please try again later.')],
				ephemeral: true
			});
		}
	}

}
