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
 * This function will retrieve and return the events of the given calendar ID.
 * If an interaction is provided, it handles user-facing error messages.
 * If not, it throws errors for background use (e.g., in checkReminders).
 *
 * @param {string} calendarId The ID of the calendar you want to retrieve
 * @param {ChatInputCommandInteraction} interaction Optional: Current Discord interaction
 * @param {boolean} singleEvents Optional: Whether to list each event separately (default: true)
 * @param {string} syncToken ...
 * @returns {Promise<calendar_v3.Schema$Event[]>}
 */
export async function retrieveEvents(
	calendarId: string,
	interaction?: ChatInputCommandInteraction,
	singleEvents = true,
	syncToken?: string
): Promise<calendar_v3.Schema$Event[]> {
	if (!KEY_PATH) {
		const msg = '❌ Environment variable MYPATH is not set.';
		if (interaction) {
			await safeReply(interaction, msg);
			return [];
		} else {
			throw new Error(msg);
		}
	}

	// Initialize auth with keyFile
	const auth = new JWT({
		keyFile: KEY_PATH,
		scopes: SCOPES
	});

	let calendar: calendar_v3.Calendar;
	try {
		calendar = google.calendar({ version: 'v3', auth });
	} catch (err) {
		const msg = '⚠️ Failed to authenticate with Google Calendar.';
		if (interaction) {
			await safeReply(interaction, msg);
			return [];
		} else {
			throw err;
		}
	}

	try {
		const tenDaysMs = 10 * 24 * 60 * 60 * 1000;

		let response: GaxiosResponse;
		const baseParams = {
			calendarId: calendarId,
			timeMin: new Date().toISOString(),
			timeMax: new Date(Date.now() + tenDaysMs).toISOString(),
			singleEvents
		};

		// This makes sure events are only sorted if single events is true
		if (syncToken) {
			response = await calendar.events.list({
				calendarId: calendarId,
				syncToken: syncToken,
				maxResults: 2500
			});
		} else if (singleEvents) {
			response = await calendar.events.list({
				...baseParams,
				orderBy: 'startTime'
			});
		} else {
			response = await calendar.events.list(baseParams);
		}

		return response.data.items ?? [];
	} catch (err) {
		const msg = '⚠️ Failed to retrieve calendar events.';
		if (interaction) {
			await safeReply(interaction, msg);
			return [];
		} else {
			throw err;
		}
	}
}

/**
 * Helper to safely reply or follow up without throwing if already replied
 * @param {ChatInputCommandInteraction} interaction The Discord interaction
 * @param {string} message The message to send
 */

async function safeReply(
	interaction: ChatInputCommandInteraction,
	message: string
): Promise<void> {
	try {
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: message, ephemeral: true });
		} else {
			await interaction.reply({ content: message, ephemeral: true });
		}
	} catch (err) {
		console.warn('⚠️ Failed to send error message to interaction:', err);
	}
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
			syncToken = response.data.nextSyncToken;
		}
	} catch (error) {
		console.log(error);
	}

	return syncToken;
}
