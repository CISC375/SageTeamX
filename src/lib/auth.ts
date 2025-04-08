/* eslint-disable camelcase */
import { calendar_v3, google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { ChatInputCommandInteraction } from 'discord.js';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const KEY_PATH = process.env.MYPATH;

/**
 * This function will retrive and return the events of the given calendar ID. It will send error messages if it cannot retrive the events
 *
 * @param {string} calendarId The ID of the calendar you want to retrieve
 * @param {ChatInputCommandInteraction} interaction Optional: Current Discord interacton
 * @param {boolean} singleEvents Optional: Determines whether to list out each event instead of just the parent events Default: true
 * @returns {Promise<GaxiosResponse<calendar_v3.Schema$Events>>} Return the events of the given calendar ID
 */
export async function retrieveEvents(calendarId: string, interaction?: ChatInputCommandInteraction, singleEvents = true): Promise<calendar_v3.Schema$Event[]> {
	const auth = new JWT({
		keyFile: KEY_PATH,
		scopes: SCOPES
	});

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

	let events: calendar_v3.Schema$Event[] = null;
	try {
		const response = await calendar.events.list({
			calendarId: calendarId,
			timeMin: new Date().toISOString(),
			timeMax: new Date(Date.now() + (10 * 24 * 60 * 60 * 1000)).toISOString(),
			singleEvents: singleEvents
		});

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
