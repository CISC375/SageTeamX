/* eslint-disable camelcase */
import { calendar_v3, google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { ChatInputCommandInteraction } from 'discord.js';
import { GaxiosResponse } from 'gaxios';
import dotenv from 'dotenv';

dotenv.config();
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const KEY_PATH = process.env.MYPATH;

/**
 * This function will retrive and return the events of the given calendar ID. It will send error messages if it cannot retrive the events
 *
 * @param {string} calendarId The ID of the calendar you want to retrieve
 * @param {ChatInputCommandInteraction} interaction Optional: Current Discord interacton
 * @param {boolean} singleEvents Optional: Determines whether to list out each event instead of just the parent events - Default: true
 * @param {string} syncToken ...
 * @returns {Promise<GaxiosResponse<calendar_v3.Schema$Events>>} Return the events of the given calendar ID
 */
export async function retrieveEvents(calendarId: string, interaction?: ChatInputCommandInteraction, singleEvents = true, syncToken?: string): Promise<calendar_v3.Schema$Event[]> {
	// Retrieve an authenticaiton token
	const auth = new JWT({
		keyFile: KEY_PATH,
		scopes: SCOPES
	});

	// Authorize access to google calendar and retrieve the calendar
	let calendar: calendar_v3.Calendar = null;
	try {
		calendar = google.calendar({ version: 'v3', auth: auth });
	} catch {
		const errorMessage = '⚠️ Failed to authenticate with Google Calendar. Please try again later.';
		if (interaction) {
			if (interaction.replied) {
				await interaction.followUp({
					content: errorMessage,
					ephemeral: true
				});
			} else {
				await interaction.reply({
					content: errorMessage,
					ephemeral: true
				});
			}
		} else {
			console.log(errorMessage);
		}
	}

	// Retrieve the events from the calendar
	let events: calendar_v3.Schema$Event[] = null;
	try {
		let response: GaxiosResponse;

		// This makes sure events are only sorted if single events is true
		if (syncToken) {
			response = await calendar.events.list({
				calendarId: calendarId,
				syncToken: syncToken,
				singleEvents: true,
				maxResults: 2500
			});
		} else if (singleEvents) {
			response = await calendar.events.list({
				calendarId: calendarId,
				timeMin: new Date().toISOString(),
				timeMax: new Date(Date.now() + (10 * 24 * 60 * 60 * 1000)).toISOString(),
				singleEvents: singleEvents,
				orderBy: 'startTime'
			});
		} else {
			response = await calendar.events.list({
				calendarId: calendarId,
				timeMin: new Date().toISOString(),
				timeMax: new Date(Date.now() + (10 * 24 * 60 * 60 * 1000)).toISOString(),
				singleEvents: singleEvents
			});
		}

		events = response.data.items;
	} catch {
		const errorMessage = '⚠️ Failed to retrieve calendar events. Please try again later.';
		if (interaction) {
			if (interaction.replied) {
				await interaction.followUp({
					content: errorMessage,
					ephemeral: true
				});
			} else {
				await interaction.reply({
					content: errorMessage,
					ephemeral: true
				});
			}
		} else {
			console.log(errorMessage);
		}
	}

	return events;
}

export async function retrieveCalendarToken(): Promise<calendar_v3.Calendar> {
	// Retrieve an authenticaiton token
	const auth = new JWT({
		keyFile: KEY_PATH,
		scopes: SCOPES
	});

	// Authorize access to google calendar
	return google.calendar({ version: 'v3', auth: auth });
}

export async function retrieveSyncToken(calendarId: string, syncToken?: string): Promise<string> {
	// Local variables
	let pageToken: string = null;

	// Retrieve an authenticaiton token
	const auth = new JWT({
		keyFile: KEY_PATH,
		scopes: SCOPES
	});

	// Authorize access to google calendar
	let calendar: calendar_v3.Calendar = null;
	try {
		calendar = google.calendar({ version: 'v3', auth: auth });
	} catch (error) {
		console.log(error);
	}

	// Retrieve the sync token from calendar evetns
	let response: GaxiosResponse<calendar_v3.Schema$Events>;
	try {
		if (syncToken) {
			response = await calendar.events.list({
				calendarId: calendarId,
				syncToken: syncToken
			});
		} else {
			response = await calendar.events.list({
				calendarId: calendarId,
				showDeleted: true
			});
		}

		syncToken = response.data.nextSyncToken;
		pageToken = response.data.nextPageToken;
		console.log('Page token:', pageToken);
		console.log('Sync token:', syncToken);
		while (pageToken && !syncToken) {
			response = await calendar.events.list({
				calendarId: calendarId,
				pageToken: pageToken
			});

			pageToken = response.data.nextPageToken;
			if (pageToken === null) {
				syncToken = response.data.nextSyncToken;
			}
		}
	} catch (error) {
		console.log(error);
	}

	return syncToken;
}
