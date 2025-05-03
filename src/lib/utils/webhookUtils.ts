import { CHANNELS } from '../../../config';
import { CalReminder } from '../types/Reminder';
import { bot } from '../../sage';
import { TextChannel } from 'discord.js';

export async function notifyEventChange(reminder: CalReminder, options: {newExpirationDate?: Date, cancelled?: boolean}): Promise<void> {
	const channel = await bot.channels.fetch(CHANNELS.SAGE) as TextChannel;
	const eventName = reminder.content.split('Starts at:')[0].trim();
	let message: string;
	if (options.cancelled) {
		message = `Hey <@${reminder.owner}>, you had a reminder set for **${eventName}**.` +
					` But that event was deleted, so I removed the reminder you had for it.`;
	} else {
		message = `Hey <@${reminder.owner}>, you had a reminder set for **${eventName}**.` +
					` But that event was moved, so I updated your reminder time to **${options.newExpirationDate.toLocaleTimeString()}**.`;
	}
	channel.send(message);
	return;
}
