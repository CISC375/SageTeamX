/* eslint-disable camelcase */
import { BOT, DB } from '../../../config';
import { Reminder } from '../types/Reminder';
import { bot } from '../../sage';
import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, ComponentType, EmbedBuilder } from 'discord.js';
import { retrieveEvents, retrieveSyncToken } from '../auth';
import { calendar_v3 } from 'googleapis';
import { Collection, MongoClient } from 'mongodb';
import { SyncToken, WatchChannel } from '../types/EventWatch';

interface ReminderDocument extends Reminder {
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
		const maxPages = userNotifcation.embeds.length;
		let currentPage = 0;

		const initialButtons = generatePaginationButtons(currentPage, maxPages);
		const message = await user.send({ embeds: [userNotifcation.embeds[currentPage]], components: [initialButtons] });

		const messageCollecter = message.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 300000
		});

		messageCollecter.on('collect', async (i: ButtonInteraction<CacheType>) => {
			await i.deferUpdate();
			if (i.customId === 'next') {
				currentPage++;
			} else if (i.customId === 'prev') {
				currentPage--;
			}

			const newButtons = generatePaginationButtons(currentPage, maxPages);
			message.edit({ embeds: [userNotifcation.embeds[currentPage]], components: [newButtons] });
		});
	}
}

function generatePaginationButtons(currentPage: number, maxPages: number): ActionRowBuilder<ButtonBuilder> {
	const previousButton = new ButtonBuilder()
		.setCustomId('prev')
		.setLabel('Previous')
		.setStyle(ButtonStyle.Primary)
		.setDisabled(currentPage === 0);

	const nextButton = new ButtonBuilder()
		.setCustomId('next')
		.setLabel('Next')
		.setStyle(ButtonStyle.Success)
		.setDisabled(currentPage + 1 === maxPages);

	const paginationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(previousButton, nextButton);

	return paginationRow;
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
			.setTitle(`Calendar Reminder Changes Page ${pageIndex + 1} of ${maxPages}`)
			.setColor('Blue');

		page.forEach((reminder) => {
			if (reminder.type === 'cancelled') {
				newEmbed.addFields({
					name: `**${reminder.content}**`,
					value: 'This event has been cancelled. So your reminder has been removed.'
				});
			} else if (reminder.type === 'recurring') {
				newEmbed.addFields({
					name: `**Event Name: ${reminder.eventSummary}**`,
					value: `This event series has been moved, so your reminder may no longer be set for the proper time. Your reminder will also no longer be updated by future event changes.
							You can view/cancel/add reminders by using the following commands:
							View: \`/viewreminders
							Cancel: \`/cancelreminder\`
							Add: \`/calreminder\``
				});
			} else {
				newEmbed.addFields({
					name: `**Event Name: ${reminder.eventSummary}**`,
					value: `New Reminder Time: ${reminder.newStartTime.toLocaleString()}
							This event has been moved, so I updated your reminder time accordingly.
							Old Reminder Time: ${reminder.expires.toLocaleString()}`
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
				await remindersCollection.updateOne(reminder, { $set: { expires: newExpirationDate, content: newContent } });
				changed = true;
			}
			parentEvents.delete(changedSingleEvent.summary);
		} else if (changedReccuringEvent) {
			// These properties are updated so that the reminder will no longer be updated by future event changes
			await remindersCollection.updateOne(reminder, { $set: { type: '', eventId: '' } });
			reminder.type = 'recurring';
			parentEvents.delete(changedReccuringEvent.summary);
			changed = true;
		} else if (cancelledEvent) {
			await remindersCollection.findOneAndDelete(reminder);
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
