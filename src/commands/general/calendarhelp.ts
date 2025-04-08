/* eslint-disable */
import { ChatInputCommandInteraction } from "discord.js";
import { Command } from "@root/src/lib/types/Command";

export default class extends Command {
	name = "calendarhelp";
	description = "Displays help information for using the /calendar command";

	async run(interaction: ChatInputCommandInteraction): Promise<void> {
		await interaction.reply({
			content:
			"**📅 Command Help: /calendar**\n\n" +
			"Use the `/calendar` command to view upcoming office hour events. You'll **receive a DM** with office hour events over the next 10 days that allows for filtering and downloading events to add to your personal calendar.\n\n" +
			
			"**📬 Filtering in DMs:**\n" +
			"`Class`, `Location Type` *(in-person/virtual)*, and `Days of Week` filtering options are available.\n\n" +

			"**🔍 Optional Command Arguments:**\n" +
			"`coursecode` — Automatically filters results by course (e.g., `cisc123`)\n\n" +

			"Get started by running `/calendar`!",
			
			ephemeral: true,
		});
	}
}