/* eslint-disable camelcase */
import dotenv from 'dotenv';
dotenv.config();
import { calendar_v3, google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { ChatInputCommandInteraction } from 'discord.js';
import { GaxiosResponse } from 'gaxios';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const KEY_PATH = process.env.MYPATH;
console.log('[DEBUG] MYPATH:', process.env.MYPATH);
console.log('[DEBUG] Resolved KEY_PATH:', KEY_PATH);
console.log('[DEBUG] Working directory:', process.cwd());

/**
 * This function will retrieve and return the events of the given calendar ID.
 * If an interaction is provided, it handles user-facing error messages.
 * If not, it throws errors for background use (e.g., in checkReminders).
 *
 * @param {string} calendarId The ID of the calendar you want to retrieve
 * @param {ChatInputCommandInteraction} interaction Optional: Current Discord interaction
 * @param {boolean} singleEvents Optional: Whether to list each event separately (default: true)
 * @returns {Promise<calendar_v3.Schema$Event[]>}
 */
export async function retrieveEvents(
	calendarId: string,
	interaction?: ChatInputCommandInteraction,
	singleEvents = true
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

		if (singleEvents) {
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
