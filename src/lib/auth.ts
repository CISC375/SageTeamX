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
export async function retrieveEvents(calendarId: string, interaction?: ChatInputCommandInteraction, singleEvents = true, syncToken = ''): Promise<calendar_v3.Schema$Event[]> {
	// Retrieve an authenticaiton token
	console.log(KEY_PATH);
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
		if (singleEvents) {
			response = await calendar.events.list({
				calendarId: calendarId,
				timeMin: new Date().toISOString(),
				timeMax: new Date(Date.now() + (10 * 24 * 60 * 60 * 1000)).toISOString(),
				singleEvents: singleEvents,
				orderBy: 'startTime',
				syncToken: syncToken
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

	// Authorize access to google calendar and retrieve the calendar
	return google.calendar({ version: 'v3', auth: auth });
}

export async function retrieveSyncToken(syncToken?: string): Promise<string> {
	const auth = new JWT({
		keyFile: KEY_PATH,
		scopes: SCOPES
	});

	const calendar = google.calendar({ version: 'v3', auth: auth });
	const response = await calendar.events.list({
		calendarId: 'c_8f94fb19936943d5980f19eac62aeb0c9379581cfbad111862852765f624bb1b@group.calendar.google.com',
		timeMin: new Date().toISOString(),
		timeMax: new Date(Date.now() + (10 * 24 * 60 * 60 * 1000)).toISOString(),
		singleEvents: true,
		orderBy: 'startTime',
		syncToken: syncToken
	});

	return response.data.nextSyncToken;
}
