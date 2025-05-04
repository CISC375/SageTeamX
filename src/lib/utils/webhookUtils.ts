/* eslint-disable camelcase */
import { BOT, CHANNELS, DB } from '../../../config';
import { CalReminder } from '../types/Reminder';
import { bot } from '../../sage';
import { TextChannel } from 'discord.js';
import { retrieveEvents, retrieveSyncToken } from '../auth';
import { calendar_v3 } from 'googleapis';
import { Collection, MongoClient } from 'mongodb';
import { WatchChannel } from '../types/EventWatch';

export async function handleChangedReminders(collection: Collection, token: string, channel: WatchChannel, client: MongoClient): Promise<void> {
	const changedEvents = await retrieveEvents(channel.calendarId, null, true, token);
	const newSyncToken = await retrieveSyncToken(channel.calendarId, token);
	await collection.updateOne({ token: token }, { $set: { token: newSyncToken } });

	const singleEvents: Map<string, calendar_v3.Schema$Event> = new Map<string, calendar_v3.Schema$Event>();
	const parentEvents: Map<string, calendar_v3.Schema$Event> = new Map<string, calendar_v3.Schema$Event>();
	const cancelledEvents: Map<string, calendar_v3.Schema$Event> = new Map<string, calendar_v3.Schema$Event>();
	for (const event of changedEvents) {
		if (!event.recurrence && event.status !== 'cancelled') {
			singleEvents.set(event.id, event);
		} else if (event.recurrence && event.status !== 'cancelled') {
			parentEvents.set(event.summary, event);
		} else if (event.status === 'cancelled') {
			cancelledEvents.set(event.id, event);
		}
	}

	const botDB = client.db(BOT.NAME);
	collection = botDB.collection(DB.REMINDERS);
	const reminders = await collection.find().toArray();
	for (const reminder of reminders) {
		const changedEvent = singleEvents.get(reminder.eventId);
		const changedReccuringEvent = parentEvents.get(reminder.content.split('Starts at:')[0].trim());
		const cancelledEvent = cancelledEvents.get(reminder.eventId);
		if (changedEvent) {
			console.log(changedEvent);
			const dateObj = new Date(changedEvent.start.dateTime);
			const newExpirationDate = new Date(dateObj.getTime() - reminder.offset);
			if (newExpirationDate.getTime() !== reminder.expires.getTime()) {
				const newContent = `${changedEvent.summary} Starts at: ${dateObj.toLocaleString()}`;
				await collection.updateOne({ _id: reminder._id }, { $set: { expires: newExpirationDate, content: newContent } });
				await notifyEventChange(reminder, { newExpirationDate: newExpirationDate });
			}
			parentEvents.delete(changedEvent.summary);
		} else if (changedReccuringEvent) {
			await collection.findOneAndDelete({ _id: reminder._id });
			await notifyEventChange(reminder, { type: 'recurring' });
		} else if (cancelledEvent) {
			console.log(reminder);
			await collection.findOneAndDelete({ _id: reminder._id });
			await notifyEventChange(reminder, { type: 'cancelled' });
		}
	}
	console.log(changedEvents);
}

export async function notifyEventChange(reminder: CalReminder, options: {newExpirationDate?: Date, type?: string}): Promise<void> {
	const channel = await bot.channels.fetch(CHANNELS.SAGE) as TextChannel;
	const eventName = reminder.content.split('Starts at:')[0].trim();
	let message: string;
	if (options.type === 'cancelled') {
		message = `Hey <@${reminder.owner}>, you had a reminder set for **${eventName}**.` +
					` But that event was deleted, so I removed the reminder you had for it.`;
	} else if (options.type === 'recurring') {
		message = `Hey <@${reminder.owner}>, you had a reminder set for **${eventName}**.` +
					` But that event series was moved, so I removed the reminder you had for it. Please use the \`/calreminder\` command to set a new one.`;
	} else {
		message = `Hey <@${reminder.owner}>, you had a reminder set for **${eventName}**.` +
					` But that event was moved, so I updated your reminder time to **${options.newExpirationDate.toLocaleTimeString()}**.`;
	}
	channel.send(message);
	return;
}
