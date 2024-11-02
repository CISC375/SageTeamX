import { ChatInputCommandInteraction, EmbedBuilder, InteractionResponse } from 'discord.js';
import { Command } from '@lib/types/Command';


const mockCalendarEvents = [
	{
		summary: 'Math Office Hours',
		start: {
			dateTime: '2024-11-02T15:00:00Z',
		}
	},
	{
		summary: 'Science Office Hours',
		start: {
			dateTime: '2024-11-02T16:00:00Z',
		}
	},
	{
		summary: 'History Office Hours',
		start: {
			dateTime: '2024-11-02T14:30:00Z',
		}
	}
];

export default class extends Command {

	description = 'Set a reminder for yourself or someone else.';

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const course = interaction.options.getString('course', true);
		const timeBefore = interaction.options.getInteger('time', true);

		// Only allow 15 or 60 minute reminders
		if (timeBefore !== 15 && timeBefore !== 60) {
			await interaction.reply('Please provide a valid reminder time (15 or 60 minutes).');
			return;
		}

		// Fetch events
		const events = await this.getUpcomingEvents(interaction);
		if (!events) {
			await interaction.reply('Could not fetch calendar events.');
			return;
		}

		// Filter for given course
		const upcomingEvent = events.find(event => event.summary.includes(course));
		if (!upcomingEvent) {
			await interaction.reply(`No upcoming office hours found for ${course}.`);
			return;
		}

		// Schedule the reminder
		const eventStartTime = new Date(upcomingEvent.start.dateTime || upcomingEvent.start.date);
		this.scheduleReminder(interaction, interaction.user.id, course, eventStartTime, timeBefore);
		await interaction.reply(`Reminder set for ${course} ${timeBefore} minutes before office hours!`);
	}

	private async getUpcomingEvents(interaction: ChatInputCommandInteraction) {
	// Assuming the existing /calendar command fetches events and stores them in interaction.user.calendarEvents
		// return interaction.user.calendarEvents; (user events from the /calendar command)
		return mockCalendarEvents;
	}

	private scheduleReminder(interaction: ChatInputCommandInteraction, userId: string, course: string, eventStartTime: Date, timeBefore: number) {
		const notifyTime = new Date(eventStartTime.getTime() - timeBefore * 60000);
		const delay = notifyTime.getTime() - Date.now();

		if (delay > 0) {
			setTimeout(async () => {
				const user = await interaction.client.users.fetch(userId);
				this.sendOfficeHourReminder(user, course);
			}, delay);
		}
	}

	private async sendOfficeHourReminder(user: any, course: string) {
		const embed = new EmbedBuilder()
			.setTitle(`Upcoming Office Hour for ${course}`)
			.setDescription('Your office hour is starting soon!')
			.setColor(0x3498db);

		try {
			await user.send({ embeds: [embed] });
		} catch (error) {
			console.error(`Could not send DM to user ${user.id}: ${error}`);
		}
	}

}
