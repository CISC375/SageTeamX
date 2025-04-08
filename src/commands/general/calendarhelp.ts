/* eslint-disable */
import { ChatInputCommandInteraction } from "discord.js";
import { Command } from "@root/src/lib/types/Command";

export default class extends Command {
	name = "calendarhelp";
	description = "Displays help information for using the /calendar command";

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.reply({
			content: "To search for calendar events, use **one or more** of the following filters:\n\n" +
				"**Arguments:**\n" +
				"classname: Enter the class name (e.g., 'cisc123') to filter by course.\n" +
				"locationtype: Enter 'IP' for In-Person events or 'V' for Virtual events.\n" +
				"eventholder: Enter the event holder's name (e.g., 'John Smith') to filter by instructor.\n" +
				"eventdate: Enter a date in the format (e.g., 'December 9') to filter events by date.\n" +
				"dayofweek: Enter the day of the week (e.g., 'Monday') to filter events by the day.\n\n" +
				"**Filtering Events:**\n" +
				"A filtering option is offered in your DMs after the command is sent.\n" +
				"If you don't add any filters, all events over the next 10 days will be returned.\n\n" +
				"Use /calendar with appropriate arguments to get started!",
			ephemeral: true,
		});
	}
}