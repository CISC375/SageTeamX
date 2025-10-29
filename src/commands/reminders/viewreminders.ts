import { DB } from '@root/config';
import { Reminder } from '@lib/types/Reminder';
import { ChatInputCommandInteraction, EmbedBuilder, InteractionResponse } from 'discord.js';
import { reminderTime, generateErrorEmbed } from '@root/src/lib/utils/generalUtils';
import { Command } from '@lib/types/Command';

/**
 * A command that allows a user to view all their pending reminders,
 * sorted by which one will expire first.
 */
export default class extends Command {

	description = 'See your upcoming reminders.';
	extendedHelp = 'Don\'t worry, private reminders will be hidden if you use this command publicly.';
	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		try {
			// Get all of the user's reminders
			const reminders: Array<Reminder> = await interaction.client.mongo.collection(DB.REMINDERS)
				.find({ owner: interaction.user.id }).toArray();

			// Sort by expiration date (soonest first)
			reminders.sort((a, b) => a.expires.valueOf() - b.expires.valueOf());

			// Handle user with no reminders
			if (reminders.length < 1) {
				// Add a 'return' to stop execution
				return interaction.reply({ content: 'You don\'t have any pending reminders!', ephemeral: true });
			}

			const embeds: Array<EmbedBuilder> = [];

			reminders.forEach((reminder, i) => {
				// Create a new embed for every 25 reminders (Discord limit)
				if (i % 25 === 0) {
					embeds.push(new EmbedBuilder()
						.setTitle('Pending reminders')
						.setColor('DarkAqua'));
				}

				const hidden = reminder.mode === 'private';
				// Add the field to the most recent embed
				embeds[Math.floor(i / 25)].addFields({
					name: `${i + 1}. ${hidden ? 'Private reminder' : reminder.content}`,
					value: hidden ? 'Some time in the future.' : reminderTime(reminder)
				});
			});

			// Send the embeds ephemerally for privacy
			return interaction.reply({ embeds, ephemeral: true });
		} catch (error) {
			// Catch any unexpected errors (e.g., database failure)
			console.error(`[viewreminders] Error: ${error}`);
			return interaction.reply({
				embeds: [generateErrorEmbed('Sorry, I couldn\'t fetch your reminders. Please try again later.')],
				ephemeral: true
			});
		}
	}

}
