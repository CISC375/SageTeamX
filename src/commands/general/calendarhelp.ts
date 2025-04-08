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
			"Use the `/calendar` command to view upcoming office hour events. After running the command, you'll receive a **DM** with additional filtering options such as class, location type (In-Person or Virtual), and day of the week. You can also select events to download and add to your personal calendar.\n\n" +
			
			"**🔍 Optional Arguments:**\n" +
			"`coursecode` — Filter by course code (e.g., `cisc123`)\n" +
			"`locationtype` — Use `IP` for In-Person or `V` for Virtual events\n" +
			"`eventholder` — Filter by the event holder's name (e.g., `John Smith`)\n" +
			"`eventdate` — Filter by a specific date (e.g., `December 9`)\n" +
			"`dayofweek` — Filter by the day of the week (e.g., `Monday`)\n\n" +

			"**📬 Filtering in DMs:**\n" +
			"If no filters are provided, all office hours within the next 10 days will be shown.\n\n" +
			"Get started by running `/calendar` with any combination of the above filters!",
			ephemeral: true,
		});
	}
}