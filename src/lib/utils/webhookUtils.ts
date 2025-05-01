import { CHANNELS } from '../../../config';
import { CalReminder } from '../types/Reminder';
import { bot } from '../../sage';
import { TextChannel } from 'discord.js';

export async function notifyEventChange(reminder: CalReminder, newExpirationDate: Date): Promise<void> {
	const channel = await bot.channels.fetch(CHANNELS.SAGE) as TextChannel;
	const eventName = reminder.content.split('Starts')[0].trim();
	const message = `Hey <@${reminder.owner}>, you had a reminder set for **${eventName}**.` +
					` But that event was moved, so I updated your reminder time to **${newExpirationDate.toLocaleTimeString()}**.`;
	channel.send(message);
	return;
}
