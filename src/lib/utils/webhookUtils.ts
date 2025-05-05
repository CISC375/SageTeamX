/* eslint-disable camelcase */
import { BOT, CHANNELS, DB } from '../../../config';
import { CalReminder } from '../types/Reminder';
import { bot } from '../../sage';
import { EmbedBuilder, TextChannel } from 'discord.js';
import { retrieveEvents, retrieveSyncToken } from '../auth';
import { calendar_v3 } from 'googleapis';
import { Collection, MongoClient, ObjectID } from 'mongodb';
import { WatchChannel } from '../types/EventWatch';

interface MongoCalReminder extends CalReminder {
	_id: ObjectID;
	originalStartTime: Date;
	newExpierationDate: Date;
}

function generateNotificationEmbed(remindersToNotify: MongoCalReminder[]): EmbedBuilder[] {
	const embeds: EmbedBuilder[] = [];
	const itemsPerPage = 3;

	const pagifiedReminders: MongoCalReminder[][] = [];
	for (let i = 0; i < remindersToNotify.length; i += itemsPerPage) {
		pagifiedReminders.push(remindersToNotify.slice(i, i + itemsPerPage));
	}
	const maxPages = pagifiedReminders.length;

	pagifiedReminders.forEach((page, pageIndex) => {
		const newEmbed = new EmbedBuilder()
			.setTitle(`Updated Reminders Page ${pageIndex + 1} of ${maxPages}`)
			.setColor('Blue');

		page.forEach((reminder) => {
			newEmbed.addFields({
				name: `**${reminder.summary}**`,
				value: `Original Start Time: **${reminder.originalStartTime.toLocaleString()}**\n
						New Start Time **${reminder.newExpierationDate.toLocaleString()}**`
			});
		});

		embeds.push(newEmbed);
	});

	return embeds;
}

/**
 * This helper function is used to update/delete calendar reminders in MongoDB based on if the events they're tracking have changed
 *
 * @param {Collection} collection The MongoDB collection to update
 * @param {string} token The current sync token of the tracked google calendar
 * @param {WatchChannel} channel The active watch channel that is tracking the google calendar
 * @param {MongoClient} client A MongoDB client to handle connection to MongoDB
 * @returns {Promise<void>} This function returns nothing
 */
export async function handleChangedReminders(collection: Collection, token: string, channel: WatchChannel, client: MongoClient): Promise<void> {
	const changedEvents = await retrieveEvents(channel.calendarId, null, true, token);
	const newSyncToken = await retrieveSyncToken(channel.calendarId, token);
	await collection.updateOne({ token: token }, { $set: { token: newSyncToken } });

	// Sort the changed events into different categories
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

	// Traverse through all of the reminders in the DB and check which ones need to be updated
	const botDB = client.db(BOT.NAME);
	collection = botDB.collection(DB.REMINDERS);
	const reminders: MongoCalReminder[] = await collection.find({ type: 'calreminder' }).toArray();
	const usersToNotify: Map<string, MongoCalReminder[]> = new Map<string, MongoCalReminder[]>();
	for (const reminder of reminders) {
		const changedEvent = singleEvents.get(reminder.eventId);
		const changedReccuringEvent = parentEvents.get(reminder.content.split('Starts at:')[0].trim());
		const cancelledEvent = cancelledEvents.get(reminder.eventId);

		if (changedEvent) {
			console.log(changedEvent);
			const dateObj = new Date(changedEvent.start.dateTime);
			const newExpirationDate = new Date(dateObj.getTime() - reminder.offset);
			if (newExpirationDate.getTime() !== reminder.expires.getTime()) {
				const newContent = `${reminder.summary} Starts at: ${dateObj.toLocaleString()}`;
				const originalStartTime = reminder.expires;
				reminder.originalStartTime = originalStartTime;
				reminder.newExpierationDate = newExpirationDate;
				await collection.updateOne({ _id: reminder._id }, { $set: { expires: newExpirationDate, content: newContent } });
				const remindersToNotify = usersToNotify.get(reminder.owner);
				if (remindersToNotify !== undefined) {
					remindersToNotify.push(reminder);
					usersToNotify.set(reminder.owner, remindersToNotify);
				} else {
					console.log('here');
					const newRemindersToNotify = [reminder];
					usersToNotify.set(reminder.owner, newRemindersToNotify);
				}
			}
			parentEvents.delete(changedEvent.summary);
		} else if (changedReccuringEvent) {
			await collection.findOneAndDelete({ _id: reminder._id });
			const remindersToNotify = usersToNotify.get(reminder.owner);
			if (remindersToNotify !== undefined) {
				remindersToNotify.push(reminder);
				usersToNotify.set(reminder.owner, remindersToNotify);
			} else {
				const newRemindersToNotify = [reminder];
				usersToNotify.set(reminder.owner, newRemindersToNotify);
			}
		} else if (cancelledEvent) {
			console.log(reminder);
			await collection.findOneAndDelete({ _id: reminder._id });
			const remindersToNotify = usersToNotify.get(reminder.owner);
			if (remindersToNotify !== undefined) {
				remindersToNotify.push(reminder);
				usersToNotify.set(reminder.owner, remindersToNotify);
			} else {
				const newRemindersToNotify = [reminder];
				usersToNotify.set(reminder.owner, newRemindersToNotify);
			}
		}
	}

	if (usersToNotify.size) {
		console.log('here1');
		const embedsToSend: {owner: string, embeds: EmbedBuilder[]}[] = [];
		usersToNotify.forEach((value, key) => {
			const newEmbedToSend = { owner: key, embeds: generateNotificationEmbed(value) };
			embedsToSend.push(newEmbedToSend);
		});
		await notifyEventChange(embedsToSend);
	}
	console.log(changedEvents);
}

async function notifyEventChange(embedsToSend: {owner: string, embeds: EmbedBuilder[]}[]): Promise<void> {
	for (const embed of embedsToSend) {
		const user = await bot.users.fetch(embed.owner);
		const message = await user.send({ embeds: [embed.embeds[0]] });
	}
}
