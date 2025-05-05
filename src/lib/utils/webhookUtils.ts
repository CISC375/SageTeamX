/* eslint-disable camelcase */
import { BOT, DB } from '../../../config';
import { Reminder } from '../types/Reminder';
import { bot } from '../../sage';
import { EmbedBuilder } from 'discord.js';
import { retrieveEvents, retrieveSyncToken } from '../auth';
import { calendar_v3 } from 'googleapis';
import { Collection, MongoClient, ObjectID } from 'mongodb';
import { SyncToken, WatchChannel } from '../types/EventWatch';

interface ReminderDocument extends Reminder {
	_id: ObjectID;
	oldStartTime?: Date;
	newStartTime?: Date;
	type?: string;
}

interface UserNotifcation {
	owner: string;
	embeds: EmbedBuilder[];
}

async function notifyEventChange(userNotifications: UserNotifcation[]): Promise<void> {
	for (const userNotifcation of userNotifications) {
		const user = await bot.users.fetch(userNotifcation.owner);
		await user.send({ embeds: [userNotifcation.embeds[0]] });
	}
}

function generateNotificationEmbed(remindersToNotify: ReminderDocument[]): EmbedBuilder[] {
	const embeds: EmbedBuilder[] = [];
	const itemsPerPage = 3;

	const pagifiedReminders: ReminderDocument[][] = [];
	for (let i = 0; i < remindersToNotify.length; i += itemsPerPage) {
		pagifiedReminders.push(remindersToNotify.slice(i, i + itemsPerPage));
	}
	const maxPages = pagifiedReminders.length;

	pagifiedReminders.forEach((page, pageIndex) => {
		const newEmbed = new EmbedBuilder()
			.setTitle(`Reminder Changes Page ${pageIndex + 1} of ${maxPages}`)
			.setColor('Blue');

		page.forEach((reminder) => {
			if (reminder.type === 'cancelled') {
				newEmbed.addFields({
					name: `**${reminder.content}**`,
					value: 'This event has been cancelled. So your reminder has been removed.'
				});
			} else if (reminder.type === 'recurring') {
				newEmbed.addFields({
					name: `**${reminder.content}**`,
					value: `This event series has been moved. Your reminder has been removed for this event. 
							Please create a new reminder using \`/calreminder\``
				});
			} else {
				newEmbed.addFields({
					name: `**${reminder.content}**`,
					value: `This event has been moved, so I have updated your remider time.\n
							New Reminder Time:** ${reminder.newStartTime.toLocaleString()}**`
				});
			}
		});

		embeds.push(newEmbed);
	});

	return embeds;
}

/**
 * This helper function is used to update/delete calendar reminders in MongoDB based on if the events they're tracking have changed
 *
 * @param {Collection} tokenCollection The MongoDB collection that contains all of the sync tokens
 * @param {string} token The current sync token of the tracked google calendar
 * @param {WatchChannel} channel The active watch channel that is tracking the google calendar
 * @param {MongoClient} client A MongoDB client to handle connection to MongoDB
 * @returns {Promise<void>} This function returns nothing
 */
export async function handleChangedReminders(tokenCollection: Collection<SyncToken>, token: string, channel: WatchChannel, client: MongoClient): Promise<void> {
	const changedEvents = await retrieveEvents(channel.calendarId, null, true, token);
	const newSyncToken = await retrieveSyncToken(channel.calendarId, token);
	await tokenCollection.updateOne({ token: token }, { $set: { token: newSyncToken } });

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

	// Retrieve every reminder in Sage's database
	const botDB = client.db(BOT.NAME);
	const remindersCollection = botDB.collection<ReminderDocument>(DB.REMINDERS);
	const reminders: ReminderDocument[] = await remindersCollection.find({ type: 'calreminder' }).toArray();

	// This will be used to keep track of which reminder belongs to who
	const usersToNotify: Map<string, ReminderDocument[]> = new Map<string, ReminderDocument[]>();

	// Traverse through all of the reminders in the DB and check which ones need to be updated
	for (const reminder of reminders) {
		let changed = false;
		const changedSingleEvent = singleEvents.get(reminder.eventId);
		const changedReccuringEvent = parentEvents.get(reminder.eventSummary);
		const cancelledEvent = cancelledEvents.get(reminder.eventId);

		// Checks to see if an event changed and what type of change occured
		if (changedSingleEvent) {
			const dateObj = new Date(changedSingleEvent.start.dateTime);
			const newExpirationDate = new Date(dateObj.getTime() - reminder.offset);
			if (newExpirationDate.getTime() !== reminder.expires.getTime()) {
				const newContent = `${reminder.eventSummary} Starts at: ${dateObj.toLocaleString()}`;
				reminder.oldStartTime = reminder.expires;
				reminder.newStartTime = newExpirationDate;
				await remindersCollection.updateOne({ _id: reminder._id }, { $set: { expires: newExpirationDate, content: newContent } });
				changed = true;
			}
			parentEvents.delete(changedSingleEvent.summary);
		} else if (changedReccuringEvent) {
			await remindersCollection.findOneAndDelete({ _id: reminder._id });
			reminder.type = 'recurring';
			changed = true;
		} else if (cancelledEvent) {
			await remindersCollection.findOneAndDelete({ _id: reminder._id });
			reminder.type = 'cancelled';
			changed = true;
		}

		// If there was an event change
		if (changed) {
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

	// Sends embeds to users who had their reminders changed
	if (usersToNotify.size) {
		const userNotifications: UserNotifcation[] = [];
		usersToNotify.forEach((value, key) => {
			const newUserNotification: UserNotifcation = { owner: key, embeds: generateNotificationEmbed(value) };
			userNotifications.push(newUserNotification);
		});
		await notifyEventChange(userNotifications);
	}
	console.log(changedEvents);
}
