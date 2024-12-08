import {
	ChatInputCommandInteraction,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
	EmbedBuilder,
  } from 'discord.js';
  import { Command } from '@lib/types/Command';
  const fs = require('fs').promises;
  const path = require('path');
  const process = require('process');
  const { authenticate } = require('@google-cloud/local-auth');
  const { google } = require('googleapis');
  
  export default class extends Command {
	name = 'calendar';
	description = 'Retrieve calendar events over the next 10 days with pagination';
  
	async run(interaction: ChatInputCommandInteraction): Promise<void> {
	  const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
	  const TOKEN_PATH = path.join(process.cwd(), 'token.json');
	  const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
  
	  async function loadSavedCredentialsIfExist() {
		try {
		  const content = await fs.readFile(TOKEN_PATH);
		  const credentials = JSON.parse(content);
		  return google.auth.fromJSON(credentials);
		} catch {
		  return null;
		}
	  }
  
	  async function saveCredentials(client) {
		const content = await fs.readFile(CREDENTIALS_PATH);
		const keys = JSON.parse(content);
		const key = keys.installed || keys.web;
		const payload = JSON.stringify({
		  type: 'authorized_user',
		  client_id: key.client_id,
		  client_secret: key.client_secret,
		  refresh_token: client.credentials.refresh_token,
		});
		await fs.writeFile(TOKEN_PATH, payload);
	  }
  
	  async function authorize() {
		let client = await loadSavedCredentialsIfExist();
		if (client) {
		  return client;
		}
		client = await authenticate({ scopes: SCOPES, keyfilePath: CREDENTIALS_PATH });
		if (client.credentials) {
		  await saveCredentials(client);
		}
		return client;
	  }
  
	  function formatDateTime(dateTime?: string): string {
		if (!dateTime) return '`NONE`';
		const date = new Date(dateTime);
		return date.toLocaleString('en-US', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
	  }
  
	  async function listEvents(auth, interaction: ChatInputCommandInteraction) {
		const calendar = google.calendar({ version: 'v3', auth });
		const now = new Date();
		const timeMin = now.toISOString();
		const timeMax = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
  
		try {
		  const res = await calendar.events.list({
			calendarId: '',
			timeMin,
			timeMax,
			singleEvents: true,
			orderBy: 'startTime',
		  });
  
		  const events = res.data.items || [];
		  if (events.length === 0) {
			await interaction.followUp('No events found over the next 10 days.');
			return;
		  }
  
		  const parsedEvents = events.map((event, index) => ({
			name: event.summary || `Event ${index + 1}`,
			start: formatDateTime(event.start?.dateTime || event.start?.date),
			end: formatDateTime(event.end?.dateTime || event.end?.date),
			location: event.location || '`NONE`',
		  }));
  
		  let currentPage = 0;
		  const EVENTS_PER_PAGE = 3;
  
		  function generateEmbed(page: number): EmbedBuilder {
			const embed = new EmbedBuilder()
			  .setColor('Green')
			  .setTitle(`Upcoming Events (Page ${page + 1} of ${Math.ceil(parsedEvents.length / EVENTS_PER_PAGE)})`);
  
			parsedEvents
			  .slice(page * EVENTS_PER_PAGE, (page + 1) * EVENTS_PER_PAGE)
			  .forEach((event, index) => {
				embed.addFields({
				  name: `Event ${page * EVENTS_PER_PAGE + index + 1}: ${event.name}`,
				  value: `**Start:** ${event.start}\n**End:** ${event.end}\n**Location:** ${event.location}\n\n`,
				});
			  });
  
			return embed;
		  }
  
		  async function updateMessage(page: number, message) {
			const embed = generateEmbed(page);
			const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
			  new ButtonBuilder()
				.setCustomId('prev')
				.setLabel('Previous')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(page === 0),
			  new ButtonBuilder()
				.setCustomId('next')
				.setLabel('Next')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(page === Math.ceil(parsedEvents.length / EVENTS_PER_PAGE) - 1),
			  new ButtonBuilder()
				.setCustomId('done')
				.setLabel('Done')
				.setStyle(ButtonStyle.Danger)
			);
  
			await message.edit({ embeds: [embed], components: [buttons] });
		  }
  
		  // Send initial message via DM
		  const dmChannel = await interaction.user.createDM();
		  const initialEmbed = generateEmbed(currentPage);
		  const initialButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
			  .setCustomId('prev')
			  .setLabel('Previous')
			  .setStyle(ButtonStyle.Primary)
			  .setDisabled(true),
			new ButtonBuilder()
			  .setCustomId('next')
			  .setLabel('Next')
			  .setStyle(ButtonStyle.Primary)
			  .setDisabled(parsedEvents.length <= EVENTS_PER_PAGE),
			new ButtonBuilder()
			  .setCustomId('done')
			  .setLabel('Done')
			  .setStyle(ButtonStyle.Danger)
		  );
  
		  const message = await dmChannel.send({
			embeds: [initialEmbed],
			components: [initialButtons],
		  });
  
		  const collector = message.createMessageComponentCollector({ time: 300000 });
  
		  collector.on('collect', async (btnInteraction) => {
			if (btnInteraction.customId === 'done') {
			  collector.stop();
			  await message.edit({ components: [] });
			  await btnInteraction.reply('Collector manually terminated.');
			} else {
			  if (btnInteraction.customId === 'prev') currentPage--;
			  if (btnInteraction.customId === 'next') currentPage++;
			  await updateMessage(currentPage, message);
			  await btnInteraction.deferUpdate();
			}
		  });
  
		  collector.on('end', async () => {
			await message.edit({ components: [] });
		  });
		} catch (err) {
		  console.error(err);
		  await interaction.followUp('Failed to retrieve calendar events.');
		}
	  }
  
	  try {
		await interaction.reply('Authenticating and fetching events...');
		const auth = await authorize();
		await listEvents(auth, interaction);
	  } catch (err) {
		console.error(err);
		await interaction.followUp('An error occurred.');
	  }
	}
  }
  
