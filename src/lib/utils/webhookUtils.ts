import { CalReminder } from '../types/Reminder';
import { bot } from '@root/src/sage';

export function notifyEventChange(reminder: CalReminder, newExpirationDate: Date): void {
	bot.user.send({ content: 'Test' });
	return;
}
